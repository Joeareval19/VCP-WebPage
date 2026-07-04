/*
 * Best-effort per-IP rate limiting shared by every voice-widget endpoint
 * (tts.js, next-turn.js, file-feedback.js) — each is an unauthenticated
 * public endpoint that spends real money/quota per call (ElevenLabs
 * credits, Groq tokens, GitHub API calls), so an unthrottled proxy is a
 * standing abuse/cost risk regardless of how narrow its own logic is.
 *
 * Deliberately in-memory, not a real distributed limiter: Vercel Functions
 * are stateless across cold starts and can run on multiple concurrent
 * instances, so this does NOT guarantee a hard global cap — a determined
 * abuser spread across enough concurrent invocations could exceed it. It
 * does stop the common case (one visitor's browser looping a request) at
 * negligible cost/complexity. If this widget sees real traffic, replace
 * with a real store (e.g. Vercel KV / Upstash) rather than tightening this
 * further — this module is intentionally the cheap first line, not the
 * final one.
 */

const WINDOW_MS = 60 * 1000;
const buckets = new Map(); // ip -> { count, windowStart }

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket && req.socket.remoteAddress || "unknown";
}

// Returns true if the request should proceed, false if it's over budget.
function allow(req, maxPerWindow) {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= maxPerWindow) return false;
  bucket.count += 1;
  return true;
}

module.exports = { allow: allow };
