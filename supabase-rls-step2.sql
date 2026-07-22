-- Karaoke Queue System - RLS step 2: hide personal columns
--
-- PREREQUISITES - both must be true before running this.
--
--   1. Host login is a real Supabase Auth session.
--      Check: the amber "Legacy login in use" banner is absent from /host,
--      and the session token carries role = "authenticated".
--
--   2. The app is deployed at commit "Fix the requests query..." or later.
--      Earlier builds request ip and device_id by name in one combined query.
--      Postgres fails the ENTIRE query with 42501 when a role asks for a
--      column it cannot read, so running this against an older build empties
--      the public queue for every singer. The current build retries with a
--      public-only column list, which is what makes this script safe.
--
-- Safe to run more than once.
--
-- WHY THE FIRST ATTEMPT DID NOTHING
-- supabase-rls.sql used:
--     revoke select (ip, device_id) on public.requests from anon;
-- Supabase grants `anon` table-wide SELECT on everything in `public`. A
-- column-level REVOKE against a role holding a table-level grant is a no-op:
-- the table grant already covers every column. You have to drop the table-level
-- grant and re-grant the safe columns explicitly, which is what this does.

-- ---------------------------------------------------------------------------
-- 0. SINGERS NEVER SIGN IN
--
-- Nothing in this script asks an end user to authenticate. Song requests stay
-- fully anonymous: open the page, type a name and song, submit.
--
-- These two policies are recreated here rather than inherited from step 1, so
-- this script is self-sufficient and the public path cannot be broken by
-- running the scripts out of order or after a rollback.
-- ---------------------------------------------------------------------------
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert
  on public.requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists requests_public_read on public.requests;
create policy requests_public_read
  on public.requests for select
  to anon, authenticated
  using (true);

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

drop policy if exists events_public_read_only on public.events;
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
