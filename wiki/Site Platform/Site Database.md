---
title: Site Database
tags: [platform, telemetry, security]
related: [[Agent Dispatch Pipeline]]
parent:
depends_on:
---

Why the vcp-ops Supabase project (`qaorlbgrkpldcatyntlw`) is shaped the way it is — three access models, one database. Schema lives in `supabase/migrations/`; filed as #52/#53 (telemetry) and #60/PR #61 (everything else).

## The three access models

| Tables | Who writes | Who reads | Why |
|--------|-----------|-----------|-----|
| `vcp_site_visits`, `vcp_site_events`, `vcp_voice_sessions`, `vcp_voice_turns` | anon key (visitor's browser), INSERT-only | service-role only | Telemetry pattern: the key is public in page source, so it must be able to add rows and do literally nothing else — verified live 2026-07-05 (anon SELECT returns zero rows, UPDATE/DELETE denied) |
| `vcp_tickets`, `vcp_pipeline_events`, `vcp_audits` | service-role only (RLS on, zero policies) | service-role only | Ops capture from the [[Agent Dispatch Pipeline]] — the service key lives ONLY in `~/vcp-dispatch/supabase-key.txt` on the worker, never in git |
| `vcp_documents` | service-role only | anon may SELECT `status='published'` rows only | Publishing is an editorial act; drafts are invisible to the site |

## Decisions worth remembering

- **The anon key cannot UPDATE — this shapes two designs.** Visit duration can't be written onto the visit row, so the client emits it as a separate event (`meta`/`visit_duration`). And a voice transcript can't grow on the session row, so `vcp_voice_turns` inserts one row per utterance as it happens — a browser closed mid-session keeps its transcript, while the session-level summary row (content model from ticket #43) lands once at session end.
- **The ops schemas were written to match existing writers, not the other way around.** `relay.js capture()` and `agent-review.yml`'s audit POST predate the tables; migration `70003` gave their payloads a schema so the fire-and-forget writes start succeeding without touching the writers.
- **`vcp_documents.kind` is an open set** (blog, research, paper, …) — no CHECK constraint, because the Library page's content types are expected to grow.
- The security advisor permanently flags the INSERT-with-`check (true)` policies and the zero-policy tables — both are the design, not oversights.
