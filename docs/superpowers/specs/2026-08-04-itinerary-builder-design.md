# Conversational Itinerary Builder — Design

Date: 2026-08-04
Status: Approved, not yet implemented

## Summary

Add a chat-driven itinerary builder to We Should Go. A Trip gets a day-by-day
itinerary with real clock times. The user edits it by typing an instruction
("move dinner back an hour and add a market in the morning") or uploading a
photo (a flight confirmation, a screenshot of a restaurant). Claude returns
structured patch operations rather than regenerating the itinerary, so edits
are surgical and reviewable.

This closes the gap named in `docs/PROJECT_CONTEXT.md` — "No dedicated
ItineraryItem table exists yet. Trip planning UI is still basic."

### Product language

Per `docs/PROJECT_CONTEXT.md`, visible UI uses **Dreamlist**, **Idea**, and
**Trip**. This document adds one term:

- **Block** — a single entry on a Trip day. A meal, a flight, a place pulled
  from an Idea, a note. Internally `itinerary_blocks`.

Do not use "reel", "inbox", "board", or "workspace" in visible UI.

## Decisions

Each of these was chosen deliberately; the rejected alternative is recorded so
a future session doesn't relitigate it.

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Time model | Real clock times on every block | Loose morning/afternoon/evening buckets — rejected, user wants precision and travel-time checking |
| Guessed vs chosen times | `time_source` enum: `pinned` / `estimated` | A single time field — rejected, the model inventing a confident-looking 10:30 is the main risk of clock times |
| When edits apply | **Always ask on any clash.** Clean edits apply instantly with Undo | Auto-resolving obvious clashes — rejected, user wants nothing moved without a yes |
| Who detects clashes | Deterministic validator in code | Asking the model to check — rejected, the model can forget; code cannot |
| Who writes clash options | Fixed set, code-generated | Claude-written options — rejected for v1 on latency (every clash stops and asks, so a ~2s pause recurs constantly). Swappable later without a migration |
| How the user answers | Tap a numbered option, or type freely | Tap-only — rejected |
| Data model | One `itinerary_blocks` table | (a) Keeping `trip_anchors` separate — rejected, every clash check becomes a two-table union to preserve a distinction `is_locked` already captures. (b) JSONB per day — rejected, loses the FK to Ideas and lets two people clobber each other's days |
| Time storage | `date` + bare `time`, local wall-clock | `timestamptz` — rejected, forces conversion on every read and gets Osaka wrong when planning from Sydney |
| Provider | Anthropic API, `claude-opus-5` | Claude CLI backed by a subscription — not a permitted use. OpenAI — viable but adds a second provider when the worker is already on Claude. ChatGPT Pro grants no API access |
| Photo path | Synchronous, straight through the Vercel route | The Railway worker — rejected, the worker exists for `yt-dlp`/`ffmpeg`/Whisper, which a screenshot needs none of |

## How the app works

End to end, in order.

1. **The user opens a Trip.** `/trips/[id]` loads the Trip, its
   `itinerary_blocks` grouped by `day_date`, and the recent
   `trip_chat_messages`. The itinerary renders as a vertical timeline with
   times down the left. Times the user set, or that came from a booking, render
   at full weight; times Claude estimated render lighter.

2. **The user types an instruction** into the chat panel — a bottom sheet on
   mobile, a sidebar on desktop. For example: *"move dinner back an hour and
   add a market in the morning"*.

3. **The server builds the Claude request.** System prompt (block schema, the
   five patch operations, and house rules) sits behind a
   `cache_control` breakpoint. After it: the current itinerary as JSON
   including block IDs, the Trip's own Ideas that aren't yet scheduled, the
   recent chat turns, and the user's message.

4. **Claude returns `{ patches[], summary }`** using structured outputs
   (`output_config.format` with a strict schema), so the response is
   guaranteed-parseable JSON rather than prose to be regexed.

