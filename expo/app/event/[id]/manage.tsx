import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, Crown, MessageCircle, Ban } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useEvents } from "@/hooks/useEventsStore";
import { supabase } from "@/lib/supabase";

interface Attendee {
  user_id: string;
  role: "host" | "member";
  name: string;
  avatar?: string;
}

export default function EventManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { cancelEvent } = useEvents();

  const [title, setTitle] = useState("");
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("upcoming");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: row } = await supabase.from("events").select("title, creator_id, status").eq("id", id).single();
    if (!row) {
      setLoading(false);
      return;
    }
    setTitle(row.title);
    setCreatorId(row.creator_id);
    setStatus(row.status);

    const { data: participants } = await supabase
      .from("event_participants")
      .select("user_id, role")
      .eq("event_id", id);
    const rows = (participants ?? []) as { user_id: string; role: "host" | "member" }[];
    if (rows.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar")
        .in("id", rows.map((r) => r.user_id));
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      setAttendees(
        rows.map((r) => ({
          user_id: r.user_id,
          role: r.role,
          name: profileMap.get(r.user_id)?.name ?? "Driver",
          avatar: profileMap.get(r.user_id)?.avatar,
        }))
      );
    } else {
      setAttendees([]);
    }

    const { data: convo } = await supabase
      .from("group_conversations")
      .select("id")
      .eq("event_id", id)
      .maybeSingle();
    setConversationId(convo?.id ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isHost = creatorId === user?.id;

  const handleCancel = useCallback(() => {
    if (!id) return;
    Alert.alert("Cancel Event?", "Everyone who joined will be notified this event is cancelled.", [
      { text: "Never mind", style: "cancel" },
      {
        text: "Cancel Event",
        style: "destructive",
        onPress: async () => {
          setCancelling(true);
          const result = await cancelEvent(id);
          setCancelling(false);
          if (result.error) Alert.alert("Couldn't cancel", result.error);
          else load();
        },
      },
    ]);
  }, [id, cancelEvent, load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color="#FF6B35" style={{ marginTop: insets.top + 140 }} />
      </View>
    );
  }

  if (!isHost) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Text style={styles.emptyTitle}>Only the host can manage this event</Text>
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
        <Text style={styles.topTitle} numberOfLines={1}>Manage: {title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {status === "cancelled" && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledText}>This event is cancelled.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Joined ({attendees.length})</Text>
          {attendees.map((a) => (
            <TouchableOpacity
              key={a.user_id}
              style={styles.memberRow}
              activeOpacity={0.7}
              onPress={() => router.push(`/user/${a.user_id}` as any)}
            >
              <View style={styles.avatar}>
                {a.avatar ? <Image source={{ uri: a.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{a.name[0]?.toUpperCase()}</Text>}
              </View>
              <Text style={[styles.rowName, { flex: 1 }]}>{a.name}{a.user_id === user?.id ? " (You)" : ""}</Text>
              {a.role === "host" && <Crown size={16} color="#FFD700" />}
            </TouchableOpacity>
          ))}
        </View>

        {conversationId && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => router.push(`/messages/group/${conversationId}` as any)}
            activeOpacity={0.85}
          >
            <MessageCircle size={16} color="#FFFFFF" />
            <Text style={styles.chatBtnText}>Open event chat</Text>
          </TouchableOpacity>
        )}

        {status !== "cancelled" && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={cancelling} activeOpacity={0.8}>
            {cancelling ? <ActivityIndicator color="#EF4444" /> : (
              <>
                <Ban size={16} color="#EF4444" />
                <Text style={styles.cancelBtnText}>Cancel Event</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", flex: 1, textAlign: "center", marginHorizontal: 8 },

  emptyState: { flex: 1, alignItems: "center", gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", textAlign: "center" },

  cancelledBanner: { backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", padding: 12, marginBottom: 16 },
  cancelledText: { color: "#EF4444", fontSize: 13, fontWeight: "600" },

  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#8A8A9A", letterSpacing: 0.6, marginBottom: 10, textTransform: "uppercase" },

  memberRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,107,53,0.14)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarText: { fontSize: 15, fontWeight: "800", color: "#FF6B35" },
  rowName: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },

  chatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  chatBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  cancelBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" },
  cancelBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 14 },
});
