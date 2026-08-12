/**
 * Driveverse — Levels & Ranks.
 *
 * Built on the Phase 1 token system (`constants/theme.ts`,
 * `components/CutCorner.tsx`), following the pattern the profile screen's
 * rank card and XP block already set (`components/ProfileScreen.tsx`).
 * The current-rank hero and the XP/rank-progress tracks mirror that screen
 * exactly so the two places a driver sees their rank agree pixel-for-pixel;
 * this screen adds the full ladder underneath.
 */

import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, Stack } from "expo-router";
import { ArrowLeft, Check, ChevronRight, Lock } from "lucide-react-native";
import { useXP } from "@/hooks/useXPStore";
import { useMainQuest } from "@/hooks/useMainQuestStore";
import {
  RANKS,
  rankForLevel,
  rankProgress,
  rankLevelLabel,
  rankIndex,
} from "@/constants/ranks";
import RankBadge from "@/components/RankBadge";
import { CutCornerBadge, CutCornerSurface } from "@/components/CutCorner";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const ICON_MD = spacing.spacingLg;
const ICON_STROKE = 1.75;

const OVERLINE = {
  fontFamily: fontFamily.displaySemiBold,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1,
  color: colors.textSecondary,
} as const;

/** Utility surface: plain rect, no cut, solid racingRed fill. */
function ProgressTrack({ progress }: { progress: number }) {
  return (
    <View style={styles.track}>
      <View
        style={[styles.trackFill, { width: `${Math.min(Math.max(progress, 0), 1) * 100}%` }]}
      />
    </View>
  );
}