5. **The patches apply to an in-memory copy** of the itinerary. Nothing has
   touched the database yet.

6. **The validator runs over the affected days only.** It is plain
   TypeScript — no model involved. It checks for overlaps, cascade collisions,
   locked-block hits, impossible travel times, closed-when-you-arrive, and
   day overflow past midnight.

7. **If the result is clean:** the patches commit inside one transaction,
   `trips.version` increments, and the chat message is stored with both the
   patch and its inverse. The UI animates the changed blocks and shows a
   summary line with an **Undo** button.

8. **If the validator finds any clash:** nothing commits. The in-memory copy is
   discarded. The chat returns the clash description plus a numbered list of
   resolutions — push the later blocks down, swap the two, shorten the earlier
   one, move it to another day, allow the overlap. The user taps one, or types
   what they'd rather do, and the flow returns to step 3.

9. **Undo** applies the stored inverse patch. It is a normal patch application,
   so it runs through the same validator and the same commit path.

10. **Photo upload follows the identical path.** The image goes to Supabase
    Storage for the chat record, and the same request that stores it sends the
    image to Claude. Vision returns the same `Patch[]` shape a typed message
    does — so steps 5 through 9 are unchanged. A flight confirmation becomes
    locked, `pinned`-time blocks with a `confirmation_ref`; a restaurant
    screenshot becomes a place block that then gets resolved against Google
    Places for coordinates and opening hours.

11. **Ideas flow into the itinerary.** Because a block can carry a
    `reel_submission_id`, "add that beach club Susan saved" resolves against
    the Trip's Dreamlist and links the block back to the Idea. The Idea's
    `status` moves to `scheduled`.

12. **The second person sees it.** Access is by Dreamlist membership, which
    migration 008 already established. `trips.version` guards concurrent edits:
    a patch computed against a stale version is rejected and re-run against
    fresh state rather than overwriting.

## Schema

New migration: `supabase/migrations/010_itinerary_blocks.sql`.

```sql
create type public.block_type as enum (
  'place', 'meal', 'transit', 'flight', 'hotel', 'event', 'note'
);
create type public.time_source as enum ('pinned', 'estimated');

create table public.itinerary_blocks (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid references public.trips(id) on delete cascade not null,

  -- Position. day_date is authoritative: a 00:30 nightcap still belongs to
  -- the previous day. start_time is local wall-clock at the destination --
  -- no timezone conversion anywhere in this feature.
  day_date            date not null,
  start_time          time,                    -- null = unscheduled, in the day's loose tray
  duration_min        integer,
  time_source         public.time_source not null default 'estimated',
  sort_order          integer not null default 0,

  -- Content
  title               text not null,
  type                public.block_type not null default 'place',
  notes               text,

  -- Locked blocks are never moved without explicit confirmation.
  is_locked           boolean not null default false,
  confirmation_ref    text,

  -- Provenance and place data
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

-- Optimistic concurrency for two people editing one Trip.
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
```

RLS reuses the helpers migration 008 already defines — no new policy logic:

```sql
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
```

### Removals in the same migration

- `trip_anchors` — absorbed into `itinerary_blocks` as `is_locked` blocks with
  a `confirmation_ref`. Currently unused, so no data migration needed.
- `trip_members` — vestigial. `is_trip_member()` has checked Dreamlist
  membership since migration 008; this table is no longer read.
- `trip_days.scheduled_items` — replaced by `itinerary_blocks`. `trip_days`
  survives as the per-day container for notes and accommodation.

This migration is destructive.

**Schema state verified 2026-08-05:** all migrations through 008 are applied.
Confirmed by column counts — `reel_submissions` has 31 columns, which requires
005, 006 and 007; `trips` has 12, which requires 008. `STATUS.md` still carries
a "pending production database action" note for 005; that note is stale.

The three targets are present and unmodified: `trip_anchors` (9 columns),
`trip_members` (2), `trip_days` (4, so `scheduled_items` is still there).

