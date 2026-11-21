-- /chud/ shared replies. Paste into Supabase → SQL Editor → Run.

create table if not exists public.replies (
  id         bigint generated always as identity primary key,
  thread     text not null check (thread in ('t-sticky','t-lore','t-archive','t-token','t-gallery','t-socials')),
  name       text not null default 'Anonymous' check (char_length(name) between 1 and 40),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.replies enable row level security;

-- anyone can read
create policy "replies are public" on public.replies
  for select to anon, authenticated using (true);

-- anyone can post (constraints above cap length + valid threads)
create policy "anyone can post" on public.replies
  for insert to anon, authenticated with check (true);

-- no update/delete policies → visitors can't edit or remove posts.
-- Moderate from the Supabase Table Editor (delete rows there).
