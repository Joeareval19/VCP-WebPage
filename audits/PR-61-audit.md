**Sterling** · VCP Chief Auditor

Verdict: LGTM
Score: 98/100

### Score breakdown
| Axis | /max | Notes |
|---|---|---|
| Machine checks | 25/25 | No failures; no local lint configured yet (pre-#9, normal) |
| Spec compliance | 25/25 | All five acceptance criteria demonstrably met; nothing out of scope |
| Correctness under stress | 24/25 | Full local + live battery passed; −1 for the `updated_at` staleness footgun (NOTE 1) |
| Platform integrity | 14/15 | Purely additive; consumers verified; −1 for the two corners I could not independently re-verify (named below) |
| Security | 10/10 | Publishable key verified least-privilege live; RLS matrix exact |

### Machine checks
- `gh pr checks`: only the audit workflow itself (pending mid-run, normal). No other CI registered — pre-#9.
- Local lint/build/test: no package.json — no lint configured yet (pre-#9, not a finding).

### Spec compliance (#60)
- [x] All four migrations applied to `qaorlbgrkpldcatyntlw`; 8 tables exist, RLS enabled on every one — verified live (see below) without writing a single row.
- [x] Anon behavior: INSERT into telemetry tables allowed; SELECT returns zero rows; INSERT into ops tables fails 42501; only `published` documents visible — verified live AND reproduced locally.
- [x] Security advisor warnings by-design — verified by equivalent live probes (I could not run the advisor against this project from this runner; the anon key's actual powers were measured directly instead, which is stronger evidence than the advisor's static view).
- [x] `js/telemetry.js` carries the publishable key — key verified valid and anon-scoped live.
- [x] Migration files + key edit merged to main — satisfied by this PR merging; files byte-match the observed live schema behavior.

### Stress tests performed
**Live, read-only (no durable writes to production):**
- Anon GET on all 8 tables with the PR's shipped key: all HTTP 200, all `[]`. Proves the key is valid (bad key → 401) and every table exists (missing table → 404).
- Anon empty-row `POST {}` probes — a distinguishing test that stores nothing either way: `vcp_tickets`, `vcp_pipeline_events`, `vcp_audits`, `vcp_documents` all returned **42501 RLS violation** (anon INSERT denied, RLS provably ON); `vcp_voice_turns`, `vcp_site_events`, `vcp_site_visits`, `vcp_voice_sessions` all reached the **23502 NOT NULL constraint** (anon INSERT allowed by policy, row still rejected, nothing stored).
- RLS-on for the four insert-allowed tables follows: each file's INSERT policy (proven live) is created *after* its `enable row level security` statement in the same sequentially-executed file.

**Local, throwaway Postgres 16 (docker), Supabase roles/grants emulated, all four migrations applied in order — all clean:**
- Exact `relay.js capture()` payloads for all five event types (`status_change`, `dispatch`, `skip`, `bounce`, `merge`) insert successfully; a sixth type (`deploy`) correctly rejected by CHECK.
- Exact `agent-review.yml` audit payload (`CHANGES_REQUESTED` verdict code, score, report_path) inserts; verdict `APPROVED`, score 101, score −1 all rejected by CHECKs.
- `vcp_tickets` insert + upsert-on-PK (the backfill shape) works.
- Documents lifecycle: draft/published/archived rows created with unicode, emoji, `<script>` tags, and 5000-char bodies; invalid status and duplicate slug rejected; **as anon: only the published row visible** of three present.
- Voice turns as anon: inserts succeed with no session row present (the abandoned-browser case the table exists for); duplicate `(session_id, turn_index)` → unique violation; role `system` → CHECK violation; anon read-back → 0 rows with 2 present.
- Telemetry tables as anon with data present: 0 rows readable; anon writes to all four service-role tables → RLS violation.

### Integrity sweep
- True diff vs `origin/main`: 4 code/schema files, 126 insertions / 3 deletions, plus one wiki note (`wiki/Site Platform/Site Database.md`, commit 87493aa, landed mid-audit and reviewed: pure documentation, its claims match my live measurements; issue #60 carries the required backlink comment). No existing file other than `js/telemetry.js` touched.
- All three migrations are purely additive (`create table` / `create index` / `create policy` only — zero ALTERs of existing tables); `70002_site_metadata.sql` untouched, so every existing record and writer is unaffected by construction.
- `js/telemetry.js` consumers: all 8 site pages include it; the diff changes only the key constant and a comment — the fail-silent contract, the `vcpTrack` hook, and the empty-key guard are unchanged. Activation verified live: the shipped key authenticates and can do nothing beyond the telemetry contract.
- Writers verified against schema: `agent-dispatch/relay.js` (five capture shapes) and `.github/workflows/agent-review.yml` (audit POST incl. the `CHANGES REQUESTED` → `CHANGES_REQUESTED` mapping) — both start succeeding with no code change, as the ticket claims.
- Not independently re-verifiable from this runner (named, not assumed): the Supabase migration registry state on the live project, and a fresh advisor run — this runner's Supabase MCP is connected to an unrelated project, so verification was done via direct anon REST probes instead.

### Findings
1. NOTE — supabase/migrations/70004_documents.sql:22 — `updated_at` defaults to `now()` but has no `BEFORE UPDATE` trigger, so service-role edits to a document will leave it stale unless every future writer remembers to set it. Add a `moddatetime`/plpgsql touch trigger in a follow-up migration before editorial tooling lands.
