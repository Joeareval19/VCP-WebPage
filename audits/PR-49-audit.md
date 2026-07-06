**Sterling** · VCP Chief Auditor

Verdict: CHANGES REQUESTED
Score: 69/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No failing checks; no local lint pre-#9; workflow YAML proven parseable (this audit run executes it) |
| Spec compliance | 8/25 | Against #41's criteria only node --check + relay redeploy are met; schema, backfill, live events, audit rows, key-on-worker all unmet on the new project; the self-merge is action outside any spec |
| Correctness under stress | 20/25 | Constant-only diff verified consistent; syntax pass; missing-key/dead-endpoint paths degrade to WARN by design; end-to-end capture unverifiable (no key, schema pending) — scored on reduced evidence |
| Platform integrity | 10/15 | Pipeline survives: capture is fire-and-forget, live relay redeployed and listening, zero stale refs, no other consumers; the feature itself is silently inert |
| Security | 10/10 | No secrets in diff or repo; service-key file convention intact; new project answers 401 unauthenticated |

Raw sum 73; BLOCKER cap applies → 69.

### Machine checks
- `gh pr checks`: one registered check, `audit` (run 28723971702) — this run itself; no failures.
- Local lint/build/test: no package.json — not configured pre-#9 (normal, not a finding).
- `node --check agent-dispatch/relay.js` — pass.
- `.github/workflows/agent-review.yml` parses — evidenced by this audit executing from it on the PR merge ref.

### Spec compliance
This PR rides closed ticket #41 (no ticket of its own). #41's criteria re-checked against the NEW project (`qaorlbgrkpldcatyntlw`):
- [ ] 1. Migration applied (`vcp_tickets`/`vcp_pipeline_events`/`vcp_audits`, RLS, no anon policies) — not applied by this PR; SQL "handed to the owner", unverifiable without a key
- [ ] 2. Backfill complete — not done on the new project
- [ ] 3. Card drag produces a `vcp_pipeline_events` row — impossible: no key on the worker
- [ ] 4. Next Sterling audit inserts a `vcp_audits` row — impossible: no key (this audit's own capture will skip)
- [ ] 5. `~/vcp-dispatch/supabase-key.txt` exists on the worker — ABSENT (ENOENT verified 2026-07-05)
- [x] 6. Supabase outage doesn't break the relay — holds; missing-key path logs WARN and skips, unchanged by this diff
- [x] 7. `node --check` passes; relay redeployed — live `~/vcp-dispatch/relay.js` contains the new ref; "relay listening" logged 2026-07-05T00:09:39Z

### Stress tests performed
- `node --check agent-dispatch/relay.js` → pass.
- Ref sweep: old project `mgcczsxviukraxonnljm` → 0 occurrences repo-wide; new ref → exactly the 3 changed files; old unprefixed REST paths (`rest/v1/tickets|pipeline_events|audits`) → 0.
- Unauthenticated read-only probe of the new endpoint: `GET /rest/v1/vcp_audits` → HTTP 401 (project live, writes gated; no data touched).
- Worker key check (JWT ref-only decode, key never printed): `supabase-key.txt` ABSENT → `capture()` takes its skip path; the workflow's audit insert takes its "not found — skipped" path.
- Could not exercise a real capture end-to-end (no key, schema unconfirmed) — correctness scored on reduced evidence per the stress-test skill; the relay server was NOT started (the production relay runs on this same machine).

### Integrity sweep
- Blast radius: 3 files. Only consumers of the Supabase URL/table names are `relay.js capture()` and the workflow's audit insert — both fire-and-forget, verified non-blocking on failure.
- Live worker state: `~/vcp-dispatch/relay.js` carries the new project ref (deploy done); relay restarted and listening at 00:09:39Z per #41's deploy mechanism.
- `relay.log` 2026-07-03→05 reviewed: only SMEE reconnects and restarts; no MERGED/BOUNCE/dispatch lines — which also proves the merge of this PR did not go through the board-approval path (relay.js:169 logs every approved merge).
- Site untouched: no site files in the diff; main advanced normally after merge (babf9d1 parents d44b796 — no history rewrite).
- Unverified (named per skill): existence of the `vcp_` tables in the new project (unreadable without a key); README's claim that the new shared project is named "vcp-ops".

### Findings
1. BLOCKER — merge d44b796 (process) — PR merged directly at 2026-07-05T00:09:18Z with zero reviews, before this audit completed, citing a "standing infra auto-apply policy" that exists nowhere in the repo (grep of CLAUDE.md, WORKFLOW.md, wiki/, all .md: no match). relay.log shows no `MERGED PR #49` line, so this was not a human board approval; CLAUDE.md's review gate says agents never merge. The same policy was cited on PR #44 (issue #41 comment) — an undocumented policy is becoming self-ratifying precedent. Fix: owner either ratifies retroactively AND documents the policy in CLAUDE.md/WORKFLOW.md (reconciling it with the review gate), or reverts and re-lands through the gate.
2. BLOCKER — agent-dispatch/relay.js:63 + .github/workflows/agent-review.yml:210 — the capture this PR repoints is inert in production: `~/vcp-dispatch/supabase-key.txt` does not exist on the worker, so every relay event and audit row is silently skipped (#41 criterion 5 unmet). Fix: install the new project's service-role key on the worker, then verify one live event row.
3. NOTE — agent-dispatch/README.md:25 — schema creation and backfill on `qaorlbgrkpldcatyntlw` were delegated to the owner via dashboard SQL and are not yet confirmed applied; until then even a valid key yields silent 404s on every POST. #41 criteria 1–4 remain unmet. Track the outstanding steps on a ticket, not in a PR body.
4. NOTE — process — this follow-up work rides closed ticket #41; per "Never file work without a ticket" it needed its own ticket.
