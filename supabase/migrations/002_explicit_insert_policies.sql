-- Make write checks explicit for rows created from the browser client.
-- This keeps trip creation and profile self-repair working even when RLS
-- policies are inspected or reapplied independently.

drop policy if exists "profiles: own record" on public.profiles;
create policy "profiles: own record"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "trips: creator full access" on public.trips;
create policy "trips: creator full access"
  on public.trips for all
  using (auth.uid() = created_by_user_id)
  with check (auth.uid() = created_by_user_id);
