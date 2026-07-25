import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, MapPin, Clock, Users, Check, Settings, MessageCircle } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useEvents } from "@/hooks/useEventsStore";
import { eventTypeLabel, EventTypeIcon } from "@/components/EventMeta";
import { supabase } from "@/lib/supabase";
import { CutCornerButton } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import { borderWidth, colors, radius, spacing, textStyle } from "@/constants/theme";

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
        <ActivityIndicator color={colors.racingRed} style={{ marginTop: insets.top + 140 }} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Text style={styles.emptyTitle}>Event not found</Text>
          <Text style={styles.emptyBody}>It may have been cancelled. Go back and pick another one from the list.</Text>
        </View>
      </View>
    );
  }

  const full = event.max_participants > 0 && participantCount >= event.max_participants;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={spacing.spacingSm}>
          <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>{event.title}</Text>
        {isHost ? (
          <Pressable style={styles.iconBtn} onPress={() => router.push(`/event/${event.id}/manage` as any)} hitSlop={spacing.spacingSm}>
            <Settings size={18} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.spacingLg, paddingBottom: insets.bottom + spacing.spacingXxl }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={[styles.typeIcon, event.status === "live" && { borderColor: colors.racingRed }]}>
            <EventTypeIcon type={event.event_type} size={22} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.rowSub}>{eventTypeLabel(event.event_type)} · Hosted by {event.host_name}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Clock size={15} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          <Text style={styles.detailText}>
            {new Date(event.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {event.ends_at ? ` – ${new Date(event.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
        </View>
        {!!event.location_name && (
          <View style={styles.detailRow}>
            <MapPin size={15} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            <Text style={styles.detailText}>{event.location_name}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Users size={15} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
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
          <CutCornerButton
            title="Open event chat"
            variant="ghost"
            corners="topRight"
            icon={<MessageCircle size={16} color={colors.textPrimary} strokeWidth={ICON_STROKE} />}
            onPress={() => router.push(`/messages/group/${conversationId}` as any)}
            style={styles.actionBtn}
          />
        )}

        <CutCornerButton
          title={isJoined ? "Going — tap to leave" : full ? "Event full" : "Join event"}
          variant={isJoined ? "ghost" : "primary"}
          corners="topRight"
          disabled={busy || (full && !isJoined)}
          onPress={handleToggle}
          icon={busy ? undefined : isJoined ? <Check size={16} color={colors.textPrimary} strokeWidth={ICON_STROKE} /> : undefined}
        />
      </ScrollView>
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
  topTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flex: 1,
    textAlign: "center",
    marginHorizontal: spacing.spacingSm,
  },

  emptyState: { flex: 1, alignItems: "center", gap: spacing.spacingSm, paddingHorizontal: spacing.spacingXl },
  emptyTitle: { ...textStyle("displayMd"), color: colors.textPrimary, textAlign: "center" },
  emptyBody: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center" },

  headerCard: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd, marginBottom: spacing.spacingXl },
  typeIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.sharp,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  eventTitle: { ...textStyle("displayMd"), color: colors.textPrimary },
  rowSub: { ...textStyle("caption"), color: colors.textSecondary, marginTop: spacing.spacingXs },

  detailRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm, marginBottom: spacing.spacingMd },
  detailText: { ...textStyle("body"), color: colors.textPrimary },

  section: { marginTop: spacing.spacingSm, marginBottom: spacing.spacingXl },
  sectionLabel: { ...textStyle("caption"), color: colors.textSecondary, letterSpacing: 1, marginBottom: spacing.spacingSm },
  blurb: { ...textStyle("body"), color: colors.textSecondary },

  errorText: { ...textStyle("caption"), color: colors.racingRed, marginBottom: spacing.spacingMd },

  actionBtn: { marginBottom: spacing.spacingMd },
});
