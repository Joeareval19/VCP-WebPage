**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 89/100

Re-audit after commit 3feaedb ("Address Sterling audit"). Replaces the prior 69/100 report.

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI (normal pre-#9); `node --check` clean; 23-scenario harness, 52/52 assertions pass |
| Spec compliance | 19/25 | 6 of 9 criteria demonstrably met; the 3 unmet (deploy, repoint, E2E) are post-merge by the spec's own sequencing and honestly disclosed |
| Correctness under stress | 22/25 | Both prior BLOCKERs verified fixed in behavior; all divergence probes now match relay.js or improve on it; residual risk is platform behavior unverifiable locally (Findings 1–2, both mitigated loudly) |
| Platform integrity | 14/15 | Purely additive; relay.js, all workflows, and every site page byte-identical to origin/main tip (4642ccf); PR MERGEABLE/CLEAN against updated main |
| Security | 9/10 | Timing-safe HMAC hard reject; fails closed on missing secret (harness-confirmed); no secrets in diff; GraphQL string interpolation is signature-gated, low risk |

### Machine checks
- `gh pr checks`: no checks reported on the branch — CI not yet configured (#9), not a finding.
- Local lint/build/test: no `package.json` — normal pre-#9, not a finding.
- `node --check api/board-webhook.js`: clean.

### Spec compliance
- [ ] AC1 — deployed and reachable at a public HTTPS URL: preview deploy only (behind Vercel preview SSO). Production deploy correctly deferred to post-merge — the PR's own disclosed `--prod`-from-branch incident is exactly why. Not yet demonstrably met, by design.
- [x] AC2 — HMAC enforced strictly: bad, missing, and tampered signatures all hard-reject 401 with zero side effects; timing-safe compare; missing secret throws → 500, fails closed never open. Harness-confirmed.
- [x] AC3 — Pending→Started dispatches `card-started` for unclaimed tickets: verified (unassigned → dispatch with `issue: 60`; assigned → skip). A failed dispatch (404) is now captured as an `error`, not a phantom success — prior NOTE 3 fixed.
- [x] AC4 — →Review dispatches `card-review` for un-audited open PRs: verified (unaudited → dispatch with `pr: 99`; `ai-approved`-labeled → skip; no PR → skip).
- [x] AC5 — →Completed merge guard matches relay.js: all four enumerated behaviors verified (mergeable → squash-merge + branch delete; no PR → bounce to source column + comment; dirty → bounce to Review + comment; merge failure → bounce + comment carrying the API reason). The guard-error catch is now ported (prior BLOCKER 2): simulated ECONNRESET mid-guard → bounce to Review + explanatory comment, card never rests unmerged. Two deliberate deviations, both improvements: a failed guard-bounce now returns 500 (visible in the delivery log) where relay.js only logged locally, and the failure is captured as `error` where relay.js recorded a bounce that never happened.
- [x] AC6 — events captured to `vcp_pipeline_events`, non-blocking on Supabase failure: verified fire-and-forget with `.catch`, missing key short-circuits. Caveat: Finding 1 (in-flight captures may be dropped at instance freeze — telemetry-only risk).
- [ ] AC7 — GitHub App webhook URL repointed: manual step for Jose, deliberately last. Not met yet (expected).
- [ ] AC8 — end-to-end smoke test: not performed, blocked on AC1/AC7. Disclosed. This is the gate that also retires Finding 2.
- [x] AC9 — README + Agent Dispatch Pipeline wiki note updated: verified; Board Integrity Sweep note properly linked into the MOC and pipeline note bidirectionally.

### Stress tests performed
Harness: mocked `global.fetch` recording every call and its ordering, real HMAC-signed payloads driven through the exported handler (`_work/_temp/sterling-54-re/stress.js`, not committed). 23 scenarios, 52 assertions, all pass:
- Auth surface: non-POST → 405; bad/missing/tampered signature → 401 with zero fetches; `BOARD_WEBHOOK_SECRET` unset → rejects (fails closed); empty raw body → loud 500 (prior NOTE 4's mitigation, confirmed).
- **Prior BLOCKER 1 fix confirmed by timeline assertion:** in the mergeable-Completed flow, the merge PUT demonstrably precedes `res.send` — all side effects complete before the response.
- **Prior BLOCKER 2 fix confirmed by divergence probe:** simulated ECONNRESET on the PR-list fetch mid-guard → bounce to Review + comment naming the error + `bounce` capture with `guard error` reason (the exact probe that failed last audit). Compound failure (guard error AND the bounce itself failing via GraphQL `errors` array) → 500 + `error` capture, never a silent success.
- **Prior NOTE 3 fix confirmed:** `repository_dispatch` returning 404 → captured as `error` with status, no phantom `dispatch` event; GraphQL HTTP 500 on issue lookup → handler 500 (visible failed delivery).
- Merge guard: mergeable → squash-merge + branch DELETE, no bounce; no PR → bounce to source column (`de246815`) + comment; `dirty` → bounce to Review, merge never attempted; merge 405 → bounce + comment carrying "not mergeable".
- Edge inputs: PR closing `#605` does not match issue `#60` (regex `\b` holds); DraftIssue ignored; same-column edits ignored; closed issue → no action; non-`projects_v2_item` events → no-op.

Not run: the function inside the actual Vercel runtime (raw-body config honor, instance freeze timing) — platform behaviors a local harness cannot reproduce; both now fail loudly rather than silently (Findings 1–2), and AC8 gates the repoint.

### Integrity sweep
- Diff vs origin/main tip (4642ccf, includes the landing-page merge that landed after this branch): same 8 files, all additive or docs-only. No functional file that exists on main is modified.
- `agent-dispatch/relay.js`, `.github/` (all workflows incl. completed-sweep.yml), `css/`, `js/`, `index.html`, `demo.html`: byte-identical to main — verified with `git diff --quiet`.
- PR mergeability re-checked against the moved main: MERGEABLE / CLEAN.
- No `api/` directory exists on main, so no routing collision with any deployed-from-main asset; the static site is unaffected.
- `.env.example` ships empty values only; `.gitignore` gains `.vercel`. Nothing sensitive in the diff.

### Findings
1. NOTE — api/board-webhook.js:114 — `capture()` POSTs are fire-and-forget and never awaited; now that the response is sent immediately after processing (correctly, per BLOCKER 1's fix), a capture issued just before `return` (e.g. the `merge` event at line 220) can still be in flight when the instance freezes post-response, silently dropping the event. Telemetry-only — the merge guard itself is unaffected. Fix when convenient: wrap capture promises in `waitUntil` from `@vercel/functions`, or simply `await` them (one cheap POST each).
2. NOTE — api/board-webhook.js:331 — the `config = { api: { bodyParser: false } }` export is a Next.js API-routes convention, still unverified on the plain `@vercel/node` runtime (no `package.json`/`vercel.json` in repo). The empty-body guard added at line 301 correctly converts the failure mode from silent 401s to a loud 500, which is the right mitigation — but AC8's one real signed delivery must be confirmed green before the GitHub App URL is repointed. Do not skip it.
