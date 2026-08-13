-- Driveverse — the Main Quest ("First Mile"), the guided eight-step chain a
-- brand-new driver walks before the daily quests mean anything.
-- ============================================================
--
-- Run this in the Supabase SQL Editor. Idempotent — safe to re-run.
--
-- Requires, and must run AFTER:
--   • database_migration_profile_v2.sql   — `trips`, `friends`, `user_xp`
--   • database_migration_daily_quests.sql — `badges`, `_apply_quest_xp`
--   • database_migration_platinum.sql     — `saved_places`, `platinum_limit`
--   • database_migration_drive_limit.sql  — `drive_quota`, the 5-drive cap
--
-- WHAT THIS STORES
--   Only which steps a driver has finished. The catalogue — titles, copy,
--   order — is `expo/constants/mainQuests.ts`, in TypeScript, because it is
--   eight fixed steps run once per account rather than something generated
--   daily; see that file's header for the full reasoning. The one thing this
--   file duplicates is the XP per step (`main_quest_step_xp` below), because
--   the server has to be the thing that grants it.
--
--   ⚠ LOCKSTEP with `expo/constants/mainQuests.ts`. The step ids and their
--   XP appear in both. `expo/lib/__tests__/mainQuest.test.ts` pins the
--   TypeScript side; nothing can pin this side from there, so if you change
--   a value in one, change it in the other in the same commit.
--
-- HOW A STEP COMPLETES
--   Five of the eight are driven by triggers on real rows and cannot be
--   faked — a `trips` insert, a `saved_places` insert, a friendship or
--   convoy membership being accepted, a `daily_quests` row completing, a
--   `user_xp` level change. Three of them ("open your trip", "open your
--   rank screen", "share your card") are the driver *looking at something*
--   and write no row anywhere, so the client reports them through
--   `complete_main_quest_step()` — whose SQL whitelists exactly those three
--   ids, so a modified client still cannot self-grant the first drive or the
--   capstone. `MAIN_QUEST_REFERENCE.md` §3 is the long version.

-- ============================================================
-- 1. THE LEDGER
-- ============================================================
--
-- Append-only: a row exists iff that driver finished that step. There is no
-- "active"/"pending" state to model, because the eight steps and their order
-- are a constant — the client derives everything else from the catalogue and
-- this set of ids (`lib/mainQuest.ts`). Nothing is ever generated per user,
-- so unlike `daily_quests` there is no generator to run and nothing to
-- expire.

create table if not exists public.user_main_quests (
  user_id      uuid not null references auth.users(id) on delete cascade,
  step_id      text not null,
  xp_awarded   integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, step_id)
);

create index if not exists user_main_quests_user_idx
  on public.user_main_quests (user_id);

alter table public.user_main_quests enable row level security;

-- Read-only to the client. Writes happen exclusively through the
-- SECURITY DEFINER functions below — there is deliberately no INSERT,
-- UPDATE or DELETE policy, the same shape `daily_quests` uses so a quest
-- can never be marked done by the thing being rewarded for it.
drop policy if exists "main quest steps are readable by their owner" on public.user_main_quests;
create policy "main quest steps are readable by their owner" on public.user_main_quests
  for select using (user_id = auth.uid());

-- ============================================================
-- 2. THE CAPSTONE BADGE
-- ============================================================
--
-- `criteria_type = 'manual'` keeps `award_badges()` (§10 of the daily-quest
-- migration) from trying to evaluate it — it is granted directly by
-- `_complete_main_quest_step` when the capstone lands, not derived from a
-- counter.

insert into public.badges (id, name, description, icon, accent_color, criteria_type, criteria_value, criteria_key, sort_order, is_active)
values (
  'first_mile_complete',
  'First Mile Complete',
  'Finished the First Mile — the eight steps that make this app yours.',
  'Award',
  '#FF1E3C',
  'manual',
  0,
  null,
  0,
  true
)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      icon        = excluded.icon,
      is_active   = true;

-- ============================================================
-- 3. THE XP MIRROR
-- ============================================================
--
-- ⚠ Must equal `MAIN_QUEST_STEPS[].xp` in `expo/constants/mainQuests.ts`.
-- An unknown id returns NULL, which `_complete_main_quest_step` treats as
-- "not a real step" and refuses — so a typo fails closed rather than
-- silently granting zero XP for a step nobody can ever complete again.

create or replace function public.main_quest_step_xp(p_step_id text)
returns integer
language sql
immutable
as $$
  select case p_step_id
    when 'first_drive'       then 100
    when 'inspect_trip'      then 50
    when 'mark_territory'    then 75
    when 'know_rank'         then 50
    when 'share_trip'        then 100
    when 'not_alone'         then 150
    when 'first_daily_quest' then 100
    when 'reach_level_2'     then 250
  end;
