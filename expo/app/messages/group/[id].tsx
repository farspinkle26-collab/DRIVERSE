import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, Send, Users } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { supabase } from "@/lib/supabase";

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
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.identity}>
          <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.memberRow}>
            <Users size={11} color="#8A8A9A" />
            <Text style={styles.memberCount}>{memberCount} member{memberCount === 1 ? "" : "s"}</Text>
          </View>
        </View>
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
              <Text style={styles.emptyTitle}>Say hello to the group 👋</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && <Text style={styles.senderName}>{senderNames[item.sender_id] ?? "Driver"}</Text>}
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
          placeholder="Message the group..."
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
  identity: { flex: 1 },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  memberCount: { fontSize: 11, color: "#8A8A9A" },

  emptyState: { alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: "#8A8A9A", fontSize: 14 },

  bubbleRow: { marginBottom: 10, flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: "#FF3B30", borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: "rgba(255,255,255,0.08)", borderBottomLeftRadius: 4 },
  senderName: { color: "#FF3B30", fontSize: 11, fontWeight: "700", marginBottom: 2 },
  bubbleText: { color: "#FFFFFF", fontSize: 15, lineHeight: 20 },
  bubbleTime: { color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 4, alignSelf: "flex-end" },

  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  input: { flex: 1, maxHeight: 100, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", paddingHorizontal: 16, paddingVertical: 10, color: "#FFFFFF", fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FF3B30", alignItems: "center", justifyContent: "center" },
});
