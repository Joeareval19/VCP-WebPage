**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 89/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 23/25 | No failing code checks; prior audit run crashed (runner infra) — inconclusive, not a code finding |
| Spec compliance | 21/25 | 5 of 6 criteria met and demonstrated; AC3 partially met (exit code in comment, not gh's error line) |
| Correctness under stress | 23/25 | Full branch matrix simulated under PS 5.1 `Stop`; live merge deferred to post-merge (workflow only runs from main) |
| Platform integrity | 14/15 | Pass 2 and preamble byte-identical to main; blast radius contained to pass 1 |
| Security | 8/10 | Newest-PR-wins matching now ends in a merge, not a bounce (NOTE 2) |

### Machine checks
- `gh pr checks`: one check, `audit` (AI Review Audit run 28721138184) — **errored, inconclusive**. Annotation: "The self-hosted runner lost communication with the server." That is the audit workflow's own prior run dying to infrastructure, not the code failing a check; per `auditor/skills/lint-first.md` §3 it is not converted to a finding. This audit proceeded without that signal (and is itself the replacement run).
- Local lint/build/test: no `package.json` — normal pre-#9, not a finding.

### Spec compliance
- [x] AC1 — Completed card + OPEN issue + mergeable `Closes #N` PR → squash-merged, branch deleted, card rests, no bounce/comment. Verified in simulation (item #101: `MERGED PR #201 ... branch deleted`, zero mutations/comments for that item).
- [x] AC2 — CONFLICTING PR → no merge attempt, bounce + conflict comment. Verified (item #102: no `MERGE-ATTEMPT` logged, bounce comment names conflicts and `mergeStateStatus: DIRTY`).
- [ ] AC3 (partial) — merge failure bounces with a comment, but the comment contains the exit code ("exit 1 - see the sweep run log"), not "gh's error line" as the spec wrote. Deviation is declared in the PR body and motivated by the #19 stderr rule. See Finding 1.
- [x] AC4 — no-open-PR path unchanged: merged-PR safeguard rests (item #104), otherwise bounce + "nothing was merged" (item #105). Verified.
- [x] AC5 — Started pass untouched: pass 2 region is byte-identical to main (regex-extracted both versions, string-equal). Verified in simulation (item #107: move only, no comment).
- [x] AC6 — under PS 5.1 with `$ErrorActionPreference = "Stop"`, a failing `gh pr merge` does not kill the step. Verified two ways: (a) harness run where PR #203's merge exited 1 — the loop continued and processed three more items, final process exit 0; (b) isolated test: unredirected native command writing stderr under `Stop` did not throw, `$LASTEXITCODE` captured, `$global:LASTEXITCODE = 0` reset confirmed.

### Stress tests performed
- Extracted the `run: |` block (lines 34–160) to a standalone file; `[Parser]::ParseFile` under PS 5.1 → 0 errors.
- Dot-sourced the extracted step in a fresh `powershell.exe -NoProfile` process with a mocked `gh` (mock sets real `$LASTEXITCODE` via `cmd /c exit N`) and a 9-item board covering every branch:
  - #101 Completed/OPEN, MERGEABLE PR, merge exits 0 → `MERGED`, card rests ✓
  - #102 CONFLICTING PR → bounce + conflict comment, merge never attempted ✓
  - #103 MERGEABLE PR, merge exits 1 → bounce, comment carries `exit 1`, loop survives ✓
  - #104 no open PR, merged PR exists → safeguard rests ✓
  - #105 no PR at all → bounce "nothing was merged" ✓
  - #106 updatedAt inside 3-min grace window → untouched ✓
  - #107 Started with open PR → pass-2 move, log-only, no comment ✓
  - #108 `mergeable: UNKNOWN` → proceeds to guarded merge attempt (per spec "only CONFLICTING short-circuits") ✓
  - #109 Completed but issue CLOSED → filtered before pass 1 ✓
- Harness finished with `$LASTEXITCODE = 0` despite the injected merge failure — the step will not false-fail in Actions (whose powershell wrapper propagates `LASTEXITCODE`); the explicit `$global:LASTEXITCODE = 0` at completed-sweep.yml:131 is what guarantees this when a merge failure is the last native result.

### Integrity sweep
- Diff scope: 2 files. `.github/workflows/completed-sweep.yml` (pass 1 open-PR path + comments only) and `agent-dispatch/README.md` (one Guards line, docs-only).
- Byte-compared regions vs `git show main:...`: script preamble, GraphQL query, grace-window logic, and the entire pass 2 are string-identical to main. Only the pass-1 `else` branch (open-PR path) changed.
- Consumers: the workflow is self-contained (schedule + manual dispatch); nothing imports it. `agent-dispatch/relay.js` untouched — fast-path merge behavior unchanged.
- Double-merge race vs the relay: 3-minute grace window retained (unchanged), and a relay-merged PR closes its issue, which the `state -eq "OPEN"` filter removes before pass 1 — sweep cannot re-merge closed work. A sweep merge while a relay merge is in flight past the grace window degrades to a failed second merge → bounce comment; annoying, not corrupting.
- Data compatibility: no schemas or stored formats touched. Board mutations use the same field/option IDs as main.
- Unverified: no live end-to-end merge was run (schedule-triggered workflow executes only from main; PR body commits to a staged live test post-merge — reasonable and worth honoring).

### Findings
1. NOTE — `.github/workflows/completed-sweep.yml:136` — AC3 asked for "comment containing gh's error line"; the comment carries only the exit code plus "see the sweep run log". Run logs expire, so the diagnostic decays. The error line can be captured safely under `Stop` without PowerShell stderr redirection by letting cmd own it: `$err = cmd /c "gh pr merge <n> --repo <r> --squash --delete-branch 2>&1"` then branch on `$LASTEXITCODE`. Acceptable as shipped; fix if merge-failure bounces turn out to need archaeology.
2. NOTE — `.github/workflows/completed-sweep.yml:109,129` — `Find-Pr` takes the first (newest-first) open PR matching `Closes #N` or `(#N)` in the title; this PR upgrades that match's consequence from bounce to squash-merge. If two open PRs claim the same issue, the newest — not necessarily the reviewed one — is what gets merged on a dropped-webhook approval. Pre-existing matcher (and the relay fast path shares the semantics, declared out of scope in #47), so NOTE not BLOCKER; consider logging the candidate count when >1 match so a shadowed merge is at least visible.