$$;

-- ============================================================
-- 4. THE CAPSTONE'S GATE
-- ============================================================
--
-- WHY THE LAST STEP IS NOT JUST "level >= 2".
--   `xpForLevel(1)` is 100 (`expo/lib/xpMath.ts`) and step 1 pays exactly
--   100 — so recording one drive satisfies the level condition outright,
--   six steps before the driver has opened a trip detail screen, saved a
--   place or completed a daily quest. A pure level check would fire the
--   payoff step first and leave every step it is meant to reward landing
--   afterwards. Level 2 is therefore a floor, and the real condition is the
--   chain: every REQUIRED step done. Mirrored by `capstoneUnlocked()` in
--   `expo/lib/mainQuest.ts` so the UI can explain the wait.
--
--   'not_alone' is excluded on purpose — it needs another driver to exist
--   nearby, and a chain that cannot finish in an empty city is a chain that
--   punishes early adopters.

create or replace function public.main_quest_required_steps()
returns text[]
language sql
immutable
as $$
  select array[
    'first_drive',
    'inspect_trip',
    'mark_territory',
    'know_rank',
    'share_trip',
    'first_daily_quest'
  ]::text[];
$$;

create or replace function public.main_quest_capstone_ready(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from unnest(public.main_quest_required_steps()) as required(step_id)
    where not exists (
      select 1 from public.user_main_quests m
      where m.user_id = p_uid and m.step_id = required.step_id
    )
  );
$$;

-- ============================================================
-- 5. COMPLETION — internal, the only thing that writes the ledger
-- ============================================================
--
-- Idempotent by the primary key: a second call for a step already finished
-- inserts nothing and grants nothing, which is what makes it safe to call
-- from a trigger that may fire more than once (every `trips` insert calls it
-- for 'first_drive', not only the first).
--
-- XP is granted through `_apply_quest_xp` — the daily-quest migration's
-- server-side leveller, which walks the same 1.6× curve as
-- `expo/lib/xpMath.ts`. Reusing it rather than writing a second XP path is
-- the point: `user_xp` keeps one writer and one curve.

-- Whether the driver is at least Level 2. Its own function because both
-- `_complete_main_quest_step` (chasing the capstone after any step) and the
-- `user_xp` trigger (chasing it after a level change) ask the same question.
create or replace function public.main_quest_level_reached(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select level from public.user_xp where user_id = p_uid), 1) >= 2;
$$;

