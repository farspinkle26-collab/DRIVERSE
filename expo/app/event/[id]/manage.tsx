import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import { ArrowLeft, Crown, MessageCircle, Ban } from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useEvents } from "@/hooks/useEventsStore";
import { supabase } from "@/lib/supabase";
import { CutCornerButton } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import { alpha, borderWidth, colors, fontFamily, radius, spacing, textStyle } from "@/constants/theme";

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
        <ActivityIndicator color={colors.racingRed} style={{ marginTop: insets.top + 140 }} />
      </View>
    );
  }

  if (!isHost) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.emptyState, { paddingTop: insets.top + 140 }]}>
          <Text style={styles.emptyTitle}>Only the host can manage this event</Text>
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
        <Text style={styles.topTitle} numberOfLines={1}>Manage: {title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.spacingLg, paddingBottom: insets.bottom + spacing.spacingXxl }} showsVerticalScrollIndicator={false}>
        {status === "cancelled" && (
          <View style={styles.cancelledBanner}>
            <Text style={styles.cancelledText}>This event is cancelled.</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Joined ({attendees.length})</Text>
          {attendees.map((a) => (
            <Pressable
              key={a.user_id}
              style={styles.memberRow}
              onPress={() => router.push(`/user/${a.user_id}` as any)}
            >
              <View style={styles.avatar}>
                {a.avatar ? <Image source={{ uri: a.avatar }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{a.name[0]?.toUpperCase()}</Text>}
              </View>
              <Text style={[styles.rowName, { flex: 1 }]}>{a.name}{a.user_id === user?.id ? " (You)" : ""}</Text>
              {a.role === "host" && <Crown size={16} color={colors.racingRed} strokeWidth={ICON_STROKE} />}
            </Pressable>
          ))}
        </View>

        {conversationId && (
          <CutCornerButton
            title="Open event chat"
            variant="ghost"
            corners="topRight"
            icon={<MessageCircle size={16} color={colors.textPrimary} strokeWidth={ICON_STROKE} />}
            onPress={() => router.push(`/messages/group/${conversationId}` as any)}
            style={styles.actionBtn}
          />
        )}

        {status !== "cancelled" && (
          <CutCornerButton
            title="Cancel Event"
            variant="outline"
            corners="topRight"
            disabled={cancelling}
            icon={cancelling ? undefined : <Ban size={16} color={colors.racingRed} strokeWidth={ICON_STROKE} />}
            onPress={handleCancel}
          />
        )}
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

  cancelledBanner: {
    backgroundColor: alpha(colors.racingRed, 0.1),
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: alpha(colors.racingRed, 0.3),
    padding: spacing.spacingMd,
    marginBottom: spacing.spacingLg,
  },
  cancelledText: { ...textStyle("caption"), color: colors.racingRed },

  section: { marginBottom: spacing.spacingXl },
  sectionLabel: { ...textStyle("caption"), color: colors.textSecondary, letterSpacing: 1, marginBottom: spacing.spacingSm },

  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm, paddingVertical: spacing.spacingSm },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 40, height: 40, borderRadius: radius.circle },
  avatarText: { ...textStyle("displayMd", { fontSize: 15, lineHeight: 18 }), color: colors.textPrimary },
  rowName: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textPrimary },

  actionBtn: { marginBottom: spacing.spacingMd },
});
