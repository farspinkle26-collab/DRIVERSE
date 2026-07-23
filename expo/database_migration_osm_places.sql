-- OSM Overpass cache + community-submitted places
-- Powers GET /places-nearby and POST /places-submit (see supabase/functions/).
--
-- Two tables, two different trust levels:
--   osm_places_cache  — server-only cache of free OpenStreetMap/Overpass results.
--                       Never written to by clients; only the edge functions
--                       (service role) read/write it.
--   places            — community-submitted POIs. Clients insert their own
--                       rows (status starts 'approved' — see notes in
--                       places-submit); everyone can read approved rows.

create extension if not exists "pgcrypto";

-- ─── OSM cache ──────────────────────────────────────────────
create table if not exists osm_places_cache (
  cache_key text primary key,
  category text not null,
  lat_bucket integer not null,
  lng_bucket integer not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists osm_places_cache_category_idx
  on osm_places_cache (category, lat_bucket, lng_bucket);

create index if not exists osm_places_cache_fetched_at_idx
  on osm_places_cache (fetched_at);

alter table osm_places_cache enable row level security;

-- Locked down: only the service role (used by the edge functions) touches
-- this table. No policies for anon/authenticated -> RLS denies them by default.

-- ─── Community places ───────────────────────────────────────
create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null,
  lng double precision not null,
  category text not null check (category in ('cafe', 'gas_station', 'workshop', 'hangout')),
  tags jsonb not null default '{}'::jsonb,
  notes text,
  photo_url text,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists places_category_idx on places (category, status);
create index if not exists places_lat_lng_idx on places (lat, lng);

alter table places enable row level security;

-- Anyone can read approved places (used to merge into /places-nearby).
create policy "places_select_approved" on places
  for select
  using (status = 'approved' or submitted_by_user_id = auth.uid());

-- Authenticated users can submit places, only as themselves.
create policy "places_insert_own" on places
  for insert
  with check (auth.uid() = submitted_by_user_id);

-- Submitters can see/edit their own pending or rejected submissions.
create policy "places_update_own" on places
  for update
  using (submitted_by_user_id = auth.uid())
  with check (submitted_by_user_id = auth.uid());
