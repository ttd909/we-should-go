# Conversational Itinerary Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a chat-driven itinerary to Trips, where typing an instruction or uploading a photo produces surgical patch edits that are validated for clashes before anything is written.

**Architecture:** Claude returns structured patch operations, never a regenerated itinerary. Patches apply to an in-memory copy first; a deterministic TypeScript validator checks the result for overlaps, travel-time impossibilities and closed venues. Clean results commit in one transaction with an inverse patch stored for Undo. Any clash discards the in-memory copy and returns numbered options instead.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS + Storage), `@anthropic-ai/sdk` with `claude-opus-5`, Vitest, Tailwind 4, `@base-ui/react`.

**Spec:** `docs/superpowers/specs/2026-08-04-itinerary-builder-design.md`

---

## Context for the engineer

You are working in **We Should Go**, a private travel app for one family. Read `docs/PROJECT_CONTEXT.md` before starting.

**Product vocabulary — this matters in all visible UI:**
- **Dreamlist** — the shared or personal container. Access control hangs off membership of one.
- **Idea** — a saved place. The database table is `reel_submissions`; never show that word to a user.
- **Trip** — belongs to a Dreamlist.
- **Block** — new in this feature. One entry on a Trip day.
- Never use "reel", "inbox", "board", or "workspace" in visible UI.

**This is Next.js 16, which differs from older versions you may know.** `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing code. Two differences that bite in this plan:
- `refresh()` from `next/cache` refreshes the client router after a mutation. It does *not* revalidate tagged data.
- Route handler params are async: `ctx.params` is a Promise, typed via the global `RouteContext<'/path/[id]'>` helper.

**Existing patterns to follow:**
- Server actions live in `src/lib/actions/*.ts`, start with `'use server'`, call `createClient()` from `@/lib/supabase/server`, check `auth.getUser()` and throw `'Unauthorized'`, then `revalidatePath()`. See `src/lib/actions/reels.ts`.
- Server actions are reachable by direct POST, so **every** one must check auth itself.
- Types live in `src/lib/types.ts`.

**Time handling — the rule that prevents a whole class of bug:** all times in this feature are **local wall-clock at the destination**. A `date` column plus a bare `time` column. Never `timestamptz`, never `new Date()` arithmetic on block times, never a timezone conversion. 19:30 in Osaka is the string `'19:30'`. All time maths goes through the helpers in Task 3, which work in integer minutes.

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Test runner config with the `@/` alias |
| `supabase/migrations/010_itinerary_blocks.sql` | New tables, drops, RLS |
| `src/lib/types.ts` | *(modify)* Add `ItineraryBlock`, `TripChatMessage` |
| `src/lib/itinerary/time.ts` | Pure minute/`HH:MM` conversion, block end times |
| `src/lib/itinerary/travel.ts` | Haversine distance, travel-time estimate |
| `src/lib/itinerary/hours.ts` | Opening-hours check |
| `src/lib/itinerary/validate.ts` | Clash detection — the heart of the feature |
| `src/lib/itinerary/patch.ts` | Patch types, apply-to-array, inverse generation |
| `src/lib/itinerary/resolutions.ts` | Fixed clash resolution options |
| `src/lib/itinerary/prompt.ts` | System prompt + structured output schema |
| `src/lib/itinerary/resolve-place.ts` | Google Places lookup for coordinates and opening hours |
| `src/lib/actions/itinerary.ts` | `sendChatMessage`, `undoChatMessage` server actions |
| `src/app/trips/[id]/page.tsx` | Trip detail — server component, loads blocks + chat |
| `src/components/itinerary/timeline.tsx` | Day-grouped block list |
| `src/components/itinerary/block-row.tsx` | One block; renders estimated times lighter |
| `src/components/itinerary/chat-panel.tsx` | Chat, clash cards, Undo |

Each `src/lib/itinerary/*.ts` file except `prompt.ts` is pure — no Supabase, no network, no `Date.now()`. That is what makes them testable and what makes the validator trustworthy.

---

## Task 1: Test infrastructure

There is currently no test runner in this project. The validator has too many edge cases to build without one.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Create the config**

Create `vitest.config.ts`. The alias mirrors the `@/*` path in `tsconfig.json` so tests import the same way source does.

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

- [ ] **Step 3: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify the runner starts**

Run: `npm test`
Expected: exits cleanly reporting "No test files found" — that is success at this stage.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Migration and types

**Files:**
- Create: `supabase/migrations/010_itinerary_blocks.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Confirm the drop targets are empty**

Run these in the Supabase SQL Editor. The dashboard's row estimates read `pg_class.reltuples` and show `0` for a never-analysed table, so check real counts:

```sql
select count(*) from trip_anchors;
select count(*) from trip_members;
select count(*) from trip_days where cardinality(scheduled_items) > 0;
```

Expected: all `0`. **If any is non-zero, stop and raise it** — the migration drops that data.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/010_itinerary_blocks.sql`:

```sql
-- ============================================================
-- Phase 3 — Itinerary blocks
-- Replaces trip_anchors and trip_days.scheduled_items with one
-- unified block table. Times are local wall-clock at the
-- destination: a date column plus a bare time column, never
-- timestamptz.
-- ============================================================

create type public.block_type as enum (
  'place', 'meal', 'transit', 'flight', 'hotel', 'event', 'note'
);
create type public.time_source as enum ('pinned', 'estimated');

create table public.itinerary_blocks (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid references public.trips(id) on delete cascade not null,

  day_date            date not null,
  start_time          time,
  duration_min        integer,
  time_source         public.time_source not null default 'estimated',
  sort_order          integer not null default 0,

  title               text not null,
  type                public.block_type not null default 'place',
  notes               text,

  is_locked           boolean not null default false,
  confirmation_ref    text,

  reel_submission_id  uuid references public.reel_submissions(id) on delete set null,
  google_place_id     text,
  opening_hours       jsonb,
  address             text,
  latitude            double precision,
  longitude           double precision,
  confidence          double precision,

  created_by_user_id  uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index itinerary_blocks_trip_day_idx
  on public.itinerary_blocks (trip_id, day_date, start_time, sort_order);

create index itinerary_blocks_reel_idx
  on public.itinerary_blocks (reel_submission_id)
  where reel_submission_id is not null;

-- Optimistic concurrency: two people editing one Trip.
alter table public.trips
  add column if not exists version integer not null default 0;

create table public.trip_chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  trip_id            uuid references public.trips(id) on delete cascade not null,
  role               text not null check (role in ('user', 'assistant')),
  content            text,
  image_url          text,
  patches            jsonb,
  inverse_patches    jsonb,
  applied_at         timestamptz,
  undone_at          timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index trip_chat_messages_trip_idx
  on public.trip_chat_messages (trip_id, created_at desc);

-- RLS reuses the helpers defined in 008. No new policy logic.
alter table public.itinerary_blocks   enable row level security;
alter table public.trip_chat_messages enable row level security;

create policy "itinerary_blocks: trip members full access"
  on public.itinerary_blocks for all
  using (public.is_trip_member(trip_id, auth.uid()))
  with check (public.is_trip_member(trip_id, auth.uid()));

create policy "trip_chat_messages: trip members full access"
  on public.trip_chat_messages for all
  using (public.is_trip_member(trip_id, auth.uid()))
  with check (public.is_trip_member(trip_id, auth.uid()));

-- Removals. trip_anchors is absorbed into itinerary_blocks as locked
-- blocks with a confirmation_ref. trip_members is vestigial: since 008,
-- is_trip_member() checks Dreamlist membership and never reads it.
drop table if exists public.trip_anchors;
drop table if exists public.trip_members;
drop type  if exists public.anchor_type;

alter table public.trip_days drop column if exists scheduled_items;
```

- [ ] **Step 3: Run against a Supabase branch first**

Create a branch in the Supabase dashboard, run the migration there, confirm no errors, then run against production. This migration is destructive and there is no undo.

- [ ] **Step 4: Add the types**

Append to `src/lib/types.ts`:

```ts
export type BlockType = 'place' | 'meal' | 'transit' | 'flight' | 'hotel' | 'event' | 'note'
export type TimeSource = 'pinned' | 'estimated'

/** Normalised opening hours. day: 0 = Sunday .. 6 = Saturday. Times are 'HH:MM' local. */
export interface OpeningHours {
  periods: { day: number; open: string; close: string }[]
}

export interface ItineraryBlock {
  id: string
  trip_id: string
  /** 'YYYY-MM-DD'. Authoritative: a 00:30 nightcap belongs to the previous day. */
  day_date: string
  /** 'HH:MM' local wall-clock, or null when unscheduled. */
  start_time: string | null
  duration_min: number | null
  time_source: TimeSource
  sort_order: number
  title: string
  type: BlockType
  notes: string | null
  is_locked: boolean
  confirmation_ref: string | null
  reel_submission_id: string | null
  google_place_id: string | null
  opening_hours: OpeningHours | null
  address: string | null
  latitude: number | null
  longitude: number | null
  confidence: number | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
}

