/**
 * Draft Companion: snake draft flow, other-team picks, top-3 recommendations.
 */

const STORAGE_KEY = "fantasy-draft-companion-league-settings";
const CSV_URL = "data/nba_fantasy_2025_26.csv";
const PLAYERS_PER_TEAM = 12;
/** Base URL for the explain-recommendation API. Uses current origin when served over http(s). Empty = feature off. */
const EXPLAIN_API_URL = "";
  // typeof window !== "undefined" && /^https?:\/\//.test(window.location?.origin || "")
  //   ? window.location.origin
  //   : "";

let settings = null;
let allPlayers = [];
let pickIndex = 0;
let draftedNames = new Set();
let userRoster = [];
let draftHistory = [];
let draftStarted = false;
let simulateMode = false;

const draftInfoCard = document.getElementById("draft-info-card");
const draftSetupMsg = document.getElementById("draft-setup-msg");
const draftSetupActions = document.getElementById("draft-setup-actions");
const btnStartDraft = document.getElementById("btn-start-draft");
const draftFlowCard = document.getElementById("draft-flow-card");
const currentPickNumEl = document.getElementById("current-pick-num");
const totalPicksEl = document.getElementById("total-picks");
const currentRoundEl = document.getElementById("current-round");
const draftTurnLabel = document.getElementById("draft-turn-label");
const sectionOtherPick = document.getElementById("section-other-pick");
const sectionYourPick = document.getElementById("section-your-pick");
const otherPickInput = document.getElementById("other-pick-input");
const autocompleteList = document.getElementById("autocomplete-list");
const btnConfirmOther = document.getElementById("btn-confirm-other");
const recommendationsEl = document.getElementById("recommendations");
const recommendationsExplanationWrap = document.getElementById("recommendations-explanation-wrap");
const recommendationsExplanationText = document.getElementById("recommendations-explanation-text");
const yourPickInput = document.getElementById("your-pick-input");
const yourAutocompleteList = document.getElementById("your-autocomplete-list");
const yourRosterCard = document.getElementById("your-roster-card");
const yourPickCountEl = document.getElementById("your-pick-count");
const slotIndicatorsEl = document.getElementById("slot-indicators");
const yourRosterList = document.getElementById("your-roster-list");
const draftCompleteCard = document.getElementById("draft-complete-card");
const draftHistoryCard = document.getElementById("draft-history-card");
const draftHistoryList = document.getElementById("draft-history-list");
const simulateCheckboxSetup = document.getElementById("simulate-draft-checkbox");
const simulateCheckboxFlow = document.getElementById("simulate-draft-checkbox-flow");

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    const name = (row.player_name || "").trim();
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    row.projected_fantasy_pts_2025_26 = Number(row.projected_fantasy_pts_2025_26) || 0;
    row.fantasy_pts_2024_25 = Number(row.fantasy_pts_2024_25) || 0;
    rows.push(row);
  }
  return rows;
}

function getTotalPicks() {
  if (!settings || !settings.numTeams) return 0;
  return settings.numTeams * PLAYERS_PER_TEAM;
}

function getTeamIndexForPick(index) {
  const numTeams = settings.numTeams;
  const round = Math.floor(index / numTeams);
  const slotInRound = index % numTeams;
  return round % 2 === 0 ? slotInRound : numTeams - 1 - slotInRound;
}

function isUserPick(index) {
  const teamIndex = getTeamIndexForPick(index);
  return teamIndex === settings.draftPosition - 1;
}

function getAvailablePlayers() {
  return allPlayers.filter((p) => !draftedNames.has((p.player_name || "").trim()));
}

/** Normalize roster entry to player object (handles { player, slot } or legacy flat player). */
function getPlayerFromEntry(entry) {
  return entry && (entry.player ?? entry);
}

function getPositionCounts() {
  const count = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
  userRoster.forEach((entry) => {
    const p = getPlayerFromEntry(entry);
    const pos = (p?.position ?? "").trim().toUpperCase();
    if (count.hasOwnProperty(pos)) count[pos]++;
  });
  return count;
}

const DEFAULT_ROSTER = { PG: 1, SG: 1, SF: 1, PF: 1, C: 1, G: 1, F: 1, UTIL: 2 };
const DEFAULT_BENCH = 3;

