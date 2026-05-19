-- Avoid recursive RLS checks between trips and trip_members.
-- Policies use security-definer helpers for cross-table ownership checks.

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
      and created_by_user_id = target_user_id
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
    from public.trip_members
    where trip_id = target_trip_id
      and user_id = target_user_id
  );
$$;

drop policy if exists "trips: creator full access" on public.trips;
create policy "trips: creator full access"
  on public.trips for all
  using (auth.uid() = created_by_user_id)
  with check (auth.uid() = created_by_user_id);

drop policy if exists "trips: members can read" on public.trips;
create policy "trips: members can read"
  on public.trips for select
  using (public.is_trip_member(trips.id, auth.uid()));

drop policy if exists "trip_members: creator manages" on public.trip_members;
create policy "trip_members: creator manages"
  on public.trip_members for all
  using (public.is_trip_creator(trip_members.trip_id, auth.uid()))
  with check (public.is_trip_creator(trip_members.trip_id, auth.uid()));

drop policy if exists "trip_anchors: creator full access" on public.trip_anchors;
create policy "trip_anchors: creator full access"
  on public.trip_anchors for all
  using (public.is_trip_creator(trip_anchors.trip_id, auth.uid()))
  with check (public.is_trip_creator(trip_anchors.trip_id, auth.uid()));

drop policy if exists "trip_anchors: members read" on public.trip_anchors;
create policy "trip_anchors: members read"
  on public.trip_anchors for select
  using (public.is_trip_member(trip_anchors.trip_id, auth.uid()));

drop policy if exists "trip_days: creator full access" on public.trip_days;
create policy "trip_days: creator full access"
  on public.trip_days for all
  using (public.is_trip_creator(trip_days.trip_id, auth.uid()))
  with check (public.is_trip_creator(trip_days.trip_id, auth.uid()));

drop policy if exists "trip_days: members read" on public.trip_days;
create policy "trip_days: members read"
  on public.trip_days for select
  using (public.is_trip_member(trip_days.trip_id, auth.uid()));
