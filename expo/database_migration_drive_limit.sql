-- Driveverse — Regular drivers get 5 recorded drives per calendar month
-- ============================================================
--
-- The first cap that gates the app's CORE action rather than a peripheral
-- one. Regular: 5 drives per calendar month. Platinum: unlimited.
--
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
-- Requires `database_migration_platinum.sql` to have been run first
-- (`is_platinum`, `platinum_limit`), and `database_migration_profile_v2.sql`
-- for the `trips` table this counts.
--
-- WHERE THE CAP IS ENFORCED
--   Twice, like every other cap in this app:
--     • the client checks `drive_quota()` before letting a drive START
--       (`lib/driveQuota.ts`, `app/(tabs)/map.tsx`) — this is the path a real
--       driver takes, and it stops them investing 40 minutes in a drive that
--       is about to be refused;
--     • the trigger below refuses the INSERT — this is what makes the cap
--       real against a modified client.
--   A legitimate client never reaches the trigger. That asymmetry is
--   deliberate and is explained at length in `lib/driveQuota.ts`.
--
-- WHY A CALENDAR MONTH
--   `date_trunc('month', now())`, matching what the paywall says ("5 a
--   month") and what a driver can reason about. A rolling 30-day window
--   would return the allowance one drive at a time on dates nobody tracks.
--   NOTE this is UTC, since `now()` is timestamptz and `date_trunc` here
--   operates in the database's timezone — a driver in UTC+7 gets their reset
--   at 07:00 local on the 1st. Accepted: the alternative is storing a
--   per-user timezone purely to move a monthly boundary by a few hours.

-- ============================================================
-- 1. TIER LIMIT — restated so this file stands alone
-- ============================================================
--
-- LOCKSTEP WARNING — this is a verbatim copy of the function in
-- `database_migration_platinum.sql`, with 'drives_per_month' added. Both
-- files `create or replace` it, so whichever runs last wins and the two MUST
-- stay identical. A feature added to only one of them disappears the moment
-- the other file is re-run, and a missing feature returns NULL, which every
-- caller reads as "unlimited" — i.e. the cap silently stops existing.
--
-- It is restated here rather than left to the platinum migration because a
-- database that has this file but an older platinum.sql would otherwise get
-- NULL for 'drives_per_month' and enforce nothing at all.
--
-- 'convoy_members' regular cap raised 2 -> 5 here and in
-- database_migration_platinum.sql together — see constants/platinum.ts.
-- Re-run this file (or the platinum one, but this one runs later per the
-- header above, so it's the one that actually sticks) to apply it.

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
        when 'convoy_members'   then 5
        when 'ai_showcases'     then 0
      end
  end;
$$;

revoke all on function public.platinum_limit(text, uuid) from public;
grant execute on function public.platinum_limit(text, uuid) to authenticated, service_role;

-- ============================================================
-- 2. COUNTING INDEX
-- ============================================================
--
-- `drive_quota` and the trigger both count a single user's rows since the
-- start of the month, which is exactly this index.

create index if not exists trips_user_created_idx
  on public.trips (user_id, created_at desc);

-- ============================================================
-- 3. QUOTA — what the client reads
-- ============================================================
--
-- Mirrors `ai_showcase_quota`'s shape so the client has one pattern to learn,
-- with ONE deliberate difference: `allowance` is returned as NULL for
-- unlimited rather than coalesced to 0. The showcase quota can coalesce
-- because a Regular driver's showcase allowance genuinely IS 0; here 0 and
-- "unlimited" are opposite answers and collapsing them would lock every
-- Platinum driver out of driving. `lib/driveQuota.ts` reads NULL as unlimited.

create or replace function public.drive_quota(uid uuid)
returns table (used integer, allowance integer, remaining integer)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select count(*)::integer as used
    from public.trips
    where user_id = uid
      and created_at >= date_trunc('month', now())
  ), a as (
    select public.platinum_limit('drives_per_month', uid) as allowance
  )
  select
    u.used,
    a.allowance,
    case when a.allowance is null then null
         else greatest(a.allowance - u.used, 0)
    end
  from u, a;
$$;

revoke all on function public.drive_quota(uuid) from public;
grant execute on function public.drive_quota(uuid) to authenticated, service_role;

-- ============================================================
-- 4. ENFORCEMENT — the backstop
-- ============================================================
--
-- Keep the 'PLATINUM_LIMIT:' prefix: `lib/platinumLimits.ts` parses it to
-- decide which paywall benefit to raise, and the feature name here
-- ('drives_per_month') is what maps onto `drivesPerMonth` there.

create or replace function public.enforce_drive_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer;
  used integer;
begin
  cap := public.platinum_limit('drives_per_month', new.user_id);
  if cap is null then
    return new;
  end if;

  select count(*) into used
  from public.trips
  where user_id = new.user_id
    and created_at >= date_trunc('month', now());

  if used >= cap then
    raise exception 'PLATINUM_LIMIT:drives_per_month:% You have used all % drives this month.', cap, cap
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_drive_limit_trigger on public.trips;
create trigger enforce_drive_limit_trigger
  before insert on public.trips
  for each row execute function public.enforce_drive_limit();

-- Done. See PLATINUM_REFERENCE.md → "Monthly drive allowance".