/** Returns { slot: { filled, max } } for each roster slot. */
function getSlotFills() {
  const roster = (settings && settings.roster) ? settings.roster : DEFAULT_ROSTER;
  const benchSlots = (settings && settings.benchSlots) ?? DEFAULT_BENCH;
  const filled = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0, G: 0, F: 0, UTIL: 0, BENCH: 0 };
  userRoster.forEach((entry) => {
    const slot = entry.slot || "BENCH";
    if (filled.hasOwnProperty(slot)) filled[slot]++;
  });
  const result = {};
  ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"].forEach((pos) => {
    const max = Math.max(0, parseInt(roster[pos], 10) || 0);
    result[pos] = { filled: filled[pos] || 0, max };
  });
  result.BENCH = { filled: filled.BENCH || 0, max: Math.max(0, benchSlots) };
  return result;
}

/** Priority: position → G/F (if applicable) → UTIL → BENCH. Returns slot to fill. */
function assignSlotForPlayer(player, slotFills) {
  const pos = (player.position || "").trim().toUpperCase();
  const canFill = (slot) => {
    const s = slotFills[slot];
    return s && s.filled < s.max;
  };
  const priority = {
    PG: ["PG", "G", "UTIL", "BENCH"],
    SG: ["SG", "G", "UTIL", "BENCH"],
    SF: ["SF", "F", "UTIL", "BENCH"],
    PF: ["PF", "F", "UTIL", "BENCH"],
    C: ["C", "UTIL", "BENCH"],
  }[pos] || ["UTIL", "BENCH"];
  for (const slot of priority) {
    if (canFill(slot)) return slot;
  }
  return "BENCH";
}

function getPositionSlotsNeeded() {
  const slotFills = getSlotFills();
  const need = {};
  ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BENCH"].forEach((pos) => {
    const s = slotFills[pos];
    need[pos] = s ? Math.max(0, s.max - s.filled) : 0;
  });
  return need;
}

/** G = PG or SG, F = SF or PF, UTIL = any position. Returns true if player has at least one open slot. */
function playerHasOpenSlot(player, slotsNeeded) {
  const pos = (player.position || "").trim().toUpperCase();
  if (!pos) return false;
  const n = (x) => (slotsNeeded[x] || 0) > 0;
  if (["PG", "SG"].includes(pos)) return n(pos) || n("G") || n("UTIL"); 
  if (["SF", "PF"].includes(pos)) return n(pos) || n("F") || n("UTIL");
  if (["C"].includes(pos)) return n(pos) || n("UTIL");
  return n("UTIL");
}

function getRecommendationReason(p, positionNeed) {
  const proj = Number(p.projected_fantasy_pts_2025_26) || 0;
  const prior = Number(p.fantasy_pts_2024_25) || 0;
  const pos = (p.position || "").trim();
  const parts = [];
  if (positionNeed > 0) {
    parts.push(`Fills your open ${pos} slot`);
  }
  parts.push(`top projected (${proj.toLocaleString()} pts)`);
  if (prior > 0) {
    parts.push(`strong 2024-25 (${prior.toLocaleString()})`);
  }
  return parts.join("; ");
}

/** Build a serializable facts object for the top recommendation (for the explain API). */
function buildFacts(p) {
  if (!p) return null;
  const slotsNeeded = getPositionSlotsNeeded();
  const positionNeed = (p._positionNeed || 0) > 0;
  const positionsStillNeeded = {};
  ["PG", "SG", "SF", "PF", "C"].forEach((pos) => {
    const n = slotsNeeded[pos];
    if (n != null && n > 0) positionsStillNeeded[pos] = n;
  });
  return {
    playerName: (p.player_name || "").trim(),
    team: (p.team || "").trim(),
    position: (p.position || "").trim(),
    positionNeed,
    projectedPts: Number(p.projected_fantasy_pts_2025_26) || 0,
    priorYearPts: Number(p.fantasy_pts_2024_25) || 0,
    positionsStillNeeded: Object.keys(positionsStillNeeded).length ? positionsStillNeeded : undefined,
  };
}

/** Fetch one plain-English explanation for all top 3 recommendations and show it in the section below the cards. */
function fetchAndShowPlainEnglishForTop3(top3) {
  if (!EXPLAIN_API_URL || !top3.length || !recommendationsExplanationWrap || !recommendationsExplanationText) return;
  const factsList = top3.map((p) => buildFacts(p)).filter(Boolean);
  if (factsList.length === 0) return;

  recommendationsExplanationWrap.hidden = false;
  recommendationsExplanationText.textContent = "...";

  const url = EXPLAIN_API_URL.replace(/\/$/, "") + "/api/explain-recommendation";
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts: factsList }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    })
    .then((data) => {
      if (data.plainEnglish && recommendationsExplanationText) {
        recommendationsExplanationText.textContent = data.plainEnglish;
      }
    })
    .catch(() => {
      if (recommendationsExplanationText) {
        recommendationsExplanationText.textContent = "Could not load explanation.";
      }
    });
}

