**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | Only check on head is this audit itself, pending (documented self-reference — not a finding per lint-first). No local lint pre-#9. |
| Spec compliance | 15/25 | AC1 proven for pending/fail/self-reference; disproven for the no-checks case (see BLOCKER). AC2 not run as written. AC3/AC4 satisfied by this audit run completing. |
| Correctness under stress | 12/25 | Root cause and fix both reproduced and verified — but the step still crashes on realistic, currently-live input (PR #8). |
| Platform integrity | 14/15 | Single workflow file changed; other workflows untouched; downstream steps verified live by this very run. |
| Security | 9/10 | No secrets, no new injection surface. |
| **Total** | **75 → capped 69** | One BLOCKER caps the score at 69. |

### Machine checks
- `gh pr checks 20`: `audit — pending` (this audit run reporting on itself; expected self-reference, not a finding) — pass.
- Local lint/build/test: no `package.json` (pre-#9) — normal, not a finding.

### Spec compliance
- [~] AC1 — `gh pr checks` non-zero no longer fails the step: **met for the enumerated cases** (self-reference, pending, failed — all stdout+exit-code paths, verified below), **not met when `gh` writes to stderr** (no-checks-reported, auth/network errors). See BLOCKER.
- [ ] AC2 — `workflow_dispatch` run completes with conclusion `success`: not performed as written. Equivalent live evidence exists: this very audit run executed the fixed step against the exact self-referential condition (`audit pending`, gh exit 8) and survived — pre-fix, that input crashed 100% of runs. But a dispatch against PR #8 today would fail (see BLOCKER).
- [x] AC3 — `audits/PR-20-audit.md` written and committed: this file, this run — the first audit report ever produced in production.
- [x] AC4 — PR comment + verdict label posted: this run.

### Stress tests performed
All tests replicated the exact Actions harness taken from this runner's own step temp file (`_work/_temp/71768785….ps1`): `$ErrorActionPreference = 'stop'` prepended, script dot-sourced, `if (Test-Path variable:\LASTEXITCODE) { exit $LASTEXITCODE }` appended. Windows PowerShell 5.1, same machine as the production runner.

1. **Root-cause repro (pre-fix logic)** — native command exiting 8 with stdout output (simulating `gh pr checks` pending), followed only by cmdlets: step exit **1**. Confirms #19's diagnosis: the appended wrapper turns a stale `$LASTEXITCODE` into step failure.
2. **Fix verification (PR logic)** — same failing input with the PR's `$global:LASTEXITCODE = 0` resets + `exit 0`: step exit **0**, log intact. Fix works for all stdout/exit-code failure modes.
3. **Live production evidence** — this audit run itself executes the fixed step (pull_request merge-ref). Its machine log shows `audit pending` — the exact input that crashed runs 1–3 — and the step passed, Sterling ran, this report exists.
4. **stderr attack (BLOCKER found)** — the PR's step script **verbatim**, run against live open **PR #8**, whose head has zero check runs: `gh pr checks 8` writes `no checks reported on the 'issue-7-smoke-test' branch` to **stderr**, and under the runner-prepended `$ErrorActionPreference='stop'`, the `2>&1` redirect raises a terminating `NativeCommandError` at the `gh` line itself. The `$global:LASTEXITCODE = 0` reset and `exit 0` **never execute**. Step exit: **1**. Also confirmed generally: `gh` writes all errors to stderr (`gh pr checks 999` → GraphQL error on stderr, exit 1), so auth/network hiccups hit the same vector.
5. **Remedy verification** — same verbatim script with `$ErrorActionPreference = 'Continue'` as the step's first line: step exit **0** against PR #8, stderr text captured into the log for Sterling to ingest. One line closes the whole class.

### Integrity sweep
- Blast radius is exactly one file: `.github/workflows/agent-review.yml` (14 additions, 0 deletions — verified vs `origin/main`). `agent-build.yml` and `approve-merge.yml` untouched.
- No site code, data, or content touched — zero frontend/backend surface.
- `machine_log` step output is written before `exit 0` (line 99 precedes line 101); downstream consumers verified live: the Sterling step received the correct log path this run, and the publish-score step's input contract is unchanged.
- YAML validity: proven by execution — this run is the changed workflow parsing and running.
- Unverified: conclusion of this run as observed from outside (a run cannot observe its own final conclusion).

### Findings
1. **BLOCKER** — `.github/workflows/agent-review.yml:75` — `gh pr checks` output to stderr still crashes the step. The Actions `shell: powershell` wrapper prepends `$ErrorActionPreference = 'stop'`; in PS 5.1, `2>&1` on a native command wraps stderr lines as ErrorRecords, which under `Stop` raise a terminating `NativeCommandError` **before** the `$global:LASTEXITCODE = 0` reset and the trailing `exit 0` run. Reproduced with the step script verbatim against live PR #8 (head has no check runs → gh exits 1 with stderr-only output). Trigger path is the product's core loop: agent pushes fix commits → new head SHA has no check runs (nothing triggers on `synchronize`) → card dragged to Review / #17 sweep fires `repository_dispatch` → step crashes. AC1's own words — "gh pr checks returning non-zero … no longer fails the step" — are violated by this input. Fix (verified, test 5): add `$ErrorActionPreference = 'Continue'` as the first line of the step script; the step is log-only by design and must never inherit `Stop`.
2. **NOTE** — `.github/workflows/agent-review.yml:88` — `npm install … 2>&1` and `npm run … 2>&1` sit on the same landmine: npm routinely writes warnings to stderr, so the day #9 lands a `package.json`, the first `npm warn` under `$ErrorActionPreference='stop'` kills the step regardless of the exit-code resets. The finding-1 remedy fixes this line for free; without it, this fix buys the pipeline only until #9 merges.

The diagnosis in #19 was correct, the exit-code fix is real and proven live — this very report existing is its proof. But the step's actual contract is "never crash while logging," and stderr is the second barrel of the same gun. One more line and it's done.
