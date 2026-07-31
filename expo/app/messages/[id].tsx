import React, { useCallback, useEffect, useRef, useState } from "react";
import { ListAvatarFrame } from "@/components/frames/AvatarFrame";
import { ListAvatarAura } from "@/components/auras/ProfileAura";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, MessageCircle, Send } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";
import { ICON_STROKE } from "@/components/TripCard";
import { borderWidth, colors, radius, spacing, textStyle } from "@/constants/theme";

interface DirectMessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export default function DirectChatScreen() {
  const { id: partnerId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [partnerName, setPartnerName] = useState("Driver");
  const [partnerAvatar, setPartnerAvatar] = useState<string | undefined>(undefined);
  const [partnerLevel, setPartnerLevel] = useState(1);
  const [messages, setMessages] = useState<DirectMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const markRead = useCallback(async () => {
    if (!user || !partnerId) return;
    await supabase
      .from("direct_messages")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("receiver_id", user.id)
      .eq("is_read", false);
  }, [user, partnerId]);

  const load = useCallback(async () => {
    if (!user || !partnerId) return;
    setLoading(true);
    // Level lives in `user_xp`, so the header's rank frame needs its own
    // read. Fired alongside the profile read rather than after it, so the
    // avatar does not paint bare and then gain a frame a beat later.
    const [{ data: profile }, { data: xp }] = await Promise.all([
      supabase.from("profiles").select("id, name, avatar").eq("id", partnerId).single(),
      supabase.from("user_xp").select("level").eq("user_id", partnerId).maybeSingle(),
    ]);
    if (profile) {
      setPartnerName(profile.name ?? "Driver");
      setPartnerAvatar(profile.avatar ?? undefined);
    }
    if (xp) setPartnerLevel((xp as { level: number }).level ?? 1);
    const { data } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as DirectMessageRow[]);
    setLoading(false);
    markRead();
  }, [user, partnerId, markRead]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!user || !partnerId) return;
    const channel = supabase
      .channel(`dm_thread_${user.id}_${partnerId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as DirectMessageRow;
          const belongsHere =
            (msg.sender_id === user.id && msg.receiver_id === partnerId) ||
            (msg.sender_id === partnerId && msg.receiver_id === user.id);
          if (!belongsHere) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.receiver_id === user.id) markRead();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, partnerId, markRead]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !user || !partnerId || sending) return;
    setInput("");
    setSending(true);
    const { data, error } = await supabase
      .from("direct_messages")
      .insert({ sender_id: user.id, receiver_id: partnerId, content: text })
      .select()
      .single();
    if (!error && data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as DirectMessageRow]));
    } else if (error) {
      setInput(text);
    }
    setSending(false);
  }, [input, user, partnerId, sending]);

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
        <Pressable
          style={styles.identity}
          onPress={() => router.push(`/user/${partnerId}` as any)}
        >
          <ListAvatarAura level={partnerLevel} size={34}>
            <ListAvatarFrame level={partnerLevel} size={34}>
              <View style={styles.avatar}>
                {partnerAvatar ? (
                  <Image source={{ uri: partnerAvatar }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{partnerName[0]?.toUpperCase() ?? "?"}</Text>
                )}
              </View>
            </ListAvatarFrame>
          </ListAvatarAura>
          <Text style={styles.topTitle} numberOfLines={1}>{partnerName}</Text>
        </Pressable>
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
              <Text style={styles.emptyBody}>Send the first message to {partnerName}.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
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
          testID="chat-input"
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.textSecondary}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
        />
        <Pressable
          testID="chat-send"
          accessibilityRole="button"
          accessibilityLabel="Send message"
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
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 34, height: 34, borderRadius: radius.circle },
  avatarText: { ...textStyle("displayMd", { fontSize: 14, lineHeight: 17 }), color: colors.textPrimary },
  topTitle: { ...textStyle("displayMd"), color: colors.textPrimary, flexShrink: 1 },

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