function getTopRecommendations(n) {
  const available = getAvailablePlayers();
  const slotsNeeded = getPositionSlotsNeeded();
  available.forEach((p) => {
    p._positionNeed = playerHasOpenSlot(p, slotsNeeded) ? 1 : 0;
  });
  const recs = [...available]
    .sort((a, b) => {
      const aFills = (a._positionNeed || 0) > 0 ? 1 : 0;
      const bFills = (b._positionNeed || 0) > 0 ? 1 : 0;
      if (bFills !== aFills) return bFills - aFills;
      const projA = a.projected_fantasy_pts_2025_26 || 0;
      const projB = b.projected_fantasy_pts_2025_26 || 0;
      if (projB !== projA) return projB - projA;
      const prevA = a.fantasy_pts_2024_25 || 0;
      const prevB = b.fantasy_pts_2024_25 || 0;
      return prevB - prevA;
    })
    // .slice(0, n);
    if (isUserPick(pickIndex)) console.log("\n10 recs:", recs.slice(0,10));
    return recs.slice(0,n)
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

function showSetup() {
  draftFlowCard.hidden = true;
  draftHistoryCard.hidden = true;
  yourRosterCard.hidden = true;
  draftCompleteCard.hidden = true;
  draftInfoCard.hidden = false;

  if (!settings) {
    draftSetupMsg.textContent = "No league settings saved. Set your number of teams and draft position on the League Settings page, then return here.";
    draftSetupActions.hidden = true;
    return;
  }
  if (allPlayers.length === 0) {
    draftSetupMsg.textContent = "Player data is still loading…";
    draftSetupActions.hidden = true;
    return;
  }

  const total = getTotalPicks();
  draftSetupMsg.textContent = `${settings.numTeams} teams, your pick #${settings.draftPosition}. Snake draft until each team has ${PLAYERS_PER_TEAM} players (${total} total picks).`;
  draftSetupActions.hidden = false;
}

function getTeamLabelForPick(index) {
  const teamIndex = getTeamIndexForPick(index);
  const isUser = teamIndex === settings.draftPosition - 1;
  return isUser ? "You" : `Team ${teamIndex + 1}`;
}

function recordDraftPick(pickNumber, teamLabel, playerName, isUser) {
  draftHistory.push({ pickNumber, teamLabel, playerName, isUser });
}

function renderDraftHistory() {
  if (!draftHistoryList) return;
  draftHistoryList.innerHTML = draftHistory
    .map(
      (entry) =>
        `<li class="draft-history-item ${entry.isUser ? "draft-history-item-you" : ""}">
          <span class="draft-history-pick">#${entry.pickNumber}</span>
          <span class="draft-history-team">${escapeHtml(entry.teamLabel)}</span>
          <span class="draft-history-player">${escapeHtml(entry.playerName)}</span>
        </li>`
    )
    .join("");
  const wrap = draftHistoryList.closest(".draft-history-wrap");
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function startDraft() {
  draftStarted = true;
  pickIndex = 0;
  draftedNames = new Set();
  userRoster = [];
  draftHistory = [];
  simulateMode = !!(simulateCheckboxSetup && simulateCheckboxSetup.checked);
  if (simulateCheckboxFlow) simulateCheckboxFlow.checked = simulateMode;
  draftInfoCard.hidden = true;
  draftFlowCard.hidden = false;
  draftHistoryCard.hidden = false;
  yourRosterCard.hidden = false;
  draftCompleteCard.hidden = true;
  otherPickInput.value = "";
  yourPickInput.value = "";
  autocompleteList.hidden = true;
  yourAutocompleteList.hidden = true;
  renderPick();
  renderYourRoster();
  renderDraftHistory();
}

function renderPick() {
  const total = getTotalPicks();
  if (pickIndex >= total) {
    draftFlowCard.hidden = true;
    yourRosterCard.hidden = false;
    draftHistoryCard.hidden = false;
    draftCompleteCard.hidden = false;
    renderYourRoster();
    renderDraftHistory();
    return;
  }

  const round = Math.floor(pickIndex / settings.numTeams) + 1;
  const teamIndex = getTeamIndexForPick(pickIndex);
  const teamNum = teamIndex + 1;
  const isUser = isUserPick(pickIndex);

  currentPickNumEl.textContent = pickIndex + 1;
  totalPicksEl.textContent = total;
  currentRoundEl.textContent = round;
  draftTurnLabel.textContent = isUser ? "Your turn" : `Team ${teamNum}'s turn`;

  sectionOtherPick.hidden = isUser;
  sectionYourPick.hidden = !isUser;

  if (isUser) {
    const top3 = getTopRecommendations(3);
    if (recommendationsExplanationWrap) {
      recommendationsExplanationWrap.hidden = !EXPLAIN_API_URL;
    }
    recommendationsEl.innerHTML = top3
      .map(
        (p) =>
          `<button type="button" class="rec-card" data-name="${escapeHtml(p.player_name)}">
            <span class="rec-name">${escapeHtml(p.player_name)}</span>
            <span class="rec-meta">${escapeHtml(p.team)} · ${escapeHtml(p.position)} · ${Number(p.projected_fantasy_pts_2025_26).toLocaleString()} proj</span>
            <span class="rec-reason">${escapeHtml(getRecommendationReason(p, p._positionNeed))}</span>
          </button>`
      )
      .join("");
    recommendationsEl.querySelectorAll(".rec-card").forEach((btn) => {
      btn.addEventListener("click", () => confirmUserPick(btn.dataset.name));
    });
    fetchAndShowPlainEnglishForTop3(top3);
    yourPickInput.value = "";
    yourAutocompleteList.hidden = true;
  } else {
    otherPickInput.value = "";
    otherPickInput.focus();
    btnConfirmOther.disabled = true;
    if (simulateMode) {
      const top1 = getTopRecommendations(1)[0];
      if (top1) {
        setTimeout(() => autoPickForOther(top1.player_name), 300);
      }
    }
  }
}

function autoPickForOther(playerName) {
  if (pickIndex >= getTotalPicks()) return;
  if (isUserPick(pickIndex)) return;
  confirmOtherPick(playerName);
}

function confirmOtherPick(playerName) {
  const name = (playerName || "").trim();
  if (!name) return;
  const pickNum = pickIndex + 1;
  const teamLabel = getTeamLabelForPick(pickIndex);
  recordDraftPick(pickNum, teamLabel, name, false);
  draftedNames.add(name);
  pickIndex++;
  renderDraftHistory();
  renderPick();
}

function confirmUserPick(playerName) {
  const name = (playerName || "").trim();
  if (!name) return;
  const pickNum = pickIndex + 1;
  recordDraftPick(pickNum, "You", name, true);
  const player = allPlayers.find((p) => (p.player_name || "").trim() === name) || {
    player_name: name, team: "—", position: "—", projected_fantasy_pts_2025_26: 0,
  };
  draftedNames.add(name);
  const slotFills = getSlotFills();
  const slot = assignSlotForPlayer(player, slotFills);
  userRoster.push({ player, slot });
  pickIndex++;
  renderDraftHistory();
  renderPick();
  renderYourRoster();
}

function renderYourRoster() {
  yourPickCountEl.textContent = userRoster.length;
  const slotFills = getSlotFills();
  if (slotIndicatorsEl) {
    const slots = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL", "BENCH"];
    slotIndicatorsEl.innerHTML = slots
      .filter((pos) => (slotFills[pos]?.max ?? 0) > 0)
      .map((pos) => {
        const s = slotFills[pos];
        const filled = s?.filled ?? 0;
        const max = s?.max ?? 0;
        const isFull = filled >= max;
        const label = pos === "BENCH" ? "Bench" : pos;
        return `<span class="slot-indicator ${isFull ? "full" : "open"}">${escapeHtml(label)} ${filled}/${max}</span>`;
      })
      .join("");
  }
  yourRosterList.innerHTML = userRoster
    .map((entry, i) => {
      const p = getPlayerFromEntry(entry);
      const slot = entry.slot || "—";
      return `<li><span class="roster-pick-num">${i + 1}</span> ${escapeHtml(p?.player_name ?? "—")} <span class="roster-meta">${escapeHtml(p?.team ?? "")} ${escapeHtml(p?.position ?? "")}</span> <span class="roster-slot-tag">${escapeHtml(slot)}</span></li>`;
    })
    .join("");
}

function filterAutocomplete(query, excludeDrafted = true) {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 2) return [];
  const available = excludeDrafted ? getAvailablePlayers() : allPlayers;
  return available
    .filter((p) => (p.player_name || "").toLowerCase().includes(q))
    .slice(0, 8);
}

function showAutocomplete(inputEl, listEl, onSelect) {
  const query = inputEl.value;
  const hits = filterAutocomplete(query);
  listEl.innerHTML = "";
  if (hits.length === 0) {
    listEl.hidden = true;
    return;
  }
  hits.forEach((p) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.textContent = `${p.player_name} (${p.team}, ${p.position})`;
    li.dataset.name = p.player_name;
    li.addEventListener("click", () => {
      onSelect(p.player_name);
      listEl.hidden = true;
      inputEl.value = p.player_name;
    });
    listEl.appendChild(li);
  });
  listEl.hidden = false;
}

