**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 84/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 23/25 | No failing checks; only registered check is this audit run (pending); no local lint pre-#9; `node --check` clean |
| Spec compliance | 18/25 | 5 of 8 criteria fully met; AC3 met with a data-quality defect (Finding 1); AC1 and AC5 not demonstrable pre-merge (migration deliberately deferred — see Unverified) |
| Correctness under stress | 20/25 | Full event matrix survived a mock-Supabase browser run; two defects: page_load always 0, nav-click POST not keepalive |
| Platform integrity | 14/15 | All 8 pages loaded live with the script — zero console errors; diff is strictly additive (footer line + script include per page); no shared CSS/JS touched; no global collisions |
| Security | 9/10 | Anon key INSERT-only under RLS is the correct telemetry pattern; no secrets committed (key placeholder empty); no rendered-content XSS surface; public-key insert spam is inherent to the accepted design |

### Machine checks
- `gh pr checks`: one check, `audit` (run 28724509725) — pending; it is this audit itself. No other CI registered — normal pre-#9, not a finding.
- Local lint/build/test: no `package.json` — normal pre-#9, not a finding.
- `node --check js/telemetry.js` — syntax OK.

### Spec compliance
- [ ] AC1 — Migration applied on `qaorlbgrkpldcatyntlw` with anon INSERT-only verified live. **Not demonstrable at audit time.** PR body defers to a post-merge dashboard run; I independently confirmed the constraint is real — the runner's scoped Supabase MCP points at `wwssfrsmuytbxvcvssav`, and the claude.ai Supabase account lists only `xuxmqpbddtajfiuogbov` and `vcp-ops` (`mgcczsxviukraxonnljm`). No tool path reaches the target project. SQL reviewed by read: DDL, check constraints, RLS enables, and `for insert to anon with check (true)` policies are correct; no select/update/delete policies exist, so anon reads are RLS-denied (empty) as the criterion requires.
- [x] AC2 — Visit row with device/screen/referrer/utm populated. Verified against a local mock Supabase (patched-in-memory key/URL; repo untouched): captured row had `device` (ua/mobile/platform), `screen` "1280x720", `language`, `timezone`, `utm` `{utm_source, utm_campaign}` from the query string, `referrer` null on direct load. Payload keys exactly match the migration's column set; visitor_id/session_id are valid v4-shaped UUIDs; both persisted across a page navigation (same visitor + session on the second visit row).
- [x] AC3 — Nav click, forced JS error, page-load perf, tab-hide each produced a correctly-typed `vcp_site_events` row: `interaction`/`link:/research.html`, `error`/`Uncaught Error: sterling-forced-error` plus `error`/`unhandledrejection: sterling-rejection`, `perf`/`page_load`, `meta`/`visit_duration` (value 21129 ms). Defect: the perf row's `value` was 0 on both page loads (Finding 1); `detail.ttfb`=34 and `detail.dom_content_loaded`=544 were correct.
- [x] AC4 — `window.vcpTrack('open', {...})` from the console wrote a `widget`-type event. Verified.
- [ ] AC5 — `vcp_voice_sessions` live insert test. Not executable (migration not applied — same constraint as AC1). By read, the table matches #43's content model: `session_id text unique`, `page_context`, `transcript`, `summary`, `filed_issue int`, plus `status` check and `duration_ms`.
- [x] AC6 — Empty key degradation: with the file served verbatim (empty `SUPABASE_ANON_KEY`), index.html loaded with zero console errors, zero telemetry network requests, and `window.vcpTrack` present as a callable no-op. Verified.
- [x] AC7 — Footer privacy note present in all 8 pages' diffs and confirmed rendered in the live footer (`.vcp-footer__meta` contains "Anonymous usage analytics").
- [x] AC8 — `supabase/migrations/70002_site_metadata.sql` checked in. Verified.

