-- /chud/ live board: database setup. Run once in the board's own Supabase project (SQL editor, or `supabase db push`).
-- One table holds every post. A post with thread = NULL starts a new thread; its thread key is 'u' || id.
-- A post with a thread key is a reply (to a user thread 'u123', or to one of the page's fixed threads like 't1').
-- Nobody writes to the table directly: all posts go through the chud-board function, which applies the limits.

create table if not exists public.chud_posts (
  id          bigint generated always as identity primary key,
  thread      text,                       -- NULL = this post starts a thread
  subject     text,                       -- thread starters only
  name        text not null default 'Anonymous',
  body        text not null,
  created_at  timestamptz not null default now(),
  bumped_at   timestamptz not null default now(),   -- thread starters: time of the newest reply
  ip_hash     text not null,              -- salted hash of the poster's IP: for rate limits and bans, never shown
  hidden      boolean not null default false,
  constraint chud_body_len check (char_length(body) between 1 and 2000),
  constraint chud_name_len check (char_length(name) between 1 and 40),
  constraint chud_subject_len check (subject is null or char_length(subject) <= 100)
);
create index if not exists chud_posts_thread on public.chud_posts (thread, id);
create index if not exists chud_posts_ip on public.chud_posts (ip_hash, created_at desc);
create index if not exists chud_posts_bump on public.chud_posts (bumped_at desc) where thread is null and not hidden;

create table if not exists public.chud_bans (
  ip_hash    text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

-- locked: no policies, so the public (anon) key can read or write nothing here; only the function's service key can
alter table public.chud_posts enable row level security;
alter table public.chud_bans  enable row level security;

-- what the page may read: two views without ip_hash and without hidden posts
create or replace view public.replies as
  select id, thread, name, body, created_at from public.chud_posts where thread is not null and not hidden;
create or replace view public.threads as
  select p.id, p.subject, p.name, p.body, p.created_at, p.bumped_at,
         (select count(*) from public.chud_posts r where r.thread = 'u' || p.id and not r.hidden) as replies
  from public.chud_posts p where p.thread is null and not p.hidden;
grant select on public.replies, public.threads to anon, authenticated;
