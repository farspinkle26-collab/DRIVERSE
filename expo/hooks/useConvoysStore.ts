import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────
export interface Convoy {
  id: string;
  creator_id: string;
  name: string;
  tag: string;
  description: string;
  created_at: string;
  // Derived
  member_count: number;
  is_joined: boolean;
  is_owner: boolean;
}

export interface CreateConvoyInput {
  name: string;
  tag: string;
  description: string;
}

interface ConvoyRow {
  id: string;
  creator_id: string;
  name: string;
  tag: string;
  description: string;
  created_at: string;
}

interface MemberRow {
  convoy_id: string;
  user_id: string;
  role: "owner" | "member";
}

// ─── Context Hook ──────────────────────────────────────────
// Convoys are persistent driving crews (unlike time-boxed events). They are
// visible to every signed-in driver in the app, which today is scoped to a
// single country's user base — the same nationwide audience already used
// for events and public profiles.
export const [ConvoysProvider, useConvoys] = createContextHook(() => {
  const [convoys, setConvoys] = useState<Convoy[]>([]);
  const [loadingConvoys, setLoadingConvoys] = useState(false);
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

  const fetchConvoys = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    try {
      const { data: rows } = await supabase
        .from("convoys")
        .select("*")
        .order("created_at", { ascending: false });

      const convoyRows = (rows ?? []) as ConvoyRow[];
      if (convoyRows.length === 0) {
        setConvoys([]);
        return;
      }

      const convoyIds = convoyRows.map((c) => c.id);
      const { data: members } = await supabase
        .from("convoy_members")
        .select("convoy_id, user_id, role")
        .in("convoy_id", convoyIds);

      const memberRows = (members ?? []) as MemberRow[];
      const countMap = new Map<string, number>();
      const joinedSet = new Set<string>();
      for (const m of memberRows) {
        countMap.set(m.convoy_id, (countMap.get(m.convoy_id) ?? 0) + 1);
        if (m.user_id === uid) joinedSet.add(m.convoy_id);
      }

      setConvoys(
        convoyRows.map((c) => ({
          ...c,
          member_count: countMap.get(c.id) ?? 0,
          is_joined: joinedSet.has(c.id),
          is_owner: c.creator_id === uid,
        }))
      );
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setConvoys([]);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    setLoadingConvoys(true);
    fetchConvoys().finally(() => setLoadingConvoys(false));

    const channel = supabase
      .channel("convoys-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convoys" },
        () => { fetchConvoys(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "convoy_members" },
        () => { fetchConvoys(); }
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchConvoys]);

  const createConvoy = useCallback(
    async (input: CreateConvoyInput): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to create a convoy" };

      const { error } = await supabase.from("convoys").insert({
        creator_id: uid,
        name: input.name.trim(),
        tag: input.tag.trim().toUpperCase(),
        description: input.description.trim(),
      });

      if (error) return { error: error.message };
      await fetchConvoys();
      return {};
    },
    [fetchConvoys]
  );

  const joinConvoy = useCallback(
    async (convoyId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to join a convoy" };

      const { error } = await supabase.from("convoy_members").insert({
        convoy_id: convoyId,
        user_id: uid,
        role: "member",
      });

      if (error) {
        if (error.code === "23505") return { error: "You already joined this convoy" };
        return { error: error.message };
      }
      await fetchConvoys();
      return {};
    },
    [fetchConvoys]
  );

  const leaveConvoy = useCallback(
    async (convoyId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };

      const { error } = await supabase
        .from("convoy_members")
        .delete()
        .eq("convoy_id", convoyId)
        .eq("user_id", uid);

      if (error) return { error: error.message };
      await fetchConvoys();
      return {};
    },
    [fetchConvoys]
  );

  return {
    convoys,
    loadingConvoys,
    fetchConvoys,
    createConvoy,
    joinConvoy,
    leaveConvoy,
  };
});