export interface TripChatMessage {
  id: string
  trip_id: string
  role: 'user' | 'assistant'
  content: string | null
  image_url: string | null
  patches: unknown | null
  inverse_patches: unknown | null
  applied_at: string | null
  undone_at: string | null
  created_by_user_id: string | null
  created_at: string
}
```

Also update the existing `Trip` interface in the same file — add `version: number`. Delete the `TripMember` and `TripAnchor` interfaces and the `AnchorType` type; their tables no longer exist.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. If `TripAnchor` or `TripMember` were imported anywhere, the compiler names the file — remove those imports.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_itinerary_blocks.sql src/lib/types.ts
git commit -m "feat: add itinerary_blocks schema and types"
```

---

## Task 3: Time helpers

Every time calculation in this feature goes through these. Working in integer minutes avoids `Date` and timezone bugs entirely.

**Files:**
- Create: `src/lib/itinerary/time.ts`
- Test: `src/lib/itinerary/time.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/itinerary/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toMinutes, toTimeString, blockEnd, addMinutes } from '@/lib/itinerary/time'
import type { ItineraryBlock } from '@/lib/types'

function block(partial: Partial<ItineraryBlock>): ItineraryBlock {
  return {
    id: 'b1', trip_id: 't1', day_date: '2026-03-12', start_time: null,
    duration_min: null, time_source: 'estimated', sort_order: 0,
    title: 'Test', type: 'place', notes: null, is_locked: false,
    confirmation_ref: null, reel_submission_id: null, google_place_id: null,
    opening_hours: null, address: null, latitude: null, longitude: null,
    confidence: null, created_by_user_id: null,
    created_at: '', updated_at: '', ...partial,
  }
}

describe('toMinutes', () => {
  it('converts HH:MM to minutes since midnight', () => {
    expect(toMinutes('00:00')).toBe(0)
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes('23:59')).toBe(1439)
  })

  it('tolerates a seconds component, which Postgres time columns return', () => {
    expect(toMinutes('09:30:00')).toBe(570)
  })
})

describe('toTimeString', () => {
  it('converts minutes back to zero-padded HH:MM', () => {
    expect(toTimeString(0)).toBe('00:00')
    expect(toTimeString(570)).toBe('09:30')
    expect(toTimeString(1439)).toBe('23:59')
  })
})

describe('addMinutes', () => {
  it('adds minutes to a time string', () => {
    expect(addMinutes('19:30', 60)).toBe('20:30')
  })

  it('returns times past midnight as over-24h values so overflow is detectable', () => {
    expect(addMinutes('23:30', 60)).toBe('24:30')
  })
})

describe('blockEnd', () => {
  it('returns start plus duration in minutes', () => {
    expect(blockEnd(block({ start_time: '19:30', duration_min: 120 }))).toBe(1290)
  })

  it('treats a missing duration as a 60 minute default', () => {
    expect(blockEnd(block({ start_time: '19:30', duration_min: null }))).toBe(1230)
  })

  it('returns null for an unscheduled block', () => {
    expect(blockEnd(block({ start_time: null }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- time`
Expected: FAIL — cannot resolve `@/lib/itinerary/time`.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/time.ts`:

```ts
import type { ItineraryBlock } from '@/lib/types'

/** Blocks with no stated duration are assumed to take an hour. */
export const DEFAULT_DURATION_MIN = 60

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

/**
 * Minutes since midnight → 'HH:MM'. Values over 1440 are kept rather than
 * wrapped, so the validator can see that a block ran past midnight.
 */
