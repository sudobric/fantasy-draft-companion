/**
 * Backend proxy for Gemini API: turns recommendation facts into plain-English text.
 * Set GEMINI_API_KEY in environment (e.g. .env). Never commit the key.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Restrict CORS in production; use CORS_ORIGIN env or allow same-origin
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({ origin: corsOrigin || true }));
app.use(express.json());

// Serve static frontend (optional: so one server serves both API and app)
app.use(express.static(path.join(__dirname)));

const SYSTEM_INSTRUCTION_SINGLE =
  "You explain a fantasy basketball draft recommendation in very simple English. Use only the facts you are given. Write 1-2 short sentences. No extra opinions or numbers not in the facts. Aim for a beginner reader.";

const SYSTEM_INSTRUCTION_MULTI =
  "You explain fantasy basketball draft recommendations in very simple English. You are given the top 3 recommendations in order of preference (1 = best). Write 2-3 short sentences about the overall recommendations, including reasons why each is a good pick. Separate each recommendation with a blank line. No extra opinions or numbers not in the facts. Aim for a beginner basketball reader.";

app.post("/api/explain-recommendation", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: "Explain feature not configured (missing GEMINI_API_KEY)." });
  }

  const { facts } = req.body;
  if (!facts) {
    return res.status(400).json({ error: "Request body must include { facts: { ... } or facts: [ ... ] }." });
  }

  const isArray = Array.isArray(facts);
  const factsList = isArray ? facts : [facts];
  if (factsList.length === 0) {
    return res.status(400).json({ error: "facts must be a non-empty object or array." });
  }
  if (factsList.length > 10) {
    return res.status(400).json({ error: "Too many facts; maximum 10." });
  }

  const userMessage = factsList
    .map((f, i) => {
      const block = formatFactsForPrompt(f);
      return `Recommendation ${i + 1}:\n${block}`;
    })
    .join("\n\n");
  const systemInstruction = factsList.length > 1 ? SYSTEM_INSTRUCTION_MULTI : SYSTEM_INSTRUCTION_SINGLE;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction,
      generationConfig: {
        maxOutputTokens: 5000,
        temperature: 0.5,
      },
    });

    const result = await model.generateContent(userMessage);
    const response = result.response;
    if (!response || !response.text) {
      return res.status(502).json({ error: "Empty response from model." });
    }
    const plainEnglish = response.text().trim();
    return res.json({ plainEnglish });
  } catch (err) {
    console.error("Gemini API error:", err.message);
    const status = err.message && err.message.includes("API key") ? 401 : 502;
    return res.status(status).json({ error: "Could not get explanation." });
  }
});

const MAX_STRING_LENGTH = 200;

function sanitizeString(val) {
  if (val == null || typeof val !== "string") return "";
  return String(val).trim().slice(0, MAX_STRING_LENGTH);
}

function formatFactsForPrompt(facts) {
  const parts = [];
  if (facts.playerName != null) parts.push(`Player: ${sanitizeString(facts.playerName)}`);
  if (facts.team != null) parts.push(`Team: ${sanitizeString(facts.team)}`);
  if (facts.position != null) parts.push(`Position: ${sanitizeString(facts.position)}`);
  if (facts.positionNeed != null)
    parts.push(`We need this position: ${facts.positionNeed ? "yes" : "no"}`);
  if (facts.projectedPts != null) parts.push(`Projected fantasy points this season: ${Number(facts.projectedPts) || 0}`);
  if (facts.priorYearPts != null) parts.push(`Last season fantasy points: ${Number(facts.priorYearPts) || 0}`);
  if (facts.positionsStillNeeded && typeof facts.positionsStillNeeded === "object") {
    const needList = Object.entries(facts.positionsStillNeeded)
      .filter(([, n]) => Number(n) > 0)
      .map(([pos, n]) => `${sanitizeString(pos)}: ${Number(n) || 0}`)
      .join(", ");
    if (needList) parts.push(`Positions still needed: ${needList}`);
  }
  return parts.length ? parts.join(". ") : JSON.stringify(facts);
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set; /api/explain-recommendation will return 503.");
  }
});
