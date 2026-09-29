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

-- 2. Row Level Security ------------------------------------------------
-- Public READ (guest gallery); writes are owner-only.

alter table prompts enable row level security;
alter table results enable row level security;

drop policy if exists "own prompts" on prompts;
drop policy if exists "prompts public read" on prompts;
create policy "prompts public read" on prompts
  for select using (true);
drop policy if exists "own prompts insert" on prompts;
create policy "own prompts insert" on prompts
  for insert with check (auth.uid() = user_id);
drop policy if exists "own prompts update" on prompts;
create policy "own prompts update" on prompts
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "own prompts delete" on prompts;
create policy "own prompts delete" on prompts
  for delete using (auth.uid() = user_id);

drop policy if exists "own results" on results;
drop policy if exists "results public read" on results;
create policy "results public read" on results
  for select using (true);
drop policy if exists "own results insert" on results;
create policy "own results insert" on results
  for insert with check (auth.uid() = user_id);
drop policy if exists "own results update" on results;
create policy "own results update" on results
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "own results delete" on results;
create policy "own results delete" on results
  for delete using (auth.uid() = user_id);

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
-- For OAuth users (Google), the username is derived from their display name.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  i int := 0;
begin
  base := coalesce(
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, 'user'), '@', 1)
  );
  base := regexp_replace(base, '[^a-zA-Z0-9_-]', '', 'g');
  if base is null or length(base) < 3 then
    base := 'user' || left(replace(new.id::text, '-', ''), 8);
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    i := i + 1;
    candidate := base || i::text;
  end loop;
  insert into public.profiles (id, username) values (new.id, candidate);
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

-- 6. Google OAuth (optional) -------------------------------------------
-- Dashboard -> Authentication -> Providers -> Google: enable + paste
--   Client ID / Client Secret from Google Cloud Console
--   (OAuth client -> Authorized redirect URI:
--      https://<your-project-ref>.supabase.co/auth/v1/callback )

-- 7. Superadmin (boleh delete prompt sesiapa) --------------------------
--    TUKAR senarai username di bawah ikut admin anda.

create or replace function is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and lower(username) in ('yusuf')
  );
$$;

drop policy if exists "own prompts delete" on prompts;
create policy "own prompts delete" on prompts
  for delete using (auth.uid() = user_id or is_superadmin());

drop policy if exists "own results delete" on results;
create policy "own results delete" on results
  for delete using (auth.uid() = user_id or is_superadmin());

drop policy if exists "own media" on storage.objects;
create policy "own media" on storage.objects
  for all using (
    bucket_id = 'media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or is_superadmin()
    )
  )
  with check (
    bucket_id = 'media'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or is_superadmin()
    )
  );
