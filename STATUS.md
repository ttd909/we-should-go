# We Should Go — Build Status

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

### Vercel app changes

| File | Status | What changed |
|---|---|---|
| `src/app/api/ingest-reel/route.ts` | **Modified** | URL validation (TikTok/Instagram only), SHA-256 dedup, accepts `page_title`/`page_description`/`thumbnail_url`, writes `extraction_jobs` row, returns `{ job_id, message }`. Removed `after(enrichReel())`. |
| `src/app/api/share-target/route.ts` | **Created** | Android PWA share target. Session-authed. Deduplicates, queues extraction job, redirects to `/?saved=true`. |
| `public/manifest.json` | **Created** | PWA manifest with `share_target` for Android. |
| `src/app/layout.tsx` | **Modified** | Added `metadata.manifest = '/manifest.json'`. |
| `src/lib/platform.ts` | **Created** | Shared TikTok/Instagram URL platform detection for app API routes. |
| `src/lib/actions/settings.ts` | **Created** | `regenerateToken()` server action — generates new 32-byte hex token, updates DB, revalidates `/settings`. |
| `src/components/settings/copy-token.tsx` | **Modified** | Added two-tap Regenerate button (first tap shows warning, second confirms). `min-h-[44px]` tap targets for mobile. |
| `.env.local.example` | **Modified** | Removed `META_APP_ACCESS_TOKEN`, added note about Railway worker env vars. |
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

---

## Environment variables

### Vercel app (`.env.local`)
| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |

### Railway worker (`worker/.env` locally, Railway Variables tab in prod)
| Variable | Notes |
|---|---|
| `SUPABASE_URL` | Same value as `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Same as Vercel |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GOOGLE_PLACES_API_KEY` | Google Cloud Console → Places API (New) |

---

## Phase 2 — planned

- **`needs_review` flow** — inline editing card in the inbox so users can manually enter the place name when extraction confidence is low
- **Trip planning UI** — drag reels from inbox into a trip, day-by-day itinerary view
- **Shared trips** — invite partner/friends by email, combined inbox per trip
- **Map view** — pin saved places on an interactive map using lat/lng from Google Places
- **Deploy** — Vercel for the Next.js app, Railway for the worker
