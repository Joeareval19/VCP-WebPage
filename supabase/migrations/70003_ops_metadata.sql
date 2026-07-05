-- [70003] Ops metadata (#41): the tables the agent pipeline already writes to.
-- Consumers: agent-dispatch/relay.js (vcp_pipeline_events), agent-review.yml
-- (vcp_audits), and the gh backfill (vcp_tickets).
-- Security model: RLS on with ZERO policies — every read and write requires
-- the service-role key (lives only in ~/vcp-dispatch/supabase-key.txt on the
-- worker, never in git). The anon key can do nothing here.

-- Mirror of GitHub issues, backfilled from gh. issue_number is the join key
-- used by the other two tables.
create table public.vcp_tickets (
  issue_number int primary key,
  title text not null,
  state text not null,                -- open | closed (gh issue state)
  board_status text,                  -- Pending | Started | Review | Completed
  labels text[],
  author text,
  assignee text,
  url text,
  created_at timestamptz,
  closed_at timestamptz,
  synced_at timestamptz not null default now()
);

-- Relay event stream: every status change, dispatch, merge, bounce, skip.
-- Field shapes match capture() in agent-dispatch/relay.js.
create table public.vcp_pipeline_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  source text not null,               -- 'relay' today; sweeps/workflows later
  event_type text not null check (event_type in ('status_change','dispatch','skip','bounce','merge')),
  issue_number int,
  pr_number int,
  from_status text,
  to_status text,
  detail jsonb
);

-- One row per Sterling audit run. Field shape matches the payload in
-- .github/workflows/agent-review.yml.
create table public.vcp_audits (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  pr_number int not null,
  issue_number int not null,
  verdict text not null check (verdict in ('LGTM','CHANGES_REQUESTED')),
  score int not null check (score between 0 and 100),
  report_path text
);

create index vcp_pipeline_events_ts_idx on public.vcp_pipeline_events (ts);
create index vcp_pipeline_events_issue_idx on public.vcp_pipeline_events (issue_number);
create index vcp_audits_pr_idx on public.vcp_audits (pr_number);
create index vcp_audits_issue_idx on public.vcp_audits (issue_number);

-- RLS on, no policies: service-role only, per agent-dispatch/README.md.
alter table public.vcp_tickets enable row level security;
alter table public.vcp_pipeline_events enable row level security;
alter table public.vcp_audits enable row level security;
