**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 97/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | Only `audit` (this run) registered — pending by definition; no package.json pre-#9 (normal); `node --check` clean on all 4 JS files; no leftover merge-conflict markers after the main merge |
| Spec compliance | 24/25 | 13 of 15 acceptance criteria demonstrably met in-checkout; the 2 remaining (live migration run, Vercel env vars) are explicitly disclosed, correctly gated, and degrade gracefully — PR honestly states "part of #43, does not close it". −1: pattern redaction is inherently partial |
| Correctness under stress | 24/25 | Prior name-redaction BLOCKER genuinely fixed (verified); all 4 prior stranded-session NOTEs resolved; upsert/PATCH-vs-RLS paths correct. −1: redaction misses "I am X"/standalone/lowercase names |
| Platform integrity | 15/15 | Sole shared-code edit (`.vcp-nav` z-index tokenization) value-identical; all other CSS purely additive; widget is a self-contained IIFE that no-ops when absent; publishable key matches existing telemetry.js; migration schemas match code writes exactly |
| Security | 9/10 | Privileged keys stay server-side; publishable INSERT-only key is the established pattern (not a secret); rate limiting + input validation on both endpoints; no values in .env.example; .gitignore covers .env*.local. −1: in-memory limiter is best-effort only (acknowledged in code) |

### Machine checks
- `gh pr checks`: only `audit` (this run) — pending by definition. No failures.
- Local lint/build/test: no package.json, no lint configured — normal pre-#9, not a finding.
- `node --check` on js/voice-widget.js, api/next-turn.js, api/file-feedback.js, api/_rate-limit.js: all clean.
- No `<<<<<<<`/`=======`/`>>>>>>>` markers left after the `origin/main` merge that touched components.css/tokens.css/demo.html.

### Spec compliance (ticket #43, amended 2026-07-05)
- [x] Liquid-motion ball renders bottom-right on every page, persists across navigation (sessionStorage chrome state), above content (`--z-widget: 500` > `--z-nav: 100`)
- [x] Animation respects `prefers-reduced-motion` both visually (CSS `transform: none !important`, `border-radius: pill`) AND at the JS level (`startIdle`/`startAudioReactive` no-op under the media query)
- [x] Clicking the ball opens a bottom-anchored panel without navigating away
- [x] Visible consent notice before the mic activates; explicit Start button arms it; Start disabled with a message when the browser lacks `SpeechRecognition`
- [x] Voice in via `SpeechRecognition`, all assistant output text-rendered — no TTS/audio: `supportsVoice` no longer checks `speechSynthesis`; api/tts.js and ElevenLabs fully removed from the tree
- [x] Questions scoped to extract a scope of work (why/what/acceptance-criteria/out-of-scope) — api/next-turn.js system prompt and the client fallback both reframed
- [x] Each open starts an independent session, `history = []`, fresh `session_id` — no cross-session memory
- [x] Closing the widget ends the session immediately, no confirmation
- [~] Confirm/run the migration against the live Supabase project + verify an end-to-end INSERT: migration `70005_voice_turns.sql` present and schema-correct; PR documents live verification (test rows inserted/deleted). Not independently re-runnable from this audit — accepted on the author's disclosed live test.
- [x] Session end writes to `vcp_voice_sessions` (transcript/page_context/duration/status) — server-side via file-feedback.js, path documented (service-role key, one consistent code path)
- [x] Every turn (not just end) persists durably — client inserts one row per utterance into `vcp_voice_turns` (INSERT-only anon key), so an abandoned mid-conversation session still leaves a partial transcript
- [x] Extracted scope-of-work filed as a Pending ticket via /vcp-spec's board mechanics (same project/field/option IDs, [7xxxx] code computed by scanning all titles), category present
- [x] `filed_issue` written back to the session row (privileged server-side PATCH)
- [x] Design-system tokens/components for the chrome; liquid ball documented in demo.html (09 section)
- [x] Works across the whole site — widget markup + script on all 7 content pages (index/research/projects/library/intent/socials/project-detail)
- [~] Env vars (GROQ_API_KEY, GITHUB_TOKEN, SUPABASE_SERVICE_ROLE_KEY) not yet in Vercel — explicitly disclosed; both endpoints return a clean "not configured" 500 and the client fallback takes over. Gated on Jose's interactive terminal, not a code defect.

