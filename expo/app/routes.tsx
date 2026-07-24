import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Route as RouteIcon,
  Timer,
  Gauge,
  Globe,
  Users,
  Lock,
  Car,
  Coffee,
  Flame,
  Briefcase,
  Map as MapIcon,
  ChevronRight,
} from "lucide-react-native";
import { useRoutes, SavedRoute, ActivityType, RouteVisibility } from "@/hooks/useRoutesStore";
import { useAuth } from "@/hooks/useAuthStore";
import RoutePreview from "@/components/RoutePreview";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const ACTIVITY_META: Record<ActivityType, { label: string; icon: React.FC<{ size: number; color: string }>; color: string }> = {
  drive: { label: "Drive", icon: Car, color: "#FF3B30" },
  cruise: { label: "Cruise", icon: Coffee, color: "#8B5CF6" },
  commute: { label: "Commute", icon: Briefcase, color: "#3B82F6" },
  race: { label: "Race", icon: Flame, color: "#FF3B6F" },
  roadtrip: { label: "Road Trip", icon: MapIcon, color: "#00D4AA" },
};

function VisibilityIcon({ v, size = 12, color = "#5A5A6E" }: { v: RouteVisibility; size?: number; color?: string }) {
  if (v === "public") return <Globe size={size} color={color} />;
  if (v === "friends") return <Users size={size} color={color} />;
  return <Lock size={size} color={color} />;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RouteCard({ route, onKudos, onOpen }: { route: SavedRoute; onKudos: () => void; onOpen: () => void }) {
  const meta = ACTIVITY_META[route.activity_type] ?? ACTIVITY_META.drive;
  const initial = (route.author_name || "D")[0].toUpperCase();

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onOpen}>
      {/* Header: author + activity */}
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>
            {route.is_mine ? "You" : route.author_name}
          </Text>
          <View style={styles.subMetaRow}>
            <meta.icon size={12} color={meta.color} />
            <Text style={[styles.subMetaText, { color: meta.color }]}>{meta.label}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.subMetaText}>{timeAgo(route.created_at)}</Text>
            <Text style={styles.dot}>·</Text>
            <VisibilityIcon v={route.visibility} />
          </View>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.cardTitle} numberOfLines={1}>{route.title}</Text>
      {route.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{route.description}</Text>
      ) : null}

      {/* Map preview */}
      <View style={styles.previewWrap}>
        <RoutePreview polyline={route.route_polyline} width={SCREEN_WIDTH - 72} height={140} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <RouteIcon size={14} color="#8A8A9A" />
          <Text style={styles.statValue}>{route.distance_km.toFixed(1)} km</Text>
        </View>
        <View style={styles.stat}>
          <Timer size={14} color="#8A8A9A" />
          <Text style={styles.statValue}>{fmtDuration(route.duration_seconds)}</Text>
        </View>
        <View style={styles.stat}>
          <Gauge size={14} color="#8A8A9A" />
          <Text style={styles.statValue}>{route.avg_speed_kmh.toFixed(0)} km/h</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onKudos} activeOpacity={0.7} hitSlop={8}>
          <Heart
            size={19}
            color={route.has_kudos ? "#FF3B6F" : "#8A8A9A"}
            fill={route.has_kudos ? "#FF3B6F" : "transparent"}
          />
          <Text style={[styles.actionText, route.has_kudos && { color: "#FF3B6F" }]}>
            {route.kudos_count}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpen} activeOpacity={0.7} hitSlop={8}>
          <MessageCircle size={18} color="#8A8A9A" />
          <Text style={styles.actionText}>{route.comments_count}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <View style={styles.viewRow}>
          <Text style={styles.viewText}>View</Text>
          <ChevronRight size={15} color="#5A5A6E" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function RoutesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { feed, myRoutes, loadingRoutes, fetchRoutes, toggleKudos } = useRoutes();
  const [tab, setTab] = useState<"feed" | "mine">("feed");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRoutes();
    setRefreshing(false);
  }, [fetchRoutes]);

  const list = tab === "feed" ? feed : myRoutes;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Routes</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["feed", "mine"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === "feed" ? "Community Feed" : "My Routes"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isAuthenticated ? (
        <View style={styles.empty}>
          <RouteIcon size={44} color="#3A3A4E" />
          <Text style={styles.emptyTitle}>Sign in to see routes</Text>
          <Text style={styles.emptySub}>Record a drive and share it with the community</Text>
          <TouchableOpacity style={styles.signInBtn} onPress={() => router.push("/login" as any)}>
            <Text style={styles.signInText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : loadingRoutes && list.length === 0 ? (
        <ActivityIndicator color="#FF3B30" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
        >
          {list.length === 0 ? (
            <View style={styles.empty}>
              <RouteIcon size={44} color="#3A3A4E" />
              <Text style={styles.emptyTitle}>
                {tab === "feed" ? "No shared routes yet" : "You haven't saved any routes"}
              </Text>
              <Text style={styles.emptySub}>
                {tab === "feed"
                  ? "Be the first — record a drive on the map and share it"
                  : "Record a drive on the map, then tap Save & Share Route"}
              </Text>
              <TouchableOpacity style={styles.signInBtn} onPress={() => router.push("/(tabs)/map" as any)}>
                <Text style={styles.signInText}>Go to Map</Text>
              </TouchableOpacity>
            </View>
          ) : (
            list.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                onKudos={() => toggleKudos(route.id)}
                onOpen={() => router.push(`/route/${route.id}` as any)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "rgba(255,59,48,0.15)" },
  tabText: { fontSize: 13, fontWeight: "700", color: "#5A5A6E" },
  tabTextActive: { color: "#FF3B30" },
  // Card
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,59,48,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 17, fontWeight: "800", color: "#FF3B30" },
  authorName: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  subMetaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  subMetaText: { fontSize: 12, color: "#8A8A9A", fontWeight: "600" },
  dot: { color: "#3A3A4E", fontSize: 12 },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF", marginBottom: 2 },
  cardDesc: { fontSize: 13, color: "#8A8A9A", lineHeight: 18, marginBottom: 10 },
  previewWrap: { marginTop: 8, marginBottom: 14, alignItems: "center" },
  statsRow: {
    flexDirection: "row",
    gap: 18,
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  statValue: { fontSize: 13, fontWeight: "700", color: "#CACAD5" },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 20 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { fontSize: 14, fontWeight: "700", color: "#8A8A9A" },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewText: { fontSize: 13, fontWeight: "700", color: "#5A5A6E" },
  // Empty
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#8A8A9A", marginTop: 14 },
  emptySub: { fontSize: 13, color: "#5A5A6E", textAlign: "center", marginTop: 6, lineHeight: 19 },
  signInBtn: {
    marginTop: 20,
    backgroundColor: "#FF3B30",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
});
