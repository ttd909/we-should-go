-- ============================================================
-- Phase 1.6 — Google Places deep links
-- ============================================================

alter table public.reel_submissions
  add column if not exists google_place_id text;

create index if not exists reel_submissions_google_place_id_idx
  on public.reel_submissions (google_place_id)
  where google_place_id is not null;
