# We Should Go - Project Context

Last updated: 2026-05-20

## App Vision

We Should Go is a private travel reel inbox and itinerary planner.

The core use case is saving TikTok and Instagram travel reels sent by my wife and friends before trips exist. The global inbox is the primary product surface. Trips form on top of that inbox later, once there is enough saved inspiration to plan around.

The product principle is:

- Capture should be effortless.
- Organisation should be optional.
- Planning should happen later.

The home screen should stay simple: a paste box plus a recent saves feed. The app should feel like a lightweight shared travel memory/inspiration inbox, not a complex dashboard.

## Final Product Decisions

- No Collections in v1.
- Use tags instead of Collections.
- `submittedBy` / `submitted_by_label` is metadata, not a bucket.
- Reels have an optional `tripId` / `trip_id`.
- Trips can start as `idea`, then move to `planning`, `booked`, or `completed`.
- Reel statuses are conceptually `inbox`, `saved`, `scheduled`, and `rejected`.
- Current code also uses `needs_review` to surface low-confidence extraction results.
- Use structured destination fields, not only tags.
- Add priority/favourite for important reels.
- Home screen should be simple: paste box plus recent saves feed.

## Data Model Decisions

### Reel

Implemented as `reel_submissions`.

Fields currently used or agreed:

- `id`
- `submitted_by_user_id`
- `submitted_by_label`
- `platform`: `instagram`, `tiktok`, or `other`
- `url`
- `url_hash` for per-user deduplication
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
- `place_type`: `cafe`, `hotel`, `restaurant`, `viewpoint`, `experience`, or `other`
- `tags`
- `is_favourite`
- `confidence`
- `trip_id`
- `status`: `inbox`, `saved`, `scheduled`, `rejected`, plus current `needs_review`
- `thumbnail_url`
- `created_at`

### Trip

Implemented as `trips`.

Fields currently used or agreed:

- `id`
- `name`
- `destination_city`
- `destination_country`
- `destination_region`
- `start_date`
- `end_date`
- `status`: `idea`, `planning`, `booked`, or `completed`
- `created_by_user_id`
- `created_at`

### ItineraryItem

Not fully implemented as a dedicated table yet.

Current representation:

- `trip_days.scheduled_items` stores an ordered array of `reel_submission` IDs.

Future likely model:

- `id`
- `trip_id`
- `trip_day_id` or date
- `reel_submission_id`
- `title`
- `location`
- `start_at`
- `end_at`
- `notes`
- `sort_order`

### FixedAnchor

Implemented as `trip_anchors`.

Used for fixed bookings or immovable trip commitments.

Fields currently used:

- `id`
- `trip_id`
- `type`: `flight`, `hotel`, `event`, or `reservation`
- `title`
- `start_at`
- `end_at`
- `location`
- `notes`
- `created_at`

### User / Member

Users are Supabase auth users with a `profiles` row.

`profiles` fields:

- `id`
- `email`
- `display_name`
- `personal_api_token`
- `created_at`

Trip sharing is scaffolded through `trip_members`.

`trip_members` fields:

- `trip_id`
- `user_id`

## What Has Already Been Built

### App

- Next.js 16 app.
- Supabase auth and database.
- Login page with email magic link.
- Auth callback route.
- Middleware/proxy protecting page routes.
- API routes bypass login redirects so API callers get JSON errors.
- Global inbox page.
- URL paste input for TikTok/Instagram reels.
- Inbox feed with cards.
- Grouped country view and flat view toggle.
- Filter chips.
- Stats strip.
- Soft reject / unreject.
- Favourite toggle.
- Needs-review section with inline manual place-name resolution.
- Detail drawer for saved places.
- Google Maps link support.
- Google Places photo fallback through a server-side Vercel proxy.
- Settings page showing personal API token.
- Token copy and regenerate UI.
- Basic trips list and new trip form.
- New trip form can prefill `destination_country` from query params.
- PWA manifest and Android share target route.

### APIs

- `POST /api/ingest-reel`
  - Accepts browser session auth or Bearer token auth.
  - Used by the web paste box and iOS Shortcut.
  - Validates TikTok/Instagram URLs.
  - Deduplicates by `url_hash`.
  - Creates `reel_submissions`.
  - Creates `extraction_jobs`.
  - Accepts iOS Shortcut URL values as either a string or an array.
