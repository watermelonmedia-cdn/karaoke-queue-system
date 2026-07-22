-- Karaoke Queue System - schema additions
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to run more than once.

-- Duet / group number support on song requests
alter table public.requests
  add column if not exists is_duo boolean not null default false;

alter table public.requests
  add column if not exists partner text;

-- Helpful indexes for the host queue and identity grouping
create index if not exists requests_event_id_idx on public.requests (event_id);
create index if not exists requests_ip_idx on public.requests (ip);
create index if not exists requests_device_id_idx on public.requests (device_id);
create index if not exists requests_created_at_idx on public.requests (created_at);
