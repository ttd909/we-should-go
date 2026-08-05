-- ============================================================
-- Phase 2.1 - strict social-platform support + ingestion limits
-- ============================================================

alter type public.reel_platform add value if not exists 'facebook';

-- Rate-limit state stays server-side. RLS is enabled without client policies;
-- only the service role can call the reservation function below.
create table public.ingestion_rate_events (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz not null default now()
);

create index ingestion_rate_events_user_created_idx
  on public.ingestion_rate_events (user_id, created_at desc);

alter table public.ingestion_rate_events enable row level security;

create or replace function public.consume_ingestion_rate_limit(
  p_user_id uuid,
  p_minute_limit integer,
  p_day_limit integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute_count integer;
  v_day_count integer;
  v_retry_after integer;
begin
  if p_user_id is null or p_minute_limit < 1 or p_day_limit < 1 then
    raise exception 'Invalid ingestion rate-limit arguments';
  end if;

  -- Serialise reservations for the same user so concurrent requests cannot
  -- race past the limit on separate Vercel instances.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  delete from public.ingestion_rate_events
  where user_id = p_user_id
    and created_at < now() - interval '1 day';

  select count(*)::integer
  into v_day_count
  from public.ingestion_rate_events
  where user_id = p_user_id
    and created_at >= now() - interval '1 day';

  if v_day_count >= p_day_limit then
    select greatest(
      1,
      ceil(extract(epoch from (min(created_at) + interval '1 day' - now())))::integer
    )
    into v_retry_after
    from public.ingestion_rate_events
    where user_id = p_user_id
      and created_at >= now() - interval '1 day';

    return query select false, v_retry_after;
    return;
  end if;

  select count(*)::integer
  into v_minute_count
  from public.ingestion_rate_events
  where user_id = p_user_id
    and created_at >= now() - interval '1 minute';

  if v_minute_count >= p_minute_limit then
    select greatest(
      1,
      ceil(extract(epoch from (min(created_at) + interval '1 minute' - now())))::integer
    )
    into v_retry_after
    from public.ingestion_rate_events
    where user_id = p_user_id
      and created_at >= now() - interval '1 minute';

    return query select false, v_retry_after;
    return;
  end if;

  insert into public.ingestion_rate_events (user_id) values (p_user_id);
  return query select true, 0;
end;
$$;

revoke all on function public.consume_ingestion_rate_limit(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_ingestion_rate_limit(uuid, integer, integer)
  to service_role;