export function toTimeString(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function addMinutes(time: string, delta: number): string {
  return toTimeString(toMinutes(time) + delta)
}

/** End of a block in minutes since midnight, or null if unscheduled. */
export function blockEnd(block: ItineraryBlock): number | null {
  if (block.start_time === null) return null
  return toMinutes(block.start_time) + (block.duration_min ?? DEFAULT_DURATION_MIN)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- time`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/time.ts src/lib/itinerary/time.test.ts
git commit -m "feat: add itinerary time helpers"
```

---

## Task 4: Travel time estimate

Deliberately crude. `docs/PROJECT_CONTEXT.md` lists "no complex route optimisation" under Do Not Build Yet. This only needs to catch "that's on the other side of the city", not produce accurate ETAs.

**Files:**
- Create: `src/lib/itinerary/travel.ts`
- Test: `src/lib/itinerary/travel.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/itinerary/travel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { haversineKm, estimateTravelMin } from '@/lib/itinerary/travel'

const osakaCastle = { latitude: 34.6873, longitude: 135.5259 }
const kuromonMarket = { latitude: 34.6653, longitude: 135.5061 }
const tokyoStation = { latitude: 35.6812, longitude: 139.7671 }

describe('haversineKm', () => {
  it('measures a short intra-city hop', () => {
    const km = haversineKm(osakaCastle, kuromonMarket)
    expect(km).toBeGreaterThan(2.5)
    expect(km).toBeLessThan(3.5)
  })

  it('measures a long intercity distance', () => {
    const km = haversineKm(osakaCastle, tokyoStation)
    expect(km).toBeGreaterThan(390)
    expect(km).toBeLessThan(410)
  })

  it('returns zero for identical points', () => {
    expect(haversineKm(osakaCastle, osakaCastle)).toBeCloseTo(0)
  })
})

describe('estimateTravelMin', () => {
  it('assumes walking under 1km', () => {
    const near = { latitude: 34.6873, longitude: 135.5300 }
    expect(estimateTravelMin(osakaCastle, near)).toBeLessThan(15)
  })

  it('assumes transit beyond 1km and includes fixed overhead', () => {
    const mins = estimateTravelMin(osakaCastle, kuromonMarket)
    expect(mins).toBeGreaterThan(10)
    expect(mins).toBeLessThan(30)
  })

  it('returns null when either point lacks coordinates', () => {
    expect(estimateTravelMin({ latitude: null, longitude: null }, osakaCastle)).toBeNull()
    expect(estimateTravelMin(osakaCastle, { latitude: 34.1, longitude: null })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- travel`
Expected: FAIL — cannot resolve `@/lib/itinerary/travel`.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/travel.ts`:

```ts
export interface Coords {
  latitude: number | null
  longitude: number | null
}

const EARTH_RADIUS_KM = 6371
const WALK_THRESHOLD_KM = 1
const WALK_MIN_PER_KM = 13
const TRANSIT_MIN_PER_KM = 3
/** Waiting, walking to the station, buying a ticket. */
const TRANSIT_OVERHEAD_MIN = 8

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * Rough minutes between two points. Null when either lacks coordinates —
 * callers skip the travel check rather than blocking the edit.
 */
export function estimateTravelMin(a: Coords, b: Coords): number | null {
  if (a.latitude === null || a.longitude === null) return null
  if (b.latitude === null || b.longitude === null) return null

  const km = haversineKm(
    { latitude: a.latitude, longitude: a.longitude },
    { latitude: b.latitude, longitude: b.longitude },
  )

  if (km <= WALK_THRESHOLD_KM) return Math.round(km * WALK_MIN_PER_KM)
  return Math.round(km * TRANSIT_MIN_PER_KM + TRANSIT_OVERHEAD_MIN)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- travel`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/travel.ts src/lib/itinerary/travel.test.ts
git commit -m "feat: add travel time estimation"
```

---

## Task 5: Opening hours check

**Files:**
- Create: `src/lib/itinerary/hours.ts`
- Test: `src/lib/itinerary/hours.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/itinerary/hours.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { weekdayOf, isOpenAt } from '@/lib/itinerary/hours'
import type { OpeningHours } from '@/lib/types'

// Thursday 12 March 2026.
const THURSDAY = '2026-03-12'

const nineToFiveWeekdays: OpeningHours = {
  periods: [1, 2, 3, 4, 5].map((day) => ({ day, open: '09:00', close: '17:00' })),
}

const closesAfterMidnight: OpeningHours = {
  periods: [{ day: 4, open: '18:00', close: '02:00' }],
}

describe('weekdayOf', () => {
  it('maps a date string to a weekday index with Sunday as 0', () => {
    expect(weekdayOf(THURSDAY)).toBe(4)
    expect(weekdayOf('2026-03-15')).toBe(0)
  })
})

describe('isOpenAt', () => {
  it('returns true inside opening hours', () => {
    expect(isOpenAt(nineToFiveWeekdays, THURSDAY, '10:30')).toBe(true)
  })

  it('returns false before opening', () => {
    expect(isOpenAt(nineToFiveWeekdays, THURSDAY, '08:30')).toBe(false)
  })

  it('returns false after closing', () => {
    expect(isOpenAt(nineToFiveWeekdays, THURSDAY, '17:30')).toBe(false)
  })

  it('returns false on a day with no periods', () => {
    expect(isOpenAt(nineToFiveWeekdays, '2026-03-15', '10:30')).toBe(false)
  })

  it('handles a venue that closes after midnight', () => {
    expect(isOpenAt(closesAfterMidnight, THURSDAY, '23:30')).toBe(true)
    expect(isOpenAt(closesAfterMidnight, THURSDAY, '19:00')).toBe(true)
    expect(isOpenAt(closesAfterMidnight, THURSDAY, '17:00')).toBe(false)
  })

  it('returns true when hours are unknown, so missing data never blocks an edit', () => {
    expect(isOpenAt(null, THURSDAY, '03:00')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- hours`
Expected: FAIL — cannot resolve `@/lib/itinerary/hours`.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/hours.ts`:

```ts
import type { OpeningHours } from '@/lib/types'
import { toMinutes } from '@/lib/itinerary/time'

/**
 * Weekday index for a 'YYYY-MM-DD' string, Sunday = 0.
 *
 * Parsed by hand rather than with `new Date(str)` because that parses as UTC
 * and shifts the day for anyone west of Greenwich. Uses Sakamoto's algorithm.
 */
export function weekdayOf(dayDate: string): number {
  const [y, m, d] = dayDate.split('-').map(Number)
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const year = m < 3 ? y - 1 : y
  return (year + Math.floor(year / 4) - Math.floor(year / 100)
    + Math.floor(year / 400) + offsets[m - 1] + d) % 7
}

/**
 * Is the venue open at this local time?
 *
 * Unknown hours return true — missing data must never block an edit. A period
 * whose close is earlier than its open is treated as running past midnight.
 */
export function isOpenAt(
  hours: OpeningHours | null,
  dayDate: string,
  time: string,
): boolean {
  if (!hours || hours.periods.length === 0) return true

  const weekday = weekdayOf(dayDate)
  const at = toMinutes(time)

  return hours.periods
    .filter((period) => period.day === weekday)
    .some((period) => {
      const open = toMinutes(period.open)
      const close = toMinutes(period.close)
      if (close <= open) return at >= open || at < close
      return at >= open && at < close
    })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- hours`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/hours.ts src/lib/itinerary/hours.test.ts
git commit -m "feat: add opening hours check"
```

---

## Task 6: The clash validator

The heart of the feature. Pure function, no model involved — that is exactly why it can be trusted to always run.

**Files:**
- Create: `src/lib/itinerary/validate.ts`
- Test: `src/lib/itinerary/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/itinerary/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateDay } from '@/lib/itinerary/validate'
import type { ItineraryBlock } from '@/lib/types'

const DAY = '2026-03-12'

function block(partial: Partial<ItineraryBlock> & { id: string }): ItineraryBlock {
  return {
    trip_id: 't1', day_date: DAY, start_time: null, duration_min: 60,
    time_source: 'estimated', sort_order: 0, title: 'Test', type: 'place',
    notes: null, is_locked: false, confirmation_ref: null,
    reel_submission_id: null, google_place_id: null, opening_hours: null,
    address: null, latitude: null, longitude: null, confidence: null,
    created_by_user_id: null, created_at: '', updated_at: '', ...partial,
  }
}

describe('validateDay', () => {
  it('returns no clashes for a well-spaced day', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '09:00', duration_min: 90 }),
      block({ id: 'b', start_time: '13:00', duration_min: 60 }),
    ], DAY)
    expect(clashes).toEqual([])
  })

  it('detects two blocks overlapping in time', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '19:00', duration_min: 90 }),
      block({ id: 'b', start_time: '19:30', duration_min: 60 }),
    ], DAY)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].type).toBe('overlap')
    expect(clashes[0].block_ids).toEqual(['a', 'b'])
  })

  it('reports an overlap involving a locked block as locked_conflict', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '19:00', duration_min: 90 }),
      block({ id: 'flight', start_time: '19:30', duration_min: 60, is_locked: true }),
    ], DAY)
    expect(clashes[0].type).toBe('locked_conflict')
  })

  it('ignores unscheduled blocks', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '19:00', duration_min: 90 }),
      block({ id: 'idea', start_time: null }),
    ], DAY)
    expect(clashes).toEqual([])
  })

  it('detects an impossible gap between distant stops', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '09:00', duration_min: 60, latitude: 34.6873, longitude: 135.5259 }),
      block({ id: 'b', start_time: '10:05', duration_min: 60, latitude: 34.6653, longitude: 135.5061 }),
    ], DAY)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].type).toBe('travel_time')
  })

  it('skips the travel check when coordinates are missing', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '09:00', duration_min: 60, latitude: 34.6873, longitude: 135.5259 }),
      block({ id: 'b', start_time: '10:05', duration_min: 60 }),
    ], DAY)
    expect(clashes).toEqual([])
  })

  it('detects arriving when a venue is closed', () => {
    const clashes = validateDay([
      block({
        id: 'a', start_time: '08:00', duration_min: 60,
        opening_hours: { periods: [{ day: 4, open: '11:00', close: '22:00' }] },
      }),
    ], DAY)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].type).toBe('closed')
  })

  it('detects a block running past midnight', () => {
    const clashes = validateDay([
      block({ id: 'a', start_time: '23:30', duration_min: 120 }),
    ], DAY)
    expect(clashes).toHaveLength(1)
    expect(clashes[0].type).toBe('day_overflow')
  })

  it('orders blocks by time regardless of input order', () => {
    const clashes = validateDay([
      block({ id: 'late', start_time: '19:30', duration_min: 60 }),
      block({ id: 'early', start_time: '19:00', duration_min: 90 }),
    ], DAY)
    expect(clashes[0].block_ids).toEqual(['early', 'late'])
  })

  it('produces a message naming both blocks', () => {
    const clashes = validateDay([
      block({ id: 'a', title: 'Endo Sushi', start_time: '19:00', duration_min: 90 }),
      block({ id: 'b', title: 'Bar Nayuta', start_time: '19:30', duration_min: 60 }),
    ], DAY)
    expect(clashes[0].message).toContain('Endo Sushi')
    expect(clashes[0].message).toContain('Bar Nayuta')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot resolve `@/lib/itinerary/validate`.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/validate.ts`:

```ts
import type { ItineraryBlock } from '@/lib/types'
import { blockEnd, toMinutes, toTimeString, DEFAULT_DURATION_MIN } from '@/lib/itinerary/time'
import { estimateTravelMin } from '@/lib/itinerary/travel'
import { isOpenAt } from '@/lib/itinerary/hours'

export type ClashType =
  | 'overlap'
  | 'locked_conflict'
  | 'travel_time'
  | 'closed'
  | 'day_overflow'

export interface Clash {
  type: ClashType
  day: string
  /** Blocks involved, earliest first. */
  block_ids: string[]
  /** User-facing, written in plain language. */
  message: string
}

const MINUTES_IN_DAY = 24 * 60

/**
 * Check one day's blocks for clashes.
 *
 * Pure: no database, no network, no clock. Unscheduled blocks are skipped
 * entirely — they sit in the day's loose tray and cannot clash with anything.
 */
export function validateDay(blocks: ItineraryBlock[], day: string): Clash[] {
  const clashes: Clash[] = []

  const scheduled = blocks
    .filter((b) => b.start_time !== null)
    .sort((a, b) => toMinutes(a.start_time!) - toMinutes(b.start_time!))

  for (const block of scheduled) {
    const end = blockEnd(block)!

    if (end > MINUTES_IN_DAY) {
      clashes.push({
        type: 'day_overflow',
        day,
        block_ids: [block.id],
        message: `${block.title} would run past midnight, ending at ${toTimeString(end)}.`,
      })
    }

    if (!isOpenAt(block.opening_hours, day, block.start_time!)) {
      clashes.push({
        type: 'closed',
        day,
        block_ids: [block.id],
        message: `${block.title} looks closed at ${block.start_time}.`,
      })
    }
  }

  for (let i = 0; i < scheduled.length - 1; i++) {
    const earlier = scheduled[i]
    const later = scheduled[i + 1]
    const earlierEnd = blockEnd(earlier)!
    const laterStart = toMinutes(later.start_time!)

    if (laterStart < earlierEnd) {
      const locked = earlier.is_locked || later.is_locked
      clashes.push({
        type: locked ? 'locked_conflict' : 'overlap',
        day,
        block_ids: [earlier.id, later.id],
        message: locked
          ? `${earlier.title} and ${later.title} overlap, and one of them is a confirmed booking.`
          : `${earlier.title} and ${later.title} overlap.`,
      })
      continue
    }

    const travel = estimateTravelMin(earlier, later)
    if (travel !== null && laterStart - earlierEnd < travel) {
      clashes.push({
        type: 'travel_time',
        day,
        block_ids: [earlier.id, later.id],
        message:
          `Getting from ${earlier.title} to ${later.title} takes about ${travel} minutes, ` +
          `but there are only ${laterStart - earlierEnd} between them.`,
      })
    }
  }

  return clashes
}

/** Validate only the days a patch touched. */
export function validateDays(blocks: ItineraryBlock[], days: string[]): Clash[] {
  return days.flatMap((day) =>
    validateDay(blocks.filter((b) => b.day_date === day), day),
  )
}
```

Remove `DEFAULT_DURATION_MIN` from the import list at the top of this file — `blockEnd` already applies it internally, and other modules import it from `time.ts` directly.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- validate`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/validate.ts src/lib/itinerary/validate.test.ts
git commit -m "feat: add itinerary clash validator"
```

---

## Task 7: Patch types and application

**Files:**
- Create: `src/lib/itinerary/patch.ts`
- Test: `src/lib/itinerary/patch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/itinerary/patch.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyPatches, invertPatches, affectedDays } from '@/lib/itinerary/patch'
import type { Patch } from '@/lib/itinerary/patch'
import type { ItineraryBlock } from '@/lib/types'

const DAY = '2026-03-12'
const NEXT_DAY = '2026-03-13'

function block(partial: Partial<ItineraryBlock> & { id: string }): ItineraryBlock {
  return {
    trip_id: 't1', day_date: DAY, start_time: '10:00', duration_min: 60,
    time_source: 'estimated', sort_order: 0, title: 'Test', type: 'place',
    notes: null, is_locked: false, confirmation_ref: null,
    reel_submission_id: null, google_place_id: null, opening_hours: null,
    address: null, latitude: null, longitude: null, confidence: null,
    created_by_user_id: null, created_at: '', updated_at: '', ...partial,
  }
}

describe('applyPatches', () => {
  it('adds a block', () => {
    const result = applyPatches([], [{
      op: 'add_block',
      day: DAY,
      block: { id: 'new', title: 'Kuromon Market', start_time: '08:30' },
    }])
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Kuromon Market')
    expect(result[0].day_date).toBe(DAY)
  })

  it('updates named fields and leaves the rest alone', () => {
    const result = applyPatches(
      [block({ id: 'a', title: 'Dinner', notes: 'keep me' })],
      [{ op: 'update_block', id: 'a', fields: { title: 'Endo Sushi' } }],
    )
    expect(result[0].title).toBe('Endo Sushi')
    expect(result[0].notes).toBe('keep me')
  })

  it('moves a block to a new time', () => {
    const result = applyPatches(
      [block({ id: 'a', start_time: '19:30' })],
      [{ op: 'move_block', id: 'a', start_time: '20:30' }],
    )
    expect(result[0].start_time).toBe('20:30')
  })

  it('moves a block to another day', () => {
    const result = applyPatches(
      [block({ id: 'a' })],
      [{ op: 'move_block', id: 'a', day: NEXT_DAY }],
    )
    expect(result[0].day_date).toBe(NEXT_DAY)
  })

  it('removes a block', () => {
    const result = applyPatches(
      [block({ id: 'a' }), block({ id: 'b' })],
      [{ op: 'remove_block', id: 'a' }],
    )
    expect(result.map((b) => b.id)).toEqual(['b'])
  })

  it('reorders a day by rewriting sort_order', () => {
    const result = applyPatches(
      [block({ id: 'a', sort_order: 0 }), block({ id: 'b', sort_order: 1 })],
      [{ op: 'reorder_day', day: DAY, block_ids: ['b', 'a'] }],
    )
    expect(result.find((b) => b.id === 'b')!.sort_order).toBe(0)
    expect(result.find((b) => b.id === 'a')!.sort_order).toBe(1)
  })

  it('does not mutate the input array', () => {
    const original = [block({ id: 'a', title: 'Original' })]
    applyPatches(original, [{ op: 'update_block', id: 'a', fields: { title: 'Changed' } }])
    expect(original[0].title).toBe('Original')
  })

  it('throws when a patch references an unknown block', () => {
    expect(() =>
      applyPatches([], [{ op: 'update_block', id: 'ghost', fields: { title: 'x' } }]),
    ).toThrow(/ghost/)
  })
})

describe('invertPatches', () => {
  it('inverts an add into a remove', () => {
    const patches: Patch[] = [{ op: 'add_block', day: DAY, block: { id: 'new', title: 'X' } }]
    expect(invertPatches([], patches)).toEqual([{ op: 'remove_block', id: 'new' }])
  })

  it('inverts a remove into an add carrying the prior state', () => {
    const before = [block({ id: 'a', title: 'Endo Sushi' })]
    const inverse = invertPatches(before, [{ op: 'remove_block', id: 'a' }])
    expect(inverse[0].op).toBe('add_block')
  })

  it('inverts an update back to the prior field values', () => {
    const before = [block({ id: 'a', title: 'Dinner' })]
    const inverse = invertPatches(before, [
      { op: 'update_block', id: 'a', fields: { title: 'Endo Sushi' } },
    ])
    expect(inverse).toEqual([{ op: 'update_block', id: 'a', fields: { title: 'Dinner' } }])
  })

  it('inverts a move back to the prior day and time', () => {
    const before = [block({ id: 'a', start_time: '19:30', day_date: DAY })]
    const inverse = invertPatches(before, [
      { op: 'move_block', id: 'a', start_time: '20:30', day: NEXT_DAY },
    ])
    expect(inverse).toEqual([{ op: 'move_block', id: 'a', day: DAY, start_time: '19:30' }])
  })

  it('round-trips: applying then inverting restores the original', () => {
    const before = [block({ id: 'a', start_time: '19:30' }), block({ id: 'b', start_time: '21:30' })]
    const patches: Patch[] = [{ op: 'move_block', id: 'a', start_time: '20:30' }]
    const inverse = invertPatches(before, patches)
    const after = applyPatches(before, patches)
    expect(applyPatches(after, inverse)).toEqual(before)
  })
})

describe('affectedDays', () => {
  it('collects days from both the patch and the prior state', () => {
    const before = [block({ id: 'a', day_date: DAY })]
    const days = affectedDays(before, [{ op: 'move_block', id: 'a', day: NEXT_DAY }])
    expect(days.sort()).toEqual([DAY, NEXT_DAY])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- patch`
Expected: FAIL — cannot resolve `@/lib/itinerary/patch`.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/patch.ts`:

```ts
import type { ItineraryBlock } from '@/lib/types'

/** Fields Claude may set on a new block. The server fills in the rest. */
export type NewBlockInput = Partial<ItineraryBlock> & { id: string; title: string }

export type Patch =
  | { op: 'add_block'; day: string; block: NewBlockInput }
  | { op: 'update_block'; id: string; fields: Partial<ItineraryBlock> }
  | { op: 'move_block'; id: string; day?: string; start_time?: string }
  | { op: 'remove_block'; id: string }
  | { op: 'reorder_day'; day: string; block_ids: string[] }

function find(blocks: ItineraryBlock[], id: string): ItineraryBlock {
  const found = blocks.find((b) => b.id === id)
  if (!found) throw new Error(`Patch references unknown block: ${id}`)
  return found
}

function materialise(input: NewBlockInput, day: string): ItineraryBlock {
  return {
    trip_id: '', day_date: day, start_time: null, duration_min: null,
    time_source: 'estimated', sort_order: 0, type: 'place', notes: null,
    is_locked: false, confirmation_ref: null, reel_submission_id: null,
    google_place_id: null, opening_hours: null, address: null,
    latitude: null, longitude: null, confidence: null, created_by_user_id: null,
    created_at: '', updated_at: '', ...input,
  }
}

/**
 * Apply patches to a copy of the block array. Never mutates the input — the
 * caller keeps the original so it can discard the result if validation fails.
 */
export function applyPatches(blocks: ItineraryBlock[], patches: Patch[]): ItineraryBlock[] {
  let next = blocks.map((b) => ({ ...b }))

  for (const patch of patches) {
    switch (patch.op) {
      case 'add_block':
        next.push(materialise(patch.block, patch.day))
        break

      case 'update_block': {
        const target = find(next, patch.id)
        Object.assign(target, patch.fields)
        break
      }

      case 'move_block': {
        const target = find(next, patch.id)
        if (patch.day !== undefined) target.day_date = patch.day
        if (patch.start_time !== undefined) target.start_time = patch.start_time
        break
      }

      case 'remove_block':
        find(next, patch.id)
        next = next.filter((b) => b.id !== patch.id)
        break

      case 'reorder_day':
        patch.block_ids.forEach((id, index) => {
          find(next, id).sort_order = index
        })
        break
    }
  }

  return next
}

/**
 * Build the patch that undoes these patches, given the state before they ran.
 * Reversed so that undoing happens in the opposite order to doing.
 */
export function invertPatches(before: ItineraryBlock[], patches: Patch[]): Patch[] {
  const inverse: Patch[] = []
  let state = before.map((b) => ({ ...b }))

  for (const patch of patches) {
    switch (patch.op) {
      case 'add_block':
        inverse.push({ op: 'remove_block', id: patch.block.id })
        break

      case 'update_block': {
        const target = find(state, patch.id)
        const priorFields: Partial<ItineraryBlock> = {}
        for (const key of Object.keys(patch.fields) as (keyof ItineraryBlock)[]) {
          Object.assign(priorFields, { [key]: target[key] })
        }
        inverse.push({ op: 'update_block', id: patch.id, fields: priorFields })
        break
      }

      case 'move_block': {
        const target = find(state, patch.id)
        inverse.push({
          op: 'move_block',
          id: patch.id,
          day: target.day_date,
          start_time: target.start_time ?? undefined,
        })
        break
      }

      case 'remove_block': {
        const target = find(state, patch.id)
        inverse.push({ op: 'add_block', day: target.day_date, block: { ...target } })
        break
      }

      case 'reorder_day': {
        const priorOrder = state
          .filter((b) => b.day_date === patch.day)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => b.id)
        inverse.push({ op: 'reorder_day', day: patch.day, block_ids: priorOrder })
        break
      }
    }

    state = applyPatches(state, [patch])
  }

  return inverse.reverse()
}

/** Days the validator needs to re-check: both origins and destinations. */
export function affectedDays(before: ItineraryBlock[], patches: Patch[]): string[] {
  const days = new Set<string>()

  for (const patch of patches) {
    if (patch.op === 'add_block' || patch.op === 'reorder_day') {
      days.add(patch.day)
    } else {
      const existing = before.find((b) => b.id === patch.id)
      if (existing) days.add(existing.day_date)
      if (patch.op === 'move_block' && patch.day) days.add(patch.day)
    }
  }

  return [...days]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- patch`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/patch.ts src/lib/itinerary/patch.test.ts
git commit -m "feat: add itinerary patch application and inversion"
```

---

## Task 8: Clash resolution options

Code-generated, so the same clash always offers the same options, instantly and with no model call.

**Files:**
- Create: `src/lib/itinerary/resolutions.ts`
- Test: `src/lib/itinerary/resolutions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/itinerary/resolutions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolutionsFor } from '@/lib/itinerary/resolutions'
import { applyPatches } from '@/lib/itinerary/patch'
import { validateDay } from '@/lib/itinerary/validate'
import type { Clash } from '@/lib/itinerary/validate'
import type { ItineraryBlock } from '@/lib/types'

const DAY = '2026-03-12'

function block(partial: Partial<ItineraryBlock> & { id: string }): ItineraryBlock {
  return {
    trip_id: 't1', day_date: DAY, start_time: '10:00', duration_min: 60,
    time_source: 'estimated', sort_order: 0, title: 'Test', type: 'place',
    notes: null, is_locked: false, confirmation_ref: null,
    reel_submission_id: null, google_place_id: null, opening_hours: null,
    address: null, latitude: null, longitude: null, confidence: null,
    created_by_user_id: null, created_at: '', updated_at: '', ...partial,
  }
}

const overlappingDay = [
  block({ id: 'dinner', title: 'Endo Sushi', start_time: '20:30', duration_min: 120 }),
  block({ id: 'drinks', title: 'Bar Nayuta', start_time: '21:30', duration_min: 60 }),
]

const overlapClash: Clash = {
  type: 'overlap', day: DAY, block_ids: ['dinner', 'drinks'], message: 'overlap',
}

describe('resolutionsFor', () => {
  it('offers push, swap, shorten, move-day and allow for an overlap', () => {
    const options = resolutionsFor(overlapClash, overlappingDay)
    expect(options.map((o) => o.id)).toEqual([
      'push_later', 'swap', 'shorten_earlier', 'move_day', 'allow_overlap',
    ])
  })

  it('gives every option a human-readable label', () => {
    for (const option of resolutionsFor(overlapClash, overlappingDay)) {
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('push_later actually clears the overlap', () => {
    const push = resolutionsFor(overlapClash, overlappingDay).find((o) => o.id === 'push_later')!
    const after = applyPatches(overlappingDay, push.patches)
    expect(validateDay(after, DAY)).toEqual([])
  })

  it('swap actually clears the overlap', () => {
    const swap = resolutionsFor(overlapClash, overlappingDay).find((o) => o.id === 'swap')!
    const after = applyPatches(overlappingDay, swap.patches)
    expect(validateDay(after, DAY)).toEqual([])
  })

  it('shorten_earlier actually clears the overlap', () => {
    const shorten = resolutionsFor(overlapClash, overlappingDay).find((o) => o.id === 'shorten_earlier')!
    const after = applyPatches(overlappingDay, shorten.patches)
    expect(validateDay(after, DAY)).toEqual([])
  })

  it('allow_overlap changes nothing', () => {
    const allow = resolutionsFor(overlapClash, overlappingDay).find((o) => o.id === 'allow_overlap')!
    expect(allow.patches).toEqual([])
  })

  it('omits swap and shorten when a locked booking is involved', () => {
    const lockedDay = [
      block({ id: 'dinner', title: 'Endo Sushi', start_time: '20:30', duration_min: 120, is_locked: true }),
      block({ id: 'drinks', title: 'Bar Nayuta', start_time: '21:30', duration_min: 60 }),
    ]
    const ids = resolutionsFor(
      { type: 'locked_conflict', day: DAY, block_ids: ['dinner', 'drinks'], message: '' },
      lockedDay,
    ).map((o) => o.id)
    expect(ids).not.toContain('swap')
    expect(ids).not.toContain('shorten_earlier')
    expect(ids).toContain('move_day')
  })

  it('offers only move-day and allow for a closed-venue clash', () => {
    const ids = resolutionsFor(
      { type: 'closed', day: DAY, block_ids: ['dinner'], message: '' },
      overlappingDay,
    ).map((o) => o.id)
    expect(ids).toEqual(['move_day', 'allow_overlap'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- resolutions`
Expected: FAIL — cannot resolve `@/lib/itinerary/resolutions`.

- [ ] **Step 3: Implement**

Create `src/lib/itinerary/resolutions.ts`:

```ts
import type { ItineraryBlock } from '@/lib/types'
import type { Clash } from '@/lib/itinerary/validate'
import type { Patch } from '@/lib/itinerary/patch'
import { toMinutes, toTimeString, blockEnd, DEFAULT_DURATION_MIN } from '@/lib/itinerary/time'

export type ResolutionId =
  | 'push_later'
  | 'swap'
  | 'shorten_earlier'
  | 'move_day'
  | 'allow_overlap'

export interface Resolution {
  id: ResolutionId
  label: string
  /** Empty means "change nothing" — that is a legitimate choice. */
  patches: Patch[]
}

/** Add a day to a 'YYYY-MM-DD' string without touching Date parsing rules. */
function nextDay(dayDate: string): string {
  const [y, m, d] = dayDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + 1))
  return date.toISOString().slice(0, 10)
}

/**
 * The fixed option set for a clash. Always the same options for the same
 * clash type, generated in code so they appear instantly and can never be
 * an option that does not actually work.
 */
export function resolutionsFor(clash: Clash, dayBlocks: ItineraryBlock[]): Resolution[] {
  const [earlierId, laterId] = clash.block_ids
  const earlier = dayBlocks.find((b) => b.id === earlierId)
  const later = laterId ? dayBlocks.find((b) => b.id === laterId) : undefined

  const moveDay: Resolution = {
    id: 'move_day',
    label: later
      ? `Move ${later.title} to the next day`
      : `Move ${earlier?.title ?? 'it'} to the next day`,
    patches: [{
      op: 'move_block',
      id: later?.id ?? earlierId,
      day: nextDay(clash.day),
    }],
  }

  const allow: Resolution = { id: 'allow_overlap', label: 'Leave it as is', patches: [] }

  if (clash.type === 'closed' || clash.type === 'day_overflow' || !earlier || !later) {
    return [moveDay, allow]
  }

  const earlierEnd = blockEnd(earlier)!
  const laterStart = toMinutes(later.start_time!)
  const shortfall = earlierEnd - laterStart

  const pushLater: Resolution = {
    id: 'push_later',
    label: `Push ${later.title} and everything after it back ${shortfall} minutes`,
    patches: dayBlocks
      .filter((b) => b.start_time !== null && toMinutes(b.start_time) >= laterStart)
      .map((b) => ({
        op: 'move_block' as const,
        id: b.id,
        start_time: toTimeString(toMinutes(b.start_time!) + shortfall),
      })),
  }

  if (clash.type === 'locked_conflict') {
    return [pushLater, moveDay, allow]
  }

  const swap: Resolution = {
    id: 'swap',
    label: `Swap ${earlier.title} and ${later.title}`,
    patches: [
      { op: 'move_block', id: later.id, start_time: earlier.start_time! },
      {
        op: 'move_block',
        id: earlier.id,
        start_time: toTimeString(
          toMinutes(earlier.start_time!) + (later.duration_min ?? DEFAULT_DURATION_MIN),
        ),
      },
    ],
  }

  const shorten: Resolution = {
    id: 'shorten_earlier',
    label: `Shorten ${earlier.title} by ${shortfall} minutes`,
    patches: [{
      op: 'update_block',
      id: earlier.id,
      fields: { duration_min: (earlier.duration_min ?? DEFAULT_DURATION_MIN) - shortfall },
    }],
  }

  return [pushLater, swap, shorten, moveDay, allow]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- resolutions`
Expected: PASS, 8 tests. The "actually clears the overlap" tests are the important ones — they compose the resolution with the real validator, so an option that does not work fails the build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/itinerary/resolutions.ts src/lib/itinerary/resolutions.test.ts
git commit -m "feat: add clash resolution options"
```

---

## Task 9: Claude prompt and schema

**Files:**
- Create: `src/lib/itinerary/prompt.ts`

- [ ] **Step 1: Write the module**

Create `src/lib/itinerary/prompt.ts`:

```ts
import type { ItineraryBlock, ReelSubmission } from '@/lib/types'

/**
 * Stable across every request, so it sits behind the cache_control breakpoint.
 * Keep volatile content out of this string — a single changed byte invalidates
 * the cached prefix.
 */
export const SYSTEM_PROMPT = `You edit a travel itinerary by returning patch operations. You never rewrite the whole itinerary.

A block is one entry on a day: a meal, a flight, a place, a note. Times are local wall-clock at the destination, formatted 'HH:MM'. Days are 'YYYY-MM-DD'.

Return the smallest set of patches that satisfies the request. Operations:
- add_block: add a new block to a day. Generate a fresh uuid for its id.
- update_block: change fields on an existing block.
- move_block: change a block's day, its start time, or both.
- remove_block: delete a block.
- reorder_day: set the order of blocks within a day.

Rules:
1. Only reference block ids that appear in the itinerary you were given.
2. When you set a time the user did not state, set time_source to 'estimated'. When the user states a time explicitly, or it comes from a booking, set it to 'pinned'. Never mark a guess as pinned.
3. Never change a block with is_locked true unless the user explicitly asks. These are confirmed bookings.
4. If a request is ambiguous about which block it means, pick the most likely and say which one you chose in the summary.
5. If the user references a saved Idea, use its details and set reel_submission_id to that Idea's id.
6. Do not attempt to resolve scheduling conflicts yourself. Make the edit the user asked for; a separate check handles conflicts.

The summary is one sentence, plain language, describing what you changed. No preamble.`

/** Strict schema for output_config.format. */
export const PATCH_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    patches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: ['add_block', 'update_block', 'move_block', 'remove_block', 'reorder_day'],
          },
          id: { type: 'string' },
          day: { type: 'string' },
          start_time: { type: 'string' },
          block_ids: { type: 'array', items: { type: 'string' } },
          block: { type: 'object', additionalProperties: true },
          fields: { type: 'object', additionalProperties: true },
        },
        required: ['op'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'patches'],
  additionalProperties: false,
} as const

/** Volatile context. Goes after the cache breakpoint. */
export function buildContext(
  blocks: ItineraryBlock[],
  unscheduledIdeas: ReelSubmission[],
  tripName: string,
): string {
  const itinerary = blocks.map((b) => ({
    id: b.id,
    day: b.day_date,
    start_time: b.start_time,
    duration_min: b.duration_min,
    title: b.title,
    type: b.type,
    is_locked: b.is_locked,
    time_source: b.time_source,
  }))

  const ideas = unscheduledIdeas.map((idea) => ({
    id: idea.id,
    name: idea.place_name,
    city: idea.destination_city,
    type: idea.place_type,
  }))

  return [
    `Trip: ${tripName}`,
    `Itinerary:\n${JSON.stringify(itinerary, null, 2)}`,
    `Saved Ideas not yet on the itinerary:\n${JSON.stringify(ideas, null, 2)}`,
  ].join('\n\n')
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/prompt.ts
git commit -m "feat: add itinerary chat prompt and response schema"
```

---

## Task 10: Google Places resolution

A block created from a photo has a name but no coordinates and no opening hours, so two of the validator's six checks silently skip it. This fills them in.

The Railway worker already does this in `worker/resolve_place.py`, but that runs in Python on a different service. Photo blocks are created in the Next.js app, so it needs its own resolver.

**Files:**
- Create: `src/lib/itinerary/resolve-place.ts`

- [ ] **Step 1: Write the resolver**

Create `src/lib/itinerary/resolve-place.ts`. `opening_hours` is a new field on the mask compared to what the worker requests, so watch the Google quota — `docs/PROJECT_CONTEXT.md` flags that budget alerts should be set before wider use.

```ts
import type { OpeningHours } from '@/lib/types'

export interface ResolvedPlace {
  google_place_id: string
  address: string | null
  latitude: number | null
  longitude: number | null
  opening_hours: OpeningHours | null
}

interface GooglePeriodPoint { day: number; hour: number; minute: number }

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toOpeningHours(
  periods: { open: GooglePeriodPoint; close?: GooglePeriodPoint }[] | undefined,
): OpeningHours | null {
  if (!periods || periods.length === 0) return null
  return {
    periods: periods
      .filter((period) => period.close)
      .map((period) => ({
        day: period.open.day,
        open: `${pad(period.open.hour)}:${pad(period.open.minute)}`,
        close: `${pad(period.close!.hour)}:${pad(period.close!.minute)}`,
      })),
  }
}

/**
 * Look up a place by name, biased by the trip's city.
 * Returns null on any failure — a block without coordinates is fine, the
 * validator just skips its travel and hours checks.
 */
export async function resolvePlace(
  name: string,
  city: string | null,
): Promise<ResolvedPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return null

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.formattedAddress',
          'places.location',
          'places.regularOpeningHours.periods',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: city ? `${name}, ${city}` : name,
        maxResultCount: 1,
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const place = data.places?.[0]
    if (!place) return null

    return {
      google_place_id: place.id,
      address: place.formattedAddress ?? null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      opening_hours: toOpeningHours(place.regularOpeningHours?.periods),
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/itinerary/resolve-place.ts
git commit -m "feat: add Google Places resolution for itinerary blocks"
```

---

## Task 11: The chat server action

Wires the pure pieces to Claude and the database. Follows the existing pattern in `src/lib/actions/reels.ts`.

**Files:**
- Create: `src/lib/actions/itinerary.ts`

- [ ] **Step 1: Confirm the API key is available to Vercel**

`ANTHROPIC_API_KEY` currently exists only in Railway. Add the same value to Vercel's environment variables and to `.env.local`, then add a line for it in `.env.local.example`.

- [ ] **Step 2: Write the action**

Create `src/lib/actions/itinerary.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { applyPatches, invertPatches, affectedDays } from '@/lib/itinerary/patch'
import type { Patch } from '@/lib/itinerary/patch'
import { validateDays } from '@/lib/itinerary/validate'
import type { Clash } from '@/lib/itinerary/validate'
import { resolutionsFor } from '@/lib/itinerary/resolutions'
import type { Resolution } from '@/lib/itinerary/resolutions'
import { SYSTEM_PROMPT, PATCH_RESPONSE_SCHEMA, buildContext } from '@/lib/itinerary/prompt'
import { resolvePlace } from '@/lib/itinerary/resolve-place'
import type { ItineraryBlock, ReelSubmission, Trip } from '@/lib/types'

export type ChatResult =
  | { status: 'applied'; summary: string; messageId: string }
  | { status: 'clash'; clash: Clash; resolutions: Resolution[]; summary: string }
  | { status: 'error'; message: string }

const anthropic = new Anthropic()

/**
 * Send a chat message, get patches, validate, and commit if clean.
 *
 * Nothing is written until the validator passes. On a clash the in-memory
 * result is discarded and the user is asked how to resolve it.
 */
export async function sendChatMessage(
  tripId: string,
  message: string,
  imageBase64?: string,
): Promise<ChatResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: trip } = await supabase
    .from('trips').select('*').eq('id', tripId).single<Trip>()
  if (!trip) throw new Error('Trip not found')

  const { data: blocksData } = await supabase
    .from('itinerary_blocks').select('*').eq('trip_id', tripId)
  const blocks = (blocksData ?? []) as ItineraryBlock[]

  const { data: ideasData } = await supabase
    .from('reel_submissions')
    .select('*')
    .eq('dreamlist_id', trip.dreamlist_id)
    .neq('status', 'rejected')
    .limit(50)
  const ideas = (ideasData ?? []) as ReelSubmission[]

  await supabase.from('trip_chat_messages').insert({
    trip_id: tripId, role: 'user', content: message,
    created_by_user_id: user.id,
  })

  const content: Anthropic.ContentBlockParam[] = []
  if (imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
    })
  }
  content.push({
    type: 'text',
    text: `${buildContext(blocks, ideas, trip.name)}\n\n${message}`,
  })

  let parsed: { summary: string; patches: Patch[] }
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: PATCH_RESPONSE_SCHEMA } },
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      return { status: 'error', message: 'That request was declined. Try rewording it.' }
    }

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { status: 'error', message: 'No response from Claude. Try again.' }
    }
    parsed = JSON.parse(textBlock.text)
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Something went wrong.',
    }
  }

  let nextBlocks: ItineraryBlock[]
  try {
    nextBlocks = applyPatches(blocks, parsed.patches)
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Invalid edit.',
    }
  }

  const clashes = validateDays(nextBlocks, affectedDays(blocks, parsed.patches))
  if (clashes.length > 0) {
    const clash = clashes[0]
    const dayBlocks = nextBlocks.filter((b) => b.day_date === clash.day)
    return {
      status: 'clash',
      clash,
      resolutions: resolutionsFor(clash, dayBlocks),
      summary: parsed.summary,
    }
  }

  const inverse = invertPatches(blocks, parsed.patches)
  const enriched = await enrichNewBlocks(blocks, nextBlocks, trip.destination_city)
  const committed = await commitPatches(tripId, trip.version, blocks, enriched, user.id)
  if (!committed) {
    return { status: 'error', message: 'Someone else edited this trip. Try again.' }
  }

  const { data: chatMessage } = await supabase
    .from('trip_chat_messages')
    .insert({
      trip_id: tripId, role: 'assistant', content: parsed.summary,
      patches: parsed.patches, inverse_patches: inverse,
      applied_at: new Date().toISOString(), created_by_user_id: user.id,
    })
    .select('id')
    .single()

  revalidatePath(`/trips/${tripId}`)
  return { status: 'applied', summary: parsed.summary, messageId: chatMessage!.id }
}

