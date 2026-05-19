-- Phase 1.5.5 — persist thumbnail URL so the inbox card grid can show place photos
alter table public.reel_submissions
  add column if not exists thumbnail_url text;
