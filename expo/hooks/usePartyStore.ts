import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { parseLimitRejection } from "@/lib/platinumLimits";
import { useAuth } from "./useAuthStore";
import { usePlatinum } from "./usePlatinumStore";

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

export const [PartyProvider, useParty] = createContextHook(() => {
  const { user } = useAuth();
  const { limit, openPaywall } = usePlatinum();
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
        party: partyRow ? {
          id: partyRow.id,
          leader_id: partyRow.leader_id,
          name: partyRow.name,
          color: partyRow.color,
          visibility: partyRow.visibility ?? "invite_only",
          description: partyRow.description ?? "",
          max_members: partyRow.max_members ?? 0,
        } : null,
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
  // Regular convoys hold 2 drivers, Platinum 8. That is what makes the perk
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
  const createParty = useCallback(async (name: string, options?: CreatePartyOptions): Promise<boolean> => {
    if (!user) return false;
    try {
      const color = PARTY_COLORS[Math.floor(Math.random() * PARTY_COLORS.length)];
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

      const { error } = await supabase
        .from("parties")
        .insert({
          leader_id: user.id,
          name: name.trim() || "Convoy",
          color,
          visibility: options?.visibility ?? "invite_only",
          description: options?.description?.trim() ?? "",
          max_members: maxMembers,
        })
        .select()
        .single();
      if (error) {
        console.error("Error creating party:", error);
        return false;
      }
      await loadParty();
      return true;
    } catch (error) {
      console.error("Error creating party:", error);
      return false;
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
    return {
      party: {
        id: partyRow.id,
        leader_id: partyRow.leader_id,
        name: partyRow.name,
        color: partyRow.color,
        visibility: partyRow.visibility ?? "invite_only",
        description: partyRow.description ?? "",
        max_members: partyRow.max_members ?? 0,
      },
      members,
    };
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

  // ─── Invite an accepted friend into my current party ─────
  const inviteFriend = useCallback(async (friendId: string): Promise<{ ok: boolean; message?: string; limitReached?: boolean }> => {
    if (!user || !state.party) return { ok: false, message: "You need a convoy first." };

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
        message: `Regular convoys cap at ${convoyMemberLimit} drivers. Go Platinum to roll deeper.`,
      };
    }

    try {
      const { error } = await supabase.from("party_members").insert({
        party_id: state.party.id,
        user_id: friendId,
        role: "member",
        status: "invited",
      });
      if (error) {
        if (error.code === "23505") return { ok: false, message: "Already invited or in a convoy." };
        const rejection = parseLimitRejection(error);
        if (rejection) {
          openPaywall(rejection.benefit);
          return { ok: false, limitReached: true, message: rejection.message };
        }
        return { ok: false, message: error.message };
      }
      await loadParty();
      return { ok: true };
    } catch (error) {
      console.error("Error inviting to party:", error);
      return { ok: false, message: "Something went wrong." };
    }
  }, [user, state.party, loadParty, convoyMemberLimit, seatsTaken, openPaywall]);

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

  // ─── Realtime: refresh whenever my roster row changes ────
  useEffect(() => {
    if (!user) return;
    loadParty();

    const channel = supabase
      .channel(`party_members_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "party_members" },
        () => loadParty()
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
  }, [user, loadParty]);

  const partyMemberIds = useMemo(
    () => new Set(state.members.filter((m) => m.status === "accepted" && m.user_id !== user?.id).map((m) => m.user_id)),
    [state.members, user?.id]
  );

  const isLeader = state.party?.leader_id === user?.id;

  return useMemo(() => ({
    party: state.party,
    members: state.members,
    invites: state.invites,
    loading: state.loading,
    partyMemberIds,
    isLeader,
    loadParty,
    createParty,
    inviteFriend,
    acceptInvite,
    declineInvite,
    leaveParty,
    kickMember,
    publicParties,
    loadingPublicParties,
    browsePublicParties,
    joinParty,
    getPartyDetail,
    /** My cap as an organiser. `null` would mean unlimited; Platinum is 8. */
    convoyMemberLimit,
    seatsTaken,
    /** True when inviting another driver would raise the paywall. */
    atConvoyLimit: convoyMemberLimit !== null && seatsTaken >= convoyMemberLimit,
  }), [state, partyMemberIds, isLeader, loadParty, createParty, inviteFriend, acceptInvite, declineInvite, leaveParty, kickMember, publicParties, loadingPublicParties, browsePublicParties, joinParty, getPartyDetail, convoyMemberLimit, seatsTaken]);
});
