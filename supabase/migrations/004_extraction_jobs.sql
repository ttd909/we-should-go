-- ============================================================
-- Phase 1.5 — extraction jobs, URL hash cache, needs_review
-- Run in Supabase SQL editor (auto-commit mode required for
-- ALTER TYPE ... ADD VALUE — cannot run inside a transaction)
-- ============================================================

-- ─── url_hash on reel_submissions ────────────────────────────
-- SHA-256 hex of the canonical URL. Used to deduplicate
-- submissions from the iOS Shortcut / Android share target.

alter table public.reel_submissions
  add column if not exists url_hash text;

create index if not exists reel_submissions_url_hash_idx
  on public.reel_submissions (submitted_by_user_id, url_hash);

-- ─── needs_review status ─────────────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- Supabase SQL editor is auto-commit, so this is safe here.

alter type public.reel_status add value if not exists 'needs_review';

-- ─── extraction_job_status enum ──────────────────────────────

create type public.extraction_job_status as enum
  ('pending', 'processing', 'completed', 'failed');

-- ─── extraction_jobs ─────────────────────────────────────────
-- One row per submitted reel. The Railway worker polls this
-- table, claims pending jobs, and updates reel_submissions.

create table public.extraction_jobs (
  id                  uuid primary key default gen_random_uuid(),
  reel_submission_id  uuid references public.reel_submissions(id)
                        on delete cascade not null,
  status              public.extraction_job_status not null default 'pending',
  error_message       text,
  -- metadata forwarded from the iOS Shortcut (page_title, page_description, thumbnail_url)
  shortcut_metadata   jsonb,
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz
);

create index extraction_jobs_status_idx
  on public.extraction_jobs (status, created_at)
  where status = 'pending';

alter table public.extraction_jobs enable row level security;

-- submitter can read their own jobs via the reel relationship
create policy "extraction_jobs: submitter can read"
  on public.extraction_jobs for select
  using (
    exists (
      select 1 from public.reel_submissions
      where id = extraction_jobs.reel_submission_id
        and submitted_by_user_id = auth.uid()
    )
  );

-- ─── claim_extraction_job helper ─────────────────────────────
-- Called by the Railway worker via supabase.rpc('claim_extraction_job').
-- Atomically moves one pending job to 'processing' using
-- FOR UPDATE SKIP LOCKED so concurrent workers never double-claim.
-- Returns the claimed job UUID, or NULL if the queue is empty.

create or replace function public.claim_extraction_job()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  update public.extraction_jobs
  set
    status     = 'processing',
    started_at = now()
  where id = (
    select id
    from   public.extraction_jobs
    where  status = 'pending'
    order  by created_at
    limit  1
    for update skip locked
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;
