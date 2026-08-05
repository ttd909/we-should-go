# We Should Go — Build Status

## Current deployment status

- Production app is live at `https://www.weshouldgo.app/`
- Railway worker is connected to the same Supabase project and successfully polling `extraction_jobs`
- TikTok `yt-dlp` failures now fall back to TikTok oEmbed metadata instead of hard-failing immediately
- Anthropic key issue was fixed in Railway by keeping `ANTHROPIC_API_KEY` as only the Anthropic key value
- Google Places resolution has been added to the worker; production needs `GOOGLE_PLACES_API_KEY` in Railway
- Google Maps links have been added to reel cards, backed by `google_place_id` when available
- Google Places photo fallback has been added; production needs `GOOGLE_PLACES_API_KEY` in Vercel for `/api/place-photo`

**Manual step still required:** run `supabase/migrations/005_google_place_id.sql` in Supabase SQL Editor before the worker can save `google_place_id`.

## Phase 1 — Core app (complete)

**What was built:**
- Next.js 16 app, Supabase for auth + database
- Google OAuth login (`/login`, `/auth/callback`)
- `profiles` table auto-created on signup, includes `personal_api_token` (random 32-byte hex)
- `reel_submissions`, `trips`, `trip_members`, `trip_anchors`, `trip_days` tables with full RLS
- Extraction now runs in the Railway worker; the Vercel app only validates URLs and queues jobs
- `/api/ingest-reel` — accepts URL via web form or Bearer token
- Inbox UI: reel cards, enrichment polling, delete
- Settings page with token display and copy button
- Basic trips create/list

**Files created in Phase 1:**
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_explicit_insert_policies.sql`
- `supabase/migrations/003_fix_recursive_trip_policies.sql`
- `src/app/api/ingest-reel/route.ts`
- `src/app/settings/page.tsx`
- `src/components/settings/copy-token.tsx`
- `src/app/page.tsx`, `src/app/trips/page.tsx`, `src/app/trips/new/page.tsx`
- `src/components/inbox/reel-card.tsx`, `url-input.tsx`, `inbox-poller.tsx`, `delete-reel-button.tsx`
- `src/components/trips/trip-card.tsx`
- `src/lib/types.ts`, `src/lib/utils.ts`, `src/lib/actions/reels.ts`
- `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`
- `src/lib/platform.ts`
- `src/proxy.ts`, `src/app/layout.tsx`, `src/app/globals.css`

---

## Phase 1.5 — Instagram extraction + iOS share-sheet (complete)

**Confirmed working:** end-to-end on local dev. Tested with Instagram reel — extracted place name, city, country, place type, and tags correctly.

### Database

**Created:** `supabase/migrations/004_extraction_jobs.sql`
- `url_hash text` column on `reel_submissions` (SHA-256 of canonical URL, indexed per-user for dedup)
- `needs_review` added to `reel_status` enum
- `extraction_jobs` table: `id`, `reel_submission_id`, `status` (pending/processing/completed/failed), `error_message`, `shortcut_metadata jsonb`, timestamps
- `claim_extraction_job()` stored procedure — `FOR UPDATE SKIP LOCKED`, safe for concurrent workers
- `supabase/migrations/005_google_place_id.sql` adds `google_place_id` for precise Google Maps deep links
- `supabase/migrations/007_google_photo_name.sql` adds `google_photo_name` for Google Places photo fallback

**Pending production database action:** run migration 005 manually in Supabase:

```sql
alter table public.reel_submissions
  add column if not exists google_place_id text;

create index if not exists reel_submissions_google_place_id_idx
  on public.reel_submissions (google_place_id)
  where google_place_id is not null;