Before running, confirm the dropped objects are actually empty with real
counts — the dashboard's row estimates read `pg_class.reltuples`, which is only
refreshed by `ANALYZE`, so `0` there can also mean "never analysed":

```sql
select count(*) from trip_anchors;
select count(*) from trip_members;
select count(*) from trip_days where cardinality(scheduled_items) > 0;
```

### Idea status

`reel_submissions.status` already includes `scheduled`. Adding a block that
references an Idea sets that status; removing the last block referencing it
returns the Idea to `saved`.

## Patch operations

```ts
type Patch =
  | { op: 'add_block';    day: string; block: NewBlock }
  | { op: 'update_block'; id: string; fields: Partial<Block> }
  | { op: 'move_block';   id: string; day?: string; start_time?: string }
  | { op: 'remove_block'; id: string }
  | { op: 'reorder_day';  day: string; block_ids: string[] }
```

`move_block` is formally a subset of `update_block`, but it gets its own
operation because it is the one the validator scrutinises hardest — moves are
where clashes originate, and a distinct op keeps that check explicit.

Every patch has a mechanical inverse, which is what makes Undo cheap:

| Patch | Inverse |
|---|---|
| `add_block` | `remove_block` with the new ID |
| `remove_block` | `add_block` with the captured prior state |
| `update_block` | `update_block` with the prior field values |
| `move_block` | `move_block` back to the prior day and time |
| `reorder_day` | `reorder_day` with the prior ID order |

## The validator

Plain TypeScript, `src/lib/itinerary/validate.ts`. Takes a day's blocks,
returns `Clash[]`. Never calls a model.

| Check | Fires when |
|---|---|
| Overlap | Two blocks' time ranges intersect |
| Cascade collision | A move pushes a block into a following one |
| Locked-block hit | Any of the above involves `is_locked = true` |
| Travel time | Gap between consecutive blocks is less than the estimated transit time |
| Closed on arrival | `start_time` falls outside `opening_hours` for that weekday |
| Day overflow | A block is pushed past midnight |

Travel time uses the haversine distance between stored coordinates with a
crude mode assumption — walking under 1km, otherwise transit at a city-average
speed. This deliberately stays crude: `PROJECT_CONTEXT.md` lists "no complex
route optimisation" under Do Not Build Yet. It only needs to catch "that's on
the other side of the city," not produce accurate ETAs.

Blocks with null coordinates skip the travel check rather than blocking.

## The chat call

Model: `claude-opus-5`.

**Prompt structure**, ordered for cache stability:

1. System prompt — block schema, the five patch ops, and house rules.
   `cache_control` breakpoint sits at the end of this block.
2. Current itinerary as JSON, with block IDs.
3. The Trip's unscheduled Ideas, so the model can reference saved places.
4. Recent chat turns.
5. The user's message, and the image if there is one.

**Only the system prompt caches.** The itinerary changes after every applied
edit, so it cannot be part of a stable prefix. At ~2,000 system tokens it is
comfortably over Opus 5's 512-token minimum.

**Expected cost:** roughly 2.6¢ per edit, roughly 5¢ per photo (Opus 5 is
high-resolution vision, up to 4,784 tokens per image). A heavily-planned trip
of ~300 edits and ~60 photos lands around $10–12. The Railway worker's
existing Idea extraction on `claude-sonnet-4-6` is unaffected.

## Photo ingestion

Photos do **not** use the Railway worker. The worker exists to run `yt-dlp`,
`ffmpeg`, and Whisper over video, which a screenshot does not need. Chat
photos go synchronously through the Vercel route.

```
photo -> Supabase Storage (chat record)
      -> base64 in the same Claude call that returns the patches
      -> same validator -> same commit path
```

