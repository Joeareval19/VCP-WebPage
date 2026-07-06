**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | `node --check` pass; no registered CI failures (only this audit pending); no local lint yet (pre-#9, normal) |
| Spec compliance | 12/25 | AC1, AC2, AC6, AC7 met; AC3 and AC4 unmet, AC5 half unmet (see findings) |
| Correctness under stress | 23/25 | capture() survived every failure mode I threw at it; workflow payload types verified correct |
| Platform integrity | 14/15 | Website untouched; relay dispatch/merge-guard logic preserved additively; deployed relay matches branch |
| Security | 10/10 | Repo grep clean of key material; RLS verified live with zero policies on all 3 tables |

Raw axis sum is 84; the BLOCKER caps the score at 69 per charter.

### Machine checks
- `gh pr checks`: only the audit run itself pending — no failing registered checks.
- Local lint/build/test: no package.json (pre-#9) — normal, not a finding.
- `node --check agent-dispatch/relay.js`: **pass** (Node v22.14.0 on the worker — global `fetch` available).
- YAML: Actions parsed and executed agent-review.yml for this very run — parse validity proven by execution.

### Spec compliance
- [x] AC1 — Migration `vcp_ops_metadata_v1` (20260704203136) applied on vcp-ops; `tickets`, `pipeline_events`, `audits` exist; RLS enabled on all three; **zero** policies (verified live via SQL against pg_class/pg_policies).
- [x] AC2 — Backfill complete at snapshot time: 22 `tickets` rows = 22 issues on GitHub; 13 backfill merge events = every PR merged before the backfill ran (PRs #42/#44 merged minutes after — see finding 3).
- [ ] AC3 — "Dragging any card produces a pipeline_events row within seconds — verified live": **not met.** `pipeline_events` contains **zero** `source=relay` rows, relay.log has zero capture lines since the 20:37:06Z redeploy, and live capture is impossible without the key file (finding 1). The live verification the criterion demands never happened.
- [ ] AC4 — "The next Sterling audit inserts an audits row": **not met.** `audits` has 0 rows, and this audit (the next one) will skip its insert — the workflow's `Test-Path` on the missing key file takes the "audit capture skipped" branch.
- [~] AC5 — Repo grep for key material (`eyJ…`, `sb_secret`, `service_role`): clean ✓. But `~/vcp-dispatch/supabase-key.txt` **does not exist on the worker** (`Test-Path` → False; checked hidden files and `*key*` recursively) ✗.
- [x] AC6 — Outage tolerance: verified by my stress harness (below) — missing key, connection-refused, and HTTP 401 all degrade to WARN logs; no exception escapes `capture()`. Note the builder's own live smoke test (relay.log WARN line) never ran — zero WARN capture lines exist.
- [x] AC7 — `node --check` passes; relay redeployed: `~/vcp-dispatch/relay.js` is byte-identical to the branch file (BOM-only diff), fresh "relay listening" line logged 2026-07-04T20:37:06Z.

### Stress tests performed
- Replicated `capture()` verbatim in a harness against controlled local targets (never the live DB): (1) empty key → synchronous WARN-skip, no throw; (2) connection refused on a closed port → "WARN capture dispatch failed: fetch failed"; (3) local mock server returning 401 → "WARN capture bounce rejected: HTTP 401"; (4) hostile payload (undefined fields, 500-emoji string, `<script>` tag in detail.reason) → serialized and sent without a synchronous throw. All four modes: no exception escaped to the caller.
- Replicated the workflow's PowerShell payload construction with verdict "CHANGES REQUESTED": produces valid JSON, `pr_number`/`score` as Int32, verdict correctly mapped to `CHANGES_REQUESTED`.
- Verified variable scoping in the workflow's capture block: `$p`, `$n`, `$verdict`, `$score`, `$report` all defined earlier in the same step.

### Integrity sweep
- Blast radius is 3 files: relay.js (worker infra), agent-review.yml (this workflow), README (docs). No website file touched — site pages unaffected by construction.
- relay.js: all changes are additive `capture()` calls; every pre-existing log/dispatch/bounce/merge statement is intact (diffed against main). The merge guard (#21) and review-dispatch dedup logic are unchanged.
- Deployed relay verified: `~/vcp-dispatch/relay.js` matches the branch content; relay restarted and listening (relay.log 20:37:06Z).
- agent-review.yml executed end-to-end for this audit run — checkout, machine checks, and Sterling steps all functioned; the new capture block is guarded by Test-Path + try/catch and cannot fail the step.
- Supabase-side check ran against the real vcp-ops project read-only; the local hotel-PMS Supabase project is a different database and is untouched by this PR.

### Findings
1. BLOCKER — deployment (AC5) — `~/vcp-dispatch/supabase-key.txt` was never created on the worker, so the entire live-capture feature is inert: the relay logs "WARN capture skipped" for every event (relay.js:65-68) and the workflow skips its audits insert (agent-review.yml:204-213). Zero `source=relay` rows and zero `audits` rows in the DB prove nothing has been captured. Fix: write the service-role key to that file AND restart the relay — the key is read once at startup (relay.js:65), so creating the file alone is not enough.
2. NOTE — agent-review.yml:185 — the audits insert is unreachable for any PR without a `Closes #N` line: the "No linked issue" branch exits the step at line 185, before the capture block at 200-213, even though `audits.issue_number` is nullable by design. Move the capture above that early-exit (or make issue-linking optional for it).
3. NOTE — data gap — merge events for PRs #42 and #44 fall between the backfill snapshot (~20:31Z) and working live capture, and the backfill's idempotence guard (skip if any source=backfill rows exist) means a re-run won't pick them up. Two manual `pipeline_events` inserts close the gap.
