-- [70005] Voice terminal per-turn transcript capture (companion to
-- vcp_voice_sessions from [70002] / issue #43).
-- Why a second table: the anon key is INSERT-only (no UPDATE), so a growing
-- transcript cannot be appended to the session row. The widget inserts one
-- row per utterance AS IT HAPPENS; the single vcp_voice_sessions row (full
-- transcript + summary) is written once at session end. If a visitor closes
-- the browser mid-session, the turns already inserted survive — the
-- transcript of an abandoned session is not lost.
-- Text is PII-redacted BEFORE storage, same contract as the session row.

create table public.vcp_voice_turns (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  session_id text not null,           -- joins vcp_voice_sessions.session_id
  turn_index int not null,            -- 0-based order within the session
  role text not null check (role in ('assistant','visitor')),
  text text not null,                 -- redacted before storage
  page_context text,
  unique (session_id, turn_index)
);

create index vcp_voice_turns_session_idx on public.vcp_voice_turns (session_id);
create index vcp_voice_turns_ts_idx on public.vcp_voice_turns (ts);

alter table public.vcp_voice_turns enable row level security;

-- Same telemetry pattern as [70002]: anon may INSERT, never read/change.
create policy anon_insert_voice_turns on public.vcp_voice_turns
  for insert to anon with check (true);
