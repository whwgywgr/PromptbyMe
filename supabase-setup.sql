-- =====================================================================
-- Prompt Manager — Supabase setup
-- Run this ONCE in Supabase Dashboard -> SQL Editor
-- =====================================================================

-- 1. Tables -----------------------------------------------------------

create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled prompt',
  model text not null default '',
  prompt text not null default '',
  notes text not null default '',
  tags text[] not null default '{}',
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_id uuid not null references prompts(id) on delete cascade,
  type text not null check (type in ('image', 'video', 'webview')),
  source text not null check (source in ('upload', 'url', 'html')),
  name text not null default '',
  size bigint not null default 0,
  mime text not null default '',
  url text,
  html text,
  storage_path text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists results_prompt_id_idx on results (prompt_id);

-- 2. Row Level Security (each user sees only their own rows) ----------

alter table prompts enable row level security;
alter table results enable row level security;

drop policy if exists "own prompts" on prompts;
create policy "own prompts" on prompts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own results" on results;
create policy "own results" on results
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Storage bucket for uploaded media --------------------------------

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "own media" on storage.objects;
create policy "own media" on storage.objects
  for all using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Auth redirect allowlist (do this in the Dashboard, not SQL):
--    Authentication -> URL Configuration
--      Site URL:            https://whwgywgr.github.io/prompt-manager/
--      Redirect URLs:       https://whwgywgr.github.io/prompt-manager/
--                           http://localhost:8931/
--                           http://127.0.0.1:5500/**  (optional dev)
