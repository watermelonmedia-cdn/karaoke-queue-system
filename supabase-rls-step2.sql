-- Karaoke Queue System - RLS step 2: hide personal columns
--
-- DO NOT RUN THIS YET.
--
-- This must be run AFTER host login moves to Supabase Auth. Until then your
-- host browser authenticates as `anon`, exactly like every singer's phone, so
-- hiding these columns from `anon` would also hide them from you and break the
-- identity grouping in the host view.
--
-- WHY THE FIRST ATTEMPT DID NOTHING
-- supabase-rls.sql used:
--     revoke select (ip, device_id) on public.requests from anon;
-- Supabase grants `anon` table-wide SELECT on everything in `public`. A
-- column-level REVOKE against a role holding a table-level grant is a no-op:
-- the table grant already covers every column. You have to drop the table-level
-- grant and re-grant the safe columns explicitly, which is what this does.

-- ---------------------------------------------------------------------------
-- 1. Replace the blanket grant with a column list
-- ---------------------------------------------------------------------------
revoke select on public.requests from anon;

grant select (
  id,
  event_id,
  singer,
  song_title,
  artist,
  status,
  created_at,
  "order",
  started_at,
  completed_at,
  is_duo,
  partner
) on public.requests to anon;

-- Signed-in hosts keep everything, including ip and device_id.
grant select on public.requests to authenticated;

-- Submissions still need to write the personal columns.
grant insert (
  id, event_id, singer, song_title, artist, status,
  created_at, device_id, ip, is_duo, partner
) on public.requests to anon;

-- ---------------------------------------------------------------------------
-- 2. Restrict mutations to signed-in hosts
-- Only safe once host login is real auth. Before that this locks you out of
-- approving and completing songs.
-- ---------------------------------------------------------------------------
drop policy if exists requests_public_update on public.requests;
create policy requests_host_update
  on public.requests for update
  to authenticated
  using (true) with check (true);

drop policy if exists requests_public_delete on public.requests;
create policy requests_host_delete
  on public.requests for delete
  to authenticated
  using (true);

drop policy if exists events_public_write on public.events;
create policy events_host_write
  on public.events for all
  to authenticated
  using (true) with check (true);

create policy events_public_read_only
  on public.events for select
  to anon
  using (true);

-- ---------------------------------------------------------------------------
-- 3. VERIFY
-- ---------------------------------------------------------------------------
-- Signed OUT, in the browser console on your live site, this must now fail:
--     fetch(URL + '/rest/v1/requests?select=ip&limit=1', {headers:{apikey:KEY}})
--   expected: 42501 permission denied for column ip
--
-- And this must still succeed:
--     fetch(URL + '/rest/v1/requests?select=singer,song_title&limit=1', ...)
--
-- Then sign in as host and confirm the Who/Device column still shows IPs.

-- ---------------------------------------------------------------------------
-- 4. ROLLBACK
-- ---------------------------------------------------------------------------
-- grant select on public.requests to anon;
-- drop policy if exists requests_host_update on public.requests;
-- create policy requests_public_update on public.requests for update
--   to anon, authenticated using (true) with check (true);
