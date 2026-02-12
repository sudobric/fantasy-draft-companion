/**
 * Fantasy Basketball Draft Companion
 * League settings form and localStorage persistence.
 */

const STORAGE_KEY = "fantasy-draft-companion-league-settings";

const form = document.getElementById("league-settings-form");
const numTeamsInput = document.getElementById("num-teams");
const draftPositionInput = document.getElementById("draft-position");
const draftPositionHint = document.getElementById("draft-position-hint");
const totalStarterSlotsEl = document.getElementById("total-starter-slots");
const statusCard = document.getElementById("status-card");
const statusMessage = document.getElementById("status-message");
const statusDetail = document.getElementById("status-detail");
const btnReset = document.getElementById("btn-reset");

const rosterInputIds = [
  "slot-pg",
  "slot-sg",
  "slot-sf",
  "slot-pf",
  "slot-c",
  "slot-g",
  "slot-f",
  "slot-util",
];

function getStarterTotal() {
  return rosterInputIds.reduce((sum, id) => {
    const input = document.getElementById(id);
    return sum + (input ? Math.max(0, parseInt(input.value, 10) || 0) : 0);
  }, 0);
}

function updateStarterTotal() {
  const total = getStarterTotal();
  totalStarterSlotsEl.textContent = total;
}

function syncDraftPositionMax() {
  const numTeams = parseInt(numTeamsInput.value, 10) || 12;
  draftPositionInput.max = numTeams;
  const pos = parseInt(draftPositionInput.value, 10);
  if (pos > numTeams) draftPositionInput.value = numTeams;
  draftPositionHint.textContent = `Pick 1–${numTeams}`;
}

function getFormData() {
  const numTeams = parseInt(numTeamsInput.value, 10) || 12;
  const draftPosition = parseInt(draftPositionInput.value, 10) || 1;
  const roster = {};
  rosterInputIds.forEach((id) => {
    const name = id.replace("slot-", "").toUpperCase();
    const input = document.getElementById(id);
    roster[name] = input ? Math.max(0, parseInt(input.value, 10) || 0) : 0;
  });
  return {
    leagueName: (document.getElementById("league-name").value || "").trim(),
    numTeams,
    draftPosition: Math.min(Math.max(1, draftPosition), numTeams),
    roster,
    benchSlots: Math.max(0, parseInt(document.getElementById("bench-slots").value, 10) || 0),
    totalStarterSlots: getStarterTotal(),
    savedAt: new Date().toISOString(),
  };
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("Failed to save league settings:", e);
    return false;
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Failed to load league settings:", e);
    return null;
  }
}

function showStatus(saved, data) {
  statusCard.classList.toggle("saved", !!saved);
  if (saved && data) {
    statusMessage.textContent = "League settings saved. They will be used during the draft.";
    const lines = [
      data.leagueName ? `League: ${data.leagueName}` : null,
      `${data.numTeams} teams, your pick: ${data.draftPosition}`,
      `Starters: ${data.totalStarterSlots} | Bench: ${data.benchSlots}`,
      `Saved: ${new Date(data.savedAt).toLocaleString()}`,
    ].filter(Boolean);
    statusDetail.textContent = lines.join("\n");
  } else {
    statusMessage.textContent =
      "No league settings saved yet. Fill the form and click “Save league settings”.";
    statusDetail.textContent = "";
  }
}

function setFormFromData(data) {
  if (!data) return;
  const leagueName = document.getElementById("league-name");
  if (leagueName) leagueName.value = data.leagueName || "";
  if (numTeamsInput) numTeamsInput.value = data.numTeams ?? 12;
  if (draftPositionInput) draftPositionInput.value = data.draftPosition ?? 1;
  const roster = data.roster || {};
  rosterInputIds.forEach((id) => {
    const key = id.replace("slot-", "").toUpperCase();
    const input = document.getElementById(id);
    if (input && roster[key] !== undefined) input.value = roster[key];
  });
  const bench = document.getElementById("bench-slots");
  if (bench && data.benchSlots !== undefined) bench.value = data.benchSlots;
  syncDraftPositionMax();
  updateStarterTotal();
}

function setDefaults() {
  document.getElementById("league-name").value = "";
  numTeamsInput.value = 12;
  draftPositionInput.value = 1;
  document.getElementById("slot-pg").value = 1;
  document.getElementById("slot-sg").value = 1;
  document.getElementById("slot-sf").value = 1;
  document.getElementById("slot-pf").value = 1;
  document.getElementById("slot-c").value = 1;
  document.getElementById("slot-g").value = 1;
  document.getElementById("slot-f").value = 1;
  document.getElementById("slot-util").value = 2;
  document.getElementById("bench-slots").value = 3;
  syncDraftPositionMax();
  updateStarterTotal();
  showStatus(false);
}

if (form) form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = getFormData();
  if (saveToStorage(data)) {
    showStatus(true, data);
  } else {
    statusMessage.textContent = "Could not save (e.g. private browsing). Try again.";
    statusDetail.textContent = "";
  }
});


if (btnReset) btnReset.addEventListener("click", () => setDefaults());

if (numTeamsInput) numTeamsInput.addEventListener("input", syncDraftPositionMax);
if (draftPositionInput) draftPositionInput.addEventListener("input", syncDraftPositionMax);
rosterInputIds.forEach((id) => {
  const input = document.getElementById(id);
  if (input) input.addEventListener("input", updateStarterTotal);
});

// Load saved settings on page load
const saved = loadFromStorage();
if (saved) {
  setFormFromData(saved);
  showStatus(true, saved);
} else {
  syncDraftPositionMax();
  updateStarterTotal();
  showStatus(false);
}

// Expose for use during draft (e.g. from other pages or scripts)
window.getLeagueSettings = function () {
  return loadFromStorage();
};