create or replace function public._complete_main_quest_step(p_uid uuid, p_step_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp   integer;
  v_rows integer := 0;
begin
  if p_uid is null or p_step_id is null then
    return false;
  end if;

  v_xp := public.main_quest_step_xp(p_step_id);
  if v_xp is null then
    -- Not a step in the catalogue. Fail closed.
    return false;
  end if;

  -- The capstone additionally waits for the rest of the chain (§4).
  if p_step_id = 'reach_level_2' and not public.main_quest_capstone_ready(p_uid) then
    return false;
  end if;

  insert into public.user_main_quests (user_id, step_id, xp_awarded)
  values (p_uid, p_step_id, v_xp)
  on conflict (user_id, step_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;               -- already had it; grant nothing twice
  end if;

  perform public._apply_quest_xp(p_uid, v_xp);

  if p_step_id = 'reach_level_2' then
    insert into public.user_badges (user_id, badge_id)
    values (p_uid, 'first_mile_complete')
    on conflict do nothing;
  end if;

  -- Finishing a step can be what makes the capstone possible. Recurse once,
  -- guarded: the gate above refuses when the chain is incomplete, and the
  -- ON CONFLICT refuses when it is already granted, so this terminates.
  if p_step_id <> 'reach_level_2'
     and public.main_quest_capstone_ready(p_uid)
     and public.main_quest_level_reached(p_uid)
  then
    perform public._complete_main_quest_step(p_uid, 'reach_level_2');
  end if;

  return true;
end;
$$;

-- ============================================================
-- 6. THE CLIENT'S ENTRY POINT — whitelisted to three steps
-- ============================================================
--
-- "Open your finished trip", "open your rank screen" and "share your trip
-- card" leave no row behind, so the client is the only witness. Everything
-- else is trigger-driven and is refused here by name — the whitelist is the
-- whole point of this function existing rather than exposing
-- `_complete_main_quest_step` directly.
--
-- Runs as the CALLER's identity via auth.uid(): a driver cannot pass someone
-- else's uid, because there is no uid parameter to pass.

create or replace function public.complete_main_quest_step(p_step_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  -- ⚠ Mirrors CLIENT_REPORTABLE_STEP_IDS in expo/constants/mainQuests.ts.
  if p_step_id not in ('inspect_trip', 'know_rank', 'share_trip') then
    return false;
  end if;

  return public._complete_main_quest_step(v_uid, p_step_id);
end;
$$;

revoke all on function public.complete_main_quest_step(text) from public;
grant execute on function public.complete_main_quest_step(text) to authenticated;

-- ============================================================
-- 7. TRIGGERS — the five server-verified steps
-- ============================================================

-- 7a. First Ignition — the first `trips` row.
create or replace function public.main_quest_on_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._complete_main_quest_step(new.user_id, 'first_drive');
  return new;
end;
$$;

drop trigger if exists trg_main_quest_trip on public.trips;
create trigger trg_main_quest_trip
  after insert on public.trips
  for each row execute function public.main_quest_on_trip();

-- 7b. Mark Your Territory — the first `saved_places` row. Any category
-- counts: a starred cafe and a long-pressed territory pin are the same
-- lesson ("places you keep live on your map").
create or replace function public.main_quest_on_saved_place()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._complete_main_quest_step(new.user_id, 'mark_territory');
  return new;
end;
$$;

drop trigger if exists trg_main_quest_saved_place on public.saved_places;
create trigger trg_main_quest_saved_place
  after insert on public.saved_places
  for each row execute function public.main_quest_on_saved_place();

-- 7c. Not Alone Anymore — a friendship accepted, or a convoy joined.
--
-- Deliberately looser than the daily quests' `make_friend` / `attend_meetup`
-- pair: this step's copy says "send a friend request OR join a convoy", so
-- either satisfies it, and a *pending* request counts too. A brand-new
-- driver reaching out should not have their tutorial step held hostage by
-- whether the other person has opened the app yet.
create or replace function public.main_quest_on_friend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._complete_main_quest_step(new.user_id, 'not_alone');
  if new.status = 'accepted' then
    perform public._complete_main_quest_step(new.friend_id, 'not_alone');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_main_quest_friend on public.friends;
create trigger trg_main_quest_friend
  after insert or update on public.friends
  for each row execute function public.main_quest_on_friend();

-- Only 'accepted' counts. `party_members` rows land in three different
-- shapes and only some of them are a driver actually joined:
--   • the leader auto-seat and `joinParty` (a public convoy, no invite)
--     both INSERT straight to 'accepted' — this step should fire right away.
--   • `invite_to_convoy` INSERTs at 'invited', and `acceptInvite` (an
--     UPDATE) is what moves it to 'accepted'. An INSERT-only, status-blind
--     trigger credits the driver the moment someone else invites them —
--     before they have done anything, including declining — which is not
--     "join a convoy". So this fires on INSERT OR UPDATE and gates on the
--     status actually being 'accepted' either way.
create or replace function public.main_quest_on_party_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' then
    perform public._complete_main_quest_step(new.user_id, 'not_alone');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_main_quest_party_member on public.party_members;
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'party_members') then
    create trigger trg_main_quest_party_member
      after insert or update on public.party_members
      for each row execute function public.main_quest_on_party_member();
  end if;
end $$;

-- 7d. Pick a Fight — the first daily quest to reach 'completed'.
create or replace function public.main_quest_on_daily_quest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    perform public._complete_main_quest_step(new.user_id, 'first_daily_quest');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_main_quest_daily_quest on public.daily_quests;
create trigger trg_main_quest_daily_quest
  after update on public.daily_quests
  for each row execute function public.main_quest_on_daily_quest();

-- 7e. Level Up — the capstone. Fires on any `user_xp` change that leaves the
-- driver at Level 2 or better; `_complete_main_quest_step` applies the chain
-- gate (§4), so an early Level 2 simply does nothing until the rest is done.
--
-- The recursion note: `_complete_main_quest_step` calls `_apply_quest_xp`,
-- which UPDATEs `user_xp`, which fires this trigger again. It terminates
-- because the second pass hits the ledger's ON CONFLICT and returns false
-- before granting anything. Postgres' default
-- trigger depth is far above the two levels this reaches.
create or replace function public.main_quest_on_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.level >= 2 then
    perform public._complete_main_quest_step(new.user_id, 'reach_level_2');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_main_quest_xp on public.user_xp;
create trigger trg_main_quest_xp
  after insert or update on public.user_xp
  for each row execute function public.main_quest_on_xp();

-- ============================================================
-- 8. THE FIRST IGNITION DRIVE IS FREE
-- ============================================================
--
-- Step 1's copy promises the tutorial drive does not count against the
-- Regular tier's 5 drives a month, so both halves of that cap have to agree
-- with it: the quota the client reads AND the trigger that enforces it. A
-- change to only one produces the worst version of this — a driver told they
-- have 5 left, refused at 5.
--
-- The rule: **a driver's first-ever trip is discounted from the month that
-- contains it.** Expressed as "is the earliest trip this user has inside the
-- current month", so it is exact rather than approximated by a count, and it
-- naturally stops applying next month (their first trip is no longer in the
-- window, and the discount goes with it).
--
-- ⚠ LOCKSTEP with `database_migration_drive_limit.sql`, which also defines
-- both of these functions. Whichever file runs last wins. If you re-run that
-- file after this one, re-run this one too or the free first drive silently
-- disappears — the same trap `platinum_limit()` carries between that file
-- and `database_migration_platinum.sql`.

create or replace function public.main_quest_free_drives(uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
    select 1 from public.trips t
    where t.user_id = uid
      and t.created_at = (select min(t2.created_at) from public.trips t2 where t2.user_id = uid)
      and t.created_at >= date_trunc('month', now())
  ) then 1 else 0 end;
$$;

create or replace function public.drive_quota(uid uuid)
returns table (used integer, allowance integer, remaining integer)
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select greatest(
      (select count(*) from public.trips
        where user_id = uid and created_at >= date_trunc('month', now()))
      - public.main_quest_free_drives(uid),
      0
    )::integer as used
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

create or replace function public.enforce_drive_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap  integer;
  used integer;
begin
  cap := public.platinum_limit('drives_per_month', new.user_id);
  if cap is null then
    return new;
  end if;

  select greatest(count(*) - public.main_quest_free_drives(new.user_id), 0)
    into used
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

-- ============================================================
-- 9. BACKFILL
-- ============================================================
--
-- Existing drivers should not be asked to "record your first drive" when
-- they have two hundred. Credit, from what the database already knows, every
-- step whose evidence is a row that exists — with `xp_awarded = 0` and no
-- call to `_apply_quest_xp`, because paying out retroactively would hand a
-- long-standing driver the whole chain's XP for work they did before the
-- chain existed. They get the ticks; they do not get the back pay.
--
-- The three client-reported steps are deliberately NOT backfilled: there is
-- no row anywhere saying whether someone has opened their rank screen, so
-- guessing would be inventing history. An existing driver picks those three
-- up the next time they do the thing, which takes about a minute.

insert into public.user_main_quests (user_id, step_id, xp_awarded)
select distinct user_id, 'first_drive', 0 from public.trips
on conflict do nothing;

insert into public.user_main_quests (user_id, step_id, xp_awarded)
select distinct user_id, 'mark_territory', 0 from public.saved_places
on conflict do nothing;

insert into public.user_main_quests (user_id, step_id, xp_awarded)
select distinct user_id, 'not_alone', 0 from public.friends
on conflict do nothing;

insert into public.user_main_quests (user_id, step_id, xp_awarded)
select distinct friend_id, 'not_alone', 0 from public.friends where status = 'accepted'
on conflict do nothing;

insert into public.user_main_quests (user_id, step_id, xp_awarded)
select distinct user_id, 'first_daily_quest', 0 from public.daily_quests where status = 'completed'
on conflict do nothing;

-- ============================================================
-- 10. ENABLE REALTIME
-- ============================================================
--
-- Without this, `hooks/useMainQuestStore.ts`'s subscription is listening to
-- a table nobody publishes changes on: every trigger above still runs and
-- writes the ledger correctly, but the client never hears about it. From
-- the driver's side that reads as "I did the thing and the chain still
-- shows it undone" — indistinguishable from the triggers being broken,
-- when the actual gap is this one missing statement. Same pattern
-- `database_migration_daily_quests.sql` §16 already uses for
-- `daily_quests`/`user_quest_stats`/`user_badges`/`user_xp`.

do $$
begin
  begin alter publication supabase_realtime add table public.user_main_quests;
  exception when duplicate_object then null; end;
end $$;

-- ============================================================
-- 11. VERIFICATION
-- ============================================================
--
--   -- the ledger for one driver
--   select step_id, xp_awarded, completed_at
--   from public.user_main_quests where user_id = '<uid>' order by completed_at;
--
--   -- the capstone's gate, and whether the level floor is met
--   select public.main_quest_capstone_ready('<uid>'),
--          public.main_quest_level_reached('<uid>');
--
--   -- the free first drive: `used` should be one lower than the raw count
--   -- during the month a driver took their very first trip
--   select * from public.drive_quota('<uid>');
--
--   -- the whitelist: both should return false
--   select public.complete_main_quest_step('first_drive');
--   select public.complete_main_quest_step('reach_level_2');
