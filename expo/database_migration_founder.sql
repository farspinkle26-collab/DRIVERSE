-- Driveverse — Founder badge
--
-- A one-time cosmetic status mark, earned by redeeming the launch code
-- ("IAMaFounder#") rather than by paying or by progression. Orthogonal to
-- both Platinum (a subscription) and rank (progression) — a driver can hold
-- any combination of the three.
--
-- ── WHERE THE TRUTH LIVES ───────────────────────────────────────────
-- Unlike Platinum, there is no external system of record to mirror — the
-- redemption itself is the event. So `profiles.is_founder` IS the source of
-- truth here, written exactly once via `redeem_founder_code()`, which is
-- `security definer` so the code comparison happens server-side and a
-- modified client can't just `UPDATE profiles SET is_founder = true`.
--
-- Run in the Supabase SQL editor. Idempotent.

alter table public.profiles
  add column if not exists is_founder boolean not null default false;

alter table public.profiles
  add column if not exists founder_redeemed_at timestamptz;

-- ============================================================
-- redeem_founder_code() — the only way is_founder ever becomes true
-- ============================================================
--
-- Runs as the function owner (security definer) so the code itself, and the
-- write to is_founder, never touch the client. Returns true the first time a
-- caller redeems a correct code, false on a wrong code, and true (no-op) on
-- a repeat redemption by someone who already has the badge — redeeming twice
-- isn't an error, it just isn't news.

create or replace function public.redeem_founder_code(code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  already boolean;
begin
  select is_founder into already
  from public.profiles
  where id = auth.uid();

  if already then
    return true;
  end if;

  if code is null or code <> 'IAMaFounder#' then
    return false;
  end if;

  update public.profiles
  set is_founder = true,
      founder_redeemed_at = now()
  where id = auth.uid();

  return true;
end;
$$;

revoke all on function public.redeem_founder_code(text) from public;
grant execute on function public.redeem_founder_code(text) to authenticated;
