-- ============================================================
-- We Should Go — initial schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable uuid generation (already enabled in Supabase, but safe to repeat)
create extension if not exists "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────

create type public.reel_platform as enum ('instagram', 'tiktok', 'other');
create type public.reel_status   as enum ('inbox', 'saved', 'scheduled', 'rejected');
create type public.place_type    as enum ('cafe', 'hotel', 'restaurant', 'viewpoint', 'experience', 'other');
create type public.trip_status   as enum ('idea', 'planning', 'booked', 'completed');
create type public.anchor_type   as enum ('flight', 'hotel', 'event', 'reservation');

-- ─── profiles ────────────────────────────────────────────────
-- One row per auth.users entry, auto-created via trigger.

create table public.profiles (
  id                 uuid references auth.users on delete cascade primary key,
  email              text,
  display_name       text,
  -- Personal API token used by the iOS Shortcut + Android share target (Phase 1.5)
  personal_api_token text unique not null default encode(gen_random_bytes(32), 'hex'),
  created_at         timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── trips ───────────────────────────────────────────────────
-- Defined before reel_submissions because reels reference trips.
-- Trips can exist without dates (status = 'idea').

create table public.trips (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  -- Structured destination fields mirror reel_submissions so matching is a
  -- clean WHERE clause, not fuzzy string compare.
  destination_city      text,
  destination_country   text,
  destination_region    text,
  start_date            date,
  end_date              date,
  status                public.trip_status not null default 'idea',
  created_by_user_id    uuid references public.profiles(id) on delete cascade not null,
  created_at            timestamptz not null default now()
);

-- ─── reel_submissions ────────────────────────────────────────

create table public.reel_submissions (
  id                    uuid primary key default gen_random_uuid(),
  submitted_by_user_id  uuid references public.profiles(id) on delete cascade not null,
  submitted_by_label    text,
  platform              public.reel_platform not null default 'other',
  url                   text not null,
  caption_text          text,
  notes                 text,
  place_name            text,
  address               text,
  latitude              double precision,
  longitude             double precision,
  destination_city      text,
  destination_country   text,
  destination_region    text,
  place_type            public.place_type,
  tags                  text[] not null default '{}',
  is_favourite          boolean not null default false,
  -- confidence: float 0–1 from Claude; low values flagged "needs review"
  confidence            double precision,
  -- null = global inbox; set when reel is pulled into a trip
  trip_id               uuid references public.trips(id) on delete set null,
  -- inbox / saved / scheduled / rejected — orthogonal to trip_id
  status                public.reel_status not null default 'inbox',
  created_at            timestamptz not null default now()
);

-- ─── trip_members ────────────────────────────────────────────

create table public.trip_members (
  trip_id  uuid references public.trips(id) on delete cascade not null,
  user_id  uuid references public.profiles(id) on delete cascade not null,
  primary key (trip_id, user_id)
);

-- ─── trip_anchors ────────────────────────────────────────────
-- Fixed bookings: flights, hotels, events, reservations.

create table public.trip_anchors (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid references public.trips(id) on delete cascade not null,
  type       public.anchor_type not null,
  title      text not null,
  start_at   timestamptz,
  end_at     timestamptz,
  location   text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ─── trip_days ───────────────────────────────────────────────
-- Only populated for booked trips with confirmed dates.
-- scheduled_items is an ordered array of reel_submission IDs.

create table public.trip_days (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid references public.trips(id) on delete cascade not null,
  date             date not null,
  scheduled_items  uuid[] not null default '{}',
  unique (trip_id, date)
);

-- ─── Row-Level Security ──────────────────────────────────────

alter table public.profiles        enable row level security;
alter table public.trips           enable row level security;
alter table public.reel_submissions enable row level security;
alter table public.trip_members    enable row level security;
alter table public.trip_anchors    enable row level security;
alter table public.trip_days       enable row level security;

-- profiles: own record only
create policy "profiles: own record"
  on public.profiles for all
  using (auth.uid() = id);

-- trips: creator has full access
create policy "trips: creator full access"
  on public.trips for all
  using (auth.uid() = created_by_user_id);

-- trips: members can read (Phase 3 — policy exists now so RLS is correct from day 1)
create policy "trips: members can read"
  on public.trips for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trips.id and user_id = auth.uid()
    )
  );

-- reels: submitter owns their reels
create policy "reels: submitter full access"
  on public.reel_submissions for all
  using (auth.uid() = submitted_by_user_id);

-- trip_members: trip creator manages the list
create policy "trip_members: creator manages"
  on public.trip_members for all
  using (
    exists (
      select 1 from public.trips
      where id = trip_members.trip_id and created_by_user_id = auth.uid()
    )
  );

-- trip_members: members can read the list (to see who else is on the trip)
create policy "trip_members: own membership visible"
  on public.trip_members for select
  using (auth.uid() = user_id);

-- trip_anchors: trip creator full access
create policy "trip_anchors: creator full access"
  on public.trip_anchors for all
  using (
    exists (
      select 1 from public.trips
      where id = trip_anchors.trip_id and created_by_user_id = auth.uid()
    )
  );

-- trip_anchors: trip members can read
create policy "trip_anchors: members read"
  on public.trip_anchors for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trip_anchors.trip_id and user_id = auth.uid()
    )
  );

-- trip_days: trip creator full access
create policy "trip_days: creator full access"
  on public.trip_days for all
  using (
    exists (
      select 1 from public.trips
      where id = trip_days.trip_id and created_by_user_id = auth.uid()
    )
  );

-- trip_days: trip members can read
create policy "trip_days: members read"
  on public.trip_days for select
  using (
    exists (
      select 1 from public.trip_members
      where trip_id = trip_days.trip_id and user_id = auth.uid()
    )
  );
