-- Driveverse — Platinum subscription tier
--
-- Adds the server side of Platinum: the entitlement mirror RevenueCat's
-- webhook writes, the tier caps enforced in the database, the saved-places
-- feature (new, so its cap ships with it), the AI-showcase ledger that keeps
-- generation cost bounded, and the two cosmetic columns.
--
-- ── WHERE THE TRUTH LIVES ───────────────────────────────────────────
-- The CLIENT gate is RevenueCat: `customerInfo.entitlements.active['platinum']`,
-- read through `hooks/usePlatinumStore.ts`. Nothing in the app asks Postgres
-- whether someone is Platinum.
--
-- `platinum_subscribers` below is a MIRROR, not a second source of truth. It
-- is written only by the service role (the `revenuecat-webhook` edge function)
-- and exists for the things the client cannot be trusted with:
--   • RLS caps — a modified client could insert a third car straight into
--     `car_collections`, so the cap is also a database trigger.
--   • Cost control — AI showcase generation spends real money per image, so
--     the edge function checks entitlement + quota server-side before calling
--     the provider.
-- If the mirror is ever behind (webhook retry in flight), the worst case is a
-- paying driver briefly hits a Regular cap on a write; the client gate keeps
-- their badge, aura and UI correct throughout.
--
-- Run in the Supabase SQL editor. Idempotent.

create extension if not exists "pgcrypto";

-- ============================================================
-- ENTITLEMENT MIRROR
-- ============================================================

create table if not exists public.platinum_subscribers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- RevenueCat's app_user_id. We configure the SDK with the Supabase user id,
  -- so these normally match; stored anyway because an anonymous purchase that
  -- is later aliased to an account keeps its original id in the webhook.
  rc_app_user_id text,
  is_active boolean not null default false,
  product_id text,
  store text,
  period_type text,
  expires_at timestamptz,
  will_renew boolean not null default false,
  -- Last webhook event applied. Used to drop out-of-order deliveries.
  last_event_id text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists platinum_subscribers_active_idx
  on public.platinum_subscribers (is_active)
  where is_active;

alter table public.platinum_subscribers enable row level security;

-- Drivers may read their own row (support screens, "why did my badge go
-- away"). Nobody may write it from a client — no insert/update/delete policy
-- exists, so RLS denies those to anon and authenticated by default. The
-- webhook uses the service role, which bypasses RLS.
drop policy if exists "platinum_select_own" on public.platinum_subscribers;
create policy "platinum_select_own" on public.platinum_subscribers
  for select using (user_id = auth.uid());

-- ============================================================
-- is_platinum() — the one function every cap consults
-- ============================================================
--
-- SECURITY DEFINER so a trigger can read the mirror while running as a user
-- who has no select policy on another driver's row (convoy capacity depends
-- on the LEADER's tier, not the joiner's).

create or replace function public.is_platinum(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.is_active and (s.expires_at is null or s.expires_at > now())
      from public.platinum_subscribers s
      where s.user_id = uid
    ),
    false
  );
$$;

revoke all on function public.is_platinum(uuid) from public;
grant execute on function public.is_platinum(uuid) to authenticated, service_role;

-- ============================================================
-- are_platinum() — badge lookup for OTHER drivers
-- ============================================================
--
-- The badge has to render next to other people's names, and a client cannot
-- read another driver's RevenueCat entitlement. This is the one read of the
-- mirror the app does, and it is deliberately narrow: a batch of ids in, a
-- boolean each out. No expiry dates, no product ids, no store — none of which
-- is any other driver's business.
--
-- It is a display projection of the mirror, NOT a second gate. Nothing is
-- authorised on the strength of this call; the driver's own entitlement still
-- comes from the RevenueCat SDK, and writes are still checked by the triggers.