### Stress tests performed
Harness: a Node mock server (in `_temp`, outside the repo) served the checkout statically on two ports — one substituting `js/telemetry.js` in-memory with a test key + local URL (the file on disk was never modified), one serving it verbatim — and recorded every `POST /rest/v1/:table` body. Pages driven with the gstack headless browser.
- Patched path, `index.html?utm_source=audit&utm_campaign=pr53`: page-view row, perf event, `vcpTrack('open')`, `setTimeout`-thrown Error, unhandled Promise rejection, synthetic `visibilitychange→hidden` (visibilityState overridden), then a real click on the nav Research link. All 9 expected rows arrived, correctly tabled and typed; the `apikey` header carried the injected key.
- The nav-click interaction POST survived the immediate navigation on localhost — but it is sent without `keepalive`, so this is timing luck, not a guarantee (Finding 2).
- Perf event: `value` (from `nav.loadEventEnd`) was 0 on both page loads — read inside the `load` handler, before the browser sets it (Finding 1).
- Fail-silent path (verbatim file): zero console errors, zero telemetry requests, `vcpTrack` no-op. Verified.
- Cookie/session identity: `vcp_vid` cookie and `vcp_sid` sessionStorage persisted across navigation — same visitor_id and session_id on both visit rows.
- Not run: live inserts against the real project (no access path — see AC1) and SQL execution (no psql; Docker daemon down on this runner). SQL correctness is by-read only.

### Integrity sweep
- Diff scope vs origin/main: 10 files — 8 pages each gain exactly one footer line + one `<script defer>` include; `js/telemetry.js` and the migration are new files. No shared CSS/JS modified.
- All 8 pages (`index`, `demo`, `intent`, `library`, `projects`, `project-detail`, `research`, `socials`) loaded in the headless browser with the script live: zero console errors on every page, including pages with their own scripts (`library.js`, `projects-*.js`, `research.js`, `socials.js`).
- Global-namespace collisions: grep for `vcpTrack|vcp_vid|vcp_sid` outside `js/telemetry.js` — zero hits. The click listener is `passive`, delegates, never calls `preventDefault`; the error/rejection listeners observe only. Existing interactivity untouched.
- Data compatibility: three new `vcp_`-prefixed tables; no existing schema or stored format modified.
- Unverified: real-Supabase behavior end-to-end (401 handling with the real URL was reasoned, not observed: a 401 response resolves the fetch, so `.catch` never fires and nothing logs — consistent with the fail-silent contract).

### Findings
1. NOTE — `js/telemetry.js:110` — `page_load` perf value is always 0: `nav.loadEventEnd` is read inside the `load` event listener, and the spec sets it only after load handlers complete. Both mock-captured perf rows carried value 0 while `detail.ttfb`/`dom_content_loaded` were correct. Fix: defer the read one tick (`setTimeout(..., 0)` inside the load handler) or use `nav.duration`.
2. NOTE — `js/telemetry.js:125` — interaction events are POSTed without `keepalive`, and the very clicks the tracker targets (`a[href]`) navigate immediately, which lets the browser abort the in-flight fetch. It survived on localhost; on real networks nav-click events — the bulk of interaction data — will be silently lossy. Fix: pass `keepalive: true` for interaction events (the plumbing already exists).
3. NOTE — all 8 pages, footer — inline `style="font-size:10.5px"` violates DESIGN.md binding rule 1 ("tokens only; zero one-off values outside tokens.css"). Fix: add a size token and a footer-note class in `components.css`.
4. NOTE — AC1/AC5 are deferred to post-merge activation (migration + key paste + anon SELECT-denied verification). Declared in the PR body and structurally unavoidable (no tool path reaches `qaorlbgrkpldcatyntlw`), but the checklist must actually run — until it does, criterion 1's security claim (anon INSERT-only) exists only on paper.
5. NOTE — ticket Files Reference lists `wiki/VCP AI Workflow/Spec Categories.md` ("Digit 7 = Platform blessed by owner") — the file exists nowhere in the vault and is not in this PR. The [70002] numbering's category is undocumented. Minor: not an acceptance criterion.
