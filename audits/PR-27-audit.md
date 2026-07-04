**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 94/100

*Re-audit (supersedes the 64/100 audit of 33f580b). Fix commit 2530338 reviewed.*

### Score breakdown
| Axis | Score | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI (pre-#9, not a finding); embedded scripts in BOTH workflows parse clean under the runner's exact shell (PS 5.1.26100.8655) |
| Spec compliance | 23/25 | All 6 ACs demonstrably met; −2 for the unticketed `agent-review-sweep.yml` ride-along (right fix, wrong vehicle — see NOTE 1) |
| Correctness under stress | 22/25 | Query and mutation execution-verified against the prior BLOCKER; −3 for still-swallowed `gh pr list`/mutation failures (NOTE 2) |
| Platform integrity | 14/15 | Additive + repairs the silently-broken #17 sweep (verified live); −1 for revert coupling (rolling back this PR re-breaks the #17 fix) |
| Security | 10/10 | `GH_TOKEN: ""` runner-login, no new secrets; comment bodies are static text + PR/issue numbers from GitHub's own API |

### Machine checks
- `gh pr checks`: no checks reported — CI not yet configured (#9), not a finding.
- Local lint/build/tests: no package.json (pre-#9) — normal.
- Both embedded PowerShell blocks extracted byte-for-byte and parsed with `Parser::ParseFile` under PS 5.1.26100.8655: **0 errors each**.

### Spec compliance
- [x] AC1 — open unmerged PR → bounce + one comment naming the PR: board query **verified live** (exit 0, real data), mutation argument passing **verified byte-identical** through native-exe delivery, bounce branch verified in full-loop simulation. Only the final live mutation is deferred to post-merge `workflow_dispatch` (per the spec's own testing plan — I do not write to the production board).
- [x] AC2 — closed-issue cards never touched: verified live — 5 cards in Completed right now, filter selected only the 1 with an open issue.
- [x] AC3 — no-PR → bounce + "nothing was merged" comment: verified in simulation (merged-but-open safeguard checked first, correctly).
- [x] AC4 — 3-min grace window: **verified live on real data** — issue #26's own card (Completed + open, touched <3 min ago) was correctly skipped this pass.
- [x] AC5 — exits 0 on nothing-to-do: both early-exit paths verified.
- [x] AC6 — `GH_TOKEN: ""` pattern, no new secrets.

Scope: one ride-along beyond the spec's Files Reference — see NOTE 1.

### Stress tests performed
All on this runner, PS 5.1, PR branch checkout; board writes mocked, reads live:
- **Board query live (the v1 BLOCKER's kill-shot):** ran the script's exact `gh api graphql -f query=... -f pid=... -f fname=Status` — exit 0, 11 real items returned, suspect filter found exactly the one genuine Completed+OPEN card. Same for the fixed `agent-review-sweep.yml` query: exit 0, real data.
- **Mutation argument delivery:** passed the script's exact mutation call shape through a native executable printing its argv — the GraphQL text arrived **byte-identical** (no quote stripping; the text is quote-free by construction) and all four variables (`pid`/`iid`/`fid`/`oid`) arrived intact, including `-f iid=$($item.id)` subexpression expansion.
- **Full loop simulation** (mocked `gh`, three suspects): open-unmerged-PR → bounce naming the PR; merged-but-open → card rests, no writes; no-PR-anywhere → bounce with "nothing was merged". Exactly 4 recorded calls (2 mutations + 2 comments), all argument-correct.
- **Live `gh pr list` calls:** both succeed (exit 0); `Find-Pr` located PR #27 for issue 26 in the open list and merged PR #22 for issue 2 in the merged list.
- **Find-Pr adversarial edges (re-run):** issue 2 vs `(#22)` title — no false match; issue 26 vs `Closes #260` — no false match (`\b`); `CLOSED #7` uppercase — matched; `close 8` (no hash) — rejected; null body and null list — handled.
- **Grace window:** live-demonstrated (above) plus mock old-vs-fresh timestamps in v1 audit.

### Integrity sweep
- Diff vs main: 4 files — new workflow, 1 README line, the `agent-review-sweep.yml` query fix, and this audit file. No frontend, shared code, or data model touched; site pages unaffected by construction.
- `agent-review-sweep.yml` blast radius: only the board-query block changed (variables + throw guard); dispatch/claim logic untouched. Fixed query verified live — the #17 sweep, a silent no-op in production since it shipped, will actually work after this merges.
- Concurrency group `completed-sweep` unique; one short job per 5 min on vcp-laptop, same load class as the existing sweep.
- Bounce path writes are reversible board operations (Completed→Review + comment); no destructive path exists.
- Revert coupling: the spec's rollback plan ("delete/revert the workflow") would also revert the #17 fix — noted under NOTE 1.

### Findings
1. NOTE — `.github/workflows/agent-review-sweep.yml` — the fix to the #17 sweep is correct, execution-verified, and repairs a live production defect, but it rode along on a ticket whose Files Reference names only `completed-sweep.yml` + README. My v1 audit asked for a sibling ticket; inline fixing was the faster call and I won't block a verified production repair — but reverting this PR now silently re-breaks the #17 sweep. If #26 is ever rolled back, re-apply the query fix separately.
2. NOTE — `.github/workflows/completed-sweep.yml:79-80,109-110` — the board query now throws on failure (good), but `gh pr list` failures still read as empty lists: a transient failure would false-bounce a legitimately-resting card with a wrong "nothing was merged" comment. And the comment on line 110 posts even if the bounce mutation on line 109 failed (native failures are invisible to `$ErrorActionPreference`). Check `$LASTEXITCODE` after each `gh` call. Not blocking: failures are transient, bounces reversible, and comments self-describe — but this is the same masking class that hid the v1 defect.
3. NOTE — pagination: board `items(first: 100)`, merged PRs `--limit 100`, open PRs at gh's default limit (30). Fine at today's scale (11 items, 2 open PRs); worth cursor loops when either sweep is next touched.

The v1 BLOCKER is dead and provably so: the author didn't just fix the two calls this ticket needed, they root-caused the pattern, fixed the production sweep carrying the same bug, and left a comment in both files explaining why variables are load-bearing — the next agent to copy this pattern copies the right one. This is what a fix responding to an audit should look like.