create or replace function public.are_platinum(uids uuid[])
returns table (user_id uuid, is_platinum boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    u as user_id,
    coalesce(
      (
        select s.is_active and (s.expires_at is null or s.expires_at > now())
        from public.platinum_subscribers s
        where s.user_id = u
      ),
      false
    ) as is_platinum
  from unnest(uids) as u;
$$;

revoke all on function public.are_platinum(uuid[]) from public;
grant execute on function public.are_platinum(uuid[]) to authenticated, service_role;

-- ============================================================
-- TIER LIMITS — mirrors constants/platinum.ts
-- ============================================================
--
-- Kept as one function rather than scattered literals so the numbers can be
-- changed in a single place. They must stay in step with `TIER_LIMITS` in
-- `constants/platinum.ts`; the client shows the cap, the database enforces it.
-- NULL means unlimited.
--
-- LOCKSTEP WARNING — this function is `create or replace`d by TWO files:
-- this one and `database_migration_drive_limit.sql`, which added
-- 'drives_per_month'. Whichever runs last wins, so the two definitions must
-- stay byte-identical in their feature list. Adding a feature to only one of
-- them means re-running the other silently drops the cap — and a dropped cap
-- returns NULL here, which every caller reads as "unlimited". Add new
-- features to both, in the same commit.

create or replace function public.platinum_limit(feature text, uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platinum(uid) then
      case feature
        when 'garage_cars'      then null
        when 'active_events'    then null
        when 'saved_places'     then null
        when 'saved_routes'     then null
        when 'drives_per_month' then null
        when 'convoy_members'   then 8
        when 'ai_showcases'     then 5
      end
    else
      case feature
        when 'garage_cars'      then 2
        when 'active_events'    then 1
        when 'saved_places'     then 10
        when 'saved_routes'     then 10
        when 'drives_per_month' then 5
        when 'convoy_members'   then 2
        when 'ai_showcases'     then 0
      end
  end;
$$;

revoke all on function public.platinum_limit(text, uuid) from public;
grant execute on function public.platinum_limit(text, uuid) to authenticated, service_role;

-- ============================================================
-- SAVED PLACES — new feature, ships with its cap
-- ============================================================
--
-- A driver's own bookmarks over the places layer. `place_id` is the id from
-- /places-nearby, which is an OSM node id for OSM results and a `places` row
-- id for community submissions — hence text, and hence the denormalised
-- name/lat/lng so a bookmark survives an OSM result falling out of the cache.

create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  place_id text not null,
  source text not null default 'osm' check (source in ('osm', 'user')),
  name text not null,
  category text not null check (category in ('cafe', 'gas_station', 'workshop', 'hangout')),
  lat double precision not null,
  lng double precision not null,
  note text default '',
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);

create index if not exists saved_places_user_idx on public.saved_places (user_id, created_at desc);

alter table public.saved_places enable row level security;

drop policy if exists "saved_places_select_own" on public.saved_places;
create policy "saved_places_select_own" on public.saved_places
  for select using (user_id = auth.uid());

drop policy if exists "saved_places_insert_own" on public.saved_places;
create policy "saved_places_insert_own" on public.saved_places
  for insert with check (user_id = auth.uid());

drop policy if exists "saved_places_delete_own" on public.saved_places;
create policy "saved_places_delete_own" on public.saved_places
  for delete using (user_id = auth.uid());

drop policy if exists "saved_places_update_own" on public.saved_places;
create policy "saved_places_update_own" on public.saved_places
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- AI SHOWCASE LEDGER
-- ============================================================
--
-- One row per generated image. This is what the monthly quota counts, so it
-- is written by the edge function (service role) at generation time — a
-- client-writable ledger would be a client-writable budget.

create table if not exists public.ai_showcases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  car_id uuid references public.car_collections(id) on delete set null,
  image_url text not null,
  style text not null default 'studio',
  created_at timestamptz not null default now()
);

create index if not exists ai_showcases_user_month_idx
  on public.ai_showcases (user_id, created_at desc);

alter table public.ai_showcases enable row level security;

drop policy if exists "ai_showcases_select_own" on public.ai_showcases;
create policy "ai_showcases_select_own" on public.ai_showcases
  for select using (user_id = auth.uid());

drop policy if exists "ai_showcases_delete_own" on public.ai_showcases;
create policy "ai_showcases_delete_own" on public.ai_showcases
  for delete using (user_id = auth.uid());

-- No insert policy: only the service role writes the ledger.

-- Generations used in the current calendar month, and what's left.
create or replace function public.ai_showcase_quota(uid uuid)
returns table (used integer, allowance integer, remaining integer)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select count(*)::integer as used
    from public.ai_showcases
    where user_id = uid
      and created_at >= date_trunc('month', now())
  ), a as (
    select coalesce(public.platinum_limit('ai_showcases', uid), 0) as allowance
  )
  select u.used, a.allowance, greatest(a.allowance - u.used, 0) from u, a;
$$;

revoke all on function public.ai_showcase_quota(uuid) from public;
grant execute on function public.ai_showcase_quota(uuid) to authenticated, service_role;

-- ============================================================
-- COSMETICS
-- ============================================================
--
-- Which premium vehicle icon / profile frame a driver has selected. Stored on
-- the profile so other drivers see the choice, nullable because "the default"
-- is the absence of a selection rather than a magic string.
--
-- These columns are NOT an entitlement. A lapsed subscriber keeps the stored
-- value; the renderer falls back to the default set when `isPlatinum` is
-- false, so cosmetics come back intact on resubscribe without any migration.

alter table public.profiles add column if not exists vehicle_icon text;
alter table public.profiles add column if not exists profile_frame text;

-- ============================================================
-- CAP ENFORCEMENT
-- ============================================================
--
-- Each of these mirrors a client-side check in the app. The client check is
-- what produces a good experience (an upgrade prompt at the point of
-- friction); the trigger is what makes the cap real.
--
-- Error messages are matched loosely by the client stores, which map them to
-- the paywall trigger — keep the 'PLATINUM_LIMIT:' prefix if you edit them.

