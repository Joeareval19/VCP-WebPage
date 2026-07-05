**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | Only registered check is this audit run (pending, self); no local lint pre-#9; `node --check` clean |
| Spec compliance | 16/25 | 5 of 9 criteria demonstrably met; merge-guard exactness broken (Finding 2); deploy/repoint/E2E deferred post-merge |
| Correctness under stress | 13/25 | 19/19 harness scenarios pass on the logic itself, but the serverless lifecycle defect (Finding 1) and two confirmed silent-failure divergences (Findings 2, 3) sit on the critical path |
| Platform integrity | 13/15 | Purely additive; relay.js, completed-sweep.yml, and all site pages byte-identical to main; endpoint failure modes lean on the sweep whose shared-runner weakness this ticket documents |
| Security | 9/10 | Timing-safe HMAC, hard reject, fails closed on missing secret (verified); no secrets committed; GraphQL string interpolation is signature-gated, low risk |

Raw axis sum 76; BLOCKER findings cap the score at 69 per charter.

### Machine checks
- `gh pr checks`: one check, `audit` — pending (this run itself). No failures.
- Local lint/build/test: no `package.json` — normal pre-#9, not a finding.
- `node --check api/board-webhook.js`: clean.

### Spec compliance
- [ ] AC1 — deployed and reachable at a public HTTPS URL: **preview deploy only**, behind Vercel's preview SSO wall; production deploy correctly deferred to post-merge (the PR's own `--prod`-from-branch incident shows why). Not yet demonstrably met.
- [x] AC2 — HMAC enforced strictly: verified in harness — bad, missing, and tampered signatures all hard-reject 401 with zero side effects; timing-safe compare; missing secret fails closed (throws → 500), never open.
- [x] AC3 — Pending→Started dispatches `card-started` for unclaimed tickets: verified (unassigned → dispatch with `issue: 60`; assigned → skip). Matches relay.js.
- [x] AC4 — →Review dispatches `card-review` for un-audited open PRs: verified (unaudited → dispatch with `pr: 99`; `ai-approved`-labeled → skip; no PR → skip). Matches relay.js.
- [ ] AC5 — →Completed merge guard "matches relay.js exactly": the four enumerated behaviors match (mergeable → squash-merge + branch delete; no PR → bounce to source column + comment; dirty → bounce to Review + comment; merge failure → bounce + comment carrying the API reason — all verified in harness). But relay.js's guard-error catch (relay.js:178-192, "must not leave the card resting in Completed unmerged — that is the exact silent failure #21 exists to kill") was not ported. Finding 2.
- [x] AC6 — events captured to `vcp_pipeline_events`, non-blocking on Supabase failure: verified (fire-and-forget, `.catch(() => {})`, missing key short-circuits). Caveat: capture fidelity is compromised by Finding 3 (failed dispatches recorded as successes) and delivery shares Finding 1's lifecycle risk.
- [ ] AC7 — GitHub App webhook URL repointed: manual step for Jose, by design last. Not met yet (expected).
- [ ] AC8 — end-to-end smoke test: not performed (blocked on AC1/AC7). The PR discloses this honestly.
- [x] AC9 — `agent-dispatch/README.md` and Agent Dispatch Pipeline wiki note updated: verified, plus a new Board Integrity Sweep note properly linked into the MOC and pipeline note (bidirectional; `[[Parallel Sub-Agent Dispatch]]` left as an allowed unresolved stub link).

