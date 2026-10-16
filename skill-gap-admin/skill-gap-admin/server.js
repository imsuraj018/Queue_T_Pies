// server.js — API routes and change detection
import express from "express";
import { assessRepo, headSha, commitSignals, askBot, summarizeCandidates, SKILLS } from "./lib.js";



if (!process.env.GROQ_API_KEY) console.warn("Warning: GROQ_API_KEY is not set. AI assessment will fail.");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const tracked = new Map(); // "owner/repo" -> { owner, repo, requirements, last }
const events = [];         // change-event log shown in the dashboard
const POLL_MS = Number(process.env.POLL_MS || 15 * 60 * 1000);

// Run an assessment and start tracking the repo for changes.
app.post("/api/assess", async (req, res) => {
  try {
    const { owner, repo, requirements = [] } = req.body;
    if (!owner || !repo) return res.status(400).json({ error: "owner and repo are required" });
    const out = await assessRepo({ owner, repo, requirements });
    tracked.set(`${owner}/${repo}`, { owner, repo, requirements, last: out });
    res.json(out);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { question, history = [], context = {}, candidates = [] } = req.body;
    if (!question || typeof question !== "string") return res.status(400).json({ error: "question required" });
    if (question.length > 1000) return res.status(400).json({ error: "question too long" });
    if (!Array.isArray(candidates) || candidates.length > 20) {
      return res.status(400).json({ error: "candidates must be an array of up to 20 items" });
    }
    const safe = candidates
      .filter((c) => c && typeof c.id === "string" && typeof c.repo === "string")
      .map((c) => ({ id: c.id.slice(0, 20), repo: c.repo.slice(0, 200) }));

    const githubSummaries = await summarizeCandidates(safe);
    const answer = await askBot({
      question,
      history,
      context: { ...context, candidateRepositories: githubSummaries },
    });
    res.json({ answer });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/events", (_req, res) => res.json(events));

app.get("/api/authenticity/:owner/:repo", async (req, res) => {
  try {
    res.json(await commitSignals(req.params.owner, req.params.repo));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Change detection: when the default branch moves, reassess and log which skills changed.
async function poll() {
  for (const t of tracked.values()) {
    try {
      const { sha } = await headSha(t.owner, t.repo);
      if (sha === t.last.commit) continue;

      const prev = t.last;
      const next = await assessRepo(t);
      const changed = SKILLS.filter((s) => next.skills[s].status !== prev.skills[s].status);
      events.unshift({
        time: next.assessedAt,
        repo: `${t.owner}/${t.repo}`,
        commit: sha.slice(0, 7),
        changed,
        status: changed.length ? "Reassessed" : "No skill change",
      });
      t.last = next;
    } catch (e) {
      console.error(`poll ${t.owner}/${t.repo}: ${e.message}`);
    }
  }
}
setInterval(poll, POLL_MS);

app.listen(process.env.PORT || 3001, () => console.log("Admin running on http://localhost:3001"));