-- ── Garage ──────────────────────────────────────────────────
create or replace function public.enforce_garage_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  current_count integer;
begin
  cap := public.platinum_limit('garage_cars', new.user_id);
  if cap is null then
    return new;
  end if;

  select count(*) into current_count
  from public.car_collections
  where user_id = new.user_id;

  if current_count >= cap then
    raise exception 'PLATINUM_LIMIT:garage_cars:% Your garage is full at % cars.', cap, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_garage_limit_trigger on public.car_collections;
create trigger enforce_garage_limit_trigger
  before insert on public.car_collections
  for each row execute function public.enforce_garage_limit();

-- ── Events ──────────────────────────────────────────────────
-- Counts only events that are still upcoming or active: a completed or
-- cancelled event should not hold a Regular driver's one slot forever.
create or replace function public.enforce_event_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  current_count integer;
begin
  cap := public.platinum_limit('active_events', new.creator_id);
  if cap is null then
    return new;
  end if;

  select count(*) into current_count
  from public.events
  where creator_id = new.creator_id
    and status in ('upcoming', 'active');

  if current_count >= cap then
    raise exception 'PLATINUM_LIMIT:active_events:% You already have % event running.', cap, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_event_limit_trigger on public.events;
create trigger enforce_event_limit_trigger
  before insert on public.events
  for each row execute function public.enforce_event_limit();

-- ── Convoy capacity ─────────────────────────────────────────
-- The cap follows the LEADER's tier, not the joiner's: a Platinum organiser's
-- 8-seat convoy must be joinable by Regular drivers, and a Regular organiser's
-- convoy must not grow to 8 just because a Platinum driver joins it.
--
-- Fires on insert and on the invited -> accepted transition, since an invite
-- that is accepted is what actually consumes a seat.
--
-- The leader's own seat counts toward the cap: `on_party_created` (see
-- database_migration_parties.sql) auto-seats them AFTER the parties insert, so
-- the party row already exists when this trigger looks up the leader, and the
-- roster is still empty at that point — the leader is always admitted, and a
-- Regular convoy of 2 means the organiser plus one.
create or replace function public.enforce_convoy_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  leader uuid;
  cap integer;
  current_count integer;
begin
  if new.status <> 'accepted' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'accepted' then
    return new;  -- already occupying a seat
  end if;

  select p.leader_id into leader from public.parties p where p.id = new.party_id;
  if leader is null then
    return new;
  end if;

  cap := public.platinum_limit('convoy_members', leader);
  if cap is null then
    return new;
  end if;

  select count(*) into current_count
  from public.party_members
  where party_id = new.party_id
    and status = 'accepted'
    and user_id <> new.user_id;

  if current_count >= cap then
    raise exception 'PLATINUM_LIMIT:convoy_members:% This convoy is full at % drivers.', cap, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_convoy_limit_trigger on public.party_members;
create trigger enforce_convoy_limit_trigger
  before insert or update on public.party_members
  for each row execute function public.enforce_convoy_limit();

-- ── Route library ───────────────────────────────────────────
create or replace function public.enforce_saved_route_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  current_count integer;
begin
  cap := public.platinum_limit('saved_routes', new.user_id);
  if cap is null then
    return new;
  end if;

  select count(*) into current_count
  from public.saved_routes
  where user_id = new.user_id;

  if current_count >= cap then
    raise exception 'PLATINUM_LIMIT:saved_routes:% Your route library is full at % routes.', cap, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_saved_route_limit_trigger on public.saved_routes;
create trigger enforce_saved_route_limit_trigger
  before insert on public.saved_routes
  for each row execute function public.enforce_saved_route_limit();

-- ── Saved places ────────────────────────────────────────────
create or replace function public.enforce_saved_place_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  current_count integer;
begin
  cap := public.platinum_limit('saved_places', new.user_id);
  if cap is null then
    return new;
  end if;

  select count(*) into current_count
  from public.saved_places
  where user_id = new.user_id;

  if current_count >= cap then
    raise exception 'PLATINUM_LIMIT:saved_places:% You have saved % places.', cap, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_saved_place_limit_trigger on public.saved_places;
create trigger enforce_saved_place_limit_trigger
  before insert on public.saved_places
  for each row execute function public.enforce_saved_place_limit();

-- ============================================================
-- STORAGE — AI showcase renders
-- ============================================================
--
-- Public-read like `car-photos`: a showcase is meant to be shared. Writes are
-- service-role only, since the edge function is the only thing that should be
-- putting an object here.

insert into storage.buckets (id, name, public)
values ('car-showcases', 'car-showcases', true)
on conflict (id) do nothing;

drop policy if exists "car_showcases_public_read" on storage.objects;
create policy "car_showcases_public_read" on storage.objects
  for select using (bucket_id = 'car-showcases');

-- ============================================================
-- EXISTING SUBSCRIBERS BACKFILL
-- ============================================================
--
-- Nothing to backfill on first deploy — every driver starts Regular and the
-- webhook fills the mirror as purchases land. Left as a note so the absence
-- of a backfill reads as deliberate rather than forgotten.
