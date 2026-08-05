-- ============================================================
-- Phase 3 - private itinerary chat images
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-chat-images',
  'trip-chat-images',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object names are: <trip UUID>/<uploader UUID>/<random UUID>.<extension>.
-- This lets Storage RLS prove both Trip membership and uploader ownership.
create policy "trip images: members read"
  on storage.objects for select
  using (
    bucket_id = 'trip-chat-images'
    and public.is_trip_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

create policy "trip images: uploader inserts"
  on storage.objects for insert
  with check (
    bucket_id = 'trip-chat-images'
    and (storage.foldername(name))[2]::uuid = auth.uid()
    and public.is_trip_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

create policy "trip images: uploader deletes"
  on storage.objects for delete
  using (
    bucket_id = 'trip-chat-images'
    and (storage.foldername(name))[2]::uuid = auth.uid()
    and public.is_trip_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

-- Retention: remove failed/abandoned objects after 24 hours with the operator
-- cleanup job. Linked chat images remain private until the uploader deletes
-- them; deleting a source image does not delete accepted itinerary Blocks.