- `POST /api/share-target`
  - Android PWA share target.
- `GET /api/place-photo`
  - Server-side Google Places photo proxy.
  - Keeps `GOOGLE_PLACES_API_KEY` out of the browser.

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
- Caps fallback confidence at `0.7`.
- Marks low-confidence results as `needs_review`.
- Resolves places through Google Places Text Search.
- Saves Google place ID, Google photo name, address, latitude, and longitude.
- Saves thumbnail URL when available.
- Marks extraction jobs as completed or failed.

### Database / Migrations

Existing migrations:

- `001_initial_schema.sql`
- `002_explicit_insert_policies.sql`
- `003_fix_recursive_trip_policies.sql`
- `004_extraction_jobs.sql`
- `005_google_place_id.sql`
- `006_thumbnail_url.sql`
- `007_google_photo_name.sql`

Important manual production steps:

- Run migrations in Supabase SQL Editor when not using Supabase CLI.
- `005_google_place_id.sql`, `006_thumbnail_url.sql`, and `007_google_photo_name.sql` are especially important for current worker/UI behavior.

### Deployments

- Vercel hosts the Next.js app.
- Railway hosts the Python worker.
- Vercel and Railway do not call each other directly.
- They communicate through Supabase:

`Vercel app -> extraction_jobs row -> Railway worker -> reel_submissions update -> Vercel app reads updated reel`

### Environment Variables

Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
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

## What Is Incomplete Or Broken

- Instagram thumbnails can still be unreliable.
  - Current order is social thumbnail, Google Places photo, gradient fallback.
  - Some older reels may not have `google_photo_name` until backfilled.
- Google Places photo fallback requires:
  - migration `007_google_photo_name.sql`
  - `GOOGLE_PLACES_API_KEY` in both Vercel and Railway.
- Existing older reels may be missing:
  - `google_place_id`
  - `google_photo_name`
  - `thumbnail_url`
  - address/lat/lng
- No automated backfill exists yet.
- No dedicated `ItineraryItem` table exists yet.
- Trip planning UI is still basic.
- Shared trips are only scaffolded through schema/policies, not fully productized.
- Needs-review flow is functional but basic.
- There is no map view yet.
- iOS Shortcut works after simplifying it to send only URL and Bearer token, but the Shortcut itself should be documented/cleaned up after more real testing.
- Google API cost should be controlled with budget alerts and quotas before wider sharing.

## Tomorrow Start Here

1. Confirm production Supabase has migrations `005`, `006`, and `007` applied.
2. Confirm Vercel has `GOOGLE_PLACES_API_KEY`.
3. Confirm Railway has `GOOGLE_PLACES_API_KEY`.
4. Redeploy Vercel and Railway after the latest commit if auto-deploy did not run.
5. Test the iOS Shortcut with one TikTok and one Instagram reel.
6. Check Supabase rows for the new saves:
   - `thumbnail_url`
   - `google_place_id`
   - `google_photo_name`
   - `address`
   - `latitude`
   - `longitude`
   - `confidence`
   - `status`
7. Check Railway logs for extraction failures or Google Places failures.
8. Decide whether to build a small backfill script for older reels.
9. Polish the home feed only after confirming the data path is reliable.
10. Set Google Cloud budget alerts and basic daily quotas for Places Text Search and Place Photo.

## Do Not Build Yet

- No Collections.
- No public feed.
- No payment features.
- No complex route optimisation.
- No TikTok/Instagram browser scraping yet.
- No overbuilt dashboard.
- No major itinerary builder until the inbox capture loop is reliable.
- No social/friend activity feed.
- No heavy map experience before saved places have reliable coordinates.

## Notes For Next Session

- Keep the global inbox primary.
- Avoid turning submitters into separate buckets.
- Avoid over-organising early.
- Prefer small reliability fixes over new feature surface.
- If images are still poor, first inspect saved row fields before changing UI.
- If Railway says a job is done but the UI looks stale, check whether the app has the relevant columns and whether Vercel has redeployed.
