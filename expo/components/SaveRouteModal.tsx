import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  X,
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
} from "lucide-react-native";
import { useRoutes, ActivityType, RouteVisibility } from "@/hooks/useRoutesStore";
import { encodePolyline, simplifyPath, LatLng } from "@/lib/polyline";

interface SaveRouteModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: (routeId: string) => void;
  path: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  topSpeedKmh: number;
  xpEarned?: number;
  originName?: string;
  destinationName?: string;
}

const ACTIVITY_OPTIONS: { key: ActivityType; label: string; icon: React.FC<{ size: number; color: string }>; color: string }[] = [
  { key: "drive", label: "Drive", icon: Car, color: "#FF6B35" },
  { key: "cruise", label: "Cruise", icon: Coffee, color: "#8B5CF6" },
  { key: "commute", label: "Commute", icon: Briefcase, color: "#3B82F6" },
  { key: "race", label: "Race", icon: Flame, color: "#FF3B6F" },
  { key: "roadtrip", label: "Road Trip", icon: MapIcon, color: "#00D4AA" },
];

const VISIBILITY_OPTIONS: { key: RouteVisibility; label: string; sub: string; icon: React.FC<{ size: number; color: string }> }[] = [
  { key: "public", label: "Public", sub: "Everyone can see & give kudos", icon: Globe },
  { key: "friends", label: "Friends", sub: "Only your friends can see", icon: Users },
  { key: "private", label: "Private", sub: "Only you can see", icon: Lock },
];

function fmtMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function SaveRouteModal({
  visible,
  onClose,
  onSaved,
  path,
  distanceMeters,
  durationSeconds,
  avgSpeedKmh,
  topSpeedKmh,
  xpEarned = 0,
  originName,
  destinationName,
}: SaveRouteModalProps) {
  const insets = useSafeAreaInsets();
  const { saveRoute } = useRoutes();

  const defaultTitle = destinationName && destinationName !== "Unknown"
    ? `Drive to ${destinationName}`
    : "Morning Drive";

  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [activity, setActivity] = useState<ActivityType>("drive");
  const [visibility, setVisibility] = useState<RouteVisibility>("public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Give your route a name");
      return;
    }
    if (path.length < 2) {
      setError("This route is too short to save");
      return;
    }
    setSaving(true);
    setError(null);

    const simplified = simplifyPath(path, 400);
    const polyline = encodePolyline(simplified);
    const start = path[0];
    const end = path[path.length - 1];

    const { id, error: saveError } = await saveRoute({
      title: title.trim(),
      description: description.trim(),
      activity_type: activity,
      route_polyline: polyline,
      start_lat: start.latitude,
      start_lng: start.longitude,
      end_lat: end.latitude,
      end_lng: end.longitude,
      origin_name: originName ?? "",
      destination_name: destinationName ?? "",
      distance_km: distanceMeters / 1000,
      duration_seconds: Math.round(durationSeconds),
      avg_speed_kmh: avgSpeedKmh,
      top_speed_kmh: topSpeedKmh,
      xp_earned: xpEarned,
      visibility,
    });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    // Reset for next time
    setTitle(defaultTitle);
    setDescription("");
    if (id) onSaved?.(id);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.kav}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.grabber} />
              <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Save & Share Route</Text>
                <TouchableOpacity onPress={onClose} hitSlop={10}>
                  <X size={22} color="#8A8A9A" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Stats strip */}
              <View style={styles.statsStrip}>
                <View style={styles.statItem}>
                  <RouteIcon size={16} color="#FF6B35" />
                  <Text style={styles.statValue}>{fmtMeters(distanceMeters)}</Text>
                  <Text style={styles.statLabel}>Distance</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Timer size={16} color="#F59E0B" />
                  <Text style={styles.statValue}>{fmtDuration(durationSeconds)}</Text>
                  <Text style={styles.statLabel}>Time</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Gauge size={16} color="#3B82F6" />
                  <Text style={styles.statValue}>{avgSpeedKmh.toFixed(0)}</Text>
                  <Text style={styles.statLabel}>km/h avg</Text>
                </View>
              </View>

              {/* Title */}
              <Text style={styles.fieldLabel}>Route name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sunset Canyon Run"
                placeholderTextColor="#5A5A6E"
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="How was the drive? Add notes for your followers..."
                placeholderTextColor="#5A5A6E"
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={1000}
              />

              {/* Activity type */}
              <Text style={styles.fieldLabel}>Activity type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {ACTIVITY_OPTIONS.map((opt) => {
                  const active = activity === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.chip,
                        active && { backgroundColor: `${opt.color}20`, borderColor: opt.color },
                      ]}
                      onPress={() => setActivity(opt.key)}
                      activeOpacity={0.7}
                    >
                      <opt.icon size={15} color={active ? opt.color : "#8A8A9A"} />
                      <Text style={[styles.chipText, active && { color: opt.color }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Visibility */}
              <Text style={styles.fieldLabel}>Who can see this?</Text>
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = visibility === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.visRow, active && styles.visRowActive]}
                    onPress={() => setVisibility(opt.key)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.visIcon, active && { backgroundColor: "rgba(255,107,53,0.15)" }]}>
                      <opt.icon size={18} color={active ? "#FF6B35" : "#8A8A9A"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visLabel, active && { color: "#FFFFFF" }]}>{opt.label}</Text>
                      <Text style={styles.visSub}>{opt.sub}</Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>
                      {active && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {error && <Text style={styles.errorText}>{error}</Text>}
            </ScrollView>

            {/* Save button */}
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#FF6B35", "#FF3B6F"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveBtnGradient}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Route</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  kav: {
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#111119",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    maxHeight: "92%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  header: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 11,
    color: "#8A8A9A",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8A8A9A",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
    marginBottom: 8,
    marginTop: 6,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
    color: "#FFFFFF",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  textArea: {
    height: 88,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  chipsRow: {
    gap: 8,
    paddingBottom: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  visRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  visRowActive: {
    borderColor: "#FF6B3560",
    backgroundColor: "rgba(255,107,53,0.06)",
  },
  visIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  visLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#CACAD5",
  },
  visSub: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#3A3A4E",
    justifyContent: "center",
    alignItems: "center",
  },
  radioActive: {
    borderColor: "#FF6B35",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF6B35",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  saveBtn: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 12,
  },
  saveBtnGradient: {
    height: 54,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
