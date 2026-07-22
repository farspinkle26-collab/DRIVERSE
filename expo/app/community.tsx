import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import * as Location from "expo-location";
import {
  ArrowLeft,
  Users,
  Flag,
  Calendar,
  MapPin,
  Clock,
  Plus,
  Check,
  Settings,
  AlertCircle,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useEvents } from "@/hooks/useEventsStore";
import { useParty } from "@/hooks/usePartyStore";
import CreateEventModal, { eventTypeColor, EventTypeIcon } from "@/components/CreateEventModal";
import CreateConvoyModal from "@/components/CreateConvoyModal";

const ACCENT = "#3B82F6"; // Community blue (matches the Drive feature card)

function formatWhen(startsAt: string): string {
  const d = new Date(startsAt);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user, isAuthenticated } = useAuth();
  const { events, loadingEvents, fetchEvents, joinEvent, leaveEvent } = useEvents();
  const {
    party,
    members,
    publicParties,
    loadingPublicParties,
    browsePublicParties,
    joinParty,
  } = useParty();

  const [tab, setTab] = useState<"convoy" | "events">(params.tab === "events" ? "events" : "convoy");
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createConvoyOpen, setCreateConvoyOpen] = useState(false);
  const [coordinate, setCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchEvents();
      browsePublicParties();
    }
  }, [isAuthenticated, fetchEvents, browsePublicParties]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchEvents(), browsePublicParties()]);
    setRefreshing(false);
  }, [fetchEvents, browsePublicParties]);

  const browsableConvoys = useMemo(
    () => publicParties.filter((p) => p.id !== party?.id),
    [publicParties, party?.id]
  );

  const handleJoinConvoy = useCallback(async (convoyId: string) => {
    setJoiningId(convoyId);
    setJoinError(null);
    const result = await joinParty(convoyId);
    setJoiningId(null);
    if (!result.ok) setJoinError(result.message ?? "Couldn't join that convoy");
    else router.push(`/convoy/${convoyId}` as any);
  }, [joinParty, router]);

  const handleToggleEvent = useCallback(async (eventId: string, joined: boolean) => {
    setJoiningId(eventId);
    setJoinError(null);
    const result = joined ? await leaveEvent(eventId) : await joinEvent(eventId);
    setJoiningId(null);
    if (result.error) setJoinError(result.error);
  }, [joinEvent, leaveEvent]);

  const openCreateEvent = useCallback(async () => {
    if (!user?.country) {
      setJoinError("Set your country in your profile before creating an event");
      return;
    }
    setLocationError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission needed to pin an event");
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoordinate({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setCreateEventOpen(true);
    } catch {
      setLocationError("Couldn't get your location");
    } finally {
      setLocating(false);
    }
  }, [user?.country]);

  const handleCreate = () => {
    if (tab === "convoy") setCreateConvoyOpen(true);
    else openCreateEvent();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Community</Text>
        <TouchableOpacity
          onPress={handleCreate}
          style={[styles.iconBtn, { backgroundColor: ACCENT + "26" }]}
          hitSlop={8}
          disabled={locating}
        >
          {locating ? <ActivityIndicator size="small" color={ACCENT} /> : <Plus size={20} color={ACCENT} />}
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TabButton label="Convoy" icon={Flag} active={tab === "convoy"} onPress={() => setTab("convoy")} />
        <TabButton label="Events" icon={Calendar} active={tab === "events"} onPress={() => setTab("events")} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        {!isAuthenticated ? (
          <View style={styles.emptyState}>
            <Users size={28} color={ACCENT + "60"} />
            <Text style={styles.emptyText}>Sign in to join the community</Text>
          </View>
        ) : (joinError || locationError) ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={14} color="#EF4444" />
            <Text style={styles.errorBannerText}>{joinError ?? locationError}</Text>
          </View>
        ) : null}

        {isAuthenticated && tab === "convoy" ? (
          <>
            {party && (
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Your convoy</Text>
                  <Text style={styles.sectionSub}>Riding with {members.length} driver{members.length === 1 ? "" : "s"}</Text>
                </View>
              </View>
            )}
            {party && (
              <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => router.push(`/convoy/${party.id}` as any)}>
                <View style={styles.convoyTop}>
                  <View style={[styles.colorDot, { backgroundColor: party.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{party.name}</Text>
                    {!!party.description && <Text style={styles.cardDesc}>{party.description}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => router.push("/convoy" as any)} hitSlop={8}>
                    <Settings size={18} color="#8A8A9A" />
                  </TouchableOpacity>
                </View>
                <View style={styles.convoyMeta}>
                  <View style={styles.metaItem}>
                    <Users size={13} color="#8A8A9A" />
                    <Text style={styles.metaText}>{members.length} member{members.length === 1 ? "" : "s"}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{party ? "Other convoys" : "Join a convoy"}</Text>
                <Text style={styles.sectionSub}>Ride together — joined members are marked special</Text>
              </View>
            </View>

            {loadingPublicParties && browsableConvoys.length === 0 ? (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />
            ) : browsableConvoys.length === 0 ? (
              <View style={styles.emptyState}>
                <Flag size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No public convoys yet — start one</Text>
              </View>
            ) : (
              browsableConvoys.map((c) => {
                const full = c.max_members > 0 && c.member_count >= c.max_members;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.card}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/convoy/${c.id}` as any)}
                  >
                    <View style={styles.convoyTop}>
                      <View style={[styles.colorDot, { backgroundColor: c.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{c.name}</Text>
                        <Text style={styles.cardDesc}>{c.description || `Led by ${c.leader_name}`}</Text>
                      </View>
                    </View>
                    <View style={styles.convoyMeta}>
                      <View style={styles.metaItem}>
                        <Users size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>
                          {c.member_count}{c.max_members > 0 ? `/${c.max_members}` : ""} members
                        </Text>
                      </View>
                    </View>
                    {!party && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionBtnPrimary, full && { opacity: 0.5 }]}
                        onPress={() => handleJoinConvoy(c.id)}
                        disabled={full || joiningId === c.id}
                        activeOpacity={0.8}
                      >
                        {joiningId === c.id ? (
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <>
                            <Flag size={15} color="#FFFFFF" />
                            <Text style={styles.actionText}>{full ? "Full" : "Join convoy"}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : null}

        {isAuthenticated && tab === "events" ? (
          <>
            {!user?.country && (
              <TouchableOpacity style={styles.warnBanner} onPress={() => router.push("/(tabs)/profile" as any)} activeOpacity={0.8}>
                <AlertCircle size={14} color="#FBBF24" />
                <Text style={styles.warnBannerText}>Set your country to see local events</Text>
              </TouchableOpacity>
            )}

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Events near you</Text>
                <Text style={styles.sectionSub}>
                  {user?.country ? `Happening in ${user.country}` : "Set your country to find events"}
                </Text>
              </View>
            </View>

            {loadingEvents && events.length === 0 ? (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 12 }} />
            ) : events.length === 0 ? (
              <View style={styles.emptyState}>
                <Calendar size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No events yet — host the first one</Text>
              </View>
            ) : (
              events.map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/event/${ev.id}` as any)}
                >
                  <View style={styles.meetupTop}>
                    <View style={[styles.meetupThumb, { backgroundColor: `${eventTypeColor(ev.event_type)}18` }]}>
                      <EventTypeIcon type={ev.event_type} size={22} color={eventTypeColor(ev.event_type)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{ev.title}</Text>
                      <Text style={styles.hostText}>by {ev.host_name}{ev.is_live ? " · Live now" : ""}</Text>
                    </View>
                  </View>

                  <View style={styles.meetupMeta}>
                    <View style={styles.metaItem}>
                      <Clock size={13} color="#8A8A9A" />
                      <Text style={styles.metaText}>{formatWhen(ev.starts_at)}</Text>
                    </View>
                    {!!ev.location_name && (
                      <View style={styles.metaItem}>
                        <MapPin size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>{ev.location_name}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.meetupFooter}>
                    <View style={styles.metaItem}>
                      <Users size={13} color={ACCENT} />
                      <Text style={[styles.metaText, { color: "#B8B8C8" }]}>
                        {ev.participant_count}{ev.max_participants > 0 ? `/${ev.max_participants}` : ""} going
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.rsvpBtn, ev.is_joined ? styles.rsvpBtnActive : styles.rsvpBtnIdle]}
                      onPress={() => handleToggleEvent(ev.id, ev.is_joined)}
                      disabled={joiningId === ev.id}
                      activeOpacity={0.8}
                    >
                      {joiningId === ev.id ? (
                        <ActivityIndicator size="small" color={ev.is_joined ? "#FFFFFF" : ACCENT} />
                      ) : ev.is_joined ? (
                        <>
                          <Check size={14} color="#FFFFFF" />
                          <Text style={styles.rsvpText}>Going</Text>
                        </>
                      ) : (
                        <Text style={[styles.rsvpText, { color: ACCENT }]}>RSVP</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        ) : null}
      </ScrollView>

      <CreateEventModal
        visible={createEventOpen}
        coordinate={coordinate}
        onClose={() => setCreateEventOpen(false)}
        onCreated={() => { setCreateEventOpen(false); fetchEvents(); }}
      />
      <CreateConvoyModal
        visible={createConvoyOpen}
        onClose={() => setCreateConvoyOpen(false)}
        onCreated={() => { setCreateConvoyOpen(false); browsePublicParties(); }}
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
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress} activeOpacity={0.8}>
      <Icon size={16} color={active ? ACCENT : "#5A5A6E"} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  topTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },

  tabs: { flexDirection: "row", gap: 4, marginHorizontal: 20, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabActive: { backgroundColor: ACCENT + "1F" },
  tabText: { fontSize: 13, fontWeight: "600", color: "#5A5A6E" },
  tabTextActive: { color: ACCENT },

  headerRow: { flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#FFFFFF" },
  sectionSub: { fontSize: 13, color: "#8A8A9A", marginTop: 2 },

  card: { backgroundColor: "#12121A", borderRadius: 16, borderWidth: 1, borderColor: "#1E1E2E", padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  cardDesc: { fontSize: 13, color: "#8A8A9A", marginTop: 3, lineHeight: 18 },

  convoyTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  colorDot: { width: 16, height: 16, borderRadius: 8 },
  convoyMeta: { flexDirection: "row", gap: 16, marginTop: 14, marginBottom: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 12.5, color: "#8A8A9A" },

  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 11, borderRadius: 12, marginTop: 8 },
  actionBtnPrimary: { backgroundColor: ACCENT },
  actionText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },

  meetupTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  meetupThumb: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  hostText: { fontSize: 12.5, color: "#8A8A9A", marginTop: 2 },
  meetupMeta: { gap: 7, marginTop: 14 },
  meetupFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
  rsvpBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  rsvpBtnIdle: { backgroundColor: ACCENT + "1A", borderWidth: 1, borderColor: ACCENT + "44" },
  rsvpBtnActive: { backgroundColor: ACCENT },
  rsvpText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13.5, color: "#8A8A9A" },

  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.25)", padding: 12, marginBottom: 12 },
  errorBannerText: { color: "#EF4444", fontSize: 13, flex: 1 },
  warnBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(251,191,36,0.1)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(251,191,36,0.25)", padding: 12, marginBottom: 12 },
  warnBannerText: { color: "#FBBF24", fontSize: 13, flex: 1 },
});
