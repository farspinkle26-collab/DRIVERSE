import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────
export type GroupConversationKind = "event" | "convoy";

export interface GroupConversationSummary {
  id: string;
  kind: GroupConversationKind;
  event_id: string | null;
  party_id: string | null;
  title: string;
  last_message: string;
  last_at: string;
  member_count: number;
}

interface ConversationRow {
  id: string;
  kind: GroupConversationKind;
  event_id: string | null;
  party_id: string | null;
  title: string;
  created_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

// ─── Context Hook: the list of group conversations I'm in ───
export const [GroupChatProvider, useGroupChat] = createContextHook(() => {
  const [conversations, setConversations] = useState<GroupConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
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

  const fetchConversations = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    try {
      const { data: memberRows } = await supabase
        .from("group_conversation_members")
        .select("conversation_id")
        .eq("user_id", uid);

      const conversationIds = (memberRows ?? []).map((m: any) => m.conversation_id);
      if (conversationIds.length === 0) {
        setConversations([]);
        return;
      }

      const [{ data: convoRows }, { data: allMemberRows }, { data: messageRows }] = await Promise.all([
        supabase.from("group_conversations").select("*").in("id", conversationIds),
        supabase.from("group_conversation_members").select("conversation_id").in("conversation_id", conversationIds),
        supabase
          .from("group_messages")
          .select("*")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false }),
      ]);

      const countMap = new Map<string, number>();
      (allMemberRows ?? []).forEach((m: any) => {
        countMap.set(m.conversation_id, (countMap.get(m.conversation_id) ?? 0) + 1);
      });

      const lastMessageMap = new Map<string, MessageRow>();
      (messageRows ?? []).forEach((m: any) => {
        if (!lastMessageMap.has(m.conversation_id)) lastMessageMap.set(m.conversation_id, m);
      });

      const rows = (convoRows ?? []) as ConversationRow[];
      const summaries: GroupConversationSummary[] = rows.map((c) => {
        const last = lastMessageMap.get(c.id);
        return {
          id: c.id,
          kind: c.kind,
          event_id: c.event_id,
          party_id: c.party_id,
          title: c.title,
          last_message: last?.content ?? "",
          last_at: last?.created_at ?? c.created_at,
          member_count: countMap.get(c.id) ?? 0,
        };
      });
      summaries.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
      setConversations(summaries);
    } catch (error) {
      console.error("Error loading group conversations:", error);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      return;
    }
    setLoadingConversations(true);
    fetchConversations().finally(() => setLoadingConversations(false));

    const channel = supabase
      .channel(`group_chat_inbox_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_messages" },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_conversation_members", filter: `user_id=eq.${userId}` },
        () => fetchConversations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchConversations]);

  return {
    conversations,
    loadingConversations,
    refresh: fetchConversations,
  };
});