/**
 * Fill in coordinates and opening hours for blocks that are new and have no
 * place data yet — typically ones Claude created from a photo or from scratch.
 * Blocks that came from an Idea already carry this from the worker.
 */
async function enrichNewBlocks(
  before: ItineraryBlock[],
  after: ItineraryBlock[],
  city: string | null,
): Promise<ItineraryBlock[]> {
  const beforeIds = new Set(before.map((b) => b.id))

  return Promise.all(
    after.map(async (block) => {
      const isNew = !beforeIds.has(block.id)
      const needsPlace = block.google_place_id === null && block.latitude === null
      const isPlaceLike = block.type === 'place' || block.type === 'meal'
      if (!isNew || !needsPlace || !isPlaceLike) return block

      const resolved = await resolvePlace(block.title, city)
      return resolved ? { ...block, ...resolved } : block
    }),
  )
}

/**
 * Keep Idea status in step with the itinerary. An Idea referenced by at least
 * one block is 'scheduled'; one no longer referenced returns to 'saved'.
 */
async function syncIdeaStatus(
  before: ItineraryBlock[],
  after: ItineraryBlock[],
): Promise<void> {
  const supabase = await createClient()

  const idsIn = (blocks: ItineraryBlock[]) =>
    new Set(blocks.map((b) => b.reel_submission_id).filter((id): id is string => id !== null))

  const wasReferenced = idsIn(before)
  const isReferenced = idsIn(after)

  const nowScheduled = [...isReferenced].filter((id) => !wasReferenced.has(id))
  const nowFree = [...wasReferenced].filter((id) => !isReferenced.has(id))

  if (nowScheduled.length > 0) {
    await supabase
      .from('reel_submissions')
      .update({ status: 'scheduled' })
      .in('id', nowScheduled)
  }
  if (nowFree.length > 0) {
    await supabase
      .from('reel_submissions')
      .update({ status: 'saved' })
      .in('id', nowFree)
  }
}

