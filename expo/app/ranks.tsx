import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Stack } from "expo-router";
import { ArrowLeft, Check, Lock, ChevronRight, Zap } from "lucide-react-native";
import { useXP } from "@/hooks/useXPStore";
import {
  RANKS,
  rankForLevel,
  rankProgress,
  rankLevelLabel,
  rankIndex,
} from "@/constants/ranks";
import RankBadge from "@/components/RankBadge";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(255,215,0,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function RanksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { level, xpCurrentLevel, xpRequired, xpProgress } = useXP();

  const current = rankForLevel(level);
  const currentIdx = rankIndex(current);
  const { progress, levelsToNext, next } = rankProgress(level);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Levels &amp; Ranks</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Current rank hero ── */}
        <View style={styles.hero}>
          <View
            style={[
              styles.heroGlow,
              { backgroundColor: hexToRgba(current.color, 0.4) },
            ]}
          />
          <RankBadge rank={current} size={168} glow />
          <Text style={[styles.heroRank, { color: current.color }]}>{current.name}</Text>
          <Text style={styles.heroLevel}>
            Level {level} · {rankLevelLabel(current)}
          </Text>

          {/* XP within this level */}
          <View style={styles.progressBlock}>
            <View style={styles.progressLabelRow}>
              <View style={styles.progressLabelLeft}>
                <Zap size={13} color="#FFD700" />
                <Text style={styles.progressLabel}>XP to Level {level + 1}</Text>
              </View>
              <Text style={styles.progressValue}>
                {xpCurrentLevel} / {xpRequired}
              </Text>
            </View>
            <View style={styles.track}>
              <LinearGradient
                colors={["#FF6B35", "#FFD700"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.fill, { width: `${Math.min(xpProgress * 100, 100)}%` }]}
              />
            </View>
          </View>

          {/* Rank progress */}
          {next ? (
            <View style={styles.progressBlock}>
              <View style={styles.progressLabelRow}>
                <Text style={styles.progressLabel}>
                  {levelsToNext} {levelsToNext === 1 ? "level" : "levels"} to{" "}
                  <Text style={{ color: next.color, fontWeight: "800" }}>{next.name}</Text>
                </Text>
              </View>
              <View style={styles.track}>
                <LinearGradient
                  colors={[current.color, next.color]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.fill, { width: `${Math.min(progress * 100, 100)}%` }]}
                />
              </View>
            </View>
          ) : (
            <View style={styles.maxedRow}>
              <Text style={styles.maxedText}>👑 You've reached the top rank!</Text>
            </View>
          )}
        </View>

        {/* ── Full ladder ── */}
        <Text style={styles.sectionTitle}>All Ranks</Text>
        <Text style={styles.sectionSub}>
          Earn XP by driving, recording routes, and completing events to climb the ladder.
        </Text>

        {RANKS.map((rank, idx) => {
          const isCurrent = idx === currentIdx;
          const isUnlocked = idx <= currentIdx;
          const isLocked = idx > currentIdx;
          return (
            <View
              key={rank.id}
              style={[
                styles.rankRow,
                isCurrent && { borderColor: rank.color, backgroundColor: hexToRgba(rank.color, 0.08) },
              ]}
            >
              <RankBadge rank={rank} size={56} locked={isLocked} />
              <View style={styles.rankInfo}>
                <View style={styles.rankNameRow}>
                  <Text style={[styles.rankName, isLocked && { color: "#8A8A9A" }]}>
                    {rank.name}
                  </Text>
                  {rank.emoji ? <Text style={{ fontSize: 15 }}>{rank.emoji}</Text> : null}
                </View>
                <Text style={styles.rankLevels}>{rankLevelLabel(rank)}</Text>
                {!rank.badge && (
                  <Text style={styles.rankSoon}>Badge art coming soon</Text>
                )}
              </View>

              {isCurrent ? (
                <View style={[styles.stateChip, { backgroundColor: rank.color }]}>
                  <Text style={styles.stateChipText}>CURRENT</Text>
                </View>
              ) : isUnlocked ? (
                <View style={styles.stateIcon}>
                  <Check size={16} color="#22C55E" />
                </View>
              ) : (
                <View style={styles.stateIcon}>
                  <Lock size={15} color="#5A5A6E" />
                </View>
              )}
            </View>
          );
        })}

        {/* Back to profile */}
        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => router.push("/(tabs)/profile" as any)}
          activeOpacity={0.7}
        >
          <Text style={styles.profileLinkText}>View your profile</Text>
          <ChevronRight size={16} color="#8A8A9A" />
        </TouchableOpacity>
      </ScrollView>
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
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: 20,
    marginBottom: 12,
  },
  heroGlow: {
    position: "absolute",
    top: 10,
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: SCREEN_WIDTH * 0.35,
    opacity: 0.22,
  },
  heroRank: {
    fontSize: 28,
    fontWeight: "900",
    marginTop: 12,
    letterSpacing: -0.5,
  },
  heroLevel: {
    fontSize: 14,
    color: "#8A8A9A",
    fontWeight: "600",
    marginTop: 4,
    marginBottom: 20,
  },
  progressBlock: { width: "100%", marginTop: 12 },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabelLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressLabel: { fontSize: 13, color: "#B0B0BE", fontWeight: "600" },
  progressValue: { fontSize: 12, color: "#8A8A9A", fontWeight: "700" },
  track: {
    height: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4 },
  maxedRow: { marginTop: 16 },
  maxedText: { fontSize: 15, color: "#FFD700", fontWeight: "700" },
  // Section
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF", marginTop: 8 },
  sectionSub: { fontSize: 13, color: "#8A8A9A", lineHeight: 19, marginTop: 4, marginBottom: 16 },
  // Rank row
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rankInfo: { flex: 1 },
  rankNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rankName: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  rankLevels: { fontSize: 12, color: "#8A8A9A", marginTop: 2, fontWeight: "600" },
  rankSoon: { fontSize: 10, color: "#5A5A6E", marginTop: 3, fontStyle: "italic" },
  stateChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  stateChipText: { fontSize: 10, fontWeight: "900", color: "#0A0A0F", letterSpacing: 0.5 },
  stateIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  profileLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 12,
  },
  profileLinkText: { fontSize: 14, fontWeight: "600", color: "#8A8A9A" },
});
