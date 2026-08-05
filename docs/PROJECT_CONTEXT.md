# We Should Go - Project Context

Last updated: 2026-05-20

## App Vision

We Should Go is a private/shared travel inspiration app built around Dreamlists.

A Dreamlist is the shared or personal place where travel Ideas live. Users save TikTok, Instagram, and public Facebook reels as Ideas, keep future trip inspiration together, and later turn those Ideas into Trips and itinerary plans.

The core emotional idea is:

- Save places you dream of visiting one day.
- Keep capture effortless.
- Keep organisation optional.
- Let planning happen later.

The app should feel like a polished mobile travel inspiration app, not an admin dashboard.

## Current Product Language

- App name: We Should Go.
- Shared/personal container: Dreamlist.
- Saved reels/place saves: Ideas.
- A reel is an Idea inside a Dreamlist.
- A Trip belongs to a Dreamlist.
- Do not use “Inbox”, “Board”, or “Workspace” in visible UI.
- The database can still use `reel_submissions` and status value `inbox` internally when safer.

Example copy:

- “My Dreamlist”
- “Thien & Susan’s Dreamlist”
- “Save a new idea”
- “Copy to Dreamlist”
- “Invite someone to this Dreamlist”

## Current Architecture

### App

- Next.js 16 app hosted on Vercel.
- Production app URL: `https://www.weshouldgo.app`.
- Supabase auth and database.
- Railway Python worker handles reel extraction.
- Vercel app and Railway worker communicate through Supabase:

`Vercel app -> extraction_jobs row -> Railway worker -> reel_submissions update -> Vercel app reads updated Idea`

### Auth

- Login uses Supabase email magic links.
- Auth callback route is `/auth/callback`.
- Magic-link redirects should use `NEXT_PUBLIC_SITE_URL`, currently intended as:

`https://www.weshouldgo.app/auth/callback`

- Supabase Auth settings must allow `https://www.weshouldgo.app/auth/callback`.

### Dreamlists

Implemented additively in `supabase/migrations/008_dreamlists.sql`.

Tables:

- `dreamlists`
- `dreamlist_members`
- `dreamlist_invites`

Rules:

- A user can belong to many Dreamlists.
- A Dreamlist has many members.
- A Dreamlist has many Ideas/ReelSubmissions.
- A Dreamlist has many Trips.
- Every new profile automatically gets a personal `My Dreamlist`.
- Access is scoped by Dreamlist membership.
- Dreamlist-level sharing only for v1.

### Ideas / Reels

Implemented as `reel_submissions`.

Important fields:

- `id`
- `dreamlist_id`
- `submitted_by_user_id`
- `submitted_by_label`
- `platform`
- `url`
- `url_hash`
- `caption_text`
- `notes`
- `place_name`
- `google_place_id`
- `google_photo_name`
- `address`
- `latitude`
- `longitude`
- `destination_city`
- `destination_country`
- `destination_region`
- `place_type`
- `tags`
- `is_favourite`
- `priority`
- `confidence`
- `trip_id`
- `status`
- `thumbnail_url`
- `source_idea_id`
- `copied_from_dreamlist_id`
- `copied_by_user_id`
- `created_at`
- `updated_at`

Notes:

- UI calls saved reels “Ideas”.
- Status `inbox` may remain as an internal DB value.
- iOS Shortcut currently saves to the user’s personal `My Dreamlist` by default.
- In-app paste box saves to the currently selected Dreamlist.
- A single source reel can produce multiple Ideas when multiple places are mentioned.
- Multi-place Ideas keep the original clip URL and additional generated rows point `source_idea_id` back to the initially submitted row.
- Ideas can be copied to another Dreamlist the current user belongs to without moving/removing the original.

### Trips

Implemented as `trips`.

Important fields:

- `id`
- `dreamlist_id`
- `name`
- `destination_city`
- `destination_country`
- `destination_region`
- `start_date`
- `end_date`
- `status`
- `created_by_user_id`
- `created_at`
- `updated_at`

Trip planning UI is still basic.

## What Has Been Built

### Core App

- Email magic-link login.
- Auth callback route.
- Middleware/proxy protects page routes.
- API routes bypass browser login redirects.
- Ideas page with paste box and Idea feed.
- Dreamlist switcher.
- Mobile bottom navigation: Ideas, Trips, Dreamlists, Settings.
- Mobile Dreamlist selector below header.
- Polished single-column mobile Idea card layout.
- Desktop horizontal nav preserved.
- Grouped country view and flat view toggle.
- Filter chips.
- Stats strip.
- Soft reject / unreject.
- Permanent delete through card action menu.
- Favourite toggle.
- Needs-review section with inline manual place-name resolution.
- Detail drawer for saved Ideas.
- Google Maps link support.
- Google Places photo fallback through `/api/place-photo`.
- Settings page with personal API token.
- Token copy and regenerate UI.
- Dreamlists page.
- Create shared Dreamlist.
- Copy invite link.
- `/join/[token]` flow.
- Basic Trips list and new Trip form scoped to Dreamlist.
- PWA manifest and Android share target route.
- Custom app icon assets in `public/icons`.

### APIs

