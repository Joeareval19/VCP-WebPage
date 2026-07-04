**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 92/100

Re-audit. The previous audit (69/100) found one BLOCKER and three NOTEs; commit bd680a2 fixes the BLOCKER and the most serious NOTE. Both fixes verified by execution.

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI failures; no local lint pre-#9 (normal); `node --check` pass |
| Spec compliance | 23/25 | Criteria 1–5 + 6a all verified met; 6b (relay restart) is post-merge deployment, documented but unverifiable pre-merge |
| Correctness under stress | 23/25 | 13 mocked-path tests + live-gh validation all pass; one failure-of-failure edge loses the merge reason from the log (NOTE 3) |
| Platform integrity | 14/15 | Only 2 hunks touch relay.js; Started/Review handlers and webhook parsing byte-identical to main; workflows' dispatch events unchanged; Started-bounce dispatch side effect remains (NOTE 1) |
| Security | 7/10 | Webhook-controlled `node_id` still interpolated into a GraphQL mutation under warn-only HMAC (NOTE 2, pre-existing pattern, accepted dev-grade) |

### Machine checks
- `gh pr checks`: no checks registered — CI not yet configured (#9), not a finding.
- Local lint/build/test: no package.json — normal pre-#9, not a finding.
- `node --check agent-dispatch/relay.js`: **pass**.

### Spec compliance
- [x] 1. CONFLICTING PR → no merge attempt (harness recorded zero `pr merge` calls), bounce to Review, one comment naming PR #16 and the conflict state.
- [x] 2. Merge command fails → card back in Review, one comment **containing the error reason** — comment body verified: `` merging PR #16 failed: `GraphQL: Pull request is not mergeable (mergePullRequest)` ``. Previous BLOCKER fixed: `reasonOf()` (relay.js:52) prefers the last non-empty stderr line, validated against a real failing `gh` call on this runner (returned `GraphQL: Could not resolve to a PullRequest with the number of 999999.`, not the command echo).
- [x] 3. No open PR → bounce to the source column (Started `de246815` and Pending `945c8a59` both verified in the recorded mutation), comment "nothing to merge"; unknown `from` → Review.
- [x] 4. Issue already CLOSED → rests, zero gh calls, log only.
- [x] 5. Happy path unchanged: single `pr merge --squash --delete-branch` call, `MERGED` log line identical to main's.
- [x] 6a. `node --check` passes.
- [ ] 6b. "Relay restarted on the worker with the new file" — post-merge deployment step, documented in the PR body and README. Must be done at merge time or the guard is not live.

### Stress tests performed
Extracted the guard block and helpers **verbatim from the PR branch file** (read from disk, not retyped) into a harness with a mocked, call-recording `gh()`; drove 13 paths:
- closed issue / no-PR (from Started, Pending, undefined) / CONFLICTING / MERGEABLE happy path — all correct (mutations carry the right option ids; comment bodies read back correct).
- **Fix 1 verified:** merge throws with realistic Node 22 `execFileSync` error (message line 1 = command echo, reason in `e.stderr`) → comment and log both carry `GraphQL: Pull request is not mergeable (mergePullRequest)`. Also validated `reasonOf()` against a real failing `gh pr view 999999` on this runner: returns the GraphQL reason.
- **Fix 2 verified:** `gh pr list` throwing (transient network) and `gh pr view` returning garbage HTML both land in the new guard-wide catch → bounce to Review + comment. The pre-#21 silent-rest path is dead.
- Empty-stderr merge failure → falls back to the command echo (no better information exists; acceptable).
- Worst case (guard fails AND the bounce mutation fails) → no escaped exception; `ERROR guard bounce ... also failed` logged.
- Comment API failing right after a merge failure → card still bounces, human still gets exactly one comment (from the outer catch); see NOTE 3 for the log gap.
- Regex boundary: issue #2 does not match a PR closing #21.

### Integrity sweep
- Blast radius: 2 non-audit files. `relay.js` is a standalone worker-machine script — nothing in the repo imports it.
- `git diff main` shows exactly two hunks in relay.js: helper insertion after `gh()` and the Completed-branch rewrite. The `to === "Started"` and `to === "Review"` handlers and all webhook parsing are byte-identical to main — dispatch and audit triggers unaffected.
- Workflow consumers grep-verified: `agent-build.yml` (`card-started`) and `agent-review.yml` (`card-review`) consume events the relay still emits identically.
- Loop safety: a bounce to Review fires a Completed→Review webhook; the Review handler's `ai-approved`/`ai-changes-requested` label skip (relay.js:108-109) absorbs it for any audited PR. At most one comment per drag, verified in every harness path.
- Old `Review → Completed` behavior is a strict subset of the new guard's happy path.
- Unverified: live webhook round-trip against the real board (requires the deployed relay — out of audit scope per stress-test rules).

### Findings
1. NOTE — `agent-dispatch/relay.js:125-127` — carried over: a no-PR bounce to **Started** fires a Completed→Started webhook; if the issue is unassigned, relay.js:90-97 dispatches a build agent as a side effect of a failed completion drag. Rare, but an agent dispatch is an expensive surprise — consider excluding Started as a bounce target or a bounce marker.
2. NOTE — `agent-dispatch/relay.js:41` — carried over: `item.node_id` from the webhook payload is string-interpolated into a GraphQL **mutation** while HMAC verification is warn-only (:72-74). Accepted dev-grade risk per the in-code note; belongs on the production-relay hardening list.
3. NOTE — `agent-dispatch/relay.js:144-147` — if `comment()` throws after a merge failure, the `BOUNCE ... merge failed (<reason>)` log line at :147 is skipped and the outer catch's comment reports the *comment* failure's reason — the actual merge reason is recorded nowhere. One-line fix: log before commenting. Failure-of-failure path, card still bounces with one comment.

Both prior blockers-in-spirit are dead: the bounce comment now tells the human the real reason, and no path through the guard leaves a card resting in Completed unmerged. Remember the deployment step — copy to `~/vcp-dispatch/relay.js` and restart the relay at merge time.
