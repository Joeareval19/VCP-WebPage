-- [70002] Site database: visitor analytics, voice-session transcripts, site events.
-- Run once in the Supabase SQL editor of project qaorlbgrkpldcatyntlw.
-- Security model: RLS on, anon key is INSERT-only (telemetry pattern) —
-- a visitor's browser can write rows but never read/update/delete anything.
-- Reads are service-role only.

create table public.vcp_site_visits (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  visitor_id uuid not null,
  session_id uuid not null,
  page text not null,
  referrer text,
  utm jsonb,
  device jsonb,
  screen text,
  language text,
  timezone text,
  -- Nullable by design: the anon role cannot UPDATE, so the v1 client emits
  -- duration as a vcp_site_events row (event_type='meta', name='visit_duration').
  duration_ms int
);

create table public.vcp_site_events (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  visitor_id uuid,
  session_id uuid,
  page text,
  event_type text not null check (event_type in ('perf','interaction','error','widget','meta')),
  name text not null,
  value numeric,
  detail jsonb
);

-- Content model from issue #43 (voice feedback assistant), plus status/duration.
create table public.vcp_voice_sessions (
  id bigint generated always as identity primary key,
  session_id text not null unique,
  ts timestamptz not null default now(),
  page_context text not null,
  transcript text not null,          -- redacted BEFORE storage (#43's PII scrub)
  summary text,
  filed_issue int,
  status text not null default 'completed' check (status in ('completed','abandoned')),
  duration_ms int
);

create index vcp_site_visits_ts_idx on public.vcp_site_visits (ts);
create index vcp_site_visits_page_idx on public.vcp_site_visits (page);
create index vcp_site_visits_visitor_idx on public.vcp_site_visits (visitor_id);
create index vcp_site_events_ts_idx on public.vcp_site_events (ts);
create index vcp_site_events_type_idx on public.vcp_site_events (event_type);
create index vcp_voice_sessions_ts_idx on public.vcp_voice_sessions (ts);

alter table public.vcp_site_visits enable row level security;
alter table public.vcp_site_events enable row level security;
alter table public.vcp_voice_sessions enable row level security;

-- INSERT-only for the anon (publishable-key) role. No select/update/delete
-- policies exist, so those operations are denied for anon by default.
create policy anon_insert_visits on public.vcp_site_visits
  for insert to anon with check (true);
create policy anon_insert_events on public.vcp_site_events
  for insert to anon with check (true);
create policy anon_insert_voice on public.vcp_voice_sessions
  for insert to anon with check (true);
