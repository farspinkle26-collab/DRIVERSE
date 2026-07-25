import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, MessageCircle, Send, Users } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";
import { ICON_STROKE } from "@/components/TripCard";
import { borderWidth, colors, radius, spacing, textStyle } from "@/constants/theme";

interface GroupMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export default function GroupChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [title, setTitle] = useState("Group Chat");
  const [memberCount, setMemberCount] = useState(0);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<GroupMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data: convo } = await supabase
      .from("group_conversations")
      .select("title")
      .eq("id", conversationId)
      .single();
    if (convo) setTitle(convo.title);

    const { data: memberRows } = await supabase
      .from("group_conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId);
    setMemberCount((memberRows ?? []).length);

    const { data } = await supabase
      .from("group_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    const rows = (data ?? []) as GroupMessageRow[];
    setMessages(rows);

    const senderIds = [...new Set(rows.map((m) => m.sender_id))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", senderIds);
      const map: Record<string, string> = {};
      (profiles ?? []).forEach((p: any) => { map[p.id] = p.name ?? "Driver"; });
      setSenderNames(map);
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`group_chat_thread_${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as GroupMessageRow;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          setSenderNames((prev) => {
            if (prev[msg.sender_id]) return prev;
            supabase.from("profiles").select("id, name").eq("id", msg.sender_id).single().then(({ data }) => {
              if (data) setSenderNames((p2) => ({ ...p2, [data.id]: data.name ?? "Driver" }));
            });
            return prev;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !user || !conversationId || sending) return;
    setInput("");
    setSending(true);
    const { data, error } = await supabase
      .from("group_messages")
      .insert({ conversation_id: conversationId, sender_id: user.id, content: text })
      .select()
      .single();
    if (!error && data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as GroupMessageRow]));
    } else if (error) {
      setInput(text);
    }
    setSending(false);
  }, [input, user, conversationId, sending]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={spacing.spacingSm}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <View style={styles.identity}>
          <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.memberRow}>
            <Users size={11} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            <Text style={styles.memberCount}>{memberCount} member{memberCount === 1 ? "" : "s"}</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.racingRed} style={styles.loader} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.spacingLg, paddingBottom: spacing.spacingSm, flexGrow: 1, justifyContent: messages.length === 0 ? "center" : "flex-start" }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MessageCircle size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <Text style={styles.emptyTitle}>NO MESSAGES YET</Text>
              <Text style={styles.emptyBody}>Send the first message to the group.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && <Text style={styles.senderName}>{senderNames[item.sender_id] ?? "Driver"}</Text>}
                  <Text style={styles.bubbleText}>{item.content}</Text>
                  <Text style={styles.bubbleTime}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.spacingSm }]}>
        <TextInput
          style={styles.input}
          placeholder="Message the group..."
          placeholderTextColor={colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
        />
        <Pressable
          style={[styles.sendBtn, !input.trim() && styles.disabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? <ActivityIndicator size="small" color={colors.voidBlack} /> : <Send size={18} color={colors.voidBlack} strokeWidth={ICON_STROKE} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingSm,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.hairline,
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
  identity: { flex: 1 },
  topTitle: { ...textStyle("displayMd"), color: colors.textPrimary },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs, marginTop: spacing.spacingXs },
  memberCount: { ...textStyle("caption"), color: colors.textSecondary },

  loader: { marginTop: spacing.spacingXxl },

  emptyState: { alignItems: "center", gap: spacing.spacingSm },
  emptyTitle: { ...textStyle("displayMd"), color: colors.textPrimary, textAlign: "center" },
  emptyBody: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },

  bubbleRow: { marginBottom: spacing.spacingSm, flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "78%",
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
  },
  bubbleMine: { borderColor: colors.racingRed },
  bubbleTheirs: { borderColor: colors.hairline },
  senderName: {
    ...textStyle("displayMd", { fontSize: 12, lineHeight: 15 }),
    color: colors.textSecondary,
    marginBottom: spacing.spacingXs,
  },
  bubbleText: { ...textStyle("body"), color: colors.textPrimary },
  bubbleTime: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    marginTop: spacing.spacingXs,
    alignSelf: "flex-end",
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.spacingSm,
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingSm,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    color: colors.textPrimary,
    ...textStyle("body"),
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sharp,
    backgroundColor: colors.racingRed,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
});
