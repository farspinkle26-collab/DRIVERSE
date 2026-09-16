import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { parseLimitRejection } from "@/lib/platinumLimits";
import {
  type ConvoyErrorInfo,
  describeConvoyError,
  isMissingDatabaseObject,
} from "@/lib/convoyErrors";
import {
  type ConvoyDestination,
  convoyDestinationFromRow,
  sameConvoyDestination,
} from "@/lib/convoyNav";
import { useAuth } from "./useAuthStore";
import { usePlatinum } from "./usePlatinumStore";
import { useNotifications } from "./useNotificationStore";

// ─── Types ─────────────────────────────────────────────────
export interface PartyMember {
  id: string;
  party_id: string;
  user_id: string;
  role: "leader" | "member";
  status: "invited" | "accepted";
  name: string;
  avatar?: string;
  level: number;
}

export interface Party {
  id: string;
  leader_id: string;
  name: string;
  color: string;
  visibility: "public" | "invite_only";
  description: string;
  max_members: number; // 0 = unlimited
  /**
   * Where the leader has pointed the convoy, or `null`. Read off the same
   * `parties` row every member is already subscribed to — see
   * `lib/convoyNav.ts` for why it lives there rather than in its own table.
   */
  destination: ConvoyDestination | null;
}

/** A driver who could be invited. `inConvoy` drivers can still be invited —
 *  they just have to leave theirs before they can accept. */
export interface InviteCandidate {
  id: string;
  name: string;
  avatar?: string;
  inConvoy: boolean;
  isFriend: boolean;
}

/** Every convoy write answers in this shape: it either worked, or it says
 *  exactly what went wrong, in words meant for a driver. */
export interface ConvoyResult {
  ok: boolean;
  error?: ConvoyErrorInfo;
  /** True when the failure was a tier cap and the paywall was raised. */
  limitReached?: boolean;
}

export interface PublicPartySummary {
  id: string;
  name: string;
  description: string;
  color: string;
  max_members: number;
  member_count: number;
  leader_name: string;
}

export interface CreatePartyOptions {
  visibility?: "public" | "invite_only";
  description?: string;
  maxMembers?: number;
}

export interface PartyInvite {
  id: string; // party_members row id
  party_id: string;
  party_name: string;
  party_color: string;
  leader_name: string;
  leader_avatar?: string;
}

interface PartyState {
  party: Party | null;
  members: PartyMember[];
  invites: PartyInvite[]; // pending invites addressed to me, across any party
  loading: boolean;
}

// Distinct from the generic online-player ring palette so a party ring
// always reads as "special" against regular player markers.
export const PARTY_COLORS = ["#FFD700", "#FF3B6F", "#22D3EE", "#A78BFA", "#34D399"];

/**
 * One place that turns a `parties` row into a `Party`.
 *
 * Every field except the primary key is defaulted, because this has to keep
 * working against a database that is one migration behind: `visibility`,
 * `description` and `max_members` arrive with community v2, the `dest_*`
 * columns with `database_migration_convoy_shared_nav.sql`, and a row missing
 * either set is a convoy that simply has no destination and is invite-only —
 * not a crash.
 */
function mapPartyRow(row: any): Party {
  return {
    id: row.id,
    leader_id: row.leader_id,
    name: row.name,
    color: row.color,
    visibility: row.visibility ?? "invite_only",
    description: row.description ?? "",
    max_members: row.max_members ?? 0,
    destination: convoyDestinationFromRow(row),
  };
}

