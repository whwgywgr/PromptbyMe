-- =====================================================================
-- PromptbyMe — Supabase setup
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

-- Added for grid thumbnails (safe to re-run on existing databases)
alter table results add column if not exists thumb_path text;

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

-- 5. Username + password auth -----------------------------------------
--    IMPORTANT (Dashboard -> Authentication -> Providers -> Email):
--    turn OFF "Confirm email" — signups use a synthetic address and
--    cannot receive confirmation mail.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles readable" on profiles;
create policy "profiles readable" on profiles
  for select using (true);

drop policy if exists "own profile insert" on profiles;
create policy "own profile insert" on profiles
  for insert with check (auth.uid() = id);

drop policy if exists "own profile update" on profiles;
create policy "own profile update" on profiles
  for update using (auth.uid() = id);

create unique index if not exists profiles_username_lower_idx
  on profiles (lower(username));

-- auto-create the profile on signup, using the username passed in
-- signUp({ options: { data: { username } } })
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'user' || left(replace(new.id::text, '-', ''), 8))
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- username -> email lookup used by signInUser()
create or replace function get_email_by_username(p_username text)
returns text language sql security definer set search_path = public as $$
  select u.email
  from auth.users u
  join public.profiles pr on pr.id = u.id
  where lower(pr.username) = lower(p_username)
  limit 1;
$$;