// Load settings and CSV
settings = loadSettings();
fetch(CSV_URL)
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Failed to load CSV"))))
  .then((text) => {
    allPlayers = parseCSV(text);
    showSetup();
  })
  .catch((err) => {
    console.error(err);
    draftSetupMsg.textContent = "Could not load player data. Check that the CSV file is available.";
    draftSetupActions.hidden = true;
  });

// Start draft button
if (btnStartDraft) {
  btnStartDraft.addEventListener("click", startDraft);
}

// Simulate draft: sync checkboxes and simulateMode
function setSimulateMode(on) {
  simulateMode = !!on;
  if (simulateCheckboxSetup) simulateCheckboxSetup.checked = simulateMode;
  if (simulateCheckboxFlow) simulateCheckboxFlow.checked = simulateMode;
}

if (simulateCheckboxSetup) {
  simulateCheckboxSetup.addEventListener("change", () => setSimulateMode(simulateCheckboxSetup.checked));
}
if (simulateCheckboxFlow) {
  simulateCheckboxFlow.addEventListener("change", () => {
    setSimulateMode(simulateCheckboxFlow.checked);
    if (simulateMode && draftStarted && pickIndex < getTotalPicks() && !isUserPick(pickIndex)) {
      const top1 = getTopRecommendations(1)[0];
      if (top1) setTimeout(() => autoPickForOther(top1.player_name), 300);
    }
  });
}

