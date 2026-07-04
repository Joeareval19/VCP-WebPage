/*
 * Vercel Function — proxies text-to-speech to ElevenLabs.
 *
 * Exists so ELEVENLABS_API_KEY never reaches client-side JS (this is a
 * public repo — anything in browser code is visible to any visitor). The
 * client (js/voice-widget.js) POSTs { text } here and gets back an audio
 * stream to play, same as it would from a direct client-side call, minus
 * the exposed key.
 *
 * Config: set ELEVENLABS_API_KEY in Vercel project env vars (never commit
 * it). See issue #43 — this was the "voice/LLM architecture" open question,
 * resolved in favor of a serverless proxy over browser-only calls.
 */

const rateLimit = require("./_rate-limit.js");

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
// A neutral default voice — swap via ELEVENLABS_VOICE_ID env var once a
// specific voice is chosen for the assistant's persona.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const MAX_TEXT_LENGTH = 500; // assistant questions are short; guards against abuse of the proxy
const MAX_PER_MINUTE = 20; // a real session asks ~6 questions; well above that, comfortably below abuse volume

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!rateLimit.allow(req, MAX_PER_MINUTE)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "TTS is not configured on the server" });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Missing required field: text" });
    return;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: "text exceeds " + MAX_TEXT_LENGTH + " characters" });
    return;
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  try {
    const upstream = await fetch(ELEVENLABS_API_URL + "/" + voiceId, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(function () { return ""; });
      res.status(upstream.status).json({ error: "ElevenLabs request failed", detail: detail });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store"); // feedback text is dynamic per-turn, never cache
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buffer);
  } catch (err) {
    res.status(502).json({ error: "TTS proxy failed", detail: err.message });
  }
};
