/**
 * Player Rankings tab: load CSV, sort by fantasy columns, filter by team/position.
 * My Team tab: show drafted roster from localStorage.
 */

const CSV_URL = "data/nba_fantasy_2025_26.csv";
const DRAFTED_TEAM_STORAGE_KEY = "fantasy-draft-companion-drafted-team";

const tabSettings = document.getElementById("tab-settings");
const tabPlayers = document.getElementById("tab-players");
const tabMyTeam = document.getElementById("tab-myteam");
const panelSettings = document.getElementById("panel-settings");
const panelPlayers = document.getElementById("panel-players");
const panelMyTeam = document.getElementById("panel-myteam");
const myteamContent = document.getElementById("myteam-content");
const filterTeam = document.getElementById("filter-team");
const filterPosition = document.getElementById("filter-position");
const tableBody = document.getElementById("players-tbody");
const playersCountEl = document.getElementById("players-count");

let allPlayers = [];
let sortKey = "fantasy_pts_2024_25";
let sortDir = "desc";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    if (row.player_name) rows.push(row);
  }
  return rows;
}

function loadPlayers() {
  fetch(CSV_URL)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error("Failed to load CSV"))))
    .then((text) => {
      allPlayers = parseCSV(text);
      const teams = [...new Set(allPlayers.map((p) => p.team).filter(Boolean))].sort();
      const teamSelect = document.getElementById("filter-team");
      teamSelect.innerHTML = '<option value="">All teams</option>';
      teams.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        teamSelect.appendChild(opt);
      });
      applySortAndFilter();
    })
    .catch((err) => {
      tableBody.innerHTML = '<tr><td colspan="5" class="loading">Could not load player data.</td></tr>';
      console.error(err);
    });
}

function getFilteredPlayers() {
  const team = (filterTeam && filterTeam.value) || "";
  const pos = (filterPosition && filterPosition.value) || "";
  return allPlayers.filter((p) => {
    if (team && p.team !== team) return false;
    if (pos && p.position !== pos) return false;
    return true;
  });
}

function applySortAndFilter() {
  let list = getFilteredPlayers();
  const key = sortKey;
  const dir = sortDir === "asc" ? 1 : -1;
  const numKeys = ["fantasy_pts_2024_25", "projected_fantasy_pts_2025_26"];
  const isNum = numKeys.includes(key);
  list = [...list].sort((a, b) => {
    let va = a[key];
    let vb = b[key];
    if (isNum) {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
      return dir * (va - vb);
    }
    va = String(va);
    vb = String(vb);
    return dir * va.localeCompare(vb);
  });
  renderTable(list);
  if (playersCountEl) playersCountEl.textContent = `Showing ${list.length} player${list.length !== 1 ? "s" : ""}.`;
}

function renderTable(players) {
  if (!tableBody) return;
  if (players.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="loading">No players match the filters.</td></tr>';
    return;
  }
  tableBody.innerHTML = players
    .map(
      (p) =>
        `<tr>
          <td>${escapeHtml(p.player_name)}</td>
          <td>${escapeHtml(p.team)}</td>
          <td>${escapeHtml(p.position)}</td>
          <td class="num">${escapeHtml(formatNum(p.fantasy_pts_2024_25))}</td>
          <td class="num">${escapeHtml(formatNum(p.projected_fantasy_pts_2025_26))}</td>
        </tr>`
    )
    .join("");
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s ?? "";
  return div.innerHTML;
}

function formatNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : (v ?? "");
}

function setSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = "desc";
  }
  document.querySelectorAll(".players-table th.sortable").forEach((th) => {
    th.classList.remove("sort-asc", "sort-desc");
    if (th.dataset.sort === key) th.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
  });
  applySortAndFilter();
}

function getPlayerFromEntry(entry) {
  return entry && (entry.player ?? entry);
}

function renderMyTeamPanel() {
  if (!myteamContent) return;
  try {
    const raw = localStorage.getItem(DRAFTED_TEAM_STORAGE_KEY);
    const roster = raw ? JSON.parse(raw) : null;
    if (!roster || !Array.isArray(roster) || roster.length === 0) {
      myteamContent.innerHTML = "<p class=\"myteam-empty\">No team drafted yet. Complete a draft to see your roster here.</p>";
      return;
    }
    const listHtml = roster
      .map((entry, i) => {
        const p = getPlayerFromEntry(entry);
        const slot = entry.slot || "—";
        return `<li><span class="roster-pick-num">${i + 1}</span> ${escapeHtml(p?.player_name ?? "—")} <span class="roster-meta">${escapeHtml(p?.team ?? "")} ${escapeHtml(p?.position ?? "")}</span> <span class="roster-slot-tag">${escapeHtml(slot)}</span></li>`;
      })
      .join("");
    myteamContent.innerHTML = `<ul class="roster-list">${listHtml}</ul>`;
  } catch (e) {
    myteamContent.innerHTML = "<p class=\"myteam-empty\">Could not load your drafted team.</p>";
  }
}

function switchTab(activeTab) {
  const isSettings = activeTab === "settings";
  const isPlayers = activeTab === "players";
  const isMyTeam = activeTab === "myteam";

  if (tabSettings) {
    tabSettings.classList.toggle("active", isSettings);
    tabSettings.setAttribute("aria-selected", isSettings ? "true" : "false");
  }
  if (tabPlayers) {
    tabPlayers.classList.toggle("active", isPlayers);
    tabPlayers.setAttribute("aria-selected", isPlayers ? "true" : "false");
  }
  if (tabMyTeam) {
    tabMyTeam.classList.toggle("active", isMyTeam);
    tabMyTeam.setAttribute("aria-selected", isMyTeam ? "true" : "false");
  }

  if (panelSettings) {
    panelSettings.classList.toggle("active", isSettings);
    panelSettings.hidden = !isSettings;
  }
  if (panelPlayers) {
    panelPlayers.classList.toggle("active", isPlayers);
    panelPlayers.hidden = !isPlayers;
  }
  if (panelMyTeam) {
    panelMyTeam.classList.toggle("active", isMyTeam);
    panelMyTeam.hidden = !isMyTeam;
  }

  if (isMyTeam) renderMyTeamPanel();
}

// Tab clicks
if (tabSettings) tabSettings.addEventListener("click", () => switchTab("settings"));
if (tabPlayers) tabPlayers.addEventListener("click", () => switchTab("players"));
if (tabMyTeam) tabMyTeam.addEventListener("click", () => switchTab("myteam"));

// Sort: click on sortable headers
document.querySelectorAll(".players-table th.sortable").forEach((th) => {
  th.addEventListener("click", () => setSort(th.dataset.sort));
});

// Filters
if (filterTeam) filterTeam.addEventListener("change", applySortAndFilter);
if (filterPosition) filterPosition.addEventListener("change", applySortAndFilter);

// Initial load and panel visibility
loadPlayers();
if (panelPlayers) panelPlayers.hidden = true;
if (panelMyTeam) panelMyTeam.hidden = true;
