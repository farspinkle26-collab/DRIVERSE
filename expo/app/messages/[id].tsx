import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, Send } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";

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
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, name, avatar")
      .eq("id", partnerId)
      .single();
    if (profile) {
      setPartnerName(profile.name ?? "Driver");
      setPartnerAvatar(profile.avatar ?? undefined);
    }
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
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.identity}
          activeOpacity={0.7}
          onPress={() => router.push(`/user/${partnerId}` as any)}
        >
          <View style={styles.avatar}>
            {partnerAvatar ? (
              <Image source={{ uri: partnerAvatar }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{partnerName[0]?.toUpperCase() ?? "?"}</Text>
            )}
          </View>
          <Text style={styles.topTitle} numberOfLines={1}>{partnerName}</Text>
        </TouchableOpacity>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#FF3B30" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: messages.length === 0 ? "center" : "flex-start" }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Say hello to {partnerName} 👋</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={styles.bubbleText}>{item.content}</Text>
                  <Text style={[styles.bubbleTime, mine && { color: "rgba(255,255,255,0.7)" }]}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 10 }]}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#5A5A6E"
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,59,48,0.14)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 34, height: 34, borderRadius: 17 },
  avatarText: { fontSize: 14, fontWeight: "800", color: "#FF3B30" },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", flexShrink: 1 },

  emptyState: { alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#8A8A9A", fontSize: 14 },

  bubbleRow: { marginBottom: 10, flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: "#FF3B30", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 },
  bubbleText: { color: "#FFFFFF", fontSize: 15, lineHeight: 20 },
  bubbleTime: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 4, alignSelf: "flex-end" },

  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  input: { flex: 1, maxHeight: 100, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 16, paddingVertical: 10, color: "#FFFFFF", fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center" },
});