### Stress tests performed
Harness: mocked `global.fetch` recording every call, real HMAC-signed payloads driven through the exported handler (`_work/_temp/sterling-54/stress.js`, not committed). 19 scenarios, all behaved as asserted:
- Method/auth surface: non-POST → 405; bad signature → 401 with zero fetches; missing signature → 401; body tampered after signing → 401; `BOARD_WEBHOOK_SECRET` unset → throws (fails closed, not open).
- Merge guard: open issue + mergeable `Closes #60` PR → squash-merge PUT + branch DELETE, no bounce; no PR → bounce to source column (`Started` option id `de246815`) + issue comment; `mergeable_state: dirty` → bounce to Review, merge never attempted; merge API 405 → bounce to Review + comment carrying "not mergeable"; issue already closed → no action.
- Dispatch paths: Started+unassigned → `card-started`; Started+assigned → skip; Review+unaudited → `card-review`; Review+audited → skip.
- Edge inputs: PR closing `#605` does NOT match issue `#60` (regex `\b` holds — bounced as no-PR instead of merging a stranger's PR); DraftIssue items ignored; same-column edits (`to === from`) ignored.
- **Divergence probes (both confirmed): (a)** simulated `ECONNRESET` on the PR-list fetch mid-guard → no bounce, no comment, card left resting in Completed, only `console.error` — relay.js bounces to Review and comments here; **(b)** `repository_dispatch` returning 404 → still captured to Supabase as a successful `dispatch` event.

What I could NOT run: the function inside the actual Vercel runtime. The raw-body read path (`bodyParser: false` via a Next.js-style config export on a plain `@vercel/node` function) and the post-response execution lifecycle are platform behaviors a local harness cannot reproduce — see Findings 1 and 4. Correctness is scored on reduced evidence there, per charter.

### Integrity sweep
- Diff vs `origin/main` is 7 files: 4 additive (`.env.example`, `api/board-webhook.js`, new wiki note, `.gitignore` line), 3 docs-only edits (README, pipeline note, MOC). No functional file that exists on main is modified.
- `agent-dispatch/relay.js` — not in the diff, byte-identical to main; still runnable for local dev as the PR claims.
- `.github/workflows/completed-sweep.yml` and `agent-build.yml` / `agent-review.yml` — untouched; the sweep backstop this design leans on is intact and its Completed-pass would recover a dropped merge within ~5 min **when a runner is online** (the shared weakness #51's own docs call out — which is why Findings 1–2 matter).
- No `api/` directory exists on main (issue #43's endpoints live on its unmerged branch), so this function creates the directory — no routing collision with any deployed-from-main asset; the static site is unaffected.
- Disclosed in the PR body: a `vercel deploy --prod` from this branch briefly wiped #43's endpoints during testing; remediated during the session, and preview-only deploys used after. Process incident, not a code defect — noted for the record.
- Secrets: `.env.example` ships empty values only; `.gitignore` gains `.vercel`. Nothing sensitive in the diff.

### Findings
1. BLOCKER — api/board-webhook.js:218 — Every side effect (merge, bounce, comment, dispatch, Supabase capture) runs AFTER `res.status(200).send("ok")`, and Vercel does not guarantee execution after the response is sent — the documented mechanism for post-response work is `waitUntil` (`@vercel/functions`), which this handler doesn't use. A suspended instance mid-`handleCompleted` = card rests in Completed, PR unmerged, no error anywhere — the exact silent failure #51 exists to kill, now on the primary path. The justifying comment is also factually wrong: GitHub does NOT auto-retry webhook deliveries on non-2xx (manual redelivery only), so ack-early buys nothing. Fix: run the handler logic BEFORE responding (2–5 API calls, well inside limits), or wrap the work in `waitUntil`.
2. BLOCKER — api/board-webhook.js:137-185 — relay.js's guard-error catch (relay.js:178-192) was not ported: any transient API failure inside `handleCompleted` propagates to the top-level catch, which only logs. Confirmed in harness: simulated network error on the PR-list fetch → no bounce, no comment, card rests in Completed unmerged. Violates AC5's "matches relay.js exactly". Fix: wrap `handleCompleted`'s body in try/catch → bounce to Review + explanatory comment, mirroring relay.js.
3. NOTE — api/board-webhook.js:110,128,69 — No GitHub response is ever checked: a 404 on `repository_dispatch` is captured to Supabase as a successful `dispatch` (harness-confirmed), and `ghGraphQL` ignores the GraphQL `errors` array, so a failed bounce mutation (HTTP 200 + errors) records a bounce that never happened. relay.js's `gh` CLI threw on both. Fix: check `resp.ok` and GraphQL `errors`; capture failures as failures.
4. NOTE — api/board-webhook.js:253 — `module.exports.config = { api: { bodyParser: false } }` is a Next.js API-routes convention; it is not a documented switch for plain `@vercel/node` functions (this repo has no `package.json` or `vercel.json`). If the runtime's body helpers consume the stream anyway, `readRawBody` returns empty and EVERY delivery 401s — total outage of the auto-merge path. Unverifiable locally and unverified on the preview (SSO wall). Must be verified with one real signed delivery before the GitHub App URL is repointed (AC8 covers this — do not skip it).
5. NOTE — api/board-webhook.js:42 — `STATUS_OPTIONS` includes `Completed`; relay.js deliberately excluded it ("Completed is never a bounce target"). Unreachable today only because of the `to === from` guard — restore the invariant by dropping the entry.
