# Conversational Itinerary Builder — Revised Design

Date: 2026-08-05
Status: Core implementation complete locally on 2026-08-05; production migration and acceptance checks pending

## Summary

Add a family-focused itinerary builder to We Should Go. A Trip has a reliable
day-by-day timeline that can always be edited directly. Chat and photo upload
make editing faster, but neither is the only way to use the itinerary.

The defining interaction remains conversational:

> “Move dinner back an hour, add the market Susan saved in the morning, and
> leave enough time to get across town.”

Claude returns a small, typed set of patch operations. The server validates
those operations, enriches new places, checks the final proposal, and commits
all itinerary changes atomically. It never replaces the entire itinerary with
fresh model output.

This feature belongs inside We Should Go rather than in a separate app. The
existing Dreamlists, Ideas, family membership, Google Places data, Supabase
project, authentication and deployment infrastructure are all useful inputs to
an itinerary.

## Product goal

Build a good private itinerary builder for one family. It does not need public
onboarding, payments, marketplace features or general-purpose enterprise
collaboration.

It should be:

- dependable enough to hold confirmed flights, hotels and reservations;
- quick enough to update by typing a sentence;
- able to extract useful details from booking screenshots and photos;
- aware of the family’s standing preferences;
- connected to the Ideas already saved in a Trip’s Dreamlist;
- manually editable whenever the model is wrong or unnecessary;
- clear about which details are confirmed, estimated or uncertain.

## Product language

Visible UI continues to use the existing language:

- **Dreamlist** — the shared or personal container.
- **Idea** — a saved place or activity.
- **Trip** — belongs to a Dreamlist.
- **Block** — one entry in an itinerary, such as a meal, flight, hotel check-in,
  place, activity, transit segment or note.

Do not show “reel”, “inbox”, “board” or “workspace” in itinerary UI.

## Core principles

### 1. The timeline is the source of truth

Chat is an editing tool, not the data model. The structured itinerary in
Postgres is authoritative. Reloading the page must never require replaying a
chat transcript to rebuild the Trip.

### 2. Manual editing is always available

Every Block can be added, edited, moved and removed without using Claude. A
model outage or misunderstanding must not make the itinerary unusable.

### 3. AI makes surgical changes

Claude returns allowlisted patch operations. It cannot write arbitrary rows,
set ownership fields, choose database IDs, update timestamps or replace the
whole itinerary.

### 4. Confirmed and estimated information look different

Times from a user or booking are **pinned**. Times suggested by the model are
**estimated**. Low-confidence photo extraction is visibly flagged. Confirmed
Blocks are locked against accidental movement.

### 5. Writes are atomic

Applying an edit updates Blocks, Trip version, Idea scheduling state and the
edit history in one database transaction. Partial itinerary commits are not
acceptable.

### 6. Uncertain external data produces warnings

Ordinary overlaps and changes to locked bookings require confirmation. Travel
time and regular opening-hours data initially produce warnings because rough
distance estimates and Google’s regular hours can be incomplete or wrong on
special dates.

### 7. Family context is a first-class feature

The app is intentionally opinionated about its family. A Dreamlist can store
home airport, travellers, dietary requirements, preferred pace, transport
preferences, interests and recurring requests. A Trip can override those
defaults.

### 8. Migrations are additive until the feature is proven

The first itinerary migration does not drop `trip_anchors`, `trip_members` or
`trip_days.scheduled_items`. Legacy structures can be removed later in a
separate migration after production use confirms they are unnecessary.

## End-to-end experience

### Opening a Trip

`/trips/[id]` shows every date from `trips.start_date` through
`trips.end_date`, including empty days. Trips without dates show a planning
tray until dates are added.

Each day contains:

- scheduled Blocks ordered by local start time;
- an unscheduled tray for Ideas and notes without a time;
- direct controls to add and edit Blocks;
- warnings attached to the affected Blocks rather than hidden in chat.

The timeline uses the destination’s local wall-clock time for display. The
stored `day_date` is the real local calendar date. An early-morning activity
may be visually grouped with the previous evening, but the database does not
pretend that 00:30 occurred on the previous date.

### Direct editing

The user can tap a Block to edit:

- title and type;
- date, start time and duration;
- notes;
- pinned versus estimated time;
- locked/confirmed status and confirmation reference;
- linked Idea or Google place.

Manual changes use the same patch validator and atomic commit path as chat
changes. This gives Undo and concurrency protection to both interfaces.

### Text chat

The chat panel is a bottom drawer on mobile and a sidebar on desktop. The
server sends Claude:

1. a stable system prompt and strict patch schema;
2. Trip dates, destination and current version;
3. family and Trip-specific preferences;
4. the current Blocks;
5. relevant unscheduled Ideas from the Trip’s Dreamlist;
6. a bounded set of recent chat turns;
7. the current user instruction.

Claude returns `{ summary, patches }`. The server runtime-validates the result,
maps temporary new-block references to server-generated UUIDs, hydrates linked
Ideas from trusted database rows, resolves new places, and validates the
enriched proposal.