export default function RanksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { level, xpCurrentLevel, xpRequired, xpProgress } = useXP();
  const { completeStep } = useMainQuest();

  /**
   * First Mile step 4, "Know Your Rank". Reaching this screen IS the step —
   * there is no row written when a driver reads their rank, which is why
   * this one is client-reported rather than trigger-driven
   * (`constants/mainQuests.ts`). Idempotent, so a remount costs nothing.
   */
  useEffect(() => {
    void completeStep("know_rank");
  }, [completeStep]);

  const current = rankForLevel(level);
  const currentIdx = rankIndex(current);
  const { progress, levelsToNext, next } = rankProgress(level);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.chrome, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={spacing.spacingSm}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <ArrowLeft size={spacing.spacingXl} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={styles.title}>LEVELS &amp; RANKS</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.spacingXxxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Current rank hero ── */}
        <View style={styles.hero}>
          <RankBadge rank={current} size={140} />
          <Text style={[styles.heroRank, { color: current.color }]}>{current.name}</Text>
          <Text style={styles.heroLevel}>
            Level {level} · {rankLevelLabel(current)}
          </Text>
        </View>

        {/* ── XP within this level ── */}
        <View style={styles.block}>
          <View style={styles.xpRow}>
            <Text style={styles.xpLevel}>LEVEL {level}</Text>
            <Text style={styles.xpValue}>{xpCurrentLevel} / {xpRequired} XP</Text>
          </View>
          <ProgressTrack progress={xpProgress} />
          <Text style={styles.xpToNext}>
            {Math.max(xpRequired - xpCurrentLevel, 0)} XP to next level
          </Text>
        </View>

        {/* ── Rank progress ── */}
        <View style={styles.block}>
          <CutCornerSurface
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.rankProgress}
          >
            {next ? (
              <>
                <View style={styles.rankProgressMiddle}>
                  <Text style={OVERLINE}>RANK PROGRESS</Text>
                  <ProgressTrack progress={progress} />
                  <Text style={styles.rankProgressNote}>
                    {levelsToNext} {levelsToNext === 1 ? "level" : "levels"} to{" "}
                    <Text style={{ color: next.color, fontFamily: fontFamily.bodySemiBold }}>
                      {next.name}
                    </Text>
                  </Text>
                </View>
                <View style={styles.verticalDivider} />
                <View style={styles.rankNext}>
                  <Text style={OVERLINE}>NEXT RANK</Text>
                  <RankBadge rank={next} size={30} />
                  <Text style={styles.rankNextName} numberOfLines={2}>
                    {next.name}
                  </Text>
                  <Text style={styles.rankNextLevel}>Lv {next.minLevel}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.maxedText}>Top rank reached</Text>
            )}
          </CutCornerSurface>
        </View>

        {/* ── Full ladder ── */}
        <View style={styles.block}>
          <Text style={styles.sectionTitle}>ALL RANKS</Text>
          <Text style={styles.sectionSub}>
            Earn XP by driving, recording routes, and completing events to climb the ladder.
          </Text>
        </View>

        <View style={styles.block}>
          {RANKS.map((rank, idx) => {
            const isCurrent = idx === currentIdx;
            const isUnlocked = idx <= currentIdx;
            const isLocked = idx > currentIdx;
            return (
              <View
                key={rank.id}
                style={[
                  styles.rankRow,
                  isCurrent && { borderColor: colors.racingRed },
                ]}
              >
                <RankBadge rank={rank} size={48} locked={isLocked} />
                <View style={styles.rankInfo}>
                  <View style={styles.rankNameRow}>
                    <Text style={[styles.rankName, isLocked && { color: colors.textSecondary }]}>
                      {rank.name}
                    </Text>
                    {rank.emoji ? <Text style={{ fontSize: 15 }}>{rank.emoji}</Text> : null}
                  </View>
                  <Text style={styles.rankLevels}>{rankLevelLabel(rank)}</Text>
                </View>

                {isCurrent ? (
                  <CutCornerBadge label="Current" solid color={colors.racingRed} corners="topRight" />
                ) : isUnlocked ? (
                  <Check size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                ) : (
                  <Lock size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                )}
              </View>
            );
          })}
        </View>

        {/* Back to profile */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View your profile"
          style={({ pressed }) => [styles.profileLink, pressed && styles.pressed]}
          onPress={() => router.push("/(tabs)/profile" as any)}
        >
          <Text style={styles.profileLinkText}>View your profile</Text>
          <ChevronRight size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.voidBlack },
  pressed: { opacity: 0.7 },
  chrome: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingMd,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.spacingLg,
    gap: spacing.spacingLg,
  },
  block: { gap: spacing.spacingSm },
  // Hero
  hero: {
    alignItems: "center",
    paddingVertical: spacing.spacingLg,
    gap: spacing.spacingXs,
  },
  heroRank: {
    ...textStyle("displayXl"),
    marginTop: spacing.spacingSm,
  },
  heroLevel: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  // XP
  xpRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  xpLevel: { ...textStyle("dataSm"), color: colors.textPrimary },
  xpValue: { ...textStyle("dataSm"), color: colors.textSecondary },
  track: {
    height: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  trackFill: { height: "100%", backgroundColor: colors.racingRed },
  xpToNext: { ...textStyle("caption"), color: colors.textSecondary },
  // Rank progress
  rankProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
  },
  rankProgressMiddle: { flex: 1, gap: spacing.spacingXs },
  rankProgressNote: { ...textStyle("caption"), color: colors.textSecondary },
  verticalDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    backgroundColor: colors.hairline,
  },
  rankNext: { alignItems: "center", gap: spacing.spacingXs / 2, width: 76 },
  rankNextName: {
    ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold }),
    color: colors.textPrimary,
    textAlign: "center",
  },
  rankNextLevel: { ...textStyle("caption"), color: colors.textSecondary },
  maxedText: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.racingRed,
  },
  // Section
  sectionTitle: { ...textStyle("displayMd"), color: colors.textPrimary },
  sectionSub: { ...textStyle("caption"), color: colors.textSecondary },
  // Rank row
  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    padding: spacing.spacingMd,
    marginBottom: spacing.spacingSm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  rankInfo: { flex: 1 },
  rankNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  rankName: {
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
  rankLevels: { ...textStyle("dataSm"), color: colors.textSecondary, marginTop: 2 },
  profileLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXs,
    paddingVertical: spacing.spacingMd,
  },
  profileLinkText: {
    ...textStyle("body", { fontFamily: fontFamily.bodyMedium }),
    color: colors.textSecondary,
  },
});
