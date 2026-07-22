-- Karaoke Queue System - row level security
--
-- PROBLEM THIS SOLVES
-- The publishable key ships inside the browser bundle, which is by design.
-- But with permissive RLS it currently lets anyone who views your page source
-- read the entire requests table, including every singer's stored IP address.
-- IP addresses count as personal data in most jurisdictions.
--
-- WHAT THIS DOES
-- Public visitors keep exactly the access the app needs: read events, read the
-- queue, submit a request. The ip and device_id columns stop being publicly
-- readable. The host view keeps full access because it reads through a
-- security-definer view.
--
-- SAFETY
-- Run the VERIFY block at the bottom immediately afterwards. If anything looks
-- wrong, the ROLLBACK block at the very bottom restores the previous behaviour
-- in one statement.
--
-- DO NOT RUN THIS DURING A LIVE EVENT. Run it on a quiet afternoon and test a
-- submission afterwards.

-- ---------------------------------------------------------------------------
-- 1. Enable RLS
-- ---------------------------------------------------------------------------
alter table public.events   enable row level security;
alter table public.requests enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Policies
-- ---------------------------------------------------------------------------

-- Anyone may read events. They are advertised publicly anyway.
drop policy if exists events_public_read on public.events;
create policy events_public_read
  on public.events for select
  to anon, authenticated
  using (true);

-- Anyone may read requests. Column privileges below hide the personal bits.
drop policy if exists requests_public_read on public.requests;
create policy requests_public_read
  on public.requests for select
  to anon, authenticated
  using (true);

-- Anyone may submit a request.
drop policy if exists requests_public_insert on public.requests;
create policy requests_public_insert
  on public.requests for insert
  to anon, authenticated
  with check (true);

-- Anyone may update a request. This is what lets the host approve, reorder and
-- mark songs complete while host auth still lives in the browser.
-- TIGHTEN THIS once host login moves to Supabase Auth: change `to anon,
-- authenticated` to `to authenticated` so only a signed-in host can mutate.
drop policy if exists requests_public_update on public.requests;
create policy requests_public_update
  on public.requests for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists requests_public_delete on public.requests;
create policy requests_public_delete
  on public.requests for delete
  to anon, authenticated
  using (true);

-- Events are created and toggled from the host view, which is still anon.
drop policy if exists events_public_write on public.events;
create policy events_public_write
  on public.events for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. Hide the personal columns from the public role
--
-- PostgREST honours column level grants, so revoking these makes the columns
-- invisible to anon selects while leaving every other column readable.
-- ---------------------------------------------------------------------------
revoke select (ip, device_id) on public.requests from anon;

-- Inserts still need to write them, so keep insert privileges intact.
grant insert (
  id, event_id, singer, song_title, artist, status,
  created_at, device_id, ip, is_duo, partner
) on public.requests to anon;

-- ---------------------------------------------------------------------------
-- 4. VERIFY - run this and read the output
-- ---------------------------------------------------------------------------
select
  c.relname                                as table_name,
  c.relrowsecurity                         as rls_on,
  (select count(*) from pg_policies p
     where p.schemaname = 'public'
       and p.tablename  = c.relname)       as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('events','requests');

-- Expected: both rows show rls_on = true and policies >= 1.
--
-- Then reload the live site and submit a test song. If the queue still loads
-- and the submission appears, you are done.

-- ---------------------------------------------------------------------------
-- 5. ROLLBACK - only if something breaks
-- ---------------------------------------------------------------------------
-- alter table public.requests disable row level security;
-- alter table public.events   disable row level security;
-- grant select on public.requests to anon;
