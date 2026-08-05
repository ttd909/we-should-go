-- ============================================================
-- Public, read-only itinerary snapshots
--
-- The planner remains private. Publishing copies a deliberately limited
-- snapshot that changes only when a trip member publishes again. Public
-- readers must know the unguessable share code and cannot list snapshots.
-- ============================================================

create table public.published_itineraries (
  id                     uuid primary key default gen_random_uuid(),
  trip_id                uuid references public.trips(id) on delete cascade not null unique,
  share_slug             text not null unique default encode(gen_random_bytes(16), 'hex'),
  snapshot               jsonb not null,
  source_version         integer not null,
  published_by_user_id   uuid references public.profiles(id) on delete set null,
  published_at           timestamptz not null default now(),
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint published_itineraries_slug_format
    check (share_slug ~ '^[a-f0-9]{32}$'),
  constraint published_itineraries_source_version
    check (source_version >= 0),
  constraint published_itineraries_snapshot_object
    check (jsonb_typeof(snapshot) = 'object')
);

create index published_itineraries_active_slug_idx
  on public.published_itineraries (share_slug)
  where is_active;

alter table public.published_itineraries enable row level security;

-- Signed-in trip members can see publication status in the private planner.
-- Anonymous readers deliberately have no table policy; they use the exact-code
-- RPC below, which prevents REST enumeration of all published trips.
create policy "published itineraries: trip members read status"
  on public.published_itineraries for select
  to authenticated
  using (public.is_trip_member(trip_id, auth.uid()));

revoke all on table public.published_itineraries from anon;
grant select on table public.published_itineraries to authenticated;

create or replace function public.sanitise_public_itinerary_notes(
  p_notes text,
  p_confirmation_ref text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_notes is null then null
    else regexp_replace(
      case
        when p_confirmation_ref is not null and char_length(btrim(p_confirmation_ref)) >= 4
          then replace(p_notes, p_confirmation_ref, '[booking reference hidden]')
        else p_notes
      end,
      '(booking|confirmation|reservation|reference|ref|pin)([[:space:]]*(number|no\.?|code)?[[:space:]]*[:#-]?[[:space:]]*)[A-Z0-9-]{5,}',
      '\1\2[hidden]',
      'gi'
    )
  end;
$$;

revoke all on function public.sanitise_public_itinerary_notes(text, text) from public;

create or replace function public.publish_itinerary_snapshot(p_trip_id uuid)
returns table (share_slug text, published_at timestamptz, source_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip public.trips%rowtype;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if not public.is_trip_member(p_trip_id, v_user_id) then
    raise exception 'Forbidden';
  end if;

  select * into v_trip
  from public.trips
  where id = p_trip_id;

  if v_trip.id is null then
    raise exception 'Trip not found';
  end if;

  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'trip', jsonb_build_object(
      'name', v_trip.name,
      'destination_city', v_trip.destination_city,
      'destination_country', v_trip.destination_country,
      'destination_region', v_trip.destination_region,
      'start_date', v_trip.start_date,
      'end_date', v_trip.end_date
    ),
    'blocks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'day_date', block.day_date,
          'start_time', case when block.start_time is null then null else to_char(block.start_time, 'HH24:MI') end,
          'duration_min', block.duration_min,
          'sort_order', block.sort_order,
          'time_source', block.time_source,
          'title', block.title,
          'type', block.type,
          'notes', public.sanitise_public_itinerary_notes(block.notes, block.confirmation_ref),
          'is_locked', block.is_locked,
          'timezone', block.timezone,
          'end_date', block.end_date,
          'end_time', case when block.end_time is null then null else to_char(block.end_time, 'HH24:MI') end,
          'end_timezone', block.end_timezone,
          'address', block.address,
          'latitude', block.latitude,
          'longitude', block.longitude
        )
        order by block.day_date, block.start_time nulls last, block.sort_order, block.created_at
      )
      from public.itinerary_blocks block
      where block.trip_id = p_trip_id
    ), '[]'::jsonb)
  );

  insert into public.published_itineraries (
    trip_id, snapshot, source_version, published_by_user_id, published_at, is_active
  ) values (
    p_trip_id, v_snapshot, v_trip.version, v_user_id, now(), true
  )
  on conflict (trip_id) do update set
    snapshot = excluded.snapshot,
    source_version = excluded.source_version,
    published_by_user_id = excluded.published_by_user_id,
    published_at = excluded.published_at,
    is_active = true,
    updated_at = now();

  return query
  select publication.share_slug, publication.published_at, publication.source_version
  from public.published_itineraries publication
  where publication.trip_id = p_trip_id;
end;
$$;

revoke all on function public.publish_itinerary_snapshot(uuid) from public, anon;
grant execute on function public.publish_itinerary_snapshot(uuid) to authenticated;

create or replace function public.unpublish_itinerary_snapshot(p_trip_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not public.is_trip_member(p_trip_id, v_user_id) then
    raise exception 'Forbidden';
  end if;

  update public.published_itineraries
  set is_active = false, updated_at = now()
  where trip_id = p_trip_id and is_active;

  return found;
end;
$$;

revoke all on function public.unpublish_itinerary_snapshot(uuid) from public, anon;
grant execute on function public.unpublish_itinerary_snapshot(uuid) to authenticated;

create or replace function public.get_public_itinerary_snapshot(p_share_slug text)
returns table (snapshot jsonb, published_at timestamptz, source_version integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_share_slug is null or p_share_slug !~ '^[a-f0-9]{32}$' then
    return;
  end if;

  return query
  select publication.snapshot, publication.published_at, publication.source_version
  from public.published_itineraries publication
  where publication.share_slug = p_share_slug
    and publication.is_active;
end;
$$;

revoke all on function public.get_public_itinerary_snapshot(text) from public;
grant execute on function public.get_public_itinerary_snapshot(text) to anon, authenticated;
