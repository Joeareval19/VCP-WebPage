**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 64/100

### Score breakdown
| Axis | Score | Notes |
|---|---|---|
| Machine checks | 25/25 | No registered CI failures; no local toolchain yet (pre-#9, not a finding) |
| Spec compliance | 10/25 | Structure mirrors the spec exactly, but AC1/AC3/AC4 can never be met at runtime (see BLOCKER) |
| Correctness under stress | 6/25 | Component logic all passed; the board query itself fails on every run and the failure is swallowed |
| Platform integrity | 13/15 | Purely additive; nothing existing breaks. Perpetuates the silent-failure masking that hid the same bug in #17 |
| Security | 10/10 | No secrets (`GH_TOKEN: ""` runner-login pattern), no injection surface; comment bodies are static text + numeric IDs |

### Machine checks
- `gh pr checks`: only `audit` (this run) pending — no failures.
- Local lint/build/tests: no package.json yet (pre-#9) — normal, not a finding.
- YAML parses clean; structure verified field-by-field: cron `*/5`, `workflow_dispatch`, concurrency `completed-sweep` / no cancel, `runs-on: [self-hosted, vcp-laptop]`, timeout 10, `shell: powershell`, `GH_TOKEN: ""`.
- Embedded PowerShell extracted byte-for-byte and parsed with `Parser::ParseFile` under the runner's exact shell (Windows PowerShell 5.1.26100.8655): 0 errors.

### Spec compliance
- [ ] AC1 — card with open unmerged PR bounced to Review within one interval, one comment naming the PR: **unreachable** — the board query fails on every pass and the run exits "nothing to sweep" (Finding 1)
- [x] AC2 — closed-issue cards never touched (today trivially true; the `state -eq "OPEN"` filter also verified correct in isolation)
- [ ] AC3 — no-PR cards bounced with a "nothing was merged" comment: unreachable, same cause
- [ ] AC4 — 3-min grace window: logic verified correct in isolation, but the code never receives items to grace
- [x] AC5 — exits 0 on a nothing-to-do pass (verified — though currently it exits 0 on *every* pass, for the wrong reason)
- [x] AC6 — `GH_TOKEN: ""` runner-login pattern, no new secrets

Scope: clean — exactly the two files the spec names, nothing smuggled in.

### Stress tests performed
All on this runner against the PR branch checkout, under PS 5.1 — the exact shell `shell: powershell` resolves to:
- Extracted the embedded script verbatim from the YAML and **ran its read-only portion: the board query fails** — `gh` receives the GraphQL with every embedded double quote stripped (`Argument 'id' on Field 'node' has an invalid value (PVT_kwHOBdoj_c4BcT54). Expected type 'ID!'` + the same for `fieldValueByName`). The error is swallowed, the script prints `Completed column is honest - nothing to sweep.` and exits 0. Reproduced from a plain `.ps1` file execution to rule out harness quoting artifacts.
- Grace window: fed mock items with old vs. fresh ISO `updatedAt`; confirmed PS 5.1 `ConvertFrom-Json` keeps them as strings and the `Parse → ToUniversalTime → cutoff` filter keeps only the stale item.
- `Find-Pr` edge cases: issue 2 vs. `(#22)` title (no false match), issue 26 vs. `Closes #260` body (no false match via `\b`), case-insensitive `CLOSED #7` matched, `close 8` (no hash) rejected, null body handled, null list handled. All correct.
- Comment body: the double-backtick escape renders a correct single-backtick markdown code span (`` `Closes #26` ``).
- Mutation template: token substitution produces valid GraphQL text — but the `gh api graphql -f query=$mutation` call at line 103 has the same quote-stripping defect as the query (embedded `"` around IDs).
- **Verified the fix live (read-only):** GraphQL variables, so the query text contains no double quotes — `gh api graphql -f query='query($pid: ID!) { node(id: $pid) ... }' -f pid=PVT_kwHOBdoj_c4BcT54` → succeeds, exit 0, returns the VCP Tracker board.

### Integrity sweep
- Diff vs. origin/main is exactly 2 files: the new workflow + 1 README line. No shared code, frontend, or data model touched; existing pages unaffected by construction.
- Concurrency group `completed-sweep` is unique — no collision with `ai-review-sweep` or agent jobs; cron load on vcp-laptop is one short job per 5 min, same as the established sweep.
- The bounce mutation only ever moves Completed→Review plus one comment — reversible board operations; no destructive path exists even once fixed.
- **Pre-existing platform defect surfaced by this audit (out of PR scope — needs its own ticket):** `agent-review-sweep.yml` (#17/#18) has the identical quoting defect and has been a **silent no-op in production**. Its green run 28712846877 (2026-07-04T16:42Z) logs the same two GraphQL errors, then `No open issues in Review — nothing to sweep.`, then exit 0 — every cron pass. The "established pattern" this PR mirrors never actually worked; mirroring faithfully propagated the bug.

### Findings
1. **BLOCKER** — `.github/workflows/completed-sweep.yml:57,103` — Windows PowerShell 5.1 does not escape embedded double quotes when passing arguments to native executables, so both `gh api graphql -f query=...` calls deliver their GraphQL with the quotes stripped. The board query errors on every pass, the failure is swallowed, and the run exits 0 claiming the column is honest. The sweep can never bounce a card; AC1/AC3/AC4 are unmet by construction. Proven by running the extracted script verbatim on this runner. **Verified fix:** use GraphQL variables so the query/mutation text contains no double quotes — `-f query='query($pid: ID!) { node(id: $pid) ... }' -f pid=$projectId` (tested live, exit 0); same treatment for the mutation (`$itemId`/`$fieldId`/`$optionId` as variables).
2. **NOTE** — same file — native `gh` failures are invisible to `$ErrorActionPreference = "Stop"`: a failed board query reads as an honest column; a transient `gh pr list` failure would false-bounce a legitimately-resting merged-but-open card with a wrong "nothing was merged" comment; a failed bounce mutation would still post the "bounced back to Review" comment (line 104 runs unconditionally after line 103). Check `$LASTEXITCODE` after each `gh` call and fail the run loudly — this exact masking is what hid the #17 sweep's total failure for days.
3. **NOTE** — `items(first: 100)` with no pagination (inherited from the #17 pattern): silently misses board items past 100. Fine at today's board size; worth a cursor loop whenever either sweep is next touched.

Good work worth naming: the component logic is sound — grace filter, PR-match edges, comment markdown, loop safety (a bounce removes the card from the next pass's query set) all survived stress, and the spec was followed to the letter. The defect lives in the one thing never executed before shipping — the testing plan deferred live runs to post-merge, and that is exactly where the bug is. Fix the two GraphQL calls, add exit-code checks, and file the sibling ticket for `agent-review-sweep.yml` — same root cause, broken in production right now.
