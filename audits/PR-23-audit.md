**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI failures; no local lint pre-#9 (normal) |
| Spec compliance | 17/25 | Criterion 2 unmet: merge-failure comment omits the error reason (BLOCKER) |
| Correctness under stress | 18/25 | Guard block passed 9 mocked-path tests verbatim; two defects found by execution |
| Platform integrity | 13/15 | Started/Review handlers byte-identical to main; dispatch interface unchanged; residual silent-rest path on transient `gh` failure |
| Security | 7/10 | Webhook-controlled `node_id` interpolated into a GraphQL *mutation* under warn-only HMAC |

Raw 80, capped at 69 by the BLOCKER.

### Machine checks
- `gh pr checks`: only the `audit` check registered (this run) — pending, not a failure. CI not yet configured (#9).
- Local lint/build/test: no package.json — normal pre-#9, not a finding.
- `node --check agent-dispatch/relay.js`: **pass** on the PR branch (and on main for comparison).

### Spec compliance
- [x] 1. CONFLICTING PR → no merge attempt, bounce to Review, one comment naming PR #n and the conflict — verified by harness (see stress tests).
- [ ] 2. Merge command fails → card back in Review ✓, one comment posted ✓, **but the comment does not contain the error reason** — it contains `Command failed: gh pr merge N --repo ... --squash --delete-branch`, the command echo. See BLOCKER below.
- [x] 3. No open PR → bounce to the source column (`Started` verified), comment "nothing to merge"; unknown/missing `from` → Review, as spec'd.
- [x] 4. Issue already CLOSED → rests, no bounce, no comment.
- [x] 5. Happy path unchanged: `gh pr merge --squash --delete-branch`, `MERGED` log line identical to main's.
- [x] 6a. `node --check` passes.
- [ ] 6b. "Relay restarted on the worker with the new file" — post-merge deployment step; documented in the PR body, unverifiable pre-merge. Must be done at merge time or the guard is not live.

### Stress tests performed
Extracted the `to === "Completed"` block and the `bounce`/`comment` helpers **verbatim from the PR branch file** into a harness with a mocked `gh()` (recorded every call), and drove all paths:
- closed issue → rests, log only ✓
- no PR, `from=Started` → GraphQL mutation with option `de246815` (Started) + comment + log ✓
- no PR, `from=undefined` → bounces to Review (`18317928`) ✓
- CONFLICTING PR → no merge call recorded, bounce to Review, comment names PR #16 and the conflict state ✓
- MERGEABLE PR → single `pr merge --squash --delete-branch` call, `MERGED` log ✓
- merge throws (realistic `execFileSync` error) → bounce + comment fire, **but the comment reads** `` merging PR #16 failed: `Command failed: gh pr merge 16 --repo Joeareval19/VCP-WebPage --squash --delete-branch` `` — reason absent (Finding 1)
- regex boundaries: issue #2 does **not** match a PR closing #21; `Closes #21` matches issue 21; title fallback `(#210)` does not match `(#21)` ✓
- `gh pr view` returning garbage/throwing → exception escapes the guard to the outer catch; card **rests in Completed unmerged** with only a relay.log line (Finding 2)
- Verified empirically (Node 22): `execFileSync` error `message` line 1 is always `Command failed: <cmd>`; the tool's stderr (the actual reason, e.g. `GraphQL: Pull request is not mergeable`) starts at line 2 and in `e.stderr`.

### Integrity sweep
- Blast radius: 2 files. `relay.js` is a standalone worker-machine script — nothing in the repo imports it; the 3 workflows consume only its `repository_dispatch` events (`card-started`, `card-review`), which are unchanged (grep-verified in `.github/workflows/`).
- `to === "Started"` and `to === "Review"` handlers and all webhook parsing are byte-identical to main (diff-verified) — dispatch and audit triggers unaffected.
- Old `Review → Completed` behavior is a strict subset of the new guard's happy path — same merge command, same log line.
- README change is one additive doc line.
- Unverified: live webhook round-trip and the board mutation against the real project (requires the deployed relay — out of audit scope per stress-test rules).

### Findings
1. **BLOCKER** — `agent-dispatch/relay.js:134` — Acceptance criterion 2 requires the bounce comment to contain **the error reason**; `String(e.message).split("\n")[0]` yields `Command failed: gh pr merge ...` (the command echo — verified by execution; the reason is on line 2 / in `e.stderr`). The human re-drags, it fails again, and they still must SSH into the worker and read `relay.log` — the exact loop this ticket was filed to kill. The `relay.log` line at :137 has the same defect. Fix: prefer stderr, e.g. `const reason = String((e && e.stderr) || e.message || e).trim().split("\n").filter(Boolean).slice(-1)[0]` (gh's last stderr line carries the reason), or `message` line `[1]`.
2. NOTE — `agent-dispatch/relay.js:111-123` — if `gh pr list` or `gh pr view` throws (transient network/auth), the exception escapes to the outer catch at :141 and the card **rests in Completed unmerged, silently** — the pre-#21 failure mode survives on this narrower path. Consider wrapping the whole Completed branch so any failure bounces to Review.
3. NOTE — `agent-dispatch/relay.js:115-116` — loop safety was analyzed only for the Review bounce. A no-PR bounce to **Started** fires a `Completed→Started` webhook; if the issue is unassigned, `relay.js:81-88` dispatches a build agent as a side effect of a failed completion drag. Rare, but an agent dispatch is an expensive surprise — consider excluding Started as a bounce target or adding a bounce marker.
4. NOTE — `agent-dispatch/relay.js:41` — `item.node_id` comes straight from the webhook payload and is string-interpolated into a GraphQL **mutation** while HMAC verification is warn-only (:63-65). This extends the pre-existing injection pattern (read query at :75) to a write. Accepted dev-grade risk per the in-code note, but it belongs on the production-relay hardening list.

One-line fix for the BLOCKER; the guard architecture itself is sound and matches the spec. Re-drag to Review after the fix for re-audit.
