/**
 * Driveverse Platinum — the point-of-friction upgrade prompt.
 *
 * The visible half of every cap. A driver at 2/2 cars should be able to see
 * that BEFORE tapping "Add a car" and getting a modal, so this renders as an
 * inline notice on the screen that owns the capped thing: the garage, the
 * event composer, the convoy roster, the save-place sheet.
 *
 * Two states, one component:
 *   • under the cap — a quiet usage readout ("2 of 10 places saved"), so the
 *     limit is never a surprise.
 *   • at the cap    — the same readout plus the upgrade action.
 *
 * It renders nothing at all for Platinum drivers. An "unlimited" badge on
 * every capped surface would be twelve reminders that you paid, which is
 * noise rather than a benefit.
 *
 * Deliberately NOT a CutCorner card: these sit inside screens that are
 * already made of cut cards, and nesting the signature shape inside itself is
 * what turns it into wallpaper. Hairline rule, chrome accent, done.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { PlatinumBadge } from "@/components/platinum/PlatinumBadge";
import { platinum, type PlatinumBenefitId } from "@/constants/platinum";
import {
  alpha,
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { usePlatinum } from "@/hooks/usePlatinumStore";

export interface TierLimitNoticeProps {
  /** How many of the capped thing the driver has. */
  current: number;
  /** The cap. `null` means unlimited — the notice hides itself. */
  cap: number | null;
  /** Plural noun for the readout: "cars", "places", "routes". */
  noun: string;
  /** Which paywall row to pin when the driver taps through. */
  benefit: PlatinumBenefitId;
  /** Shown at the cap, in place of the generic line. One sentence. */
  atCapMessage?: string;
  /**
   * Renders the usage readout even when the driver is under the cap.
   * Default true. Pass false where the surface is already busy and only the
   * blocking case is worth the space.
   */
  showUsage?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TierLimitNotice({
  current,
  cap,
  noun,
  benefit,
  atCapMessage,
  showUsage = true,
  style,
}: TierLimitNoticeProps) {
  const { isPlatinum, openPaywall } = usePlatinum();

  // Platinum, or no cap on this surface: nothing to say.
  if (isPlatinum || cap === null) return null;

  const atCap = current >= cap;
  if (!atCap && !showUsage) return null;

  const usage = `${current} of ${cap} ${noun}`;

  if (!atCap) {
    return (
      <View style={[styles.usageRow, style]}>
        <Text style={styles.usageText}>{usage}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${usage}. Upgrade to Platinum for unlimited.`}
      onPress={() => openPaywall(benefit)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <PlatinumBadge size={spacing.spacingXl} />
      <View style={styles.body}>
        <Text style={styles.headline}>{usage}</Text>
        <Text style={styles.message}>
          {atCapMessage ?? `Go Platinum for unlimited ${noun}.`}
        </Text>
      </View>
      <ChevronRight
        size={spacing.spacingLg}
        color={platinum.chromeDim}
        strokeWidth={1.75}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * PlatinumLockedRow
 * ------------------------------------------------------------------ */

/**
 * For a feature that is Platinum-only rather than capped — the AI showcase
 * button, a cosmetics section, an early-access entry. Same chrome language as
 * the cap notice so "you need Platinum" always looks the same, whether the
 * reason is a number or an entitlement.
 */
export function PlatinumLockedRow({
  label,
  detail,
  benefit,
  style,
}: {
  label: string;
  detail?: string;
  benefit: PlatinumBenefitId;
  style?: StyleProp<ViewStyle>;
}) {
  const { openPaywall } = usePlatinum();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Platinum feature. Upgrade to unlock.`}
      onPress={() => openPaywall(benefit)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
    >
      <PlatinumBadge size={spacing.spacingXl} />
      <View style={styles.body}>
        <Text style={styles.headline}>{label}</Text>
        <Text style={styles.message}>{detail ?? "A Platinum feature."}</Text>
      </View>
      <View style={styles.unlockTag}>
        <Text style={styles.unlockText}>UNLOCK</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  usageRow: {
    paddingVertical: spacing.spacingSm,
  },
  usageText: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingMd,
    backgroundColor: alpha(platinum.chrome, 0.05),
    borderWidth: borderWidth.hairline,
    borderColor: platinum.chromeDeep,
    borderRadius: radius.sharp,
  },
  body: {
    flex: 1,
    gap: spacing.spacingXs / 2,
  },
  headline: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  message: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  unlockTag: {
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
    borderWidth: borderWidth.hairline,
    borderColor: platinum.chrome,
    borderRadius: radius.sharp,
  },
  unlockText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
    color: platinum.chrome,
  },
});

export default TierLimitNotice;
