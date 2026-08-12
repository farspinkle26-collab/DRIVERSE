/**
 * Driveverse — the First Mile's homepage notification.
 *
 * The map is the app's home screen, and a new driver has no reason to open
 * the Drive Hub unprompted — so the chain needs a way to say "there is
 * something here for you" from where they already are. This is that: the
 * step they are on, how far through they are, and a tap straight to the
 * Quests tab.
 *
 * IT DISAPPEARS ON ITS OWN. `showNudge` is false once the chain is
 * finished, while progress is still loading, and when signed out — see
 * `shouldNudge` in `lib/mainQuest.ts` for why "still loading" needs to be
 * its own condition rather than inferred from an empty list (it would
 * otherwise flash on every cold start for drivers who finished months ago).
 * There is deliberately no dismiss control: the thing it points at is
 * finishable in a few minutes and then it is gone for good, so a dismiss
 * would only create a way to lose the tutorial permanently by mistake.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { CutCornerSurface } from "@/components/CutCorner";
import { useMainQuest } from "@/hooks/useMainQuestStore";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  spacing,
  textStyle,
} from "@/constants/theme";

export default function MainQuestNudge() {
  const router = useRouter();
  const { showNudge, next, completed, total, ratio, capstoneUnlocked } =
    useMainQuest();

  if (!showNudge) return null;

  // `next` is null when every required step is done and only the capstone
  // remains — the chain is not finished, but there is nothing left to *do*
  // except reach Level 2, so the card says that instead of pointing at a
  // step that does not exist.
  const title = next ? next.title : "Reach Level 2";
  const detail = next
    ? next.description
    : "Keep driving — the First Mile badge is waiting.";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`First Mile, step ${completed + 1} of ${total}: ${title}. Open your quests.`}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/drive",
          // `at` is a nonce so a second tap re-applies the tab: the Drive
          // Hub stays mounted, so an unchanged `view` param is a no-op.
          params: { view: "quests", at: String(Date.now()) },
        } as any)
      }
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.racingRed}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.content}
      >
        <View style={styles.headerLine}>
          <Text style={styles.kicker}>FIRST MILE</Text>
          <Text style={styles.count}>
            {completed}/{total}
          </Text>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
        </View>

        <View style={styles.body}>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {capstoneUnlocked && !next ? title : `Next: ${title}`}
            </Text>
            <Text style={styles.detail} numberOfLines={2}>
              {detail}
            </Text>
          </View>
          <ChevronRight
            size={spacing.spacingLg}
            color={colors.textSecondary}
            strokeWidth={1.75}
          />
        </View>
      </CutCornerSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  content: {
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    gap: spacing.spacingSm,
  },
  headerLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kicker: {
    ...textStyle("caption"),
    fontFamily: fontFamily.displaySemiBold,
    letterSpacing: 1.5,
    color: colors.racingRed,
  },
  count: { ...textStyle("dataSm"), color: colors.textSecondary },
  track: {
    height: 3,
    backgroundColor: alpha(colors.racingRed, 0.2),
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.racingRed },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  text: { flex: 1, gap: spacing.spacingXs / 2 },
  title: {
    ...textStyle("caption"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  detail: { ...textStyle("caption"), color: colors.textSecondary },
});