```

### Railway worker

**Created:** `worker/` (Python service inside the app repo)

| File | Purpose |
|---|---|
| `worker/main.py` | Polling loop. Calls `claim_extraction_job()` RPC, dispatches to `process_job()`. Enforces confidence cap (0.7 for fallback path, `needs_review` status below 0.5). Resolves Google place ID/address/lat/lng when configured. |
| `worker/extract_reel.py` | Two-path extraction. Primary: yt_dlp Python API (no subprocess, avoids PATH issues) → ffmpeg frames (gracefully skipped if ffmpeg not installed) → faster-whisper transcript. Fallback: TikTok oEmbed or OG scraping + shortcut metadata backstop. |
| `worker/claude_extract.py` | Sends up to 5 frames or a thumbnail + all available text to Claude. Handles both primary and fallback input shapes. |
| `worker/resolve_place.py` | Google Places Text Search resolver for place ID, address, latitude, and longitude. |
| `worker/requirements.txt` | `anthropic`, `supabase`, `faster-whisper`, `yt-dlp`, `requests`, `python-dotenv` |
| `worker/Dockerfile` | Python 3.11-slim + ffmpeg. Used on Railway. |
| `worker/railway.toml` | Railway deploy config. |
| `worker/.env.example` | Template for local dev. |
| `worker/.env` | Local dev secrets (gitignored). |
| `worker/.gitignore` | Excludes `.env`, `__pycache__`, `.venv`. |

**Notable fixes applied during local testing:**
- Switched yt_dlp from subprocess to Python API — avoids Windows PATH issues
- Changed format from `bestvideo+bestaudio` (requires ffmpeg merge) to `best` (single pre-muxed file)
- Added `encoding='utf-8'` when reading yt_dlp info JSON — fixes Windows cp1252 default
- ffmpeg frame extraction degrades to `[]` rather than crashing when ffmpeg is not installed
- Added `python-dotenv` so the worker loads `worker/.env` automatically
- Added Claude connection retries for transient Anthropic API connection errors
- Added TikTok oEmbed fallback when TikTok video download is blocked or unavailable
- Added Google Places Text Search resolution after Claude extraction

### Vercel app changes

| File | Status | What changed |
|---|---|---|
| `src/app/api/ingest-reel/route.ts` | **Modified** | Strict TikTok/Instagram/Facebook reel URL validation, database-backed per-user rate limits, SHA-256 dedup, accepts `page_title`/`page_description`/`thumbnail_url`, writes `extraction_jobs` row, returns `{ job_id, message }`. Removed `after(enrichReel())`. |
| `src/app/api/share-target/route.ts` | **Created** | Android PWA share target. Session-authed. Deduplicates, queues extraction job, redirects to `/?saved=true`. |
| `public/manifest.json` | **Created** | PWA manifest with `share_target` for Android. |
| `src/app/layout.tsx` | **Modified** | Added `metadata.manifest = '/manifest.json'`. |
| `src/lib/platform.ts` | **Created** | Strict shared TikTok/Instagram/Facebook reel URL parsing and canonicalisation for app API routes. |
| `src/lib/actions/settings.ts` | **Created** | `regenerateToken()` server action — generates new 32-byte hex token, updates DB, revalidates `/settings`. |
| `src/components/settings/copy-token.tsx` | **Modified** | Added two-tap Regenerate button (first tap shows warning, second confirms). `min-h-[44px]` tap targets for mobile. |
| `src/components/inbox/reel-card.tsx` | **Modified** | Added `Google Maps ↗` link when Google place ID or coordinates are available. |
| `src/app/api/place-photo/route.ts` | **Created** | Server-side Google Places photo proxy so the browser never sees the API key. |
| `src/lib/types.ts` | **Modified** | Added `google_place_id` and `google_photo_name` to `ReelSubmission`. |
| `.env.local.example` | **Modified** | Added server-side `GOOGLE_PLACES_API_KEY` for the Vercel photo proxy. |
| `src/lib/pipeline/*` | **Deleted** | Removed obsolete Vercel-side extraction pipeline. Railway now owns extraction. |

### Documentation

| File | Status |
|---|---|
| `SHORTCUT_SETUP.md` | **Created** — step-by-step iOS Shortcut setup for non-technical users. Covers finding the token, every Shortcut action in order, testing, sharing via iCloud link, troubleshooting. |
| `STATUS.md` | **Created / updated** |

### Architecture note

The Vercel app queues extraction jobs only. The obsolete Vercel-side extraction pipeline (`src/lib/pipeline/*`) has been removed. URL platform detection now lives in `src/lib/platform.ts`.

### Deployment targets

| Service | Root directory | Notes |
|---|---|---|
| Vercel | repo root (`we-should-go`) | Next.js app. Build with `npm run build`. |
| Railway | `worker/` | Python worker. Uses `worker/Dockerfile`, `worker/railway.toml`, and `worker/requirements.txt`. |

Vercel and Railway do not call each other directly. They communicate through Supabase:

`Vercel app → extraction_jobs row → Railway worker → reel_submissions update → Vercel app reads updated reel`

---

## Environment variables

### Vercel app (`.env.local`)
| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → Places API (New), used by `/api/place-photo` |

### Railway worker (`worker/.env` locally, Railway Variables tab in prod)
| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Same value as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as Vercel |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → Places API (New) |

---

---

## Phase 1.5.5 — Inbox UI redesign (complete)

**Design system:** Editorial Minimalism + Aurora accents (via UI/UX Pro Max). Libre Bodoni serif for place names/headers, Geist Sans for UI chrome. Travel colour tokens in globals.css.

**What was built:**

| File | Status | What changed |
|---|---|---|
| `supabase/migrations/006_thumbnail_url.sql` | **Created** | Adds `thumbnail_url text` column to `reel_submissions` |
| `worker/main.py` | **Modified** | Copies `thumbnail_url` from `shortcut_metadata` (or extraction) into `reel_submissions` update |
| `src/lib/types.ts` | **Modified** | Added `needs_review` to `ReelStatus`; added `thumbnail_url` to `ReelSubmission` |
| `next.config.ts` | **Modified** | Added `remotePatterns` wildcard for external thumbnail images |
| `src/lib/actions/reels.ts` | **Modified** | Added `softRejectReel`, `unrejectReel`, `toggleFavourite`, `resolveNeedsReview` |
| `src/app/globals.css` | **Modified** | Travel CSS tokens; Base UI Collapsible + Drawer animation CSS; star-pulse keyframe; reduced-motion overrides |
| `src/lib/country-flag.ts` | **Created** | Country name → flag emoji lookup |
| `src/components/inbox/card-utils.ts` | **Created** | Shared place-type labels, gradient classes, Google Maps URL builder |
| `src/components/inbox/place-card.tsx` | **Created** | Card with thumbnail/gradient, star toggle, swipe gestures (touch + mouse drag) |
| `src/components/inbox/detail-drawer.tsx` | **Created** | `@base-ui/react` Drawer bottom sheet — full place detail, links, star |
| `src/components/inbox/filter-chips.tsx` | **Created** | Sticky horizontal chip row (All / submitters / Favourites / Needs review) |
| `src/components/inbox/stats-strip.tsx` | **Created** | Tappable stats strip: places · countries · favourited |
| `src/components/inbox/needs-review-section.tsx` | **Created** | Collapsible amber section with inline place-name inputs |
| `src/components/inbox/country-group.tsx` | **Created** | `@base-ui/react` Collapsible group per country with ready-to-plan nudge |
| `src/components/inbox/inbox-client.tsx` | **Created** | Client orchestrator: `useOptimistic`, all handlers, filter/view-mode state |
| `src/app/page.tsx` | **Modified** | Fetches all reels (incl. rejected) + trips; passes to `InboxClient` |
| `src/app/trips/new/page.tsx` | **Modified** | Reads `?destination_country=` query param to pre-fill form from nudge button |

**Manual step required:** run `supabase/migrations/006_thumbnail_url.sql` in Supabase SQL Editor before thumbnails will be stored by the worker.

**Features delivered:**
- Card grid (2-col mobile, 3-col desktop) with thumbnails or place-type gradients
- Country grouping, collapsible, sorted by count desc
- Swipe left → reject (with exit animation); swipe right → favourite (with star pulse) — works on both touch and mouse drag
- Filter chips: All / submitter labels / Favourites / Needs review
- Needs review collapsible section with inline place-name resolution
- Stats strip: total · countries · favourited (tappable)
- Ready-to-plan nudge (≥5 saves, no trip for that country)
- Show/hide rejected toggle
- Detail drawer (Base UI Drawer, swipe-to-close on mobile)
- `useOptimistic` for immediate UI feedback on all mutations

---

## Phase 2 — planned

- **`needs_review` flow** — inline editing card in the inbox so users can manually enter the place name when extraction confidence is low
- **Trip planning UI** — drag reels from inbox into a trip, day-by-day itinerary view
- **Shared trips** — invite partner/friends by email, combined inbox per trip
- **Map view** — pin saved places on an interactive map using Google Places lat/lng
- **Backfill place IDs** — optionally rerun Google Places resolution for older saved reels that were processed before migration 005