- `POST /api/ingest-reel`
  - Accepts browser session auth or Bearer token auth.
  - Used by web paste box and iOS Shortcut.
  - Strictly validates TikTok, Instagram, and Facebook reel hostnames and paths.
  - Limits each authenticated user to 10 new reels per minute and 100 per day.
  - Deduplicates by `url_hash` within a Dreamlist.
  - Creates `reel_submissions`.
  - Creates `extraction_jobs`.
  - Accepts iOS Shortcut URL values as either a string or an array.
  - Uses provided `dreamlist_id` when present and permitted.
  - Falls back to user’s personal Dreamlist when no Dreamlist is provided.
- `GET /api/shortcut/dreamlists`
  - Accepts Bearer token auth.
  - Returns the user’s Dreamlists, labels, and `ids_by_label` for the dynamic iOS Shortcut Dreamlist picker.
- `POST /api/share-target`
  - Android PWA share target.
  - Saves to user’s personal Dreamlist.
- `GET /api/place-photo`
  - Server-side Google Places photo proxy.

### Railway Worker

Worker lives in `worker/`.

It:

- Polls Supabase `extraction_jobs`.
- Claims one job at a time using `claim_extraction_job()`.
- Extracts reel content using `yt-dlp`.
- Uses `ffmpeg` for frames when possible.
- Uses `faster-whisper` for transcript.
- Falls back for blocked TikToks via TikTok oEmbed.
- Falls back to page metadata scraping when needed.
- Sends frames/thumbnail/text to Claude.
- Asks Claude for every distinct place/venue mentioned, so one source clip can fan out into multiple Idea rows.
- Caps fallback confidence at `0.7`.
- Marks low-confidence results as `needs_review`.
- Resolves places through Google Places Text Search.
- Saves Google place ID, Google photo name, address, latitude, and longitude.
- Saves thumbnail URL when available.
- Marks extraction jobs as completed or failed.

## Database / Migrations

Existing migrations:

- `001_initial_schema.sql`
- `002_explicit_insert_policies.sql`
- `003_fix_recursive_trip_policies.sql`
- `004_extraction_jobs.sql`
- `005_google_place_id.sql`
- `006_thumbnail_url.sql`
- `007_google_photo_name.sql`
- `008_dreamlists.sql`
- `009_ingestion_rate_limits.sql`

Important:

- Run migrations manually in Supabase SQL Editor when not using Supabase CLI.
- Migrations through `009_ingestion_rate_limits.sql` are required for the current app.
- The example seed file `supabase/seed_dreamlists_example.sql` is optional and must be edited to use real signed-up user emails before running.

## Environment Variables

Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL=https://www.weshouldgo.app`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_PLACES_API_KEY`

Railway:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_PLACES_API_KEY`

Local only:

- `.env.local`
- `worker/.env`

Do not commit real env files.

## Current Performance Notes

Recently improved:

- Global nav no longer fetches Supabase Dreamlists.
- Dreamlist switcher now lives on pages that already load Dreamlists.
- Ideas/Trips navigation preserves the `dreamlist` query parameter.
- Header is less server-dependent.

If navigation still feels slow, next likely optimisations:

- Add lightweight route-level loading states.
- Reduce page queries further.
- Consider client-side cached Dreamlist membership state.
- Inspect Vercel function timing and Supabase query timing before upgrading Vercel.

## What Is Incomplete Or Broken

- Instagram thumbnails can still be unreliable.
- Older Ideas may be missing:
  - `google_place_id`
  - `google_photo_name`
  - `thumbnail_url`
  - address/lat/lng
- No automated backfill exists yet.
- Manual needs-review resolution currently does not re-run Google Places resolution.
- No dedicated `ItineraryItem` table exists yet.
- Trip planning UI is still basic.
- No map view yet.
- No in-app notifications.
- No in-app messaging.
- No Collections.
- Google API cost should be controlled with budget alerts and quotas before wider sharing.

## Do Not Build Yet

- No Collections.
- No public feed.
- No payment features.
- No complex route optimisation.
- No TikTok/Instagram browser scraping yet.
- No social/friend activity feed.
- No trip-level permissions yet.
- No reel-to-user sharing.
- No in-app direct messaging.
- No notifications yet.

## Tomorrow Start Here

1. Confirm Vercel has `NEXT_PUBLIC_SITE_URL=https://www.weshouldgo.app`.
2. Confirm Supabase Auth has `https://www.weshouldgo.app/auth/callback` in allowed redirect URLs.
3. Test magic-link login from another phone.
4. Test iOS Shortcut save:
   - It should save into personal `My Dreamlist`.
5. Test in-app paste save:
   - It should save into selected Dreamlist.
6. Test shared Dreamlist invite flow:
   - Create shared Dreamlist.
   - Copy invite link.
   - Open on second phone.
   - Log in.
   - Confirm the second user sees shared Ideas and Trips.
7. Test Ideas -> Trips navigation speed on mobile after the latest nav optimisation.
8. If still slow, inspect Vercel/Supabase timings before considering paid Vercel changes.

## Notes For Next Session

- Keep Dreamlist as the top-level product concept.
- Keep Ideas as the saved reel/place concept.
- Keep capture simple.
- Prefer small reliability/performance fixes over new feature surface.
- If images are poor, inspect saved row fields before changing UI.
- If Railway says a job is done but UI looks stale, check migrations, columns, and deployment freshness.
