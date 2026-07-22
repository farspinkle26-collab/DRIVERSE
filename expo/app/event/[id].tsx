import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, MapPin, Clock, Users, Check, Settings, MessageCircle } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useEvents } from "@/hooks/useEventsStore";
import { eventTypeColor, eventTypeLabel, EventTypeIcon } from "@/components/CreateEventModal";
import { supabase } from "@/lib/supabase";

interface EventDetail {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  event_type: "meetup" | "convoy" | "cruise" | "race";
  location_name: string;
  starts_at: string;
  ends_at: string | null;
  max_participants: number;
  status: string;
  host_name: string;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { joinEvent, leaveEvent } = useEvents();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [isJoined, setIsJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const isHost = event?.creator_id === user?.id;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: row } = await supabase.from("events").select("*").eq("id", id).single();
    if (!row) {
      setEvent(null);
      setLoading(false);
      return;
    }
    const { data: hostProfile } = await supabase.from("profiles").select("name").eq("id", row.creator_id).single();
    const { data: participants } = await supabase.from("event_participants").select("user_id").eq("event_id", id);
    setEvent({ ...row, host_name: hostProfile?.name ?? "Driver" });
    setParticipantCount((participants ?? []).length);
    setIsJoined((participants ?? []).some((p: any) => p.user_id === user?.id));

    const { data: convo } = await supabase
      .from("group_conversations")
      .select("id")
      .eq("event_id", id)
      .maybeSingle();
    setConversationId(convo?.id ?? null);
    setLoading(false);
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    const result = isJoined ? await leaveEvent(id) : await joinEvent(id);
    setBusy(false);
    if (result.error) setError(result.error);
    else load();
  }, [id, isJoined, joinEvent, leaveEvent, load]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator color="#FF6B35" style={{ marginTop: insets.top + 140 }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Text style={styles.emptyTitle}>Event not found</Text>
        </View>
      </View>
    );
  }

  const color = eventTypeColor(event.event_type);
  const full = event.max_participants > 0 && participantCount >= event.max_participants;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{event.title}</Text>
        {isHost ? (
          <TouchableOpacity onPress={() => router.push(`/event/${event.id}/manage` as any)} style={styles.iconBtn} hitSlop={8}>
            <Settings size={18} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={[styles.typeIcon, { backgroundColor: `${color}18`, borderColor: `${color}50` }]}>
            <EventTypeIcon type={event.event_type} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.rowSub}>{eventTypeLabel(event.event_type)} · Hosted by {event.host_name}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Clock size={15} color="#8A8A9A" />
          <Text style={styles.detailText}>
            {new Date(event.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {event.ends_at ? ` – ${new Date(event.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
        </View>
        {!!event.location_name && (
          <View style={styles.detailRow}>
            <MapPin size={15} color="#8A8A9A" />
            <Text style={styles.detailText}>{event.location_name}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Users size={15} color="#8A8A9A" />
          <Text style={styles.detailText}>
            {participantCount}{event.max_participants > 0 ? `/${event.max_participants}` : ""} joined
          </Text>
        </View>

        {!!event.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>How to join</Text>
            <Text style={styles.blurb}>{event.description}</Text>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {conversationId && isJoined && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => router.push(`/messages/group/${conversationId}` as any)}
            activeOpacity={0.85}
          >
            <MessageCircle size={16} color="#FFFFFF" />
            <Text style={styles.chatBtnText}>Open event chat</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.joinBtn, isJoined ? styles.joinBtnActive : { backgroundColor: color }, full && !isJoined && { opacity: 0.5 }]}
          onPress={handleToggle}
          disabled={busy || (full && !isJoined)}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : isJoined ? (
            <>
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.joinBtnText}>Going — tap to leave</Text>
            </>
          ) : (
            <Text style={styles.joinBtnText}>{full ? "Event full" : "Join event"}</Text>
          )}
        </TouchableOpacity>
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
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },

  headerCard: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  typeIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  eventTitle: { fontSize: 19, fontWeight: "800", color: "#FFFFFF" },
  rowSub: { fontSize: 12.5, color: "#8A8A9A", marginTop: 2 },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  detailText: { fontSize: 14, color: "#D0D0DC" },

  section: { marginTop: 8, marginBottom: 18 },
  sectionLabel: { fontSize: 12, fontWeight: "800", color: "#8A8A9A", letterSpacing: 0.6, marginBottom: 8, textTransform: "uppercase" },
  blurb: { color: "#B8B8C8", fontSize: 14, lineHeight: 20 },

  errorText: { color: "#EF4444", fontSize: 13, fontWeight: "600", marginBottom: 12 },

  chatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  chatBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },

  joinBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  joinBtnActive: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  joinBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
