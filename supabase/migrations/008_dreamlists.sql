-- ============================================================
-- Phase 2 — Dreamlists
-- Add shared/personal Dreamlists without renaming existing core tables.
-- ============================================================

create type public.dreamlist_type as enum ('personal', 'shared');
create type public.dreamlist_member_role as enum ('owner', 'member');
create type public.idea_priority as enum ('normal', 'high');

create table public.dreamlists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       public.dreamlist_type not null default 'personal',
  owner_id   uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index dreamlists_one_personal_per_owner_idx
  on public.dreamlists (owner_id)
  where type = 'personal';

create table public.dreamlist_members (
  id           uuid primary key default gen_random_uuid(),
  dreamlist_id uuid references public.dreamlists(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  role         public.dreamlist_member_role not null default 'member',
  created_at   timestamptz not null default now(),
  unique (dreamlist_id, user_id)
);

create table public.dreamlist_invites (
  id                 uuid primary key default gen_random_uuid(),
  dreamlist_id       uuid references public.dreamlists(id) on delete cascade not null,
  token              text unique not null,
  invited_by_user_id uuid references public.profiles(id) on delete cascade not null,
  expires_at         timestamptz,
  used_at            timestamptz,
  created_at         timestamptz not null default now()
);

alter table public.reel_submissions
  add column if not exists dreamlist_id uuid references public.dreamlists(id) on delete cascade,
  add column if not exists priority public.idea_priority not null default 'normal',
  add column if not exists source_idea_id uuid references public.reel_submissions(id) on delete set null,
  add column if not exists copied_from_dreamlist_id uuid references public.dreamlists(id) on delete set null,
  add column if not exists copied_by_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.trips
  add column if not exists dreamlist_id uuid references public.dreamlists(id) on delete cascade,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists reel_submissions_dreamlist_id_idx
  on public.reel_submissions (dreamlist_id, created_at desc);

create index if not exists trips_dreamlist_id_idx
  on public.trips (dreamlist_id, created_at desc);

create index if not exists dreamlist_members_user_id_idx
  on public.dreamlist_members (user_id, dreamlist_id);

create index if not exists dreamlist_invites_token_idx
  on public.dreamlist_invites (token);

-- Backfill every existing profile with a private Dreamlist.
insert into public.dreamlists (name, type, owner_id)
select 'My Dreamlist', 'personal', p.id
from public.profiles p
where not exists (
  select 1
  from public.dreamlists d
  where d.owner_id = p.id and d.type = 'personal'
);

insert into public.dreamlist_members (dreamlist_id, user_id, role)
select d.id, d.owner_id, 'owner'
from public.dreamlists d
on conflict (dreamlist_id, user_id) do nothing;

update public.reel_submissions r
set dreamlist_id = d.id
from public.dreamlists d
where r.dreamlist_id is null
  and d.owner_id = r.submitted_by_user_id
  and d.type = 'personal';

update public.trips t
set dreamlist_id = d.id
from public.dreamlists d
where t.dreamlist_id is null
  and d.owner_id = t.created_by_user_id
  and d.type = 'personal';

alter table public.reel_submissions
  alter column dreamlist_id set not null;

alter table public.trips
  alter column dreamlist_id set not null;

-- Ensure future signups get a personal Dreamlist automatically.
create or replace function public.handle_new_profile_dreamlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dreamlist_id uuid;
begin
  insert into public.dreamlists (name, type, owner_id)
  values ('My Dreamlist', 'personal', new.id)
  returning id into v_dreamlist_id;

  insert into public.dreamlist_members (dreamlist_id, user_id, role)
  values (v_dreamlist_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_profile_created_create_dreamlist on public.profiles;
create trigger on_profile_created_create_dreamlist
  after insert on public.profiles
  for each row execute procedure public.handle_new_profile_dreamlist();

create or replace function public.is_dreamlist_member(target_dreamlist_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dreamlist_members
    where dreamlist_id = target_dreamlist_id
      and user_id = target_user_id
  );
$$;

create or replace function public.is_dreamlist_owner(target_dreamlist_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dreamlist_members
    where dreamlist_id = target_dreamlist_id
      and user_id = target_user_id
      and role = 'owner'
  );
$$;

create or replace function public.is_trip_member(target_trip_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips
    where id = target_trip_id
      and public.is_dreamlist_member(dreamlist_id, target_user_id)
  );
$$;

create or replace function public.is_trip_creator(target_trip_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips
    where id = target_trip_id
      and (
        created_by_user_id = target_user_id
        or public.is_dreamlist_owner(dreamlist_id, target_user_id)
      )
  );
$$;

alter table public.dreamlists enable row level security;
alter table public.dreamlist_members enable row level security;
alter table public.dreamlist_invites enable row level security;

create policy "dreamlists: members read"
  on public.dreamlists for select
  using (public.is_dreamlist_member(dreamlists.id, auth.uid()));

create policy "dreamlists: owners create"
  on public.dreamlists for insert
  with check (auth.uid() = owner_id);

create policy "dreamlists: owners update"
  on public.dreamlists for update
  using (public.is_dreamlist_owner(dreamlists.id, auth.uid()))
  with check (public.is_dreamlist_owner(dreamlists.id, auth.uid()));

create policy "dreamlist_members: members read"
  on public.dreamlist_members for select
  using (public.is_dreamlist_member(dreamlist_members.dreamlist_id, auth.uid()));

create policy "dreamlist_members: owners manage"
  on public.dreamlist_members for all
  using (public.is_dreamlist_owner(dreamlist_members.dreamlist_id, auth.uid()))
  with check (public.is_dreamlist_owner(dreamlist_members.dreamlist_id, auth.uid()));

create policy "dreamlist_invites: owners manage"
  on public.dreamlist_invites for all
  using (public.is_dreamlist_owner(dreamlist_invites.dreamlist_id, auth.uid()))
  with check (public.is_dreamlist_owner(dreamlist_invites.dreamlist_id, auth.uid()));

drop policy if exists "reels: submitter full access" on public.reel_submissions;
create policy "reels: dreamlist members read"
  on public.reel_submissions for select
  using (public.is_dreamlist_member(reel_submissions.dreamlist_id, auth.uid()));

create policy "reels: dreamlist members insert"
  on public.reel_submissions for insert
  with check (
    auth.uid() = submitted_by_user_id
    and public.is_dreamlist_member(reel_submissions.dreamlist_id, auth.uid())
  );

create policy "reels: dreamlist members update"
  on public.reel_submissions for update
  using (public.is_dreamlist_member(reel_submissions.dreamlist_id, auth.uid()))
  with check (public.is_dreamlist_member(reel_submissions.dreamlist_id, auth.uid()));

create policy "reels: dreamlist members delete"
  on public.reel_submissions for delete
  using (public.is_dreamlist_member(reel_submissions.dreamlist_id, auth.uid()));

drop policy if exists "trips: creator full access" on public.trips;
drop policy if exists "trips: members can read" on public.trips;
create policy "trips: dreamlist members read"
  on public.trips for select
  using (public.is_dreamlist_member(trips.dreamlist_id, auth.uid()));

create policy "trips: dreamlist members insert"
  on public.trips for insert
  with check (public.is_dreamlist_member(trips.dreamlist_id, auth.uid()));

create policy "trips: dreamlist members update"
  on public.trips for update
  using (public.is_dreamlist_member(trips.dreamlist_id, auth.uid()))
  with check (public.is_dreamlist_member(trips.dreamlist_id, auth.uid()));

create policy "trips: dreamlist members delete"
  on public.trips for delete
  using (public.is_dreamlist_member(trips.dreamlist_id, auth.uid()));
