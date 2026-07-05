-- [70004] Document store: the published-writing repository behind the
-- Library page ("finished, citable documents VCP has published — filter by
-- topic or sort by date") — blogs, research write-ups, and future kinds.
-- Security model: the ONLY table the anon key may read — and only rows with
-- status = 'published'. Drafts/archived rows are invisible to the site.
-- All writes are service-role only (publishing is an editorial act, not a
-- visitor one).

create table public.vcp_documents (
  id bigint generated always as identity primary key,
  slug text not null unique,          -- URL identity: /library/<slug>
  kind text not null default 'blog',  -- blog | research | paper | note | ... (open set by design)
  status text not null default 'draft' check (status in ('draft','published','archived')),
  title text not null,
  summary text,                       -- card/teaser text on the Library grid
  body_md text,                       -- full document, markdown
  topics text[],                      -- Library topic filter
  author text,
  hero_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb                      -- citations, canonical URL, reading time, ...
);

create index vcp_documents_status_idx on public.vcp_documents (status);
create index vcp_documents_kind_idx on public.vcp_documents (kind);
create index vcp_documents_published_idx on public.vcp_documents (published_at desc);
create index vcp_documents_topics_idx on public.vcp_documents using gin (topics);

alter table public.vcp_documents enable row level security;

-- Visitors (anon key) can read published documents only. No insert/update/
-- delete policies exist, so anon writes are denied by default.
create policy anon_read_published_documents on public.vcp_documents
  for select to anon using (status = 'published');
