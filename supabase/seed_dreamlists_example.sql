-- Example Dreamlist seed data.
--
-- Run this only after:
-- 1. Migration 008_dreamlists.sql has been applied.
-- 2. The two users have signed up at least once, so they exist in auth.users/profiles.
-- 3. You have changed the emails below to real user emails from your Supabase Auth table.
--
-- This is intentionally not a migration because Supabase Auth user IDs are environment-specific.

do $$
declare
  thien_email text := 'thiendo98@yahoo.com';
  susan_email text := 'susanlai87@hotmail.com';
  thien_id uuid;
  susan_id uuid;
  thien_personal_id uuid;
  shared_id uuid;
begin
  select id into thien_id
  from public.profiles
  where email = thien_email
  limit 1;

  select id into susan_id
  from public.profiles
  where email = susan_email
  limit 1;

  if thien_id is null or susan_id is null then
    raise exception
      'Seed users not found. Update thien_email/susan_email to real signed-up user emails. thien_id=%, susan_id=%',
      thien_id,
      susan_id;
  end if;

  update public.profiles
  set display_name = case
    when id = thien_id then 'Thien'
    when id = susan_id then 'Susan'
    else display_name
  end
  where id in (thien_id, susan_id);

  insert into public.dreamlists (name, type, owner_id)
  values ('My Dreamlist', 'personal', thien_id)
  on conflict do nothing;

  select id into thien_personal_id
  from public.dreamlists
  where owner_id = thien_id and type = 'personal'
  limit 1;

  insert into public.dreamlists (name, type, owner_id)
  values ('Thien & Susan''s Dreamlist', 'shared', thien_id)
  returning id into shared_id;

  insert into public.dreamlist_members (dreamlist_id, user_id, role)
  values
    (thien_personal_id, thien_id, 'owner'),
    (shared_id, thien_id, 'owner'),
    (shared_id, susan_id, 'member')
  on conflict (dreamlist_id, user_id) do nothing;

  insert into public.reel_submissions (
    dreamlist_id,
    submitted_by_user_id,
    submitted_by_label,
    platform,
    url,
    url_hash,
    notes,
    status,
    destination_country,
    destination_city,
    destination_region,
    place_name,
    place_type,
    tags,
    priority,
    confidence
  )
  values
    (thien_personal_id, thien_id, 'Thien', 'instagram', 'https://www.instagram.com/reel/example-personal-1', encode(digest('example-personal-1', 'sha256'), 'hex'), 'One day Japan idea', 'saved', 'Japan', 'Tokyo', 'East Asia', 'Shibuya Sky', 'viewpoint', array['skyline', 'date night'], 'high', 0.9),
    (shared_id, thien_id, 'Thien', 'tiktok', 'https://www.tiktok.com/@travel/video/example-shared-1', encode(digest('example-shared-1', 'sha256'), 'hex'), 'Looks good for the first night', 'saved', 'Japan', 'Tokyo', 'East Asia', 'Omoide Yokocho', 'restaurant', array['food', 'night'], 'normal', 0.86),
    (shared_id, susan_id, 'Susan', 'instagram', 'https://www.instagram.com/reel/example-shared-2', encode(digest('example-shared-2', 'sha256'), 'hex'), 'Susan wants this one', 'saved', 'Japan', 'Kyoto', 'East Asia', 'Arashiyama Bamboo Grove', 'experience', array['walk', 'classic'], 'high', 0.88),
    (shared_id, susan_id, 'Susan', 'tiktok', 'https://www.tiktok.com/@travel/video/example-shared-3', encode(digest('example-shared-3', 'sha256'), 'hex'), 'Maybe for breakfast', 'inbox', 'Japan', 'Kyoto', 'East Asia', 'Kissa Kishin', 'cafe', array['coffee', 'quiet'], 'normal', 0.72);
end $$;
