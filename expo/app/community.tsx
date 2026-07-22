import React, { useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
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

const ACCENT = "#3B82F6"; // Community blue (matches the Drive feature card)

// ─── Convoy data ─────────────────────────────────────────────────────
// A "convoy" is a driving crew you can ride with. Membership is toggled
// locally so the Join / Leave button is fully interactive.
type Convoy = {
  id: string;
  name: string;
  tag: string;
  members: number;
  description: string;
  online: number;
  verified?: boolean;
};

const CONVOYS: Convoy[] = [
  {
    id: "c1",
    name: "Midnight Runners",
    tag: "MDNT",
    members: 342,
    online: 28,
    description: "Late-night touge & city cruises. JDM welcome.",
    verified: true,
  },
  {
    id: "c2",
    name: "Apex Hunters",
    tag: "APEX",
    members: 187,
    online: 12,
    description: "Track days, canyon runs and clean driving.",
  },
  {
    id: "c3",
    name: "EV Volt Crew",
    tag: "VOLT",
    members: 96,
    online: 9,
    description: "Electric owners charging up together.",
  },
  {
    id: "c4",
    name: "Sunday Cruisers",
    tag: "SNDY",
    members: 254,
    online: 17,
    description: "Relaxed weekend coffee runs, all cars welcome.",
    verified: true,
  },
];

// ─── Meetup data ─────────────────────────────────────────────────────
type Meetup = {
  id: string;
  title: string;
  date: string;
  when: "week" | "nearby";
  distanceKm: number;
  location: string;
  attendees: number;
  host: string;
};

const MEETUPS: Meetup[] = [
  {
    id: "m1",
    title: "Midnight Rally",
    date: "Sat, 25 Jul · 21:00",
    when: "week",
    distanceKm: 3,
    location: "Downtown Parking Lot",
    attendees: 128,
    host: "Midnight Runners",
  },
  {
    id: "m2",
    title: "Cars & Coffee",
    date: "Sun, 26 Jul · 08:00",
    when: "week",
    distanceKm: 6,
    location: "Harbour Cafe",
    attendees: 74,
    host: "Sunday Cruisers",
  },
  {
    id: "m3",
    title: "Canyon Touge Run",
    date: "Sat, 1 Aug · 06:00",
    when: "nearby",
    distanceKm: 22,
    location: "Skyline Pass",
    attendees: 41,
    host: "Apex Hunters",
  },
  {
    id: "m4",
    title: "EV Showcase",
    date: "Sun, 2 Aug · 10:00",
    when: "nearby",
    distanceKm: 14,
    location: "City Central",
    attendees: 56,
    host: "EV Volt Crew",
  },
];

const MEETUP_FILTERS = [
  { key: "all", label: "All" },
  { key: "week", label: "This week" },
  { key: "nearby", label: "Nearby" },
] as const;
type MeetupFilter = (typeof MEETUP_FILTERS)[number]["key"];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab] = useState<"convoy" | "meetups">("convoy");

  // Interactive membership + RSVP state
  const [joined, setJoined] = useState<Record<string, boolean>>({ c1: true });
  const [going, setGoing] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<MeetupFilter>("all");

  const toggleJoin = (id: string) =>
    setJoined((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleGoing = (id: string) =>
    setGoing((prev) => ({ ...prev, [id]: !prev[id] }));

  const visibleMeetups = useMemo(() => {
    if (filter === "all") return MEETUPS;
    if (filter === "week") return MEETUPS.filter((m) => m.when === "week");
    return MEETUPS.filter((m) => m.distanceKm <= 15);
  }, [filter]);

  const joinedCount = Object.values(joined).filter(Boolean).length;
  const goingCount = Object.values(going).filter(Boolean).length;

  const handleCreate = () => {
    if (tab === "convoy") {
      Alert.alert("Start a Convoy", "Rally your crew and give it a name.", [
        { text: "Not now", style: "cancel" },
        { text: "Create", style: "default" },
      ]);
    } else {
      Alert.alert("Host a Meetup", "Pick a spot, set a time, invite drivers.", [
        { text: "Not now", style: "cancel" },
        { text: "Create", style: "default" },
      ]);
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
      >
        {tab === "convoy" ? (
          <>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Your convoys</Text>
                <Text style={styles.sectionSub}>
                  {joinedCount > 0
                    ? `Riding with ${joinedCount} crew${joinedCount > 1 ? "s" : ""}`
                    : "Join a crew to ride together"}
                </Text>
              </View>
            </View>

            {CONVOYS.map((c) => {
              const isJoined = !!joined[c.id];
              return (
                <View key={c.id} style={styles.card}>
                  <View style={styles.convoyTop}>
                    <View style={[styles.tagBadge, { backgroundColor: ACCENT + "22" }]}>
                      <Text style={[styles.tagText, { color: ACCENT }]}>{c.tag}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.cardTitle}>{c.name}</Text>
                        {c.verified ? (
                          <Shield size={14} color={ACCENT} fill={ACCENT} />
                        ) : null}
                      </View>
                      <Text style={styles.cardDesc}>{c.description}</Text>
                    </View>
                  </View>

                  <View style={styles.convoyMeta}>
                    <View style={styles.metaItem}>
                      <Users size={13} color="#8A8A9A" />
                      <Text style={styles.metaText}>{c.members} members</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <View style={styles.onlineDot} />
                      <Text style={styles.metaText}>{c.online} online</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isJoined ? styles.actionBtnJoined : styles.actionBtnPrimary,
                    ]}
                    onPress={() => toggleJoin(c.id)}
                    activeOpacity={0.8}
                  >
                    {isJoined ? (
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
            })}
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

            {visibleMeetups.length === 0 ? (
              <View style={styles.emptyState}>
                <Calendar size={28} color={ACCENT + "60"} />
                <Text style={styles.emptyText}>No meetups match this filter</Text>
              </View>
            ) : (
              visibleMeetups.map((m) => {
                const isGoing = !!going[m.id];
                return (
                  <View key={m.id} style={styles.card}>
                    <View style={styles.meetupTop}>
                      <View style={styles.meetupThumb}>
                        <Calendar size={24} color={ACCENT} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{m.title}</Text>
                        <Text style={styles.hostText}>by {m.host}</Text>
                      </View>
                    </View>

                    <View style={styles.meetupMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>{m.date}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <MapPin size={13} color="#8A8A9A" />
                        <Text style={styles.metaText}>
                          {m.location} · {m.distanceKm} km
                        </Text>
                      </View>
                    </View>

                    <View style={styles.meetupFooter}>
                      <View style={styles.metaItem}>
                        <Users size={13} color={ACCENT} />
                        <Text style={[styles.metaText, { color: "#B8B8C8" }]}>
                          {m.attendees + (isGoing ? 1 : 0)} going
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.rsvpBtn,
                          isGoing ? styles.rsvpBtnActive : styles.rsvpBtnIdle,
                        ]}
                        onPress={() => toggleGoing(m.id)}
                        activeOpacity={0.8}
                      >
                        {isGoing ? (
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
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
  },

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
