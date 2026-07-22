import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
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
  Shield,
  Zap,
  X,
} from "lucide-react-native";
import { useCommunity } from "@/hooks/useCommunityStore";
import { useEvents } from "@/hooks/useEventsStore";
import CreateEventModal from "@/components/CreateEventModal";

const ACCENT = "#3B82F6"; // Community blue (matches the Drive feature card)

const MEETUP_FILTERS = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "nearby", label: "Nearby" },
] as const;
type MeetupFilter = (typeof MEETUP_FILTERS)[number]["key"];

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { crews, loadingCrews, joinCrew, leaveCrew, createCrew } = useCommunity();
  const { events, loadingEvents, joinEvent, leaveEvent } = useEvents();

  const [tab, setTab] = useState<"crew" | "meetups">("crew");
  const [filter, setFilter] = useState<MeetupFilter>("all");
  const [myPos, setMyPos] = useState<{ latitude: number; longitude: number } | null>(null);

  const [createCrewVisible, setCreateCrewVisible] = useState(false);
  const [createMeetupVisible, setCreateMeetupVisible] = useState(false);
  const [meetupPin, setMeetupPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
      .then((loc) => setMyPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }))
      .catch(() => {});
  }, []);

  const visibleMeetups = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 3600 * 1000;
    return events.filter((e) => {
      if (filter === "week") {
        const start = new Date(e.starts_at).getTime();
        return start - now <= weekMs;
      }
      if (filter === "nearby") {
        if (!myPos) return true;
        return haversineKm(myPos, { latitude: e.latitude, longitude: e.longitude }) <= 15;
      }
      return true;
    });
  }, [events, filter, myPos]);

  const joinedCount = crews.filter((c) => c.is_joined).length;
  const goingCount = events.filter((e) => e.is_joined).length;

  const handleToggleCrew = useCallback(async (crew: (typeof crews)[number]) => {
    setBusyId(crew.id);
    const result = crew.is_joined ? await leaveCrew(crew.id) : await joinCrew(crew.id);
    setBusyId(null);
    if (result.error) console.error(result.error);
  }, [joinCrew, leaveCrew]);

  const handleToggleGoing = useCallback(async (event: (typeof events)[number]) => {
    setBusyId(event.id);
    const result = event.is_joined ? await leaveEvent(event.id) : await joinEvent(event.id);
    setBusyId(null);
    if (result.error) console.error(result.error);
  }, [joinEvent, leaveEvent]);

  const handleCreate = useCallback(async () => {
    if (tab === "crew") {
      setCreateCrewVisible(true);
    } else {
      const pin = myPos ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
        .then((loc) => ({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }))
        .catch(() => null));
      setMeetupPin(pin);
      setCreateMeetupVisible(true);
    }
  }, [tab, myPos]);

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
          label="Crews"
          icon={Flag}
          active={tab === "crew"}
          onPress={() => setTab("crew")}
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
      >
        {tab === "crew" ? (
          <>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Crews in your country</Text>
                <Text style={styles.sectionSub}>
                  {joinedCount > 0
                    ? `Riding with ${joinedCount} crew${joinedCount > 1 ? "s" : ""}`
                    : "Join a crew to ride together"}
                </Text>
              </View>
            </View>

            {loadingCrews && crews.length === 0 ? (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
            ) : crews.length === 0 ? (
              <View style={styles.emptyState}>
                <Flag size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No crews near you yet — start the first one</Text>
              </View>
            ) : (
              crews.map((c) => {
                const isJoined = c.is_joined;
                return (
                  <View key={c.id} style={styles.card}>
                    <View style={styles.convoyTop}>
                      <View style={[styles.tagBadge, { backgroundColor: ACCENT + "22" }]}>
                        <Text style={[styles.tagText, { color: ACCENT }]}>{c.tag || c.name.slice(0, 4).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.nameRow}>
                          <Text style={styles.cardTitle}>{c.name}</Text>
                          {c.is_creator ? (
                            <Shield size={14} color={ACCENT} fill={ACCENT} />
                          ) : null}
                        </View>
                        {c.description ? <Text style={styles.cardDesc}>{c.description}</Text> : null}
                      </View>
                    </View>

                    <View style={styles.convoyMeta}>
                      <View style={styles.metaItem}>
                        <Users size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>{c.member_count} member{c.member_count === 1 ? "" : "s"}</Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        isJoined ? styles.actionBtnJoined : styles.actionBtnPrimary,
                      ]}
                      onPress={() => handleToggleCrew(c)}
                      disabled={busyId === c.id}
                      activeOpacity={0.8}
                    >
                      {busyId === c.id ? (
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
                          <Text style={styles.actionText}>Join crew</Text>
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
                <Text style={styles.sectionTitle}>Upcoming meetups</Text>
                <Text style={styles.sectionSub}>
                  {goingCount > 0
                    ? `You're going to ${goingCount} meetup${goingCount > 1 ? "s" : ""}`
                    : "RSVP to meetups near you"}
                </Text>
              </View>
            </View>

            {loadingEvents && events.length === 0 ? (
              <ActivityIndicator color={ACCENT} style={{ marginTop: 24 }} />
            ) : visibleMeetups.length === 0 ? (
              <View style={styles.emptyState}>
                <Calendar size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No meetups match this filter</Text>
              </View>
            ) : (
              visibleMeetups.map((m) => {
                const isGoing = m.is_joined;
                const distanceKm = myPos ? haversineKm(myPos, { latitude: m.latitude, longitude: m.longitude }) : null;
                return (
                  <View key={m.id} style={styles.card}>
                    <View style={styles.meetupTop}>
                      <View style={styles.meetupThumb}>
                        <Calendar size={24} color={ACCENT} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{m.title}</Text>
                        <Text style={styles.hostText}>by {m.host_name}</Text>
                      </View>
                    </View>

                    <View style={styles.meetupMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>
                          {new Date(m.starts_at).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <MapPin size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>
                          {m.location_name || "Pinned location"}
                          {distanceKm != null ? ` · ${distanceKm.toFixed(1)} km` : ""}
                        </Text>
                      </View>
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
                        onPress={() => handleToggleGoing(m)}
                        disabled={busyId === m.id}
                        activeOpacity={0.8}
                      >
                        {busyId === m.id ? (
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

      <CreateCrewModal
        visible={createCrewVisible}
        onClose={() => setCreateCrewVisible(false)}
        onCreate={createCrew}
      />

      <CreateEventModal
        visible={createMeetupVisible}
        coordinate={meetupPin}
        onClose={() => setCreateMeetupVisible(false)}
        onCreated={() => setCreateMeetupVisible(false)}
      />
    </View>
  );
}

function CreateCrewModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; tag?: string; description?: string }) => Promise<{ error?: string }>;
}) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setName("");
    setTag("");
    setDescription("");
    setError(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (name.trim().length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await onCreate({ name, tag, description });
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    reset();
    onClose();
  }, [name, tag, description, submitting, onCreate, reset, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={modalStyles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={modalStyles.sheetWrap}>
          <View style={[modalStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.headerTitle}>Start a Crew</Text>
              <TouchableOpacity style={modalStyles.closeBtn} onPress={handleClose} activeOpacity={0.7}>
                <X size={18} color="#8A8A9A" />
              </TouchableOpacity>
            </View>

            <Text style={modalStyles.label}>Crew name</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="Midnight Runners"
              placeholderTextColor="#4A4A5E"
              value={name}
              onChangeText={setName}
              maxLength={60}
            />

            <Text style={modalStyles.label}>Tag (optional)</Text>
            <TextInput
              style={modalStyles.input}
              placeholder="MDNT"
              placeholderTextColor="#4A4A5E"
              value={tag}
              onChangeText={setTag}
              maxLength={6}
              autoCapitalize="characters"
            />

            <Text style={modalStyles.label}>Description (optional)</Text>
            <TextInput
              style={[modalStyles.input, modalStyles.inputMultiline]}
              placeholder="What's this crew about?"
              placeholderTextColor="#4A4A5E"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={300}
            />

            {error && <Text style={modalStyles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[modalStyles.submitBtn, (name.trim().length < 2 || submitting) && modalStyles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={name.trim().length < 2 || submitting}
              activeOpacity={0.75}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Flag size={18} color="#FFFFFF" />
                  <Text style={modalStyles.submitBtnText}>Create Crew</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "flex-end" },
  sheetWrap: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#0E0E18",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255, 255, 255, 0.06)",
    justifyContent: "center", alignItems: "center",
  },
  label: {
    color: "#8A8A9A", fontSize: 12, fontWeight: "600", marginTop: 14, marginBottom: 8,
    letterSpacing: 0.4, textTransform: "uppercase",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)", borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)", color: "#FFFFFF", fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
  errorText: { color: "#EF4444", fontSize: 13, fontWeight: "600", marginTop: 12 },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 15, marginTop: 20, marginBottom: 8,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
});

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

  // Crew
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

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13.5, color: "#8A8A9A" },
});
