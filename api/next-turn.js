/*
 * Vercel Function — generates the assistant's next question in a voice
 * feedback session, replacing the mocked keyword-matching stand-in that
 * used to live client-side (js/voice-widget.js's old nextTurn()).
 *
 * Exists so GROQ_API_KEY never reaches client-side JS (public repo —
 * anything in browser code is visible to any visitor). The client POSTs
 * the transcript so far ({ history }) and gets back either the next
 * question to ask, or a signal that the session has reached a natural,
 * specific conclusion (per issue #43's session-end criteria).
 *
 * Config: set GROQ_API_KEY in Vercel project env vars (never commit it).
 * Groq's API is OpenAI-compatible chat completions — see
 * https://console.groq.com/docs/api-reference#chat-create. Model choice:
 * a small fast model, since this is short, low-latency turn generation,
 * not a task that needs a large model.
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const MAX_HISTORY_TURNS = 12; // 6 visitor + 6 assistant lines — matches the widget's MAX_TURNS safety cap
const MAX_LINE_LENGTH = 1000; // guards against a single runaway transcript line inflating the prompt

const SYSTEM_PROMPT = [
  "You are a brief, friendly QA assistant collecting voice feedback about a website from an anonymous visitor.",
  "Your job: start broad, then ask sharper follow-up questions that dig from vague impressions into specific,",
  "actionable detail (e.g. which element, what about it, what a fix might look like).",
  "Ask exactly ONE question per turn. Keep questions short (one sentence) since they will be spoken aloud.",
  "If the visitor indicates they're done, or the conversation has reached a natural and specific conclusion",
  "(you have at least one concrete, specific piece of feedback), respond with exactly the token DONE instead of a question.",
  "Never ask for personally identifying information. Never repeat a question already asked in this transcript.",
].join(" ");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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