### Stress tests performed
- Re-ran the prior BLOCKER's exact cases against the current `PII_PATTERNS` (extracted verbatim, run in Node): "my name is John Smith and I like the nav" → "my name is [redacted-name] and I like the nav"; "this is Miguel from Vegas" → "this is [redacted-name] from Vegas" (does NOT swallow "from"); "Im Bob" → redacted. Emails and phones redact. The name blocker from the previous audit is genuinely fixed.
- Redaction gaps (NOTE, not blocker — spec scopes this to "pattern-based" + a consent notice): "I am Sarah Connor" survives ("I am" not in the lead-in set), lowercase/standalone names survive, and "(415) 555-0199" leaves a stray "(" (cosmetic).
- Read-path edges the previous audit flagged, re-checked against the current code: (1) autoplay-stranding is structurally gone — text-out only, no `audio.play()` path exists; (2) `finishTimer` is now stored (finishSession) and cleared in both startSession and endSession, so close+reopen within 1.6s no longer kills the fresh session; (3) `recognition.onerror` now routes permission errors to `renderMicError` (retry affordance) and re-listens only on transient no-speech/aborted.
- `arm()` calls `askQuestion(turn.question)` without a `done` check, but only ever runs on an empty history where `fetchNextTurn` returns the constant OPENING_QUESTION — `question` is always defined on that path; subsequent turns route through `onresult`, which does check `turn.done`. No undefined-question crash.
- file-feedback.js required-field validation (transcript/sessionId/pageContext length+type) present; `recordVoiceSession` supplies non-null `transcript` and `page_context: pageContext || "unknown"`, satisfying the table's NOT NULL constraints; `status` is a valid enum value ('completed'|'abandoned').

### Integrity sweep
- Diff is 17 files. The ONLY edit to a pre-existing shared CSS rule is css/components.css:19 `.vcp-nav` `z-index: 100` → `var(--z-nav)`, and css/tokens.css defines `--z-nav: 100` — computed value identical to main. Every other components.css/tokens.css change is a new `.vcp-voice-*`/liquid selector or a new token; no existing rule's value changed.
- Widget markup on the 6 newly-touched pages is appended after the existing script tags, before `</body>`; existing markup untouched. The script is an IIFE that no-ops when `#vcp-voice-widget` is absent, so any page without the block is unaffected.
- Supabase: both tables' schemas (70002 vcp_voice_sessions, 70005 vcp_voice_turns) match every field the code writes; both are anon-INSERT-only under RLS, and the privileged file-feedback.js upsert/PATCH correctly relies on the service-role key bypassing RLS. Existing records remain readable — the code only adds rows, never migrates the schema.
- The committed `sb_publishable_...` key in voice-widget.js:215 is byte-identical to the one already on main in js/telemetry.js:14 — same publishable INSERT-only key, no new secret exposure.
- .env.example carries no values; .gitignore now covers `.env*.local` (all `vercel env pull` variants).
- Not independently verified on this runner: live browser render (Chrome extension was disconnected during the author's last session) and live Supabase/GitHub round-trips (require provisioned secrets). Scored on static + Node execution evidence plus the author's disclosed live tests, not assumed to pass.

### Findings
1. NOTE — js/voice-widget.js:104 — Pattern-based name redaction only catches capitalized names after an explicit lead-in ("my name is / this is / I'm"). "I am Sarah Connor", standalone names, and lowercase names pass through unredacted. This is within the spec's declared "pattern-based" scope and backstopped by the consent notice, so it's an accepted limitation — but an LLM-side redaction pass (already noted as a #43 follow-up) is the real fix before this handles adversarial input.
2. NOTE — api/_rate-limit.js:20 — The limiter is in-memory per instance, so it does not enforce a hard global cap across Vercel's concurrent instances/cold starts (the module says so itself). Fine as the cheap first line at launch scale; swap to Vercel KV/Upstash if the widget ever sees real traffic.
3. NOTE — js/voice-widget.js:95 — The phone pattern leaves a stray leading "(" on "(415) 555-0199" → "([redacted-phone]". Cosmetic only; the digits are redacted.