export const [PartyProvider, useParty] = createContextHook(() => {
  const { user } = useAuth();
  const { limit, openPaywall } = usePlatinum();
  const { showNotification } = useNotifications();
  const [state, setState] = useState<PartyState>({
    party: null,
    members: [],
    invites: [],
    loading: false,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const hydrateMembers = useCallback(async (rows: any[]): Promise<PartyMember[]> => {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.user_id);
    const [{ data: profiles }, { data: xp }] = await Promise.all([
      supabase.from("profiles").select("id, name, avatar").in("id", ids),
      supabase.from("user_xp").select("user_id, level").in("user_id", ids),
    ]);
    const profileMap: Record<string, { name: string; avatar?: string }> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = { name: p.name, avatar: p.avatar }; });
    const levelMap: Record<string, number> = {};
    (xp ?? []).forEach((x: any) => { levelMap[x.user_id] = x.level; });

    return rows.map((r) => ({
      id: r.id,
      party_id: r.party_id,
      user_id: r.user_id,
      role: r.role,
      status: r.status,
      name: profileMap[r.user_id]?.name ?? "Driver",
      avatar: profileMap[r.user_id]?.avatar,
      level: levelMap[r.user_id] ?? 1,
    }));
  }, []);

  // ─── Resolve pending invites to my-party display info ────
  const hydrateInvites = useCallback(async (rows: any[]): Promise<PartyInvite[]> => {
    if (rows.length === 0) return [];
    const partyIds = rows.map((r) => r.party_id);
    const { data: partyRows } = await supabase.from("parties").select("*").in("id", partyIds);
    const leaderIds = (partyRows ?? []).map((p: any) => p.leader_id);
    const { data: leaderProfiles } = leaderIds.length
      ? await supabase.from("profiles").select("id, name, avatar").in("id", leaderIds)
      : { data: [] as any[] };

    const partyMap: Record<string, any> = {};
    (partyRows ?? []).forEach((p: any) => { partyMap[p.id] = p; });
    const leaderMap: Record<string, { name: string; avatar?: string }> = {};
    (leaderProfiles ?? []).forEach((p: any) => { leaderMap[p.id] = { name: p.name, avatar: p.avatar }; });

    return rows.map((r) => {
      const p = partyMap[r.party_id];
      const leader = p ? leaderMap[p.leader_id] : undefined;
      return {
        id: r.id,
        party_id: r.party_id,
        party_name: p?.name ?? "Convoy",
        party_color: p?.color ?? "#FFD700",
        leader_name: leader?.name ?? "Driver",
        leader_avatar: leader?.avatar,
      };
    });
  }, []);

  // ─── Load my party (if any) + pending invites ────────────
  const loadParty = useCallback(async () => {
    if (!user) return;
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const { data: myRows } = await supabase
        .from("party_members")
        .select("*")
        .eq("user_id", user.id);

      const accepted = (myRows ?? []).find((r) => r.status === "accepted");
      const invitedRows = (myRows ?? []).filter((r) => r.status === "invited");

      const invites = await hydrateInvites(invitedRows);

      if (!accepted) {
        setState((prev) => ({ ...prev, party: null, members: [], invites, loading: false }));
        return;
      }

      const [{ data: partyRow }, { data: rosterRows }] = await Promise.all([
        supabase.from("parties").select("*").eq("id", accepted.party_id).single(),
        supabase.from("party_members").select("*").eq("party_id", accepted.party_id),
      ]);

      const members = await hydrateMembers(rosterRows ?? []);

      setState((prev) => ({
        ...prev,
        party: partyRow ? mapPartyRow(partyRow) : null,
        members,
        invites,
        loading: false,
      }));
    } catch (error) {
      console.error("Error loading party:", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [user, hydrateMembers, hydrateInvites]);

  // ─── Tier cap ────────────────────────────────────────────
  //
  // Convoy size is capped by the ORGANISER's tier, not each joiner's:
  // Regular convoys hold 5 drivers, Platinum 8. That is what makes the perk
  // coherent — a Platinum organiser can gather 8 Regular drivers, and a
  // Regular organiser's convoy doesn't grow just because a Platinum driver
  // joined it. The same rule is enforced in `enforce_convoy_limit()`.
  //
  // Consequence worth stating: a driver who is BLOCKED FROM JOINING someone
  // else's full convoy is never shown the paywall. Upgrading would not let
  // them in, so offering it would be a straight-up misleading upsell.
  const convoyMemberLimit = limit("convoyMembers");

  /** Seats taken in my convoy: accepted members plus outstanding invites. */
  const seatsTaken = useMemo(() => state.members.length, [state.members]);

  // ─── Create a party (I become leader) ────────────────────
  //
  // Two paths, deliberately:
  //
  //   1. `create_convoy()` — one SECURITY DEFINER statement that inserts the
  //      party and seats the leader without RLS in the way. This is the path
  //      that fixes "Couldn't create convoy": the leader's own seat was going
  //      through a `party_members` policy that queried `party_members`, and
  //      Postgres aborts that with 42P17 rather than answering it.
  //   2. The original direct INSERT — used only when the function isn't
  //      deployed yet, so a database that hasn't had
  //      `database_migration_convoy_shared_nav.sql` run against it keeps
  //      working exactly as it did.
  //
  // Whichever path fails, the caller gets the real reason. The old contract
  // was a bare `false`, which is how a permanent schema error spent this long
  // being reported to drivers as "Please try again."
  const createParty = useCallback(async (name: string, options?: CreatePartyOptions): Promise<ConvoyResult> => {
    if (!user) {
      return {
        ok: false,
        error: {
          title: "Sign in to start a convoy",
          message: "A convoy is led by a driver account, so it can't be created while signed out.",
          needsMigration: false,
          rpcMissing: false,
        },
      };
    }

    // A requested capacity above the organiser's tier cap is clamped rather
    // than rejected: the driver picked "25" from a menu that predates
    // Platinum, and silently honouring the real ceiling beats failing the
    // create. The upgrade prompt comes when they try to fill those seats.
    const requested = options?.maxMembers ?? 0;
    const maxMembers =
      convoyMemberLimit === null
        ? requested
        : requested === 0
          ? convoyMemberLimit
          : Math.min(requested, convoyMemberLimit);

    const trimmedName = name.trim() || "Convoy";
    const visibility = options?.visibility ?? "invite_only";
    const description = options?.description?.trim() ?? "";

    try {
      const { error: rpcError } = await supabase.rpc("create_convoy", {
        p_name: trimmedName,
        p_visibility: visibility,
        p_description: description,
        p_max_members: maxMembers,
        p_color: PARTY_COLORS[Math.floor(Math.random() * PARTY_COLORS.length)],
      });

      if (!rpcError) {
        await loadParty();
        return { ok: true };
      }

      const rpcInfo = describeConvoyError(rpcError, "create a convoy");
      if (!rpcInfo.rpcMissing) {
        // The function ran and refused. That answer is authoritative — do not
        // retry through the legacy path, which would only fail differently.
        console.error("create_convoy rejected:", rpcError);
        return { ok: false, error: rpcInfo };
      }

      // ── Fallback: the pre-migration path ──────────────────
      const { error } = await supabase
        .from("parties")
        .insert({
          leader_id: user.id,
          name: trimmedName,
          color: PARTY_COLORS[Math.floor(Math.random() * PARTY_COLORS.length)],
          visibility,
          description,
          max_members: maxMembers,
        })
        .select()
        .single();

      if (error) {
        // A database old enough to lack the RPC may also lack the columns the
        // insert above sends. One more attempt with the columns that have
        // existed since database_migration_parties.sql, so a convoy can still
        // be created on the oldest schema this app has ever shipped against.
        if (isMissingDatabaseObject(error)) {
          const { error: baseError } = await supabase
            .from("parties")
            .insert({ leader_id: user.id, name: trimmedName, color: PARTY_COLORS[0] })
            .select()
            .single();
          if (!baseError) {
            await loadParty();
            return { ok: true };
          }
          console.error("Error creating party (base columns):", baseError);
          return { ok: false, error: describeConvoyError(baseError, "create a convoy") };
        }
        console.error("Error creating party:", error);
        return { ok: false, error: describeConvoyError(error, "create a convoy") };
      }

      await loadParty();
      return { ok: true };
    } catch (error) {
      console.error("Error creating party:", error);
      return { ok: false, error: describeConvoyError(error, "create a convoy") };
    }
  }, [user, loadParty, convoyMemberLimit]);

  // ─── Browse public convoys (for anyone not already in one) ──
  const [publicParties, setPublicParties] = useState<PublicPartySummary[]>([]);
  const [loadingPublicParties, setLoadingPublicParties] = useState(false);

  const browsePublicParties = useCallback(async () => {
    setLoadingPublicParties(true);
    try {
      const { data: partyRows } = await supabase
        .from("parties")
        .select("*")
        .eq("visibility", "public")
        .order("created_at", { ascending: false });

      const rows = (partyRows ?? []) as any[];
      if (rows.length === 0) {
        setPublicParties([]);
        return;
      }

      const partyIds = rows.map((p) => p.id);
      const leaderIds = [...new Set(rows.map((p) => p.leader_id))];
      const [{ data: memberRows }, { data: leaderProfiles }] = await Promise.all([
        supabase.from("party_members").select("party_id, user_id").eq("status", "accepted").in("party_id", partyIds),
        supabase.from("profiles").select("id, name").in("id", leaderIds),
      ]);

      const countMap = new Map<string, number>();
      (memberRows ?? []).forEach((m: any) => {
        countMap.set(m.party_id, (countMap.get(m.party_id) ?? 0) + 1);
      });
      const leaderMap = new Map<string, string>();
      (leaderProfiles ?? []).forEach((p: any) => { leaderMap.set(p.id, p.name ?? "Driver"); });

      setPublicParties(
        rows.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          color: p.color,
          max_members: p.max_members ?? 0,
          member_count: countMap.get(p.id) ?? 0,
          leader_name: leaderMap.get(p.leader_id) ?? "Driver",
        }))
      );
    } catch (error) {
      console.error("Error browsing convoys:", error);
    } finally {
      setLoadingPublicParties(false);
    }
  }, []);

  // ─── Fetch any convoy + its accepted roster by id (for viewing a
  // convoy you're browsing, not just your own) ─────────────
  const getPartyDetail = useCallback(async (partyId: string): Promise<{ party: Party | null; members: PartyMember[] }> => {
    const { data: partyRow } = await supabase.from("parties").select("*").eq("id", partyId).single();
    if (!partyRow) return { party: null, members: [] };
    const { data: rosterRows } = await supabase
      .from("party_members")
      .select("*")
      .eq("party_id", partyId)
      .eq("status", "accepted");
    const members = await hydrateMembers(rosterRows ?? []);
    return { party: mapPartyRow(partyRow), members };
  }, [hydrateMembers]);

  // ─── Join a public convoy directly (no invite needed) ────
  const joinParty = useCallback(async (partyId: string): Promise<{ ok: boolean; message?: string }> => {
    if (!user) return { ok: false, message: "Sign in to join a convoy." };
    try {
      const { error } = await supabase
        .from("party_members")
        .insert({ party_id: partyId, user_id: user.id, role: "member", status: "accepted" });
      if (error) {
        if (error.code === "23505") return { ok: false, message: "Leave your current convoy first." };
        // Capacity is the ORGANISER's, so no paywall here — see the tier-cap
        // note above. The joiner just gets told the convoy is full.
        const rejection = parseLimitRejection(error);
        if (rejection) {
          return { ok: false, message: `This convoy is full at ${rejection.cap} drivers.` };
        }
        if (error.message.includes("full")) return { ok: false, message: "This convoy is full." };
        return { ok: false, message: error.message };
      }
      await loadParty();
      return { ok: true };
    } catch (error) {
      console.error("Error joining party:", error);
      return { ok: false, message: "Something went wrong." };
    }
  }, [user, loadParty]);

  // ─── Invite any driver into my current party ─────────────
  //
  // "Any driver" is the change: an invite used to require an accepted
  // `friends` row on both the client and in RLS, which made the most natural
  // invite in the product — the driver you can see two streets away on the
  // map — the one that always failed. The friends check is gone from both
  // halves; what remains is that only someone already in the convoy can
  // invite, and the invitee still has to accept.
  const inviteDriver = useCallback(async (driverId: string): Promise<ConvoyResult> => {
    if (!user || !state.party) {
      return {
        ok: false,
        error: {
          title: "You're not in a convoy yet",
          message: "An invite has to point at a convoy. Start one, then invite drivers.",
          needsMigration: false,
          rpcMissing: false,
        },
      };
    }

    // The organiser IS the one who can lift this cap, so this is the friction
    // point that earns a paywall. Outstanding invites count as taken seats —
    // otherwise a leader can invite ten drivers and only discover the ceiling
    // when the third one accepts.
    if (
      state.party.leader_id === user.id &&
      convoyMemberLimit !== null &&
      seatsTaken >= convoyMemberLimit
    ) {
      openPaywall("convoy");
      return {
        ok: false,
        limitReached: true,
        error: {
          title: "Your convoy is full",
          message: `Regular convoys cap at ${convoyMemberLimit} drivers. Go Platinum to roll deeper.`,
          needsMigration: false,
          rpcMissing: false,
        },
      };
    }

    const handleFailure = (error: unknown): ConvoyResult => {
      const rejection = parseLimitRejection(error);
      if (rejection) {
        // Only the organiser can lift the cap, so only the organiser is shown
        // the way past it.
        if (state.party?.leader_id === user.id) openPaywall(rejection.benefit);
        return {
          ok: false,
          limitReached: true,
          error: describeConvoyError(error, "send that invite"),
        };
      }
      return { ok: false, error: describeConvoyError(error, "send that invite") };
    };

    try {
      const { error: rpcError } = await supabase.rpc("invite_to_convoy", { p_user_id: driverId });
      if (!rpcError) {
        await loadParty();
        return { ok: true };
      }
      if (!describeConvoyError(rpcError, "send that invite").rpcMissing) {
        return handleFailure(rpcError);
      }

      // ── Fallback: direct insert, pre-migration ────────────
      const { error } = await supabase.from("party_members").insert({
        party_id: state.party.id,
        user_id: driverId,
        role: "member",
        status: "invited",
      });
      if (error) return handleFailure(error);
      await loadParty();
      return { ok: true };
    } catch (error) {
      console.error("Error inviting to party:", error);
      return handleFailure(error);
    }
  }, [user, state.party, loadParty, convoyMemberLimit, seatsTaken, openPaywall]);

  // ─── Find drivers to invite ──────────────────────────────
  //
  // Goes through `search_convoy_invitees` because one field it returns cannot
  // be computed on the client: whether a driver is already in someone else's
  // convoy. Those `party_members` rows aren't visible to me, so without the
  // RPC the picker would happily offer a driver who cannot accept. On an
  // un-migrated database it falls back to a plain `profiles` search and
  // simply doesn't know — the invite still works, it just may sit pending.
  const searchDrivers = useCallback(async (query: string, limit = 20): Promise<InviteCandidate[]> => {
    const trimmed = query.trim();
    try {
      const { data, error } = await supabase.rpc("search_convoy_invitees", {
        p_query: trimmed,
        p_limit: limit,
      });
      if (!error) {
        return ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          name: r.name ?? "Driver",
          avatar: r.avatar ?? undefined,
          inConvoy: Boolean(r.in_convoy),
          isFriend: false,
        }));
      }
      if (!isMissingDatabaseObject(error)) {
        console.error("Error searching drivers:", error);
        return [];
      }

      let request = supabase.from("profiles").select("id, name, avatar").limit(limit);
      if (trimmed) request = request.ilike("name", `%${trimmed}%`);
      const { data: rows } = await request;
      return ((rows ?? []) as any[])
        .filter((r) => r.id !== user?.id)
        .map((r) => ({
          id: r.id,
          name: r.name ?? "Driver",
          avatar: r.avatar ?? undefined,
          inConvoy: false,
          isFriend: false,
        }));
    } catch (error) {
      console.error("Error searching drivers:", error);
      return [];
    }
  }, [user?.id]);

  // ─── Accept / decline an invite ──────────────────────────
  const acceptInvite = useCallback(async (partyId: string): Promise<{ ok: boolean; message?: string }> => {
    if (!user) return { ok: false };
    try {
      const { error } = await supabase
        .from("party_members")
        .update({ status: "accepted" })
        .eq("party_id", partyId)
        .eq("user_id", user.id);
      if (error) {
        if (error.code === "23505") return { ok: false, message: "Leave your current convoy first." };
        const rejection = parseLimitRejection(error);
        if (rejection) {
          // Someone else took the last seat between the invite and the
          // accept. Again the organiser's cap, so no paywall for the invitee.
          return { ok: false, message: `That convoy filled up at ${rejection.cap} drivers.` };
        }
        return { ok: false, message: error.message };
      }
      await loadParty();
      return { ok: true };
    } catch (error) {
      console.error("Error accepting party invite:", error);
      return { ok: false };
    }
  }, [user, loadParty]);

  const declineInvite = useCallback(async (partyId: string) => {
    if (!user) return;
    await supabase.from("party_members").delete().eq("party_id", partyId).eq("user_id", user.id);
    await loadParty();
  }, [user, loadParty]);

  // ─── Leave (member) or disband (leader) ──────────────────
  const leaveParty = useCallback(async () => {
    if (!user || !state.party) return;
    try {
      if (state.party.leader_id === user.id) {
        await supabase.from("parties").delete().eq("id", state.party.id);
      } else {
        await supabase.from("party_members").delete().eq("party_id", state.party.id).eq("user_id", user.id);
      }
      await loadParty();
    } catch (error) {
      console.error("Error leaving party:", error);
    }
  }, [user, state.party, loadParty]);

  // ─── Kick a member (leader only) ──────────────────────────
  const kickMember = useCallback(async (userId: string) => {
    if (!user || !state.party || state.party.leader_id !== user.id) return;
    await supabase.from("party_members").delete().eq("party_id", state.party.id).eq("user_id", userId);
    await loadParty();
  }, [user, state.party, loadParty]);

  // ─── Shared navigation: the leader's destination ─────────
  //
  // Optimistic on purpose. The leader taps Route and the banner has to be up
  // before the round trip finishes, or the feature reads as laggy on the one
  // device whose action it is. The realtime event that follows carries the
  // same values, so a failed write self-corrects on the next `loadParty`.
  const setDestination = useCallback(async (
    destination: { lat: number; lng: number; name?: string }
  ): Promise<ConvoyResult> => {
    if (!user || !state.party) return { ok: false };
    if (state.party.leader_id !== user.id) {
      return {
        ok: false,
        error: {
          title: "Only the leader sets the route",
          message: "The convoy follows its leader's destination. Ask them to set it.",
          needsMigration: false,
          rpcMissing: false,
        },
      };
    }
    // Rule 2 in lib/convoyNav.ts: the map re-runs its navigation effect on
    // every GPS tick, and without this the leader would republish about once
    // a second and every member would take a realtime event for it.
    if (sameConvoyDestination(state.party.destination, destination)) return { ok: true };

    const optimistic: ConvoyDestination = {
      lat: destination.lat,
      lng: destination.lng,
      name: destination.name?.trim() || `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`,
      setBy: user.id,
      setAt: Date.now(),
    };
    setState((prev) => (prev.party ? { ...prev, party: { ...prev.party, destination: optimistic } } : prev));

    const { error } = await supabase.rpc("set_convoy_destination", {
      p_lat: destination.lat,
      p_lng: destination.lng,
      p_name: destination.name ?? null,
    });
    if (error) {
      console.error("Error sharing convoy destination:", error);
      await loadParty();
      return { ok: false, error: describeConvoyError(error, "share that destination") };
    }
    return { ok: true };
  }, [user, state.party, loadParty]);

  const clearDestination = useCallback(async (): Promise<void> => {
    if (!user || !state.party || state.party.leader_id !== user.id) return;
    if (!state.party.destination) return;
    setState((prev) => (prev.party ? { ...prev, party: { ...prev.party, destination: null } } : prev));
    const { error } = await supabase.rpc("clear_convoy_destination");
    if (error) {
      console.error("Error clearing convoy destination:", error);
      await loadParty();
    }
  }, [user, state.party, loadParty]);

  // ─── Realtime: refresh whenever my roster row changes ────
  useEffect(() => {
    if (!user) return;
    loadParty();

    const channel = supabase
      .channel(`party_members_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "party_members" },
        (payload) => {
          loadParty();

          // A fresh invite for this driver → toast it, regardless of screen
          // (this store is mounted globally in `app/_layout.tsx`).
          const row = payload.new as { user_id?: string; status?: string; party_id?: string } | null;
          if (
            payload.eventType === "INSERT" &&
            row?.user_id === user.id &&
            row?.status === "invited" &&
            row.party_id
          ) {
            supabase
              .from("parties")
              .select("name")
              .eq("id", row.party_id)
              .single()
              .then(({ data }) => {
                showNotification(
                  "Convoy invite",
                  `You've been invited to join ${data?.name ?? "a convoy"}`,
                  "request",
                  { partyId: row.party_id }
                );
              });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parties" },
        () => loadParty()
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user, loadParty, showNotification]);

  const partyMemberIds = useMemo(
    () => new Set(state.members.filter((m) => m.status === "accepted" && m.user_id !== user?.id).map((m) => m.user_id)),
    [state.members, user?.id]
  );

  const isLeader = state.party?.leader_id === user?.id;

  /** Every accepted member's id, mine included — what the map needs to know
   *  which drivers on screen get the convoy pin. */
  const partyMemberIdsWithMe = useMemo(
    () => new Set(state.members.filter((m) => m.status === "accepted").map((m) => m.user_id)),
    [state.members]
  );

  const leaderName = useMemo(
    () => state.members.find((m) => m.role === "leader")?.name ?? "The leader",
    [state.members]
  );

  return useMemo(() => ({
    party: state.party,
    members: state.members,
    invites: state.invites,
    loading: state.loading,
    partyMemberIds,
    partyMemberIdsWithMe,
    leaderName,
    isLeader,
    loadParty,
    createParty,
    inviteDriver,
    searchDrivers,
    acceptInvite,
    declineInvite,
    leaveParty,
    kickMember,
    publicParties,
    loadingPublicParties,
    browsePublicParties,
    joinParty,
    getPartyDetail,
    /** The convoy's shared destination, or `null`. Leader-written. */
    destination: state.party?.destination ?? null,
    setDestination,
    clearDestination,
    /** My cap as an organiser. `null` would mean unlimited; Platinum is 8. */
    convoyMemberLimit,
    seatsTaken,
    /** True when inviting another driver would raise the paywall. */
    atConvoyLimit: convoyMemberLimit !== null && seatsTaken >= convoyMemberLimit,
  }), [state, partyMemberIds, partyMemberIdsWithMe, leaderName, isLeader, loadParty, createParty, inviteDriver, searchDrivers, acceptInvite, declineInvite, leaveParty, kickMember, publicParties, loadingPublicParties, browsePublicParties, joinParty, getPartyDetail, setDestination, clearDestination, convoyMemberLimit, seatsTaken]);
});
