-- ============================================================
-- Phase 1 — reliable itinerary foundation
-- Additive only: legacy Trip tables and columns remain untouched.
-- ============================================================

create type public.itinerary_block_type as enum (
  'place', 'meal', 'transit', 'flight', 'hotel', 'event', 'note'
);

create type public.itinerary_time_source as enum ('pinned', 'estimated');
create type public.itinerary_edit_status as enum (
  'pending', 'applied', 'rejected', 'undone'
);

alter table public.trips
  add column if not exists version integer not null default 0,
  add column if not exists travel_preferences jsonb not null default '{}'::jsonb;

alter table public.dreamlists
  add column if not exists travel_preferences jsonb not null default '{}'::jsonb;

create table public.itinerary_blocks (
  id                     uuid primary key default gen_random_uuid(),
  trip_id                uuid references public.trips(id) on delete cascade not null,
  day_date               date not null,
  start_time             time,
  duration_min           integer,
  sort_order             integer not null default 0,
  time_source            public.itinerary_time_source not null default 'estimated',
  title                  text not null,
  type                   public.itinerary_block_type not null default 'place',
  notes                  text,
  is_locked              boolean not null default false,
  confirmation_ref       text,
  confidence             double precision,
  timezone               text,
  end_date               date,
  end_time               time,
  end_timezone           text,
  reel_submission_id     uuid references public.reel_submissions(id) on delete set null,
  google_place_id        text,
  opening_hours          jsonb,
  address                text,
  latitude               double precision,
  longitude              double precision,
  created_by_user_id     uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint itinerary_blocks_title_length
    check (char_length(btrim(title)) between 1 and 240),
  constraint itinerary_blocks_duration_positive
    check (duration_min is null or duration_min between 1 and 10080),
  constraint itinerary_blocks_confidence_range
    check (confidence is null or confidence between 0 and 1),
  constraint itinerary_blocks_end_date_order
    check (end_date is null or end_date >= day_date)
);

create index itinerary_blocks_trip_day_idx
  on public.itinerary_blocks (trip_id, day_date, start_time, sort_order);

create index itinerary_blocks_idea_idx
  on public.itinerary_blocks (reel_submission_id)
  where reel_submission_id is not null;

create table public.trip_chat_messages (
  id                     uuid primary key default gen_random_uuid(),
  trip_id                uuid references public.trips(id) on delete cascade not null,
  role                   text not null check (role in ('user', 'assistant')),
  content                text,
  image_path             text,
  error_message          text,
  reply_to_message_id    uuid references public.trip_chat_messages(id) on delete set null,
  client_request_id      uuid,
  created_by_user_id     uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),

  constraint trip_chat_messages_has_content
    check (content is not null or image_path is not null or error_message is not null)
);

create unique index trip_chat_messages_request_idx
  on public.trip_chat_messages (trip_id, client_request_id)
  where client_request_id is not null;

create index trip_chat_messages_trip_created_idx
  on public.trip_chat_messages (trip_id, created_at desc);

create table public.itinerary_edit_sets (
  id                     uuid primary key default gen_random_uuid(),
  trip_id                uuid references public.trips(id) on delete cascade not null,
  source_message_id      uuid references public.trip_chat_messages(id) on delete set null,
  client_request_id      uuid not null,
  expected_version       integer not null,
  status                 public.itinerary_edit_status not null default 'pending',
  summary                text,
  patches                jsonb not null default '[]'::jsonb,
  inverse_patches        jsonb not null default '[]'::jsonb,
  hard_conflicts         jsonb not null default '[]'::jsonb,
  warnings               jsonb not null default '[]'::jsonb,
  warning_overrides      jsonb not null default '[]'::jsonb,
  undoes_edit_id         uuid references public.itinerary_edit_sets(id) on delete set null,
  created_by_user_id     uuid references public.profiles(id) on delete set null,
  applied_at             timestamptz,
  undone_at              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint itinerary_edit_sets_expected_version
    check (expected_version >= 0),
  constraint itinerary_edit_sets_patch_arrays
    check (
      jsonb_typeof(patches) = 'array'
      and jsonb_typeof(inverse_patches) = 'array'
      and jsonb_typeof(hard_conflicts) = 'array'
      and jsonb_typeof(warnings) = 'array'
      and jsonb_typeof(warning_overrides) = 'array'
    ),
  unique (trip_id, client_request_id)
);

