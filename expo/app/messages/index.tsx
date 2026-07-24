import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { ArrowLeft, Search, SquarePen, MessageCircle, X, Send, Users } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useGroupChat } from "@/hooks/useGroupChatStore";
import { supabase } from "@/lib/supabase";

interface DirectMessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  avatar?: string;
}

interface ConversationRow {
  key: string;
  kind: "dm" | "group";
  targetId: string; // partnerId for dm, conversationId for group
  name: string;
  avatar?: string;
  lastMessage: string;
  lastSenderIsMe: boolean;
  lastAt: string;
  unread: number;
  memberCount?: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { conversations: groupConversations } = useGroupChat();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<DirectMessageRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Contact>>({});
  const [query, setQuery] = useState("");

  const [composeOpen, setComposeOpen] = useState(false);
  const [friends, setFriends] = useState<Contact[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("Error loading conversations:", error);
      return;
    }
    const list = (data ?? []) as DirectMessageRow[];
    setRows(list);

    const partnerIds = Array.from(
      new Set(list.map((m) => (m.sender_id === user.id ? m.receiver_id : m.sender_id)))
    );
    if (partnerIds.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name, avatar")
        .in("id", partnerIds);
      const map: Record<string, Contact> = {};
      (profileRows ?? []).forEach((p: any) => {
        map[p.id] = { id: p.id, name: p.name ?? "Driver", avatar: p.avatar ?? undefined };
      });
      setProfiles(map);
    }
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    await loadConversations();
    setLoading(false);
  }, [loadConversations]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  // Realtime: any new/updated DM touching me refreshes the inbox.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`messages_inbox_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = (payload.new ?? payload.old) as DirectMessageRow | undefined;
          if (!row) return;
          if (row.sender_id !== user.id && row.receiver_id !== user.id) return;
          loadConversations();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [loadConversations]);

  const conversations = useMemo<ConversationRow[]>(() => {
    if (!user) return [];
    const byPartner = new Map<string, DirectMessageRow>();
    rows.forEach((m) => {
      const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      const existing = byPartner.get(partnerId);
      if (!existing || new Date(m.created_at) > new Date(existing.created_at)) {
        byPartner.set(partnerId, m);
      }
    });
    const unreadByPartner = new Map<string, number>();
    rows.forEach((m) => {
      if (m.receiver_id === user.id && !m.is_read) {
        const partnerId = m.sender_id;
        unreadByPartner.set(partnerId, (unreadByPartner.get(partnerId) ?? 0) + 1);
      }
    });
    const dmList: ConversationRow[] = Array.from(byPartner.entries()).map(([partnerId, last]) => ({
      key: `dm_${partnerId}`,
      kind: "dm" as const,
      targetId: partnerId,
      name: profiles[partnerId]?.name ?? "Driver",
      avatar: profiles[partnerId]?.avatar,
      lastMessage: last.content,
      lastSenderIsMe: last.sender_id === user.id,
      lastAt: last.created_at,
      unread: unreadByPartner.get(partnerId) ?? 0,
    }));

    const groupList: ConversationRow[] = groupConversations.map((c) => ({
      key: `group_${c.id}`,
      kind: "group" as const,
      targetId: c.id,
      name: c.title,
      lastMessage: c.last_message,
      lastSenderIsMe: false,
      lastAt: c.last_at,
      unread: 0,
      memberCount: c.member_count,
    }));

    const list = [...dmList, ...groupList];
    list.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [rows, profiles, user, query, groupConversations]);

  const openCompose = useCallback(async () => {
    setComposeOpen(true);
    if (!user || friends.length > 0) return;
    setFriendsLoading(true);
    const { data: sent } = await supabase
      .from("friends")
      .select("friend_id, status, profiles!friends_friend_id_fkey(name, avatar)")
      .eq("user_id", user.id)
      .eq("status", "accepted");
    const { data: received } = await supabase
      .from("friends")
      .select("user_id, status, profiles!friends_user_id_fkey(name, avatar)")
      .eq("friend_id", user.id)
      .eq("status", "accepted");
    const list: Contact[] = [
      ...(sent ?? []).map((r: any) => ({ id: r.friend_id, name: r.profiles?.name ?? "Driver", avatar: r.profiles?.avatar })),
      ...(received ?? []).map((r: any) => ({ id: r.user_id, name: r.profiles?.name ?? "Driver", avatar: r.profiles?.avatar })),
    ];
    setFriends(list);
    setFriendsLoading(false);
  }, [user, friends.length]);

  const startConversation = useCallback((contactId: string) => {
    setComposeOpen(false);
    router.push(`/messages/${contactId}` as any);
  }, [router]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <MessageCircle size={44} color="#3A3A4E" />
          <Text style={styles.emptyTitle}>Sign in to see your messages</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Messages</Text>
        <TouchableOpacity onPress={openCompose} style={styles.iconBtn} hitSlop={8}>
          <SquarePen size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color="#5A5A6E" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor="#5A5A6E"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}><X size={16} color="#5A5A6E" /></TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color="#FF3B30" style={{ marginTop: 40 }} />
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <MessageCircle size={44} color="#3A3A4E" />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySub}>Start a conversation with a friend</Text>
          <TouchableOpacity style={styles.composeCta} onPress={openCompose} activeOpacity={0.85}>
            <Text style={styles.composeCtaText}>New Message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push(
                (item.kind === "group" ? `/messages/group/${item.targetId}` : `/messages/${item.targetId}`) as any
              )}
            >
              <View style={styles.avatar}>
                {item.kind === "group" ? (
                  <Users size={20} color="#FF3B30" />
                ) : item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() ?? "?"}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                <Text
                  style={[styles.rowPreview, item.unread > 0 && styles.rowPreviewUnread]}
                  numberOfLines={1}
                >
                  {item.lastMessage
                    ? `${item.lastSenderIsMe ? "You: " : ""}${item.lastMessage}`
                    : item.kind === "group"
                      ? `${item.memberCount ?? 0} members`
                      : "No messages yet"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={styles.rowTime}>{timeAgo(item.lastAt)}</Text>
                {item.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{item.unread > 9 ? "9+" : item.unread}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ═══ COMPOSE MODAL: pick a friend to message ═══ */}
      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setComposeOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Message</Text>
            <TouchableOpacity onPress={() => setComposeOpen(false)}><X size={20} color="#8A8A9A" /></TouchableOpacity>
          </View>
          {friendsLoading ? (
            <ActivityIndicator color="#FF3B30" style={{ marginVertical: 20 }} />
          ) : friends.length === 0 ? (
            <View style={styles.notifEmpty}>
              <Send size={28} color="#3A3A4E" />
              <Text style={styles.emptySub}>Add friends to start messaging them</Text>
            </View>
          ) : (
            friends.map((f) => (
              <TouchableOpacity key={f.id} style={styles.friendRow} onPress={() => startConversation(f.id)} activeOpacity={0.7}>
                <View style={styles.avatar}>
                  {f.avatar ? <Image source={{ uri: f.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{f.name[0]?.toUpperCase()}</Text>}
                </View>
                <Text style={styles.rowName}>{f.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },

  searchWrap: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14 },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", marginTop: 8 },
  emptySub: { fontSize: 13, color: "#8A8A9A", textAlign: "center" },
  composeCta: { marginTop: 16, backgroundColor: "#FF3B30", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  composeCtaText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,59,48,0.14)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 50, height: 50, borderRadius: 25 },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#FF3B30" },
  rowName: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  rowPreview: { fontSize: 13, color: "#8A8A9A", marginTop: 2 },
  rowPreviewUnread: { color: "#E5E5EA", fontWeight: "600" },
  rowTime: { fontSize: 11, color: "#5A5A6E" },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: { backgroundColor: "#14141F", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "70%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  notifEmpty: { alignItems: "center", gap: 8, paddingVertical: 24 },
  friendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
});
