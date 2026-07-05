**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 95/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | `node --check` pass; no registered CI beyond the audit run itself (pre-#9, normal) |
| Spec compliance | 22/25 | All 8 criteria substantively met; idle-tab criterion has a 30s load-time grace the spec text doesn't allow (−2); `inp` measures worst *event*, not worst *interaction* (−1) |
| Correctness under stress | 23/25 | 53/53 harness checks pass; rage-click radius ignores intermediate clicks (−2) |
| Platform integrity | 15/15 | Schema-compatible, v1 event surface verified unchanged, 2-file blast radius |
| Security | 10/10 | No new secrets; copy samples are site content by design (per ticket) |

### Machine checks
- `gh pr checks`: only the `audit` check registered (this run, pending) — CI not yet configured (#9), not a finding.
- Local lint: no package.json (pre-#9, normal).
- `node --check js/telemetry.js`: **pass** (re-verified on this runner, node v22.14.0). Base branch copy also passes — the diff introduces no syntax regression.

### Spec compliance (#64 acceptance criteria)
- [x] No requests from localhost/file — verified by executing the script with `location.hostname` = `localhost`, `127.0.0.1`, `[::1]` and `protocol` = `file:`: zero fetches, no-op `vcpTrack` still exposed. Anchoring verified: `notlocalhost.com`, `localhost.evil.com`, `127.0.0.1.example.com` all still send.
- [x] `vcp_dev=1` → `device.dev: true`; `xvcp_dev=1` does NOT false-positive. `navigator.webdriver`, `HeadlessChrome`, `Chrome-Lighthouse` UAs → `device.bot: true`.
- [~] Idle visible tab accrues no engaged time — **accrues exactly 30,000ms** (measured) before going silent, because `lastActivity` initializes to load time (telemetry.js:164). Disclosed in the PR body as "initial grace"; the criterion as written says none. Active reading accrues correctly (60s input-per-tick → 60,000ms delta); second hide sends a second delta (60000, 20000); hidden tab accrues nothing; zero delta sends no row.
- [x] Scroll-depth milestones fire exactly once per view (re-scrolls produce no duplicates); single-screen page reports 100 (plus 25/50/75, correct cumulative semantics) on load; 50% scroll fires 25+50 only; rAF throttle coalesces 3 scroll events into 1 frame; `scrollHeight=0` is guarded (`Math.max(…,1)`), no crash.
- [x] `lcp`/`cls`/`inp` rows arrive on first hide, keepalive, exactly once (second hide re-sends nothing); `cls` correctly excludes `hadRecentInput` shifts (0.05+0.0123 → 0.062, recent-input 0.4 excluded); `cls` omitted when 0; browser where all three `observe()` calls throw: no crash, no vitals rows, `visit_duration` still sent.
- [x] `device` blob carries `v: 2`, `viewport` ("1280x800"), `connection` ("4g"), `dark`, `reduced_motion` — all verified in the captured visit row.
- [x] Copy: 603-char unicode selection → value 603, sample capped at 120 chars; empty selection sends nothing; `<script>` payload rides as inert JSON string. Rage click: 3 clicks/700ms/same spot fires with `{tag, id}`; slow triple-click and spread clicks do not fire; null target doesn't crash.
- [x] Fail-silent: with `fetch` throwing synchronously, a full simulated session (load, scroll, copy, engaged tick, hide, `vcpTrack` call) propagates nothing to the page.
- [x] `node --check` passes; style matches v1 (var, IIFE, per-handler try/catch — confirmed by reading the full file).

### Stress tests performed
Built a Node vm harness (runner-local, no deployed environment touched) that stubs `window`/`document`/`location`/`navigator`/`fetch`/`PerformanceObserver`/`setInterval`/`Date.now` and executes the PR branch's `js/telemetry.js` verbatim, capturing every POST. 53 checks across 6 suites: hygiene guards (13), engaged time (6), scroll depth (7), Web Vitals (12), content signals (10), fail-silent (1) — plus device-blob assertions. **All 53 pass.** Anomalies probed deliberately:
- Idle-tab grace: 24 ticks (120s) with zero input accrued exactly 30,000ms, then stopped.
- Rage-click geometry: clicks at (100,100) → (500,500) → (105,105) within 300ms **fires** `rage_click` — the radius test compares only the first and current click (finding 2).
- `inp` observer accepts any event-timing entry ≥ 40ms duration, no `interactionId` filter (finding 3).

### Integrity sweep
- Blast radius: exactly 2 files changed vs base (`js/telemetry.js`, one appended line in `wiki/Site Platform/Site Database.md`). No shared components, no CSS, no HTML touched.
- Schema compatibility (the core mandate): all new events use `event_type` ∈ {meta, interaction, perf} — inside the existing CHECK constraint in `supabase/migrations/70002_site_metadata.sql:30`; values are numeric, details are jsonb, new `device` keys land in an unconstrained jsonb column. **Zero schema changes claim verified true**; existing rows unaffected (INSERT-only, no migration).
- v1 surface unbroken, verified by execution: visit row still posts on load, `visit_duration` still sent exactly once with keepalive (restructured handler re-verified across hide/show/hide), v1 click interaction tracker coexists with the new rage-click listener without crash, `window.vcpTrack` contract for #43 unchanged and exposed on both the guard and full paths.
- All 8 HTML pages load the script with `defer` (verified by grep) — `load` listeners register before the event fires, so the on-load depth check is sound.
- Stacking: base `feat/70003-db-activation` (PR #61, still open) — disclosed in the PR body; branch history contains the #60 commits as expected. Not verified: behavior after #61's squash-merge retarget (standard GitHub mechanics, low risk).

### Findings
1. NOTE — js/telemetry.js:164 — `lastActivity` initializes to load time, so a fully idle visible tab accrues 30s of engaged time (measured 30,000ms with zero input). Criterion says "accrues no engaged time"; PR body discloses it as designed grace. Either initialize `lastActivity` to 0 so the first input starts the clock, or amend the wiki decision note to record the grace as intentional.
2. NOTE — js/telemetry.js:270-271 — rage-click radius compares only `clicks[0]` vs the current click; an intermediate click far away doesn't break the pattern (evidence: (100,100)→(500,500)→(105,105) in 300ms fired). Require every click in the 700ms window within the radius.
3. NOTE — js/telemetry.js:221-225 — the `inp` value is the worst duration of *any* event-timing entry, including non-interaction entries (`interactionId` 0, e.g. mouseover); real INP considers interactions only, so reported values will skew high. Add `if (!en.interactionId) return;` to the entry loop.