function updateOtherPickUI() {
  showAutocomplete(otherPickInput, autocompleteList, (name) => {
    otherPickInput.value = name;
    if (btnConfirmOther) btnConfirmOther.disabled = false;
  });
  const hits = filterAutocomplete(otherPickInput?.value);
  const exact = hits.find(
    (p) => (p.player_name || "").trim().toLowerCase() === (otherPickInput?.value || "").trim().toLowerCase()
  );
  if (btnConfirmOther) btnConfirmOther.disabled = !exact;
}

if (otherPickInput) {
  otherPickInput.addEventListener("input", updateOtherPickUI);
  otherPickInput.addEventListener("focus", updateOtherPickUI);
}
document.addEventListener("click", (e) => {
  if (autocompleteList && !autocompleteList.contains(e.target) && e.target !== otherPickInput) {
    autocompleteList.hidden = true;
  }
  if (yourAutocompleteList && !yourAutocompleteList.contains(e.target) && e.target !== yourPickInput) {
    yourAutocompleteList.hidden = true;
  }
});

if (btnConfirmOther) {
  btnConfirmOther.addEventListener("click", () => {
    const name = (otherPickInput.value || "").trim();
    const available = getAvailablePlayers();
    const match = available.find((p) => (p.player_name || "").trim().toLowerCase() === name.toLowerCase());
    if (match) {
      confirmOtherPick(match.player_name);
    } else if (name.length >= 2) {
      const pickNum = pickIndex + 1;
      const teamLabel = getTeamLabelForPick(pickIndex);
      recordDraftPick(pickNum, teamLabel, name, false);
      draftedNames.add(name);
      pickIndex++;
      renderDraftHistory();
      renderPick();
    }
  });
}

// Your pick: autocomplete for custom pick
if (yourPickInput) {
  yourPickInput.addEventListener("input", () => {
    showAutocomplete(yourPickInput, yourAutocompleteList, (name) => {
      yourPickInput.value = name;
      confirmUserPick(name);
    });
  });
  yourPickInput.addEventListener("focus", () => {
    showAutocomplete(yourPickInput, yourAutocompleteList, (name) => {
      yourPickInput.value = name;
      confirmUserPick(name);
    });
  });
}
