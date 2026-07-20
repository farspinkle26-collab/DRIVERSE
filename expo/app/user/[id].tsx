import React, { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import {
  ArrowLeft,
  Car,
  Route as RouteIcon,
  Users,
  UserPlus,
  UserCheck,
  Clock,
  ChevronRight,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import {
  rankForLevel,
  nextRankForLevel,
  rankProgress,
  rankLevelLabel,
} from "@/constants/ranks";
import RankBadge from "@/components/RankBadge";
import { supabase } from "@/lib/supabase";

type FriendState = "none" | "pending_sent" | "pending_received" | "friends" | "self";

interface PublicProfile {
  id: string;
  name: string;
  avatar?: string;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [level, setLevel] = useState(1);
  const [carCount, setCarCount] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [friendState, setFriendState] = useState<FriendState>("none");
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // ─── Core profile ───────────────────────────────
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, name, avatar")
        .eq("id", id)
        .single();

      if (prof) {
        setProfile({ id: prof.id, name: prof.name, avatar: prof.avatar ?? undefined });
      }

      // ─── Level (rank) ───────────────────────────────
      const { data: xp } = await supabase
        .from("user_xp")
        .select("level")
        .eq("user_id", id)
        .single();
      if (xp?.level) setLevel(xp.level);

      // ─── Counts ─────────────────────────────────────
      const [{ count: cars }, { count: trips }, { count: sent }, { count: received }] =
        await Promise.all([
          supabase
            .from("car_collections")
            .select("id", { count: "exact", head: true })
            .eq("user_id", id),
          supabase
            .from("trips")
            .select("id", { count: "exact", head: true })
            .eq("user_id", id),
          supabase
            .from("friends")
            .select("id", { count: "exact", head: true })
            .eq("user_id", id)
            .eq("status", "accepted"),
          supabase
            .from("friends")
            .select("id", { count: "exact", head: true })
            .eq("friend_id", id)
            .eq("status", "accepted"),
        ]);
      setCarCount(cars ?? 0);
      setTripCount(trips ?? 0);
      setFriendCount((sent ?? 0) + (received ?? 0));

      // ─── Friendship state vs current user ───────────
      if (user && user.id === id) {
        setFriendState("self");
      } else if (user) {
        const { data: rel } = await supabase
          .from("friends")
          .select("*")
          .or(
            `and(user_id.eq.${user.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${user.id})`
          )
          .limit(1);
        const r = rel?.[0];
        if (!r) setFriendState("none");
        else if (r.status === "accepted") setFriendState("friends");
        else if (r.user_id === user.id) setFriendState("pending_sent");
        else setFriendState("pending_received");
      }
    } catch (err) {
      console.error("Load public profile error:", err);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleAddFriend = async () => {
    if (!user || !id) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from("friends").insert({
        user_id: user.id,
        friend_id: id,
        status: "pending",
      });
      if (error) Alert.alert("Error", error.message);
      else {
        setFriendState("pending_sent");
        Alert.alert("Sent!", `Friend request sent to ${profile?.name ?? "this driver"}.`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const rank = rankForLevel(level);
  const next = nextRankForLevel(level);
  const { progress, levelsToNext } = rankProgress(level);

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centered}>
          <ActivityIndicator color="#FF6B35" size="large" />
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.centered, { paddingHorizontal: 32 }]}>
          <Users size={40} color="#3A3A4E" />
          <Text style={styles.emptyText}>Profile unavailable</Text>
          <Text style={styles.emptySub}>
            This driver&apos;s profile could not be loaded.
          </Text>
          <TouchableOpacity style={styles.backBtnSolid} onPress={() => router.back()}>
            <Text style={styles.backBtnSolidText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ IDENTITY ═══ */}
        <View style={styles.identity}>
          <View style={styles.avatarSection}>
            <LinearGradient colors={[rank.color, rank.colorDark]} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                {profile.avatar ? (
                  <Image source={{ uri: profile.avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarLetter}>{profile.name?.[0]?.toUpperCase() ?? "D"}</Text>
                )}
              </View>
            </LinearGradient>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{level}</Text>
            </View>
          </View>
          <Text style={styles.userName}>{profile.name}</Text>
        </View>

        {/* ═══ BIG RANK HERO ═══ */}
        <TouchableOpacity
          style={styles.rankHero}
          activeOpacity={0.9}
          onPress={() => router.push("/ranks" as any)}
        >
          <LinearGradient
            colors={[`${rank.color}22`, "rgba(255,255,255,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.rankHeroGradient}
          >
            <RankBadge rank={rank} size={150} glow />
            <Text style={[styles.rankName, { color: rank.color }]}>{rank.name}</Text>
            <View style={styles.rankMetaRow}>
              <Text style={styles.rankMeta}>Level {level}</Text>
              <View style={styles.rankMetaDot} />
              <Text style={styles.rankMeta}>{rankLevelLabel(rank)}</Text>
            </View>

            {/* Progress to next rank */}
            {next ? (
              <View style={styles.rankProgressWrap}>
                <View style={styles.rankProgressTrack}>
                  <LinearGradient
                    colors={[rank.color, next.color]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.rankProgressFill, { width: `${Math.min(progress * 100, 100)}%` }]}
                  />
                </View>
                <Text style={styles.rankProgressText}>
                  {levelsToNext} {levelsToNext === 1 ? "level" : "levels"} to {next.name}
                </Text>
              </View>
            ) : (
              <View style={styles.rankProgressWrap}>
                <Text style={styles.rankProgressText}>Top of the ladder 👑</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* ═══ STATS ═══ */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Car size={18} color="#FF6B35" />
            <Text style={styles.statValue}>{carCount}</Text>
            <Text style={styles.statLabel}>Cars</Text>
          </View>
          <View style={styles.statCard}>
            <RouteIcon size={18} color="#00D4AA" />
            <Text style={styles.statValue}>{tripCount}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
          <View style={styles.statCard}>
            <Users size={18} color="#FFD700" />
            <Text style={styles.statValue}>{friendCount}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
        </View>

        {/* ═══ ACTION ═══ */}
        {friendState !== "self" && user && (
          <View style={styles.actionWrap}>
            {friendState === "none" && (
              <TouchableOpacity
                style={styles.addFriendBtn}
                onPress={handleAddFriend}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={["#FF6B35", "#FF3B6F"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addFriendGradient}
                >
                  {actionLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <UserPlus size={18} color="#FFFFFF" />
                      <Text style={styles.addFriendText}>Add Friend</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
            {friendState === "pending_sent" && (
              <View style={[styles.statusPill, { borderColor: "rgba(255,215,0,0.3)" }]}>
                <Clock size={16} color="#FFD700" />
                <Text style={[styles.statusPillText, { color: "#FFD700" }]}>Request Pending</Text>
              </View>
            )}
            {friendState === "pending_received" && (
              <View style={[styles.statusPill, { borderColor: "rgba(255,107,53,0.3)" }]}>
                <UserPlus size={16} color="#FF6B35" />
                <Text style={[styles.statusPillText, { color: "#FF6B35" }]}>
                  Wants to be friends — accept in your Friends tab
                </Text>
              </View>
            )}
            {friendState === "friends" && (
              <View style={[styles.statusPill, { borderColor: "rgba(34,197,94,0.3)" }]}>
                <UserCheck size={16} color="#22C55E" />
                <Text style={[styles.statusPillText, { color: "#22C55E" }]}>Friends</Text>
              </View>
            )}
          </View>
        )}

        {/* View full rank ladder */}
        <TouchableOpacity
          style={styles.ladderRow}
          onPress={() => router.push("/ranks" as any)}
          activeOpacity={0.7}
        >
          <RankBadge rank={rank} size={28} />
          <Text style={styles.ladderText}>View the full rank ladder</Text>
          <ChevronRight size={16} color="#5A5A6E" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  bg: { ...StyleSheet.absoluteFillObject },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
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
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  // Identity
  identity: { alignItems: "center", paddingTop: 8 },
  avatarSection: { position: "relative", marginBottom: 12 },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  avatarInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#0A0A0F",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 92, height: 92, borderRadius: 46 },
  avatarLetter: { fontSize: 38, fontWeight: "800", color: "#FF6B35" },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },
  levelBadgeText: { fontSize: 14, fontWeight: "800", color: "#000" },
  userName: { fontSize: 24, fontWeight: "800", color: "#FFFFFF", marginBottom: 4 },
  // Rank hero
  rankHero: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rankHeroGradient: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  rankName: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  rankMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  rankMeta: { fontSize: 13, fontWeight: "600", color: "#8A8A9A" },
  rankMetaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3A3A4E",
  },
  rankProgressWrap: { width: "100%", marginTop: 18, alignItems: "center" },
  rankProgressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  rankProgressFill: { height: "100%", borderRadius: 4 },
  rankProgressText: { fontSize: 12, color: "#8A8A9A", marginTop: 8, fontWeight: "600" },
  // Stats
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 6,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: "#FFFFFF" },
  statLabel: { fontSize: 11, color: "#8A8A9A" },
  // Action
  actionWrap: { marginHorizontal: 20, marginTop: 20 },
  addFriendBtn: { borderRadius: 14, overflow: "hidden" },
  addFriendGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
  },
  addFriendText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
  },
  statusPillText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  // Ladder row
  ladderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 20,
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  ladderText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  // Empty
  emptyText: { fontSize: 18, fontWeight: "700", color: "#8A8A9A", marginTop: 14 },
  emptySub: { fontSize: 14, color: "#5A5A6E", textAlign: "center", marginTop: 6 },
  backBtnSolid: {
    marginTop: 24,
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FF6B35",
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnSolidText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});
