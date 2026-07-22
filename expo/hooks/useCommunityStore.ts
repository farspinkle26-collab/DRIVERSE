import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { resolveCountry } from "@/lib/geoCountry";

// ─── Types ─────────────────────────────────────────────────
export interface Crew {
  id: string;
  creator_id: string;
  name: string;
  tag: string;
  description: string;
  country: string;
  created_at: string;
  // Derived
  member_count: number;
  is_joined: boolean;
  is_creator: boolean;
}

export interface CreateCrewInput {
  name: string;
  tag?: string;
  description?: string;
}

interface CrewRow {
  id: string;
  creator_id: string;
  name: string;
  tag: string;
  description: string;
  country: string;
  created_at: string;
}

interface MemberRow {
  crew_id: string;
  user_id: string;
  role: "creator" | "member";
}

// ─── Context Hook ──────────────────────────────────────────
export const [CommunityProvider, useCommunity] = createContextHook(() => {
  const [crews, setCrews] = useState<Crew[]>([]);
  const [loadingCrews, setLoadingCrews] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  const fetchCrews = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    try {
      const { data: rows } = await supabase
        .from("community_crews")
        .select("*")
        .order("created_at", { ascending: false });

      const crewRows = (rows ?? []) as CrewRow[];
      if (crewRows.length === 0) {
        setCrews([]);
        return;
      }

      const crewIds = crewRows.map((c) => c.id);
      const { data: members } = await supabase
        .from("community_crew_members")
        .select("crew_id, user_id, role")
        .in("crew_id", crewIds);

      const memberRows = (members ?? []) as MemberRow[];
      const countMap = new Map<string, number>();
      const joinedSet = new Set<string>();
      for (const m of memberRows) {
        countMap.set(m.crew_id, (countMap.get(m.crew_id) ?? 0) + 1);
        if (m.user_id === uid) joinedSet.add(m.crew_id);
      }

      setCrews(
        crewRows.map((c) => ({
          ...c,
          member_count: countMap.get(c.id) ?? 0,
          is_joined: joinedSet.has(c.id),
          is_creator: c.creator_id === uid,
        }))
      );
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setCrews([]);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    setLoadingCrews(true);
    fetchCrews().finally(() => setLoadingCrews(false));

    const channel = supabase
      .channel("community-crews-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_crews" },
        () => { fetchCrews(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "community_crew_members" },
        () => { fetchCrews(); }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchCrews]);

  const createCrew = useCallback(
    async (input: CreateCrewInput): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to start a crew" };

      const country = await resolveCountry();
      if (!country) return { error: "Couldn't determine your country — check location permissions" };

      const { error } = await supabase.from("community_crews").insert({
        creator_id: uid,
        name: input.name.trim(),
        tag: (input.tag ?? "").trim().toUpperCase(),
        description: (input.description ?? "").trim(),
        country,
      });

      if (error) return { error: error.message };
      await fetchCrews();
      return {};
    },
    [fetchCrews]
  );

  const joinCrew = useCallback(
    async (crewId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to join a crew" };

      const { error } = await supabase.from("community_crew_members").insert({
        crew_id: crewId,
        user_id: uid,
        role: "member",
      });

      if (error) {
        if (error.code === "23505") return { error: "You already joined this crew" };
        return { error: error.message };
      }
      await fetchCrews();
      return {};
    },
    [fetchCrews]
  );

  const leaveCrew = useCallback(
    async (crewId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };

      const { error } = await supabase
        .from("community_crew_members")
        .delete()
        .eq("crew_id", crewId)
        .eq("user_id", uid);

      if (error) return { error: error.message };
      await fetchCrews();
      return {};
    },
    [fetchCrews]
  );

  return {
    crews,
    loadingCrews,
    fetchCrews,
    createCrew,
    joinCrew,
    leaveCrew,
  };
});
