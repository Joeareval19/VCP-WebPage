/*
 * Vercel Function — generates the assistant's next question in a voice-to-
 * spec intake session, replacing the mocked keyword-matching stand-in that
 * used to live client-side (js/voice-widget.js's old nextTurn()).
 *
 * Exists so GROQ_API_KEY never reaches client-side JS (public repo —
 * anything in browser code is visible to any visitor). The client POSTs
 * the transcript so far ({ history }) and gets back either the next
 * question to ask, or a signal that the session has reached a natural,
 * specific conclusion (per issue #43's session-end criteria).
 *
 * Revised 2026-07-05 (issue #43 amended spec): this is no longer a general
 * "what do you like/dislike" feedback interview — it's scoped to extract
 * a well-defined scope of work (why/what/acceptance-criteria/out-of-scope),
 * the same shape a human produces via /vcp-spec's own interrogation, just
 * adapted for a spoken, one-turn-at-a-time conversation. Output is
 * text-only (see js/voice-widget.js) — this endpoint's questions are never
 * spoken aloud, only rendered.
 *
 * Revised again 2026-07-05: per-turn durability now happens client-side —
 * js/voice-widget.js inserts each turn directly into Supabase's
 * vcp_voice_turns table (issue #60/[70005]) using the publishable anon key
 * (INSERT-only under RLS), the same pattern js/telemetry.js already uses.
 * This endpoint briefly upserted the growing transcript into
 * vcp_voice_sessions itself (via a privileged SUPABASE_SERVICE_ROLE_KEY),
 * but that was reconciled away once vcp_voice_turns landed — one row per
 * utterance, written directly from the browser, is simpler and needs no
 * server round-trip or privileged key just to persist a turn. This
 * endpoint is purely a Groq proxy again; it no longer touches Supabase.
 *
 * Config: set GROQ_API_KEY in Vercel project env vars (never commit it).
 * Groq's API is OpenAI-compatible chat completions — see
 * https://console.groq.com/docs/api-reference#chat-create. Model choice:
 * a small fast model, since this is short, low-latency turn generation,
 * not a task that needs a large model.
 */

const rateLimit = require("./_rate-limit.js");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const MAX_HISTORY_TURNS = 12; // 6 visitor + 6 assistant lines — matches the widget's MAX_TURNS safety cap
const MAX_LINE_LENGTH = 1000; // guards against a single runaway transcript line inflating the prompt
const MAX_PER_MINUTE = 20; // one real session makes ~6 calls to this endpoint

const SYSTEM_PROMPT = [
  "You are an intake assistant that turns a website visitor's spoken idea, request, or piece of feedback into a well-defined scope of work — the same shape a human would produce answering: why does this matter, what exactly should be built or changed, how would you know it's done (acceptance criteria), and what's explicitly out of scope.",
  "Your job: start broad, then ask sharper follow-up questions that dig from a vague idea into specific, actionable detail — who is affected, what the current behavior is versus the desired behavior, what a concrete 'done' looks like, and whether anything should be explicitly excluded.",
  "Ask exactly ONE question per turn. Keep questions short (one or two sentences) — this is a spoken conversation, not a written form.",
  "You have enough for a scope of work once you can state, even roughly: why this matters, what should change, and at least one concrete acceptance criterion. Once you have that, or the visitor indicates they're done, respond with exactly the token DONE instead of a question.",
  "Never ask for personally identifying information. Never repeat a question already asked in this transcript.",
].join(" ");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!rateLimit.allow(req, MAX_PER_MINUTE)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Conversation logic is not configured on the server" });
    return;
  }

  const { history } = req.body || {};
  if (!Array.isArray(history)) {
    res.status(400).json({ error: "Missing required field: history (array)" });
    return;
  }
  if (history.length > MAX_HISTORY_TURNS) {
    res.status(400).json({ error: "history exceeds " + MAX_HISTORY_TURNS + " turns" });
    return;
  }
  for (const turn of history) {
    if (!turn || (turn.role !== "assistant" && turn.role !== "visitor") || typeof turn.text !== "string") {
      res.status(400).json({ error: "Each history entry needs role (assistant|visitor) and text" });
      return;
    }
    if (turn.text.length > MAX_LINE_LENGTH) {
      res.status(400).json({ error: "A history line exceeds " + MAX_LINE_LENGTH + " characters" });
      return;
    }
  }

  var chatMessages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (history.length === 0) {
    chatMessages.push({ role: "user", content: "Start the session with your opening question." });
  } else {
    history.forEach(function (turn) {
      chatMessages.push({ role: turn.role === "assistant" ? "assistant" : "user", content: turn.text });
    });
  }

  try {
    const upstream = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        messages: chatMessages,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(function () { return ""; });
      res.status(upstream.status).json({ error: "LLM request failed", detail: detail });
      return;
    }

    const data = await upstream.json();
    const text = ((data.choices && data.choices[0] && data.choices[0].message.content) || "").trim();

    if (text === "DONE" || text.length === 0) {
      res.status(200).json({ done: true });
      return;
    }
    res.status(200).json({ done: false, question: text });
  } catch (err) {
    res.status(502).json({ error: "next-turn proxy failed", detail: err.message });
  }
};
