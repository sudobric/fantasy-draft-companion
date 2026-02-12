# Fantasy Basketball Draft Companion

A web app to configure your fantasy basketball league and run a live snake draft. Set league size, your draft position, and roster slots—then enter picks as they happen and get top-3 recommendations when it’s your turn.

## Features

### League Settings
- **League configuration**: League name (optional), number of teams (4–30), your draft position
- **Roster slots**: PG, SG, SF, PF, C, G, F, UTIL (each configurable 0–5)
- **Bench slots**: Set number of bench spots (0–10)
- **Local storage**: All settings are saved in your browser (localStorage) and restored when you return

### Player Rankings
- Browse NBA player data (2024–25 fantasy points and 2025–26 projections)
- Sort by clicking column headers (2024–25 FP or 2025–26 Proj)
- Filter by team or position

### Draft Companion
- **Snake draft**: Supports any league size; each team drafts 12 players
- **Other teams’ picks**: Enter drafted players via autocomplete; confirm to advance
- **Simulate draft**: Option to auto-pick best available player for other teams
- **Your turn**: Top 3 recommendations based on projected points, position needs, and prior-year performance
- **Position-aware**: Recommendations and roster slots respect PG, SG, SF, PF, C, G, F, UTIL, and bench
- **Custom pick**: Search and select any available player instead of a recommendation
- **Your roster**: Live view of your picks with slot indicators (e.g. PG 1/1, UTIL 0/2)
- **Draft history**: Full list of all picks as they’re made

## How to run

You need a local server to load player data (the CSV is fetched via `fetch`; opening files directly with `file://` will fail).

**Option 1: Node server (recommended)** — Serves the app and optional explain API:

```bash
npm install
npm start
```

Visit `http://localhost:3000`.

**Option 2: Static server only**

```bash
# Python 3
python3 -m http.server 8000

# Node (npx)
npx serve .
```

Then visit `http://localhost:8000` (or the port shown).

## Optional: Plain-English recommendations (Gemini API)

The app can call a backend that uses Google’s Gemini API to turn the top 3 recommendations into a short plain-English explanation. Without the backend, recommendations still show bullet-point reasons.

1. **Backend**: Run the Node server (`npm start`). It serves the app and the explain API at `http://localhost:3000`.
2. **API key**: Create a key at [Google AI Studio](https://aistudio.google.com/apikey). Put it in a `.env` file in the project root (do not commit):
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. **Frontend**: In `js/draft.js`, set `EXPLAIN_API_URL` to `"http://localhost:3000"` (or your backend URL). When it’s empty, the explain feature is off. If the request fails, the app keeps using bullet reasons.

## Using stored settings programmatically

Settings are stored under `fantasy-draft-companion-league-settings`. From any page on the same origin:

```javascript
const settings = window.getLeagueSettings();
// or
const raw = localStorage.getItem('fantasy-draft-companion-league-settings');
const settings = raw ? JSON.parse(raw) : null;
```

Example `settings` object:

```json
{
  "leagueName": "Office League 2025",
  "numTeams": 12,
  "draftPosition": 3,
  "roster": { "PG": 1, "SG": 1, "SF": 1, "PF": 1, "C": 1, "G": 1, "F": 1, "UTIL": 2 },
  "benchSlots": 3,
  "totalStarterSlots": 10,
  "savedAt": "2025-02-04T12:00:00.000Z"
}
```

Use `numTeams` and `draftPosition` for pick order, and `roster` / `totalStarterSlots` / `benchSlots` for roster construction.

## Player data

Player data comes from `data/nba_fantasy_2025_26.csv` with columns:

- `player_name`, `team`, `position`
- `fantasy_pts_2024_25` — 2024–25 season fantasy points
- `projected_fantasy_pts_2025_26` — projected fantasy points for 2025–26

Values are sample/placeholder. Replace with real data (e.g. from ESPN, Yahoo, or another source). See `data/README.md` for details.

## Tech

- Plain HTML, CSS, and JavaScript
- No build step for the frontend
- localStorage for settings
- Node backend (Express) serves the app and optional `/api/explain-recommendation` (Gemini API) when using `npm start`
