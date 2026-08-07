import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Share,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import MapboxTileLayer from "@/components/MapboxTileLayer";
import MapboxMapStatus from "@/components/MapboxMapStatus";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { createAppLink } from "@/lib/deepLink";
import * as Clipboard from "expo-clipboard";
import {
  ArrowLeft,
  Heart,
  Share2,
  Send,
  Trash2,
  MapPin,
  Route as RouteIcon,
  Timer,
  Gauge,
  TrendingUp,
  Zap,
  Globe,
  Users,
  Lock,
  MoreVertical,
  Flag,
} from "lucide-react-native";
import { useRoutes, RouteComment, RouteVisibility } from "@/hooks/useRoutesStore";
import { useAuth } from "@/hooks/useAuthStore";
import { decodePolyline, regionForPath } from "@/lib/polyline";
import { useTheme } from "@/hooks/useThemeStore";
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from "@/constants/mapStyles";
import RenameModal from "@/components/RenameModal";
import { appAlert } from "@/lib/appAlert";
import { convertSpeed, speedUnitForCountry, speedUnitLabel } from "@/lib/speedUnits";

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const VIS_META: Record<RouteVisibility, { label: string; icon: React.FC<{ size: number; color: string }> }> = {
  public: { label: "Public", icon: Globe },
  friends: { label: "Friends", icon: Users },
  private: { label: "Private", icon: Lock },
};

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const { isDark } = useTheme();
  const { user } = useAuth();
  const speedUnit = useMemo(() => speedUnitForCountry(user?.country), [user?.country]);
  const { getRoute, toggleKudos, fetchComments, addComment, deleteComment, deleteRoute, updateRoute } = useRoutes();

  const route = getRoute(id ?? "");

  const [comments, setComments] = useState<RouteComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const coords = useMemo(
    () => (route?.route_polyline ? decodePolyline(route.route_polyline) : []),
    [route?.route_polyline]
  );

  const loadComments = useCallback(async () => {
    if (!id) return;
    setLoadingComments(true);
    const list = await fetchComments(id);
    setComments(list);
    setLoadingComments(false);
  }, [id, fetchComments]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Fit map to the route once coordinates are available. initialRegion alone
  // can render at a stale zoom before the native view has laid out, so we
  // also re-fit as soon as the map reports ready.
  const fitToRoute = useCallback(() => {
    if (coords.length > 1) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }
  }, [coords]);

  useEffect(() => {
    const t = setTimeout(fitToRoute, 400);
    return () => clearTimeout(t);
  }, [fitToRoute]);

  const handleShare = useCallback(async () => {
    if (!route) return;
    const url = createAppLink(`route/${route.id}`);
    const message =
      `🚗 ${route.title}\n` +
      `${route.distance_km.toFixed(1)} km · ${fmtDuration(route.duration_seconds)} · ${convertSpeed(route.avg_speed_kmh, speedUnit).toFixed(0)} ${speedUnitLabel(speedUnit)} avg\n` +
      `Check out my route on Driveverse: ${url}`;
    try {
      const res = await Share.share({ message, title: route.title });
      if (res.action === Share.dismissedAction) {
        // no-op
      }
    } catch {
      // Fallback: copy link
      await Clipboard.setStringAsync(url);
      appAlert("Link copied", "Route link copied to clipboard");
    }
  }, [route]);

  const handleCopyLink = useCallback(async () => {
    if (!route) return;
    const url = createAppLink(`route/${route.id}`);
    await Clipboard.setStringAsync(url);
    appAlert("Link copied", "Route link copied to clipboard");
  }, [route]);

  const handlePost = useCallback(async () => {
    if (!id || !commentText.trim()) return;
    setPosting(true);
    const { error } = await addComment(id, commentText);
    setPosting(false);
    if (error) {
      appAlert("Could not post", error);
      return;
    }
    setCommentText("");
    loadComments();
  }, [id, commentText, addComment, loadComments]);

  const handleDeleteRoute = useCallback(() => {
    if (!route) return;
    appAlert("Delete Route", `Delete "${route.title}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await deleteRoute(route.id);
          if (error) appAlert("Error", error);
          else router.back();
        },
      },
    ]);
  }, [route, deleteRoute, router]);

  const handleChangeVisibility = useCallback(() => {
    if (!route) return;
    appAlert("Route Visibility", "Who can see this route?", [
      { text: "🌍 Public", onPress: () => updateRoute(route.id, { visibility: "public" }) },
      { text: "👥 Friends only", onPress: () => updateRoute(route.id, { visibility: "friends" }) },
      { text: "🔒 Private", onPress: () => updateRoute(route.id, { visibility: "private" }) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [route, updateRoute]);

  const handleOwnerMenu = useCallback(() => {
    appAlert("Route Options", undefined, [
      { text: "Rename route", onPress: () => setShowRename(true) },
      { text: "Change visibility", onPress: handleChangeVisibility },
      { text: "Copy share link", onPress: handleCopyLink },
      { text: "Delete route", style: "destructive", onPress: handleDeleteRoute },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [handleChangeVisibility, handleCopyLink, handleDeleteRoute]);

  const handleRename = useCallback(async (value: string) => {
    if (!route) return;
    setRenaming(true);
    const { error } = await updateRoute(route.id, { title: value });
    setRenaming(false);
    if (error) {
      appAlert("Error", error);
      return;
    }
    setShowRename(false);
  }, [route, updateRoute]);

  if (!route) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <ArrowLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Route</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.notFound}>
          <RouteIcon size={44} color="#3A3A4E" />
          <Text style={styles.notFoundText}>Route not found</Text>
          <Text style={styles.notFoundSub}>
            It may be private, deleted, or not shared with you.
          </Text>
        </View>
      </View>
    );
  }

  const VisIcon = VIS_META[route.visibility].icon;
  const initial = (route.author_name || "D")[0].toUpperCase();
  const region = regionForPath(coords);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{route.title}</Text>
        {route.is_mine ? (
          <TouchableOpacity onPress={handleOwnerMenu} style={styles.iconBtn} hitSlop={8}>
            <MoreVertical size={20} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 50}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Map */}
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
              initialRegion={region}
              mapType={Platform.OS === "web" ? undefined : "none"}
              onMapReady={fitToRoute}
              customMapStyle={isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              <MapboxTileLayer dark={isDark} />

              {coords.length > 1 && (
                <>
                  <Polyline coordinates={coords} strokeWidth={8} strokeColor="rgba(255,107,53,0.25)" lineCap="round" />
                  <Polyline coordinates={coords} strokeWidth={4} strokeColor="#FF6B35" lineCap="round" />
                </>
              )}
              {coords.length > 0 && (
                <Marker coordinate={coords[0]} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[styles.endpoint, { backgroundColor: "#00D4AA" }]} />
                </Marker>
              )}
              {coords.length > 1 && (
                <Marker coordinate={coords[coords.length - 1]} anchor={{ x: 0.5, y: 1 }}>
                  <Flag size={26} color="#FF3B6F" fill="#FF3B6F30" />
                </Marker>
              )}
            </MapView>
            <MapboxMapStatus style={styles.mapboxStatus} />
          </View>

          <View style={styles.body}>
            {/* Author row */}
            <View style={styles.authorRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.authorName}>{route.is_mine ? "You" : route.author_name}</Text>
                <View style={styles.subRow}>
                  <Text style={styles.subText}>{timeAgo(route.created_at)}</Text>
                  <Text style={styles.dot}>·</Text>
                  <VisIcon size={12} color="#8A8A9A" />
                  <Text style={styles.subText}>{VIS_META[route.visibility].label}</Text>
                </View>
              </View>
            </View>

            {/* Title + description */}
            <Text style={styles.title}>{route.title}</Text>
            {route.description ? <Text style={styles.description}>{route.description}</Text> : null}
            {(route.origin_name || route.destination_name) ? (
              <View style={styles.routeLine}>
                <MapPin size={13} color="#00D4AA" />
                <Text style={styles.routeLineText} numberOfLines={1}>
                  {route.origin_name || "Start"} → {route.destination_name || "Finish"}
                </Text>
              </View>
            ) : null}

            {/* Stats grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <RouteIcon size={16} color="#FF6B35" />
                <Text style={styles.statBoxValue}>{route.distance_km.toFixed(1)}</Text>
                <Text style={styles.statBoxLabel}>km</Text>
              </View>
              <View style={styles.statBox}>
                <Timer size={16} color="#F59E0B" />
                <Text style={styles.statBoxValue}>{fmtDuration(route.duration_seconds)}</Text>
                <Text style={styles.statBoxLabel}>time</Text>
              </View>
              <View style={styles.statBox}>
                <TrendingUp size={16} color="#3B82F6" />
                <Text style={styles.statBoxValue}>{convertSpeed(route.avg_speed_kmh, speedUnit).toFixed(0)}</Text>
                <Text style={styles.statBoxLabel}>{speedUnitLabel(speedUnit)} avg</Text>
              </View>
              <View style={styles.statBox}>
                <Gauge size={16} color="#FF3B6F" />
                <Text style={styles.statBoxValue}>{convertSpeed(route.top_speed_kmh, speedUnit).toFixed(0)}</Text>
                <Text style={styles.statBoxLabel}>{speedUnitLabel(speedUnit)} top</Text>
              </View>
            </View>

            {route.xp_earned > 0 && (
              <View style={styles.xpRow}>
                <Zap size={15} color="#FFD700" />
                <Text style={styles.xpText}>Earned +{route.xp_earned} XP on this drive</Text>
              </View>
            )}

            {/* Kudos + Share actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.kudosBtn, route.has_kudos && styles.kudosBtnActive]}
                onPress={() => toggleKudos(route.id)}
                activeOpacity={0.8}
              >
                <Heart
                  size={19}
                  color={route.has_kudos ? "#FFFFFF" : "#FF3B6F"}
                  fill={route.has_kudos ? "#FFFFFF" : "transparent"}
                />
                <Text style={[styles.kudosText, route.has_kudos && { color: "#FFFFFF" }]}>
                  {route.kudos_count} {route.kudos_count === 1 ? "Kudos" : "Kudos"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8}>
                <Share2 size={18} color="#FFFFFF" />
                <Text style={styles.shareText}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Comments */}
            <Text style={styles.commentsTitle}>
              Comments {route.comments_count > 0 ? `(${route.comments_count})` : ""}
            </Text>
            {loadingComments ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 16 }} />
            ) : comments.length === 0 ? (
              <Text style={styles.noComments}>No comments yet. Start the conversation!</Text>
            ) : (
              comments.map((c) => (
                <View key={c.id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{(c.author_name || "D")[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>
                        {c.user_id === user?.id ? "You" : c.author_name}
                      </Text>
                      <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                    </View>
                    <Text style={styles.commentText}>{c.content}</Text>
                  </View>
                  {c.user_id === user?.id && (
                    <TouchableOpacity
                      onPress={async () => {
                        await deleteComment(c.id);
                        loadComments();
                      }}
                      hitSlop={8}
                    >
                      <Trash2 size={15} color="#5A5A6E" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Comment input */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment..."
            placeholderTextColor="#5A5A6E"
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!commentText.trim() || posting) && { opacity: 0.4 }]}
            onPress={handlePost}
            disabled={!commentText.trim() || posting}
          >
            {posting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <RenameModal
        visible={showRename}
        title="Rename Route"
        initialValue={route.title}
        placeholder="e.g. Sunset Canyon Run"
        saving={renaming}
        onCancel={() => setShowRename(false)}
        onSave={handleRename}
      />
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
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: "#FFFFFF", textAlign: "center" },
  mapboxStatus: {
    position: "absolute",
    right: 10,
    bottom: 10,
  },
  mapWrap: {
    height: 260,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#12121C",
  },
  endpoint: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: "#0A0A0F",
  },
  body: { padding: 20 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,107,53,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "800", color: "#FF6B35" },
  authorName: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  subText: { fontSize: 12, color: "#8A8A9A" },
  dot: { color: "#3A3A4E", fontSize: 12 },
  title: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginBottom: 6 },
  description: { fontSize: 14, color: "#B0B0BE", lineHeight: 20, marginBottom: 10 },
  routeLine: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  routeLineText: { fontSize: 13, color: "#8A8A9A", flex: 1 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statBoxValue: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  statBoxLabel: { fontSize: 10, color: "#8A8A9A" },
  xpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,215,0,0.08)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
  },
  xpText: { fontSize: 13, fontWeight: "700", color: "#FFD700" },
  actions: { flexDirection: "row", gap: 12, marginBottom: 24 },
  kudosBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(255,59,111,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,59,111,0.4)",
  },
  kudosBtnActive: { backgroundColor: "#FF3B6F", borderColor: "#FF3B6F" },
  kudosText: { fontSize: 15, fontWeight: "800", color: "#FF3B6F" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 50,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: "#FF6B35",
  },
  shareText: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  commentsTitle: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", marginBottom: 12 },
  noComments: { fontSize: 13, color: "#5A5A6E", paddingVertical: 16 },
  commentRow: { flexDirection: "row", gap: 10, marginBottom: 16, alignItems: "flex-start" },
  commentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarText: { fontSize: 14, fontWeight: "700", color: "#8A8A9A" },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  commentAuthor: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  commentTime: { fontSize: 11, color: "#5A5A6E" },
  commentText: { fontSize: 14, color: "#CACAD5", lineHeight: 19 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#0A0A0F",
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: "#FFFFFF",
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 10 },
  notFoundText: { fontSize: 18, fontWeight: "700", color: "#8A8A9A" },
  notFoundSub: { fontSize: 13, color: "#5A5A6E", textAlign: "center" },
});
