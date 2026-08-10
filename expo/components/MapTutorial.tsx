/**
 * Driveverse — the first-launch map tutorial.
 *
 * Plays exactly once, right after a new driver's very first arrival at the
 * live map (`app/(tabs)/map.tsx` mounts this whenever
 * `user.tutorialCompletedAt` is unset). A spotlight walkthrough of the map's
 * floating controls — Drive, the chrome cluster, Convoy/Chat, and the tab
 * bar — which now carry no visible caption at all
 * (`app/(tabs)/map.tsx`'s `MapChromeButton`). Without this, a brand-new
 * driver has no way to learn what any of those icons do.
 *
 * WHY THIS IS NOT SVG MASKING
 *   A single `Svg` + `Mask` cutout would be the more "correct" way to draw a
 *   spotlight, but this app's own history with `react-native-svg` on Android
 *   is a recurring source of exactly this class of bug (`MapPolyline.tsx`'s
 *   `#RRGGBBAA` alpha-channel trap is the canonical example — see its
 *   header). Four opaque `View`s framing the hole is a cruder technique but
 *   composites the same everywhere `View` itself does, which is worth more
 *   here than a rounded corner on the cutout.
 *
 * WHY A REGISTRY AND NOT REFS
 *   See `hooks/useTutorialTargets.ts` — the tab bar and the map's own
 *   buttons live in different files with no ref path between them.
 *
 * WHY THE FALLBACK IS "CENTRE THE CARD", NOT "WAIT"
 *   A target's rect can be one frame behind `onLayout` (see the registry's
 *   retry). Rather than block the tutorial on a measurement, a step with no
 *   rect yet renders exactly like `welcome`/`done` — a full dim, a centred
 *   card — and reflows to the real spotlight the instant the rect arrives.
 *   The worst case is one extra frame that reads as "the intro card," never
 *   a flash at (0,0).
 */

import React, { useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CutCornerButton, CutCornerCard } from "@/components/CutCorner";
import { useTutorialTargets } from "@/hooks/useTutorialTargets";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { TUTORIAL_STEPS, paddedRect, tooltipTop } from "@/lib/tutorialSteps";
import {
  borderWidth,
  colors,
  cut,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const SPOTLIGHT_PADDING = 8;
const SCRIM_OPACITY = 0.82;
/** Fixed rather than measured — the card's own layout hasn't happened yet
 *  when `tooltipTop` needs a height to reason about, and every card in this
 *  tour is short enough (one heading line, one body line) to hold to this. */
const TOOLTIP_HEIGHT_ESTIMATE = 168;

export interface MapTutorialProps {
  visible: boolean;
  onDone: (outcome: "completed" | "skipped") => void;
}

export default function MapTutorial({ visible, onDone }: MapTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const { rects } = useTutorialTargets();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const step = TUTORIAL_STEPS[stepIndex];
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;
  const rect = step.target ? rects[step.target] ?? null : null;

  const { width: screenW, height: screenH } = useMemo(
    () => Dimensions.get("window"),
    []
  );

  if (!visible) return null;

  const handleNext = () => {
    if (isLast) {
      onDone("completed");
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const handleSkip = () => onDone("skipped");

  const hole = rect ? paddedRect(rect, SPOTLIGHT_PADDING) : null;
  const top = tooltipTop(
    hole,
    screenH,
    TOOLTIP_HEIGHT_ESTIMATE,
    insets.top + spacing.spacingLg,
    insets.bottom + spacing.spacingLg
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {hole ? (
          <SpotlightScrim hole={hole} screenW={screenW} screenH={screenH} />
        ) : (
          <View style={styles.fullScrim} />
        )}

        <View style={[styles.cardWrap, { top }]}>
          <CutCornerCard
            fill={colors.carbonSurface}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            contentStyle={styles.card}
          >
            <View style={styles.dots}>
              {TUTORIAL_STEPS.map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.dot, i === stepIndex && styles.dotActive]}
                />
              ))}
            </View>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.body}>{step.body}</Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Skip tutorial"
                onPress={handleSkip}
                hitSlop={spacing.spacingSm}
              >
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
              <CutCornerButton
                title={isLast ? "Let's go" : "Next"}
                size="sm"
                corners="topRight"
                onPress={handleNext}
              />
            </View>
          </CutCornerCard>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Four opaque bars framing a hole. Order: top, bottom, left, right — the
 * left/right bars only span the hole's own row, so top/bottom stay full-width
 * and nothing has to reason about a stacking order more complex than "draw
 * these four rectangles."
 */
function SpotlightScrim({
  hole,
  screenW,
  screenH,
}: {
  hole: { x: number; y: number; width: number; height: number };
  screenW: number;
  screenH: number;
}) {
  const top = Math.max(0, hole.y);
  const bottom = Math.max(0, hole.y + hole.height);
  const left = Math.max(0, hole.x);
  const right = Math.max(0, hole.x + hole.width);

  return (
    <>
      <View style={[styles.scrimBar, { top: 0, left: 0, right: 0, height: top }]} />
      <View
        style={[
          styles.scrimBar,
          { top: bottom, left: 0, right: 0, height: Math.max(0, screenH - bottom) },
        ]}
      />
      <View
        style={[
          styles.scrimBar,
          { top, left: 0, width: left, height: Math.max(0, bottom - top) },
        ]}
      />
      <View
        style={[
          styles.scrimBar,
          {
            top,
            left: right,
            width: Math.max(0, screenW - right),
            height: Math.max(0, bottom - top),
          },
        ]}
      />
      {/* A hairline ring around the hole — without it the cutout reads as a
          rendering gap rather than a deliberate spotlight. */}
      <View
        pointerEvents="none"
        style={[
          styles.spotlightRing,
          { top, left, width: hole.width, height: hole.height },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fullScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.voidBlack,
    opacity: SCRIM_OPACITY,
  },
  scrimBar: {
    position: "absolute",
    backgroundColor: colors.voidBlack,
    opacity: SCRIM_OPACITY,
  },
  spotlightRing: {
    position: "absolute",
    borderRadius: radius.circle,
    borderWidth: borderWidth.emphasis,
    borderColor: colors.racingRed,
  },
  cardWrap: {
    position: "absolute",
    left: spacing.spacingLg,
    right: spacing.spacingLg,
  },
  card: {
    gap: spacing.spacingMd,
  },
  dots: {
    flexDirection: "row",
    gap: spacing.spacingXs,
  },
  dot: {
    width: spacing.spacingSm,
    height: spacing.spacingXs,
    borderRadius: radius.sharp,
    backgroundColor: colors.hairline,
  },
  dotActive: {
    backgroundColor: colors.racingRed,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  body: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.spacingXs,
  },
  skip: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
});