create index itinerary_edit_sets_trip_status_idx
  on public.itinerary_edit_sets (trip_id, status, created_at desc);

create table public.itinerary_rate_events (
  id                     bigint generated always as identity primary key,
  user_id                uuid references public.profiles(id) on delete cascade not null,
  trip_id                uuid references public.trips(id) on delete cascade not null,
  created_at             timestamptz not null default now()
);

create index itinerary_rate_events_user_trip_created_idx
  on public.itinerary_rate_events (user_id, trip_id, created_at desc);

create table public.itinerary_ai_usage (
  id                     bigint generated always as identity primary key,
  user_id                uuid references public.profiles(id) on delete cascade not null,
  trip_id                uuid references public.trips(id) on delete cascade not null,
  request_id             uuid not null,
  model                  text not null,
  input_tokens           integer not null default 0,
  output_tokens          integer not null default 0,
  estimated_cost_usd     numeric(12, 6),
  latency_ms             integer not null,
  outcome                text not null check (outcome in ('applied', 'pending', 'rejected', 'error')),
  created_at             timestamptz not null default now(),
  unique (trip_id, request_id)
);

create index itinerary_ai_usage_trip_created_idx
  on public.itinerary_ai_usage (trip_id, created_at desc);

create or replace function public.set_itinerary_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger itinerary_blocks_set_updated_at
  before update on public.itinerary_blocks
  for each row execute procedure public.set_itinerary_updated_at();

create trigger itinerary_edit_sets_set_updated_at
  before update on public.itinerary_edit_sets
  for each row execute procedure public.set_itinerary_updated_at();

alter table public.itinerary_blocks enable row level security;
alter table public.trip_chat_messages enable row level security;
alter table public.itinerary_edit_sets enable row level security;
alter table public.itinerary_rate_events enable row level security;
alter table public.itinerary_ai_usage enable row level security;

create policy "itinerary_blocks: trip members read"
  on public.itinerary_blocks for select
  using (public.is_trip_member(trip_id, auth.uid()));

create policy "trip_chat_messages: trip members read"
  on public.trip_chat_messages for select
  using (public.is_trip_member(trip_id, auth.uid()));

create policy "trip_chat_messages: members insert own"
  on public.trip_chat_messages for insert
  with check (
    created_by_user_id = auth.uid()
    and public.is_trip_member(trip_id, auth.uid())
  );

create policy "itinerary_edit_sets: trip members read"
  on public.itinerary_edit_sets for select
  using (public.is_trip_member(trip_id, auth.uid()));

create policy "itinerary_edit_sets: members insert own"
  on public.itinerary_edit_sets for insert
  with check (
    created_by_user_id = auth.uid()
    and public.is_trip_member(trip_id, auth.uid())
  );

create policy "itinerary_edit_sets: creators update pending"
  on public.itinerary_edit_sets for update
  using (
    created_by_user_id = auth.uid()
    and status = 'pending'
    and public.is_trip_member(trip_id, auth.uid())
  )
  with check (created_by_user_id = auth.uid());

create policy "itinerary_ai_usage: members read own"
  on public.itinerary_ai_usage for select
  using (user_id = auth.uid() and public.is_trip_member(trip_id, auth.uid()));

create policy "itinerary_ai_usage: members insert own"
  on public.itinerary_ai_usage for insert
  with check (user_id = auth.uid() and public.is_trip_member(trip_id, auth.uid()));