/**
 * Write the new block set, guarded by the trip version.
 * Returns false when the version moved — someone else edited concurrently.
 */
async function commitPatches(
  tripId: string,
  expectedVersion: number,
  before: ItineraryBlock[],
  after: ItineraryBlock[],
  userId: string,
): Promise<boolean> {
  const supabase = await createClient()

  const { data: bumped } = await supabase
    .from('trips')
    .update({ version: expectedVersion + 1, updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('version', expectedVersion)
    .select('id')

  if (!bumped || bumped.length === 0) return false

  const beforeIds = new Set(before.map((b) => b.id))
  const afterIds = new Set(after.map((b) => b.id))

  const removed = [...beforeIds].filter((id) => !afterIds.has(id))
  if (removed.length > 0) {
    await supabase.from('itinerary_blocks').delete().in('id', removed)
  }

  const rows = after.map((b) => ({
    ...b,
    trip_id: tripId,
    created_by_user_id: b.created_by_user_id ?? userId,
    updated_at: new Date().toISOString(),
  }))
  await supabase.from('itinerary_blocks').upsert(rows)

  await syncIdeaStatus(before, after)

  return true
}

/** Apply a stored inverse patch. Runs the same validate-then-commit path. */
export async function undoChatMessage(tripId: string, messageId: string): Promise<ChatResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: message } = await supabase
    .from('trip_chat_messages').select('*').eq('id', messageId).single()
  if (!message?.inverse_patches) {
    return { status: 'error', message: 'Nothing to undo.' }
  }

  const { data: trip } = await supabase
    .from('trips').select('*').eq('id', tripId).single<Trip>()
  const { data: blocksData } = await supabase
    .from('itinerary_blocks').select('*').eq('trip_id', tripId)
  const blocks = (blocksData ?? []) as ItineraryBlock[]

  const patches = message.inverse_patches as Patch[]
  const nextBlocks = applyPatches(blocks, patches)

  const committed = await commitPatches(tripId, trip!.version, blocks, nextBlocks, user.id)
  if (!committed) {
    return { status: 'error', message: 'Someone else edited this trip. Try again.' }
  }

  await supabase
    .from('trip_chat_messages')
    .update({ undone_at: new Date().toISOString() })
    .eq('id', messageId)

  revalidatePath(`/trips/${tripId}`)
  return { status: 'applied', summary: 'Undone.', messageId }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/itinerary.ts .env.local.example
git commit -m "feat: add itinerary chat server action"
```

---

## Task 12: Trip detail page and timeline

**Files:**
- Create: `src/app/trips/[id]/page.tsx`
- Create: `src/components/itinerary/block-row.tsx`
- Create: `src/components/itinerary/timeline.tsx`

- [ ] **Step 1: Create the block row**

Create `src/components/itinerary/block-row.tsx`. The estimated-vs-pinned distinction is the point of this component — a time the user chose must never look like one Claude invented.

```tsx
import type { ItineraryBlock } from '@/lib/types'

export function BlockRow({ block }: { block: ItineraryBlock }) {
  const isEstimate = block.time_source === 'estimated'

  return (
    <div className="flex gap-3 py-2">
      <div
        className={
          isEstimate
            ? 'w-14 shrink-0 text-sm tabular-nums text-muted-foreground/50'
            : 'w-14 shrink-0 text-sm tabular-nums font-medium text-foreground'
        }
        title={isEstimate ? 'Estimated time' : 'Set time'}
      >
        {block.start_time?.slice(0, 5) ?? ''}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-serif text-base leading-tight">{block.title}</p>
        {block.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground">{block.notes}</p>
        )}
        {block.is_locked && (
          <span className="mt-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
            Booked
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the timeline**

Create `src/components/itinerary/timeline.tsx`:

```tsx
import type { ItineraryBlock } from '@/lib/types'
import { BlockRow } from './block-row'

function formatDay(dayDate: string): string {
  const [y, m, d] = dayDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

export function Timeline({ blocks }: { blocks: ItineraryBlock[] }) {
  const days = [...new Set(blocks.map((b) => b.day_date))].sort()

  if (days.length === 0) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        Nothing planned yet. Ask below to start building the itinerary.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {days.map((day) => {
        const dayBlocks = blocks.filter((b) => b.day_date === day)
        const scheduled = dayBlocks
          .filter((b) => b.start_time !== null)
          .sort((a, b) => a.start_time!.localeCompare(b.start_time!))
        const loose = dayBlocks.filter((b) => b.start_time === null)

        return (
          <section key={day}>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-sky-700">
              {formatDay(day)}
            </h2>
            <div className="divide-y divide-border/50">
              {scheduled.map((block) => <BlockRow key={block.id} block={block} />)}
            </div>
            {loose.length > 0 && (
              <div className="mt-3 rounded-lg border border-dashed border-border p-2">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  No time yet
                </p>
                {loose.map((block) => <BlockRow key={block.id} block={block} />)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create the page**

Create `src/app/trips/[id]/page.tsx`. Note `params` is a Promise in Next 16.

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Timeline } from '@/components/itinerary/timeline'
import { ChatPanel } from '@/components/itinerary/chat-panel'
import type { ItineraryBlock, Trip, TripChatMessage } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: trip } = await supabase
    .from('trips').select('*').eq('id', id).single<Trip>()
  if (!trip) notFound()

  const { data: blocksData } = await supabase
    .from('itinerary_blocks')
    .select('*')
    .eq('trip_id', id)
    .order('day_date')
    .order('start_time', { nullsFirst: false })

  const { data: messagesData } = await supabase
    .from('trip_chat_messages')
    .select('*')
    .eq('trip_id', id)
    .order('created_at', { ascending: true })
    .limit(50)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-32">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">{trip.name}</h1>
      {trip.destination_city && (
        <p className="mb-6 text-sm text-muted-foreground">{trip.destination_city}</p>
      )}

      <Timeline blocks={(blocksData ?? []) as ItineraryBlock[]} />
      <ChatPanel tripId={id} messages={(messagesData ?? []) as TripChatMessage[]} />
    </main>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: one error, that `@/components/itinerary/chat-panel` does not exist. That is Task 12.

- [ ] **Step 5: Commit**

```bash
git add src/app/trips/\[id\]/page.tsx src/components/itinerary/
git commit -m "feat: add trip detail page and itinerary timeline"
```

---

## Task 13: Chat panel

**Files:**
- Create: `src/components/itinerary/chat-panel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/itinerary/chat-panel.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { sendChatMessage, undoChatMessage } from '@/lib/actions/itinerary'
import type { ChatResult } from '@/lib/actions/itinerary'
import type { TripChatMessage } from '@/lib/types'

export function ChatPanel({
  tripId,
  messages,
}: {
  tripId: string
  messages: TripChatMessage[]
}) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ChatResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function send(text: string) {
    if (!text.trim()) return
    setInput('')
    startTransition(async () => {
      setResult(await sendChatMessage(tripId, text))
    })
  }

  const lastApplied = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.applied_at && !m.undone_at)

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-2xl px-4 py-3">
        {result?.status === 'clash' && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">{result.clash.message}</p>
            <p className="mt-0.5 text-xs text-amber-800">How do you want to handle it?</p>
            <ul className="mt-2 space-y-1">
              {result.resolutions.map((option, index) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => send(`Resolve that by: ${option.label}`)}
                    className="min-h-[44px] w-full rounded px-2 text-left text-sm text-amber-900 hover:bg-amber-100"
                  >
                    <span className="mr-2 tabular-nums opacity-60">{index + 1}</span>
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result?.status === 'applied' && (
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{result.summary}</span>
            <button
              type="button"
              onClick={() =>
                startTransition(async () => {
                  setResult(await undoChatMessage(tripId, result.messageId))
                })
              }
              className="shrink-0 underline underline-offset-2"
            >
              Undo
            </button>
          </div>
        )}

        {result?.status === 'error' && (
          <p className="mb-3 text-sm text-red-600">{result.message}</p>
        )}

        {!result && lastApplied && (
          <p className="mb-3 text-sm text-muted-foreground">{lastApplied.content}</p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            send(input)
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Move dinner back an hour…"
            disabled={isPending}
            className="min-h-[44px] flex-1 rounded-lg border border-border px-3 text-base"
          />
          <button
            type="submit"
            disabled={isPending || !input.trim()}
            className="min-h-[44px] rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
          >
            {isPending ? '…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the whole app compiles and builds**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean.

- [ ] **Step 3: Verify end to end against the real app**

Run: `npm run dev`, open a Trip at `http://localhost:3001/trips/<id>`, and check each of these:

1. Type "add breakfast at 8am on the first day" — a block appears, the summary shows, Undo is offered.
2. Tap Undo — the block disappears.
3. Add two blocks that overlap — the amber clash card appears with numbered options, and nothing was written.
4. Tap an option — the clash resolves and the itinerary updates.
5. Confirm an estimated time renders lighter than a pinned one.

- [ ] **Step 4: Commit**

```bash
git add src/components/itinerary/chat-panel.tsx
git commit -m "feat: add itinerary chat panel with clash resolution"
```

---

## Task 14: Photo upload

**Files:**
- Modify: `src/components/itinerary/chat-panel.tsx`

- [ ] **Step 1: Create the storage bucket**

In the Supabase dashboard, create a private Storage bucket named `trip-chat-images`. Add a policy allowing authenticated users to insert.

- [ ] **Step 2: Add the file input to the chat panel**

In `src/components/itinerary/chat-panel.tsx`, add this handler inside the component, above the `return`:

```tsx
  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result).split(',')[1]
      startTransition(async () => {
        setResult(await sendChatMessage(tripId, 'Add what is in this photo.', base64))
      })
    }
    reader.readAsDataURL(file)
  }
```

Then add this input inside the `<form>`, before the text input:

```tsx
          <label className="flex min-h-[44px] cursor-pointer items-center rounded-lg border border-border px-3 text-sm">
            Photo
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
                event.target.value = ''
              }}
            />
          </label>
```

- [ ] **Step 3: Verify end to end**

Run `npm run dev`, open a Trip, and upload a screenshot of a flight confirmation. Expected: blocks appear with `Booked` badges and times at full weight, because a confirmation sets `is_locked` and `time_source: 'pinned'`.

- [ ] **Step 4: Commit**

```bash
git add src/components/itinerary/chat-panel.tsx
git commit -m "feat: add photo upload to itinerary chat"
```

---

## Task 15: Link Trips to the itinerary and update docs

**Files:**
- Modify: `src/components/trips/trip-card.tsx`
- Modify: `STATUS.md`
- Modify: `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: Make trip cards link to the detail page**

Open `src/components/trips/trip-card.tsx`. Add the import and wrap the card's
outermost element in a `Link`, keeping whatever classes it already has:

```tsx
import Link from 'next/link'

// …inside the component's return, wrapping the existing markup:
<Link href={`/trips/${trip.id}`} className="block">
  {/* existing card markup, unchanged */}
</Link>
```

- [ ] **Step 2: Clear the stale migration warning**

In `STATUS.md`, delete the "Manual step still required" line near the top and the "Pending production database action" block. Migrations 005, 006 and 007 are confirmed applied. Add migration 010 to the migrations list.

- [ ] **Step 3: Update the project context**

In `docs/PROJECT_CONTEXT.md`:
- Under "What Is Incomplete Or Broken", remove "No dedicated `ItineraryItem` table exists yet" and "Trip planning UI is still basic".
- Add an "Itinerary" section documenting `itinerary_blocks` and `trip_chat_messages`, and note that Block is now part of the product vocabulary.
- Add `ANTHROPIC_API_KEY` to the Vercel environment variable list.

- [ ] **Step 4: Run the full check**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/trips/trip-card.tsx STATUS.md docs/PROJECT_CONTEXT.md
git commit -m "docs: record itinerary feature and clear stale migration notes"
```

---

## Verification checklist

Before calling this done:

- [ ] `npm test` — all tests pass
- [ ] `npx tsc --noEmit` — no type errors
- [ ] `npm run build` — production build succeeds
- [ ] Typing an instruction edits the itinerary and offers Undo
- [ ] Undo restores the previous state
- [ ] An overlapping edit shows the clash card and writes nothing
- [ ] Tapping a resolution option clears the clash
- [ ] Typing a free-text answer to a clash also works
- [ ] A photo of a confirmation produces locked blocks with pinned times
- [ ] Estimated times render visibly lighter than pinned ones
- [ ] The second Dreamlist member can open the same Trip and see the itinerary
- [ ] A place added by name gets coordinates, so the travel-time check fires on it
- [ ] Scheduling a saved Idea moves its status to `scheduled` on the Ideas page