| Uploaded | Produces |
|---|---|
| Flight or hotel confirmation | `is_locked` blocks, `time_source: 'pinned'`, `confirmation_ref` set |
| Restaurant screenshot | A place block, then resolved via Google Places for `google_place_id`, coordinates, `opening_hours` |
| A friend's text recommendation | An unscheduled block in the day's loose tray |
| A handwritten list | Several blocks at once |

Photos are the highest-risk input — a misread departure time matters more than
a misread restaurant name. Two guards: extraction returns a `confidence` score
(the same pattern `reel_submissions.confidence` already uses to drive the
needs-review flow), and low-confidence blocks land visibly flagged. Clash
handling is unchanged — a confirmation that collides with an existing booking
stops and asks like any other edit.

## Google Places

`opening_hours` is a new field on the existing Places lookup. The worker's
`worker/resolve_place.py` already performs Text Search; the itinerary path
needs the same resolution server-side in the Next.js app for places that
arrive by photo rather than by Idea.

`PROJECT_CONTEXT.md` flags that Google API cost needs budget alerts and quotas.
Adding `opening_hours` to the requested field mask increases per-call cost.
Cache resolved place data on the block rather than re-fetching.

## UI

`/trips/[id]` is greenfield — no existing page to work around.

- **Timeline**, vertical, times down the left edge. Estimated times render
  lighter than pinned ones, so a time the user chose never looks like one the
  model invented.
- **Loose tray** per day for blocks with a null `start_time`.
- **Chat panel** — bottom sheet on mobile using `@base-ui/react` Drawer (the
  pattern already working in `src/components/inbox/detail-drawer.tsx`),
  sidebar on desktop.
- **Change animation** on blocks touched by the last applied patch.
- **Undo** on the summary line of any applied edit.
- **Clash card** with numbered options and a free-text fallback.
- Follows the existing design system — Libre Bodoni for place names, Geist Sans
  for UI chrome, the travel colour tokens in `globals.css`.

## Error handling

| Failure | Response |
|---|---|
| Patch references a non-existent block ID | Reject, re-run once with the error fed back, then surface plainly |
| Stale `trips.version` at commit | Reject and re-run against fresh state; the user sees a brief retry, not a conflict dialog |
| Anthropic API error or rate limit | Keep the user's message in the thread, show the error, offer retry — never lose input |
| Google Places lookup fails | Block is created without coordinates; travel-time and hours checks skip it rather than blocking |
| Vision extraction low confidence | Block lands flagged for review rather than silently |

## Out of scope for v1

- **A household preferences block in the system prompt.** Deferred
  deliberately. Without it, an open-ended instruction like "add somewhere for
  dinner" still has real context to work from — the Trip's unscheduled Ideas
  and what is already on the itinerary — it just won't know standing facts
  like a home airport or dietary constraints. Adding it later is a text field
  and a prompt section, not a migration.
- Claude-written or Claude-ranked clash options (the validator's option set is
  swappable later without a migration)
- Routing-API travel times — the distance heuristic stands
- Map view
- Offline access
- Booking or price lookups
- Trip-level permissions — Dreamlist membership remains the access boundary,
  consistent with `PROJECT_CONTEXT.md`
- Automatic itinerary generation from scratch. Everything is user-initiated

## Risks

1. **Migration 010 is destructive** and drops three things. Schema state was
   verified on 2026-08-05 — everything through 008 is applied, and all three
   drop targets are present and unmodified. Remaining step is confirming they
   hold no rows (see the Schema section), then running against a branch first.
2. **The model inventing times** is the core risk of the clock-time model.
   `time_source` mitigates it visually, but the system prompt must also be
   explicit that unknown times are estimates.
3. **"Always ask on any clash" could feel naggy** once real trips generate
   real clashes. If it does, the fix is narrowing what counts as a clash, not
   moving to auto-resolve — that decision was explicit.
4. **Google Places cost** rises with the added `opening_hours` field and the
   new server-side resolution path. Set quotas first.