create or replace function public.consume_itinerary_rate_limit(
  p_trip_id uuid,
  p_minute_limit integer,
  p_day_limit integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_retry integer;
begin
  if v_user_id is null or p_minute_limit < 1 or p_day_limit < 1 then
    raise exception 'Invalid itinerary rate-limit request';
  end if;
  if not public.is_trip_member(p_trip_id, v_user_id) then
    raise exception 'Forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || p_trip_id::text, 0));
  delete from public.itinerary_rate_events
  where user_id = v_user_id and created_at < now() - interval '1 day';

  select count(*)::integer into v_count from public.itinerary_rate_events
  where user_id = v_user_id and trip_id = p_trip_id and created_at >= now() - interval '1 day';
  if v_count >= p_day_limit then
    select greatest(1, ceil(extract(epoch from (min(created_at) + interval '1 day' - now())))::integer)
    into v_retry from public.itinerary_rate_events
    where user_id = v_user_id and trip_id = p_trip_id and created_at >= now() - interval '1 day';
    return query select false, v_retry;
    return;
  end if;

  select count(*)::integer into v_count from public.itinerary_rate_events
  where user_id = v_user_id and trip_id = p_trip_id and created_at >= now() - interval '1 minute';
  if v_count >= p_minute_limit then
    select greatest(1, ceil(extract(epoch from (min(created_at) + interval '1 minute' - now())))::integer)
    into v_retry from public.itinerary_rate_events
    where user_id = v_user_id and trip_id = p_trip_id and created_at >= now() - interval '1 minute';
    return query select false, v_retry;
    return;
  end if;

  insert into public.itinerary_rate_events (user_id, trip_id) values (v_user_id, p_trip_id);
  return query select true, 0;
end;
$$;

revoke all on function public.consume_itinerary_rate_limit(uuid, integer, integer)
  from public, anon;
grant execute on function public.consume_itinerary_rate_limit(uuid, integer, integer)
  to authenticated;

-- Apply an already validated edit as one transaction. The function accepts a
-- complete trusted Block set produced by server-side domain code. It does not
-- accept trip_id or ownership fields from the client/model for individual rows.
create or replace function public.apply_itinerary_edit(
  p_trip_id uuid,
  p_expected_version integer,
  p_client_request_id uuid,
  p_summary text,
  p_patches jsonb,
  p_inverse_patches jsonb,
  p_removed_ids uuid[],
  p_blocks jsonb,
  p_warning_overrides jsonb default '[]'::jsonb,
  p_source_message_id uuid default null,
  p_undoes_edit_id uuid default null
)
returns table (edit_id uuid, trip_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_version integer;
  v_existing_id uuid;
  v_existing_status public.itinerary_edit_status;
  v_edit_id uuid;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if not public.is_trip_member(p_trip_id, v_user_id) then
    raise exception 'Forbidden';
  end if;

  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_patches, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_inverse_patches, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_warning_overrides, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid itinerary edit payload';
  end if;

  select version
  into v_current_version
  from public.trips
  where id = p_trip_id
  for update;

  if v_current_version is null then
    raise exception 'Trip not found';
  end if;

  select id, status
  into v_existing_id, v_existing_status
  from public.itinerary_edit_sets
  where trip_id = p_trip_id
    and client_request_id = p_client_request_id;

  if v_existing_id is not null and v_existing_status in ('applied', 'undone') then
    return query select v_existing_id, v_current_version;
    return;
  end if;

  if v_current_version <> p_expected_version then
    raise exception 'stale_trip_version';
  end if;

  if exists (
    select 1
    from public.itinerary_blocks existing
    join jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) incoming
      on existing.id = (incoming ->> 'id')::uuid
    where existing.trip_id <> p_trip_id
  ) then
    raise exception 'Block belongs to another Trip';
  end if;

  delete from public.itinerary_blocks
  where trip_id = p_trip_id
    and id = any(coalesce(p_removed_ids, '{}'::uuid[]));

  insert into public.itinerary_blocks (
    id, trip_id, day_date, start_time, duration_min, sort_order, time_source,
    title, type, notes, is_locked, confirmation_ref, confidence, timezone,
    end_date, end_time, end_timezone, reel_submission_id, google_place_id,
    opening_hours, address, latitude, longitude, created_by_user_id
  )
  select
    row_data.id,
    p_trip_id,
    row_data.day_date,
    row_data.start_time,
    row_data.duration_min,
    coalesce(row_data.sort_order, 0),
    coalesce(row_data.time_source, 'estimated'::public.itinerary_time_source),
    row_data.title,
    coalesce(row_data.type, 'place'::public.itinerary_block_type),
    row_data.notes,
    coalesce(row_data.is_locked, false),
    row_data.confirmation_ref,
    row_data.confidence,
    row_data.timezone,
    row_data.end_date,
    row_data.end_time,
    row_data.end_timezone,
    row_data.reel_submission_id,
    row_data.google_place_id,
    row_data.opening_hours,
    row_data.address,
    row_data.latitude,
    row_data.longitude,
    v_user_id
  from jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb)) as row_data(
    id uuid,
    day_date date,
    start_time time,
    duration_min integer,
    sort_order integer,
    time_source public.itinerary_time_source,
    title text,
    type public.itinerary_block_type,
    notes text,
    is_locked boolean,
    confirmation_ref text,
    confidence double precision,
    timezone text,
    end_date date,
    end_time time,
    end_timezone text,
    reel_submission_id uuid,
    google_place_id text,
    opening_hours jsonb,
    address text,
    latitude double precision,
    longitude double precision
  )
  on conflict (id) do update set
    day_date = excluded.day_date,
    start_time = excluded.start_time,
    duration_min = excluded.duration_min,
    sort_order = excluded.sort_order,
    time_source = excluded.time_source,
    title = excluded.title,
    type = excluded.type,
    notes = excluded.notes,
    is_locked = excluded.is_locked,
    confirmation_ref = excluded.confirmation_ref,
    confidence = excluded.confidence,
    timezone = excluded.timezone,
    end_date = excluded.end_date,
    end_time = excluded.end_time,
    end_timezone = excluded.end_timezone,
    reel_submission_id = excluded.reel_submission_id,
    google_place_id = excluded.google_place_id,
    opening_hours = excluded.opening_hours,
    address = excluded.address,
    latitude = excluded.latitude,
    longitude = excluded.longitude;

  update public.reel_submissions idea
  set status = 'scheduled', updated_at = now()
  where idea.status <> 'rejected'
    and exists (
      select 1
      from public.itinerary_blocks block
      where block.reel_submission_id = idea.id
    );

  update public.reel_submissions idea
  set status = 'saved', updated_at = now()
  where idea.status = 'scheduled'
    and not exists (
      select 1
      from public.itinerary_blocks block
      where block.reel_submission_id = idea.id
    );

  insert into public.itinerary_edit_sets (
    trip_id, source_message_id, client_request_id, expected_version, status,
    summary, patches, inverse_patches, warning_overrides, undoes_edit_id,
    created_by_user_id, applied_at
  ) values (
    p_trip_id,
    p_source_message_id,
    p_client_request_id,
    p_expected_version,
    'applied',
    p_summary,
    coalesce(p_patches, '[]'::jsonb),
    coalesce(p_inverse_patches, '[]'::jsonb),
    coalesce(p_warning_overrides, '[]'::jsonb),
    p_undoes_edit_id,
    v_user_id,
    now()
  )
  on conflict (trip_id, client_request_id) do update set
    status = 'applied',
    summary = excluded.summary,
    patches = excluded.patches,
    inverse_patches = excluded.inverse_patches,
    warning_overrides = excluded.warning_overrides,
    undoes_edit_id = excluded.undoes_edit_id,
    applied_at = now()
  returning id into v_edit_id;

  if p_undoes_edit_id is not null then
    update public.itinerary_edit_sets
    set status = 'undone', undone_at = now()
    where id = p_undoes_edit_id
      and trip_id = p_trip_id
      and status = 'applied';

    if not found then
      raise exception 'Edit cannot be undone';
    end if;
  end if;

  if p_source_message_id is not null and p_summary is not null then
    insert into public.trip_chat_messages (
      trip_id, role, content, reply_to_message_id, created_by_user_id
    ) values (
      p_trip_id, 'assistant', p_summary, p_source_message_id, v_user_id
    );
  end if;

  update public.trips
  set version = version + 1, updated_at = now()
  where id = p_trip_id;

  return query select v_edit_id, v_current_version + 1;
end;
$$;

revoke all on function public.apply_itinerary_edit(
  uuid, integer, uuid, text, jsonb, jsonb, uuid[], jsonb, jsonb, uuid, uuid
) from public;

grant execute on function public.apply_itinerary_edit(
  uuid, integer, uuid, text, jsonb, jsonb, uuid[], jsonb, jsonb, uuid, uuid
) to authenticated;
