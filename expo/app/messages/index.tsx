import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { ArrowLeft, Search, SquarePen, MessageCircle, X, Send, Users } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useGroupChat } from "@/hooks/useGroupChatStore";
import { supabase } from "@/lib/supabase";
import { CutCornerBadge, CutCornerButton } from "@/components/CutCorner";
import { PlatinumNameBadge } from "@/components/platinum/PlatinumBadge";
import { ListAvatarFrame } from "@/components/frames/AvatarFrame";
import { ListAvatarAura } from "@/components/auras/ProfileAura";
import { usePlatinumDirectory } from "@/hooks/usePlatinumDirectory";
import { ICON_STROKE } from "@/components/TripCard";
import { borderWidth, colors, fontFamily, radius, spacing, textStyle } from "@/constants/theme";

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
  /** Drives the rank frame on the row's avatar. */
  level?: number;
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
  /** DM rows only — a group has no single rank to frame. */
  level?: number;
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
      // Level comes from `user_xp`, not `profiles` — same two-query shape the
      // convoy roster and profile search already use. Both go out together so
      // the row does not paint an unframed avatar and then pop a frame in.
      const [{ data: profileRows }, { data: xpRows }] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar").in("id", partnerIds),
        supabase.from("user_xp").select("user_id, level").in("user_id", partnerIds),
      ]);
      const levelMap: Record<string, number> = {};
      (xpRows ?? []).forEach((x: any) => {
        levelMap[x.user_id] = x.level;
      });
      const map: Record<string, Contact> = {};
      (profileRows ?? []).forEach((p: any) => {
        map[p.id] = {
          id: p.id,
          name: p.name ?? "Driver",
          avatar: p.avatar ?? undefined,
          level: levelMap[p.id] ?? 1,
        };
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
      level: profiles[partnerId]?.level,
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

  // Badge lookup for the drivers in the list. One batched call for the whole
  // screen — see `hooks/usePlatinumDirectory.ts`.
  const platinumPartners = usePlatinumDirectory(
    conversations.filter((c) => c.kind === "dm").map((c) => c.targetId)
  );

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
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <MessageCircle size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          <Text style={styles.emptyTitle}>SIGN IN TO SEE YOUR MESSAGES</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={spacing.spacingSm}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={styles.topTitle}>MESSAGES</Text>
        <Pressable style={styles.iconBtn} onPress={openCompose} hitSlop={spacing.spacingSm}>
          <SquarePen size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Search size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} style={{ marginRight: spacing.spacingSm }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={spacing.spacingSm}>
            <X size={16} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.racingRed} style={styles.loader} />
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <MessageCircle size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          <Text style={styles.emptyTitle}>NO MESSAGES YET</Text>
          <Text style={styles.emptySub}>Tap New Message to start a conversation with a friend.</Text>
          <CutCornerButton
            title="New Message"
            size="sm"
            corners="topRight"
            onPress={openCompose}
            style={styles.composeCta}
          />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.spacingXl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.racingRed} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(
                (item.kind === "group" ? `/messages/group/${item.targetId}` : `/messages/${item.targetId}`) as any
              )}
            >
              {/* Groups get the bare avatar well: the row stands for a convoy,
                  not a driver, so there is no rank to frame. DMs get the
                  partner's rank frame at `list` detail. */}
              {item.kind === "group" ? (
                <View style={styles.avatar}>
                  <Users size={20} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                </View>
              ) : (
                <ListAvatarAura level={item.level ?? 1} size={50}>
                  <ListAvatarFrame level={item.level ?? 1} size={50}>
                    <View style={styles.avatar}>
                      {item.avatar ? (
                        <Image source={{ uri: item.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() ?? "?"}</Text>
                      )}
                    </View>
                  </ListAvatarFrame>
                </ListAvatarAura>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.rowNameLine}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  {/* Direct conversations only: a group's "name" is the
                      convoy title, not a driver, so there is nobody to badge. */}
                  <PlatinumNameBadge
                    show={item.kind === "dm" && platinumPartners.has(item.targetId)}
                    name={item.name}
                  />
                </View>
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
              <View style={styles.rowMeta}>
                <Text style={styles.rowTime}>{timeAgo(item.lastAt)}</Text>
                {item.unread > 0 && (
                  <CutCornerBadge
                    label={item.unread > 9 ? "9+" : String(item.unread)}
                    numeric
                    solid
                    corners="topRight"
                  />
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      {/* ═══ COMPOSE MODAL: pick a friend to message ═══ */}
      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setComposeOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.spacingXl }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>NEW MESSAGE</Text>
            <Pressable onPress={() => setComposeOpen(false)} hitSlop={spacing.spacingSm}>
              <X size={20} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>
          {friendsLoading ? (
            <ActivityIndicator color={colors.racingRed} style={styles.loaderSm} />
          ) : friends.length === 0 ? (
            <View style={styles.notifEmpty}>
              <Send size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <Text style={styles.emptySub}>Add friends first — then they'll show up here to message.</Text>
            </View>
          ) : (
            friends.map((f) => (
              <Pressable key={f.id} style={styles.friendRow} onPress={() => startConversation(f.id)}>
                <View style={styles.avatar}>
                  {f.avatar ? <Image source={{ uri: f.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{f.name[0]?.toUpperCase()}</Text>}
                </View>
                <Text style={styles.rowName}>{f.name}</Text>
              </Pressable>
            ))
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingSm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { ...textStyle("displayMd"), color: colors.textPrimary },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.spacingLg,
    marginBottom: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingMd,
    height: 42,
  },
  searchInput: { flex: 1, color: colors.textPrimary, ...textStyle("body") },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.spacingSm, paddingHorizontal: spacing.spacingXl },
  emptyTitle: { ...textStyle("displayMd"), color: colors.textPrimary, textAlign: "center", marginTop: spacing.spacingSm },
  emptySub: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },
  composeCta: { marginTop: spacing.spacingMd },
  loader: { marginTop: spacing.spacingXxl },
  loaderSm: { marginVertical: spacing.spacingXl },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd, paddingHorizontal: spacing.spacingLg, paddingVertical: spacing.spacingMd },
  separator: { height: borderWidth.hairline, backgroundColor: colors.hairline, marginLeft: spacing.spacingLg + 50 + spacing.spacingMd },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 50, height: 50, borderRadius: radius.circle },
  avatarText: { ...textStyle("displayMd", { fontSize: 18, lineHeight: 22 }), color: colors.textPrimary },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  rowName: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textPrimary, flexShrink: 1 },
  rowPreview: { ...textStyle("caption"), color: colors.textSecondary, marginTop: spacing.spacingXs },
  rowPreviewUnread: { color: colors.textPrimary, fontFamily: fontFamily.bodyMedium },
  rowMeta: { alignItems: "flex-end", gap: spacing.spacingXs },
  rowTime: { ...textStyle("caption"), color: colors.textSecondary },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: {
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderLeftWidth: borderWidth.hairline,
    borderRightWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingLg,
    maxHeight: "70%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.spacingMd },
  modalTitle: { ...textStyle("displayMd"), color: colors.textPrimary },
  notifEmpty: { alignItems: "center", gap: spacing.spacingSm, paddingVertical: spacing.spacingXl },
  friendRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd, paddingVertical: spacing.spacingSm },
});