If the proposal is clean, it applies immediately and shows Undo.

If it overlaps another Block or changes a locked booking, the proposal is
stored as a pending edit. Nothing is committed to the itinerary. The user can
choose a deterministic resolution, explicitly allow the warning, or type a
different instruction. Resolution buttons operate on the stored proposal;
they do not ask Claude to recreate the original change from memory.

### Photo upload

The browser validates and resizes an image, then uploads it directly to a
private Supabase Storage bucket. Booking images never travel through a base64
Server Action payload.

The server reads the private object, preserves its real MIME type, and sends it
to Claude with the same structured patch schema used by text chat.

Photo-derived changes always open as a reviewable proposal before being
committed. Examples:

| Image | Proposed result |
|---|---|
| Flight confirmation | Locked flight Block with pinned departure details, arrival metadata and confirmation reference |
| Hotel booking | Locked check-in/check-out Blocks or accommodation metadata |
| Restaurant screenshot | Place or meal Block, then Google Places resolution |
| Friend’s recommendation | Unscheduled Block with the original note |
| Handwritten list | Several proposed Blocks, each independently reviewable |

Low-confidence times, dates and confirmation references must be highlighted.
The original image remains private and linked to the chat message for later
checking.

### Using saved Ideas

Claude may reference only Idea IDs included in the trusted request context.
When an Idea is selected, the server copies its place name, address,
coordinates, Google Place ID and other available data from Postgres. Model
output is not trusted to reproduce those fields.

Scheduling state must account for references across every Trip. Removing an
Idea from one Trip must not mark it unscheduled while another Trip still uses
it. Prefer deriving scheduled state from `itinerary_blocks` references; if the
existing status field is maintained, update it transactionally after checking
all references.

### Undo and concurrent family edits

Every applied edit stores the forward patch, inverse patch and Trip version.
For the initial release, Undo applies to the latest compatible edit. It uses
the same validation and atomic database function as a normal change.

`trips.version` protects Thien and Susan from overwriting one another. The
database function compares the expected version before writing. A stale edit
is reloaded and regenerated or returned for review; it is never partially
applied.

## Family preferences

Dreamlist-level defaults should support:

- home airport;
- traveller names;
- dietary needs and allergies;
- preferred daily pace;
- walking tolerance and transport preference;
- interests and commonly requested activities;
- recurring family notes, such as including a Muay Thai gym;
- default day start/end preferences.

Trip-specific preferences can override or add to these defaults. Preferences
are context, not hard rules: the user can always explicitly request something
different.

For v1, a typed JSONB object on the Dreamlist is sufficient. Keep its schema in
application code and runtime-validate it before placing it in a model request.

## Revised data model

### `itinerary_blocks`

One row per Block. Important fields:

- `id`, generated by the server/database;
- `trip_id`;
- `day_date`, the real local start date;
- `start_time`, nullable local wall-clock time;
- `duration_min`, nullable with a positive constraint;
- `sort_order` for unscheduled or same-time ordering;
- `time_source`: `pinned` or `estimated`;
- `title`, `type`, `notes`;
- `is_locked`, `confirmation_ref`, `confidence`;
- optional `timezone` for the start location;
- optional arrival/end metadata for flights and overnight travel;
- `reel_submission_id` for a linked Idea;
- trusted Google Place fields and normalized opening-hours data;
- creator and timestamps.

Flights and overnight travel may end on another date or in another timezone.
They must not be forced through a same-day “past midnight” error. Ordinary
place/meal Blocks can still warn when their duration unexpectedly crosses a
day boundary.

### `trip_chat_messages`

Stores user and assistant turns, image paths, errors and links to edit sets.
User input is saved before the external model call so a timeout never loses the
instruction.

### `itinerary_edit_sets`

Stores one proposed or applied change:

- Trip and originating message;
- expected Trip version;
- status: `pending`, `applied`, `rejected` or `undone`;
- validated forward and inverse patches;
- hard conflicts and soft warnings;
- explicit overrides;
- idempotency key and timestamps.

This record lets a clash card survive refresh and lets a resolution operate on
the exact proposal that caused it.

### Trip and Dreamlist additions

- `trips.version` for optimistic concurrency;
- optional Trip preference overrides;
- Dreamlist family preferences.

### Storage

Create a private `trip-chat-images` bucket in a migration. Storage policies
must scope paths to authenticated members of the related Trip/Dreamlist. Do not
use a general “any authenticated user may upload anywhere” policy.

## Patch contract

The model receives a strict discriminated union. Every object has
`additionalProperties: false`, and every operation requires its relevant
fields.

Conceptually:

```ts
type Patch =
  | { op: 'add_block'; client_ref: string; block: AllowedNewBlockFields }
  | { op: 'update_block'; id: string; changes: AllowedMutableFields }
  | { op: 'move_block'; id: string; day_date: string | null; start_time: string | null }
  | { op: 'remove_block'; id: string }
  | { op: 'reorder_day'; day_date: string; block_ids: string[] }
```

