**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 67/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | Only the `audit` check registered (this run); no local lint pre-#9 — normal, not a finding |
| Spec compliance | 13/25 | PR is an honest declared-partial draft of #43; ~6 of 11 criteria met, but one criterion the PR claims as "real" (PII redaction) is broken for names |
| Correctness under stress | 13/25 | TTS proxy survived all 10 attack inputs; name redaction failed its core case (BLOCKER); three stranded-session edges found by reading |
| Platform integrity | 12/15 | Only shared-code change (nav z-index tokenization) verified value-identical on both pages; no browser render driven this run |
| Security | 4/10 | Key correctly server-side, no secrets committed; but the privacy control leaks names, and the proxy is an unauthenticated credit-spending endpoint with no rate limit |

### Machine checks
- `gh pr checks`: only `audit` (this run) — pending by definition. No failures.
- Local lint/build/test: no package.json, no lint configured — normal pre-#9, not a finding.
- `node --check` on both new JS files: clean.

### Spec compliance (ticket #43)
The PR is a draft, explicitly "part of #43 (does not close it yet)". Judged against the full criteria list anyway; disclosed-in-PR gaps are marked (draft-scope).
- [x] Liquid-motion ball renders fixed bottom-right (index.html), above page content (`--z-widget: 500` > `--z-nav: 100`)
- [x] `prefers-reduced-motion`: `animation: none` + static `--radius-pill` fallback; verified the higher-specificity `[data-state]` rule cannot re-arm it (it sets only `animation-duration`; `animation-name` stays `none` from the media-query shorthand)
- [x] Click opens a bottom-anchored panel, no navigation, not full-screen
- [x] Visible consent notice before mic; explicit Start button arms it; Start disabled with a message when the browser lacks SpeechRecognition
- [~] TTS + STT plumbing real; contextual follow-ups are keyword-matched canned questions, not an LLM (draft-scope, disclosed)
- [x] Each open resets `history = []` — no cross-session memory
- [x] Close ends the session immediately, no confirmation
- [ ] Session-end summary is `console.log`ged, not filed as a Pending ticket (draft-scope, disclosed) — AND its PII redaction does not redact names (finding 1, NOT disclosed: the PR body lists name redaction under "Real")
- [ ] Transcript retention separate from the ticket: absent (draft-scope, implied)
- [ ] New liquid-ball component not documented in demo.html (not in the PR's declared follow-up list either)
- [ ] Site-wide: widget is on index.html only; demo.html carries the shared nav but no widget
- No smuggled scope: the `.vcp-nav` z-index tokenization is a supporting refactor, value-identical.

### Stress tests performed
- `api/tts.js` handler exercised in Node with a mock req/res (no live upstream): GET→405; POST without `ELEVENLABS_API_KEY`→500; body undefined/empty/whitespace/number/object→400 each; 501-char text→400; upstream fetch throwing→502; upstream 401→passed through with detail. All validation paths correct.
- `PII_PATTERNS` copied verbatim from js/voice-widget.js:34-38 and run against attack inputs: emails and phones redact ("jose@example.com"→"[redacted-email]"; both phone formats caught, one leaves a stray "(" — cosmetic). Names do NOT redact: "my name is John Smith and I like the nav", "I'm Sarah Connor", "this is Miguel from Vegas" all returned verbatim. Root cause proven: the pattern's `tag` is `"$&".replace(...)`, which executes at definition time against the literal 2-char string `"$&"` (no match, no-op), so the tag is the string `"$&"` — which `String.replace` interprets as "the whole match". The rule substitutes every matched name back into the text unchanged.
- Read-path edges in the session machine (not browser-driven this run): `audio.play()` at line 206 returns a promise whose rejection (autoplay policy) is unhandled — `onended` never fires and the session strands in "speaking"; `recognition.onerror` (line 244) sets "idle" with no retry affordance, stranding an armed session on e.g. mic-permission denial; the 1.6s `setTimeout` at line 255 is never cleared, so close-and-reopen within 1.6s kills the fresh session.

### Integrity sweep
- Diff is 7 files; the only edit to pre-existing shared code is css/components.css:19 `.vcp-nav` `z-index: 100` → `var(--z-nav)`. Verified `--z-nav: 100` is defined in css/tokens.css `:root` and that both consumers of the nav (index.html:11-13, demo.html:10-12) load tokens.css before components.css — computed value identical to main on every page.
- demo.html is otherwise untouched and byte-identical to main.
- css/tokens.css additions are new tokens only (`--dur-ambient`, `--z-nav`, `--z-widget`) plus `--dur-ambient: 0ms` in the existing reduced-motion block — no existing token changed.
- index.html additions are appended at the end of `<body>` (widget markup + one script tag); no existing markup touched. Widget script is an IIFE that no-ops if `#vcp-voice-widget` is absent, so pages without the markup are unaffected.
- .gitignore gains `.vercel` only; .env.example contains no values.
- One-off rgba()/px values in the new component CSS match the established idiom of components.css on main (verified existing rgba usage) — not a design-law violation.
- Unverified: no browser render was driven on this runner; visual behavior relies on the PR author's reported Chrome run plus static analysis above.

### Findings
1. BLOCKER — js/voice-widget.js:37 — Name redaction is a silent no-op: the pattern's replacement evaluates to the literal string `"$&"` (whole-match backreference), so "my name is John Smith" survives redaction verbatim. The PR body lists name redaction under "Real". Fix: capture the lead-in phrase and use a replacer, e.g. `re: /\b(my name is|i'?m|this is)\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?/gi, tag: "$1 [redacted-name]"`.
2. NOTE — api/tts.js:20 — The proxy is unauthenticated and unthrottled; the 500-char cap is per-request, so a loop drains ElevenLabs credits freely on a public site. Add rate limiting and/or an origin allowlist before `ELEVENLABS_API_KEY` is ever provisioned (deployment is currently blocked on Vercel linking, which is the only reason this is not a BLOCKER).
3. NOTE — js/voice-widget.js:206 — `audio.play()` rejection (autoplay policy) is unhandled: `onended` never fires and the session strands in "speaking". Add `.catch(function(){ self.speakWithBrowserTts(question); })` or route to `listen()`.
4. NOTE — js/voice-widget.js:255 — The 1.6s end-of-session timer is never stored/cleared; closing and reopening within 1.6s makes the stale timer end the brand-new session. Keep the handle and clear it in `endSession`/`startSession`.
5. NOTE — js/voice-widget.js:244 — `recognition.onerror` drops to "idle" with no retry affordance; a visitor who denies mic permission right after consenting gets a dead panel whose only exit is close. Render a retry (or re-consent) state instead.
