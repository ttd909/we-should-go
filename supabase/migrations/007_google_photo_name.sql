-- Phase 1.7 — Google Places photo fallback
alter table public.reel_submissions
  add column if not exists google_photo_name text;
