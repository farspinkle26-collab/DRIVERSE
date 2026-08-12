/**
 * Driveverse — the First Mile chain, rendered above the daily quests.
 *
 * A brand-new driver has no idea what a "daily quest" is worth, so the
 * guided chain sits first and the daily set below it; once the chain is
 * finished this component renders nothing at all and the Quests tab is back
 * to what it always was.
 *
 * SHAPE — a numbered list, not eight quest cards. `QuestCard` in
 * `app/(tabs)/drive.tsx` is built for one independent daily objective with
 * its own difficulty tier and progress ring. These are ordered steps in a
 * single chain, and eight of those cards would bury the three daily quests
 * they are meant to introduce. So: one framed surface, one row per step,
 * with the current step given the emphasis.
 *
 * The catalogue and the rules are `constants/mainQuests.ts` and
 * `lib/mainQuest.ts`; nothing here decides anything.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  Award,
  Check,
  Flame,
  Gauge,
  MapPin,
  Share2,
  Swords,
  Trophy,
  Users,
} from "lucide-react-native";
import { CutCornerSurface } from "@/components/CutCorner";
import { useMainQuest } from "@/hooks/useMainQuestStore";
import type { MainQuestStepState } from "@/lib/mainQuest";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const ICON_STROKE = 1.75;

/**
 * Name → component for the catalogue's `icon` field. Same split as
 * `SYMBOL_COMPONENTS` in the Quests tab: the catalogue stays free of React
 * so it can be unit-tested, and the binding lives at the render site.
 */
const STEP_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = {
  Flame,
  Gauge,
  MapPin,
  Trophy,
  Share2,
  Users,
  Swords,
  Award,
};

function StepRow({ state, isLast }: { state: MainQuestStepState; isLast: boolean }) {
  const { step, done, current } = state;
  const Icon = STEP_ICONS[step.icon] ?? Flame;

  // Three states, three treatments. `done` and `current` are self-evident;
  // everything else is dimmed rather than hidden — a driver should be able
  // to read the whole chain up front and know what they are in for.
  const tint = done
    ? colors.racingRed
    : current
      ? colors.textPrimary
      : colors.textSecondary;

  return (
    <View style={styles.row}>
      {/* Rail: the marker plus the line joining it to the next step. */}
      <View style={styles.rail}>
        <View
          style={[
            styles.marker,
            done && styles.markerDone,
            current && styles.markerCurrent,
          ]}
        >
          {done ? (
            <Check size={14} color={colors.voidBlack} strokeWidth={2.5} />
          ) : (
            <Icon size={14} color={tint} strokeWidth={ICON_STROKE} />
          )}
        </View>
        {!isLast ? (
          <View style={[styles.railLine, done && styles.railLineDone]} />
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text
            style={[
              styles.stepTitle,
              done && styles.stepTitleDone,
              !done && !current && styles.stepTitleIdle,
            ]}
            numberOfLines={1}
          >
            {step.order}. {step.title}
          </Text>
          <Text style={[styles.xp, done && styles.xpDone]}>+{step.xp}</Text>
        </View>

        <Text style={styles.stepDesc} numberOfLines={2}>
          {step.description}
        </Text>

        {/* The "why" line only where it earns its space: the step being
            worked on, and the optional one, whose whole point is that it
            may not be doable yet. */}
        {(current || step.optional) && !done ? (
          <Text style={styles.stepTeaches} numberOfLines={2}>
            {step.teaches}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function MainQuestChain() {
  const { steps, completed, total, ratio, allComplete, loaded, capstoneUnlocked } =
    useMainQuest();

  // Nothing to show before the first read resolves (an empty ledger and an
  // unread one look identical), and nothing to show once it is finished —
  // the chain is a tutorial, not a permanent fixture.
  if (!loaded || allComplete) return null;

  return (
    <CutCornerSurface
      fill={colors.carbonSurface}
      borderColor={colors.hairline}
      borderWidth={borderWidth.hairline}
      cutSize={cut.md}
      corners="topRight"
      contentStyle={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.heading}>THE FIRST MILE</Text>
          <Text style={styles.subheading}>
            {capstoneUnlocked
              ? "One step left — reach Level 2 to claim the badge."
              : "Eight steps to learn the app. Rewards are real XP."}
          </Text>
        </View>
        <Text style={styles.count}>
          {completed} / {total}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>

      <View style={styles.steps}>
        {steps.map((s, i) => (
          <StepRow key={s.step.id} state={s} isLast={i === steps.length - 1} />
        ))}
      </View>
    </CutCornerSurface>
  );
}

const MARKER = 26;

const styles = StyleSheet.create({
  card: {
    padding: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.spacingMd,
  },
  headerText: { flex: 1, gap: spacing.spacingXs },
  heading: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  subheading: { ...textStyle("caption"), color: colors.textSecondary },
  count: { ...textStyle("dataSm"), color: colors.racingRed },

  progressTrack: {
    height: spacing.spacingXs,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.racingRed },

  steps: { marginTop: spacing.spacingXs },

  row: { flexDirection: "row", gap: spacing.spacingMd },
  // The rail draws its own connector, so rows sit flush and the line is
  // continuous rather than broken by row padding.
  rail: { width: MARKER, alignItems: "center" },
  marker: {
    width: MARKER,
    height: MARKER,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.voidBlack,
    alignItems: "center",
    justifyContent: "center",
  },
  markerDone: {
    backgroundColor: colors.racingRed,
    borderColor: colors.racingRed,
  },
  markerCurrent: {
    borderColor: colors.racingRed,
    borderWidth: borderWidth.emphasis,
    backgroundColor: alpha(colors.racingRed, 0.12),
  },
  railLine: {
    flex: 1,
    width: borderWidth.hairline,
    backgroundColor: colors.hairline,
    marginVertical: spacing.spacingXs,
  },
  railLineDone: { backgroundColor: colors.racingRed },

  body: { flex: 1, gap: spacing.spacingXs, paddingBottom: spacing.spacingLg },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  stepTitle: {
    flex: 1,
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
    color: colors.textPrimary,
  },
  stepTitleDone: {
    color: colors.textSecondary,
    textDecorationLine: "line-through",
  },
  stepTitleIdle: { color: colors.textSecondary },
  xp: { ...textStyle("dataSm"), color: colors.racingRed },
  xpDone: { color: colors.textSecondary },
  stepDesc: { ...textStyle("caption"), color: colors.textSecondary },
  stepTeaches: { ...textStyle("caption"), color: colors.racingRed },
});