The allowlists exclude IDs, ownership, Trip foreign keys, Google data,
timestamps and other server-managed fields. New IDs are generated after schema
validation. A linked Idea is represented by its ID and hydrated by the server.

The same runtime schema validates model output again before any patch reaches
the domain functions.

## Validation policy

Validation runs after Idea hydration and Google Places enrichment.

### Hard conflicts — require a decision

- overlapping scheduled Blocks;
- changing or removing a locked Block without explicit instruction;
- invalid or non-positive duration;
- date outside the Trip range unless the Trip range is being changed;
- malformed patch references or attempts to update forbidden fields;
- stale Trip version.

### Soft warnings — may be explicitly accepted

- estimated travel gap is too short;
- venue appears closed according to regular hours;
- new place could not be resolved;
- photo extraction has low confidence;
- ordinary non-booking Block crosses midnight;
- destination/timezone data is incomplete.

Opening-hours handling must include overnight periods, 24-hour places and the
fact that regular hours may not reflect holidays or special dates.

## Atomic commit boundary

External model and Google requests happen before the commit. The final database
function must atomically:

1. verify Dreamlist membership;
2. compare `trips.version` with the edit’s expected version;
3. apply deletes/inserts/updates for the validated Block set;
4. update Idea scheduling state safely;
5. mark the edit set applied and store the inverse patch;
6. increment Trip version;
7. write the assistant summary/applied state.

Any database error rolls back all seven steps. The user’s original chat message
is intentionally retained even when the itinerary commit fails.

## Model and cost policy

- Configure the itinerary model through an environment variable rather than
  hardcoding it.
- Start routine text edits on a capable Sonnet model.
- Retry schema failures once with the validation error.
- Escalate difficult instructions or booking images to Opus only when needed.
- Keep output limits appropriate for patches rather than allowing very large
  prose responses.
- Record token usage and estimated cost per request.
- Add a per-user/per-Trip rate limit and an idempotency key to prevent duplicate
  submissions and accidental spend.
- Cache only the stable system prompt; itinerary and chat state are volatile.

## Delivery phases

### Phase 1 — Reliable itinerary foundation

Deliver a useful non-AI itinerary:

- additive schema and RLS;
- family and Trip preferences;
- all Trip days and unscheduled tray;
- direct Block create/edit/move/delete;
- pure patch, time and validation functions with tests;
- atomic database commit and version guard;
- edit history and latest-edit Undo;
- confirmed versus estimated styling.

Success means the family can plan a Trip reliably without Claude.

### Phase 2 — Conversational text editing

Add:

- strict structured patch output and runtime validation;
- bounded conversational history;
- trusted Idea hydration;
- Google Places enrichment before validation;
- clean-edit auto-apply;
- persistent pending edits and deterministic clash resolution;
- soft warning overrides;
- idempotency, rate limits, timeout/error handling and usage tracking;
- mobile chat drawer and desktop sidebar.

Success means common instructions apply the smallest expected change and can be
undone or resolved without losing context.

### Phase 3 — Private photo ingestion

Add:

- private Storage bucket and membership-scoped policies;
- client resize/compression, MIME and size validation;
- direct upload rather than Server Action base64;
- server-side vision call using the stored object;
- reviewable pending proposals for every photo;
- booking confidence indicators and confirmation references;
- cleanup/retention rules for sensitive images.

Success means flight, hotel and restaurant screenshots produce accurate,
reviewable Blocks without exposing or losing the original image.

### Phase 4 — Travel polish and smarter planning

Add only after the first three phases are stable:

- better multi-city, timezone and overnight presentation;
- explicit “build a draft from my saved Ideas” generation;
- drag/reorder and stronger change animations;
- print/export and compact travel-day summary;
- optional routing API if the distance heuristic is insufficient;
- model routing between Sonnet and Opus based on task difficulty;
- operational dashboards for model cost, errors and Google quota;
- later cleanup migration for proven-unused legacy Trip structures.

Success means the itinerary is comfortable to use during a real trip, not only
while planning at home.

## Out of scope

- public feed or public itinerary publishing;
- payments, bookings or live price lookup;
- complex route optimization in the initial phases;
- a separate itinerary application or database;
- trip-level permission systems beyond Dreamlist membership;
- background itinerary generation without a user request;
- destructive removal of legacy Trip tables before production proof;
- full offline synchronization in the first release.

## Main risks and mitigations

1. **Model makes a valid-looking wrong change.** Strict field allowlists,
   direct editing, visible estimates, reviewable photo edits and Undo.
2. **Partial database update corrupts a Trip.** One version-guarded Postgres
   function for every applied edit.
3. **Booking photo exposes sensitive data.** Private storage, scoped policies,
   bounded retention and no base64 logging.
4. **Opening-hours or travel warning is wrong.** Treat these as warnings first;
   preserve explicit user override.
5. **Two family members edit at once.** Expected-version check and retry against
   fresh state.
6. **AI cost grows silently.** Model routing, bounded context/output, rate
   limits and usage logging.
7. **Large scope delays a useful result.** Phase 1 must stand alone as a good
   manual itinerary before conversational features begin.
