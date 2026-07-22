import React, { useMemo, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import {
  ArrowLeft,
  Users,
  Flag,
  Calendar,
  MapPin,
  Clock,
  Plus,
  Check,
  Shield,
  Zap,
} from "lucide-react-native";
import { useConvoys, type Convoy } from "@/hooks/useConvoysStore";
import { useEvents, type DriveEvent } from "@/hooks/useEventsStore";
import { EventTypeIcon, eventTypeLabel } from "@/components/CreateEventModal";
import CreateConvoyModal from "@/components/CreateConvoyModal";

const ACCENT = "#3B82F6"; // Community blue (matches the Drive feature card)
const WEEK_MS = 7 * 24 * 3600 * 1000;

const MEETUP_FILTERS = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "live", label: "Live now" },
] as const;
type MeetupFilter = (typeof MEETUP_FILTERS)[number]["key"];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { convoys, loadingConvoys, fetchConvoys, joinConvoy, leaveConvoy } = useConvoys();
  const { events, loadingEvents, fetchEvents, joinEvent, leaveEvent } = useEvents();

  const [tab, setTab] = useState<"convoy" | "meetups">("convoy");
  const [filter, setFilter] = useState<MeetupFilter>("all");
  const [showCreateConvoy, setShowCreateConvoy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchConvoys(), fetchEvents()]);
    setRefreshing(false);
  }, [fetchConvoys, fetchEvents]);

  const visibleMeetups = useMemo(() => {
    const now = Date.now();
    if (filter === "week") {
      return events.filter((e) => new Date(e.starts_at).getTime() - now <= WEEK_MS);
    }
    if (filter === "live") {
      return events.filter((e) => e.is_live);
    }
    return events;
  }, [events, filter]);

  const joinedCount = convoys.filter((c) => c.is_joined).length;
  const goingCount = events.filter((e) => e.is_joined).length;

  const handleToggleConvoy = useCallback(
    async (c: Convoy) => {
      setBusyId(c.id);
      const result = c.is_joined ? await leaveConvoy(c.id) : await joinConvoy(c.id);
      setBusyId(null);
      if (result.error) Alert.alert("Couldn't update convoy", result.error);
    },
    [joinConvoy, leaveConvoy]
  );

  const handleToggleEvent = useCallback(
    async (e: DriveEvent) => {
      setBusyId(e.id);
      const result = e.is_joined ? await leaveEvent(e.id) : await joinEvent(e.id);
      setBusyId(null);
      if (result.error) Alert.alert("Couldn't update RSVP", result.error);
    },
    [joinEvent, leaveEvent]
  );

  const handleCreate = () => {
    if (tab === "convoy") {
      setShowCreateConvoy(true);
    } else {
      Alert.alert(
        "Host a Meetup",
        "Pick a spot on the map to drop a pin and set the time.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open map", onPress: () => router.push("/(tabs)/map" as any) },
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient
        colors={["#0A0A0F", "#060609", "#0A0A0F"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Community</Text>
        <TouchableOpacity
          onPress={handleCreate}
          style={[styles.iconBtn, { backgroundColor: ACCENT + "26" }]}
          hitSlop={8}
        >
          <Plus size={20} color={ACCENT} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabButton
          label="Convoy"
          icon={Flag}
          active={tab === "convoy"}
          onPress={() => setTab("convoy")}
        />
        <TabButton
          label="Meetups"
          icon={Calendar}
          active={tab === "meetups"}
          onPress={() => setTab("meetups")}
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingTop: 8,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
        }
      >
        {tab === "convoy" ? (
          <>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Driver-created convoys</Text>
                <Text style={styles.sectionSub}>
                  {joinedCount > 0
                    ? `Riding with ${joinedCount} crew${joinedCount > 1 ? "s" : ""}`
                    : "Join a crew to ride together"}
                </Text>
              </View>
            </View>

            {loadingConvoys && convoys.length === 0 ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : convoys.length === 0 ? (
              <View style={styles.emptyState}>
                <Flag size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No convoys yet</Text>
                <TouchableOpacity onPress={() => setShowCreateConvoy(true)} activeOpacity={0.8}>
                  <Text style={[styles.emptyText, { color: ACCENT, fontWeight: "700" }]}>
                    Start the first one
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              convoys.map((c) => {
                const isJoined = c.is_joined;
                const isBusy = busyId === c.id;
                return (
                  <View key={c.id} style={styles.card}>
                    <View style={styles.convoyTop}>
                      <View style={[styles.tagBadge, { backgroundColor: ACCENT + "22" }]}>
                        <Text style={[styles.tagText, { color: ACCENT }]}>{c.tag}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <Text style={styles.cardTitle}>{c.name}</Text>
                          {c.is_owner ? (
                            <Shield size={14} color={ACCENT} fill={ACCENT} />
                          ) : null}
                        </View>
                        {!!c.description && (
                          <Text style={styles.cardDesc}>{c.description}</Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.convoyMeta}>
                      <View style={styles.metaItem}>
                        <Users size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>
                          {c.member_count} member{c.member_count === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        isJoined ? styles.actionBtnJoined : styles.actionBtnPrimary,
                      ]}
                      onPress={() => handleToggleConvoy(c)}
                      activeOpacity={0.8}
                      disabled={isBusy}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color={isJoined ? ACCENT : "#FFFFFF"} />
                      ) : isJoined ? (
                        <>
                          <Check size={15} color={ACCENT} />
                          <Text style={[styles.actionText, { color: ACCENT }]}>
                            Joined
                          </Text>
                        </>
                      ) : (
                        <>
                          <Zap size={15} color="#FFFFFF" />
                          <Text style={styles.actionText}>Join convoy</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        ) : (
          <>
            {/* Filter chips */}
            <View style={styles.filterRow}>
              {MEETUP_FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setFilter(f.key)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.chipText, active && styles.chipTextActive]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Driver-hosted meetups</Text>
                <Text style={styles.sectionSub}>
                  {goingCount > 0
                    ? `You're going to ${goingCount} meetup${goingCount > 1 ? "s" : ""}`
                    : "RSVP to meetups near you"}
                </Text>
              </View>
            </View>

            {loadingEvents && events.length === 0 ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={ACCENT} />
              </View>
            ) : visibleMeetups.length === 0 ? (
              <View style={styles.emptyState}>
                <Calendar size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No meetups match this filter</Text>
              </View>
            ) : (
              visibleMeetups.map((m) => {
                const isGoing = m.is_joined;
                const isBusy = busyId === m.id;
                return (
                  <View key={m.id} style={styles.card}>
                    <View style={styles.meetupTop}>
                      <View style={styles.meetupThumb}>
                        <EventTypeIcon type={m.event_type} size={22} color={ACCENT} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{m.title}</Text>
                        <Text style={styles.hostText}>
                          {eventTypeLabel(m.event_type)} · hosted by {m.host_name}
                        </Text>
                      </View>
                      {m.is_live && (
                        <View style={styles.liveBadge}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveText}>LIVE</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.meetupMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>
                          {new Date(m.starts_at).toLocaleString(undefined, {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      {!!m.location_name && (
                        <View style={styles.metaItem}>
                          <MapPin size={13} color="#8A8A9A" />
                          <Text style={styles.metaText}>{m.location_name}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.meetupFooter}>
                      <View style={styles.metaItem}>
                        <Users size={13} color={ACCENT} />
                        <Text style={[styles.metaText, { color: "#B8B8C8" }]}>
                          {m.participant_count} going
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.rsvpBtn,
                          isGoing ? styles.rsvpBtnActive : styles.rsvpBtnIdle,
                        ]}
                        onPress={() => handleToggleEvent(m)}
                        activeOpacity={0.8}
                        disabled={isBusy}
                      >
                        {isBusy ? (
                          <ActivityIndicator size="small" color={isGoing ? "#FFFFFF" : ACCENT} />
                        ) : isGoing ? (
                          <>
                            <Check size={14} color="#FFFFFF" />
                            <Text style={styles.rsvpText}>Going</Text>
                          </>
                        ) : (
                          <Text style={[styles.rsvpText, { color: ACCENT }]}>
                            RSVP
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <CreateConvoyModal
        visible={showCreateConvoy}
        onClose={() => setShowCreateConvoy(false)}
        onCreated={() => setShowCreateConvoy(false)}
      />
    </View>
  );
}

function TabButton({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.FC<{ size: number; color: string }>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tab, active && styles.tabActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Icon size={16} color={active ? ACCENT : "#5A5A6E"} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },

  // Header
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  topTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },

  // Tabs
  tabs: {
    flexDirection: "row",
    gap: 4,
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: ACCENT + "1F" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#5A5A6E" },
  tabTextActive: { color: ACCENT },

  // Sections
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  sectionSub: { fontSize: 13, color: "#8A8A9A", marginTop: 2 },

  // Cards
  card: {
    backgroundColor: "#12121A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E1E2E",
    padding: 16,
    marginBottom: 12,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  cardDesc: { fontSize: 13, color: "#8A8A9A", marginTop: 3, lineHeight: 18 },

  // Convoy
  convoyTop: { flexDirection: "row", gap: 12 },
  tagBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  convoyMeta: {
    flexDirection: "row",
    gap: 16,
    marginTop: 14,
    marginBottom: 14,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12.5, color: "#8A8A9A" },

  // Action buttons
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 11,
    borderRadius: 12,
  },
  actionBtnPrimary: { backgroundColor: ACCENT },
  actionBtnJoined: {
    backgroundColor: ACCENT + "1A",
    borderWidth: 1,
    borderColor: ACCENT + "44",
  },
  actionText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },

  // Meetup
  filterRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "#1E1E2E",
  },
  chipActive: { backgroundColor: ACCENT + "22", borderColor: ACCENT + "55" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#8A8A9A" },
  chipTextActive: { color: ACCENT },

  meetupTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  meetupThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: ACCENT + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  hostText: { fontSize: 12.5, color: "#8A8A9A", marginTop: 2 },
  meetupMeta: { gap: 7, marginTop: 14 },
  meetupFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  rsvpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rsvpBtnIdle: {
    backgroundColor: ACCENT + "1A",
    borderWidth: 1,
    borderColor: ACCENT + "44",
  },
  rsvpBtnActive: { backgroundColor: ACCENT },
  rsvpText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF444422",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#EF4444", letterSpacing: 0.4 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13.5, color: "#8A8A9A" },
});
