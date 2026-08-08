/**
 * Driveverse — renders every `appAlert()` call as a Driveverse-styled dialog
 * instead of the OS `Alert.alert` chrome. See `lib/appAlert.ts` for why this
 * exists and why it is a bound function rather than a hook.
 *
 * Mounted once, in `app/_layout.tsx`, inside `AppErrorBoundary` alongside the
 * rest of the tree. It is pure React state — a `Modal`, some `View`s, no
 * native call anywhere in it — so it carries none of
 * LAUNCH_SAFETY_REFERENCE.md's module-scope hazards; it is exactly the kind
 * of component that file's rules are fine with living at the root.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CutCornerButton, CutCornerCard } from "@/components/CutCorner";
import {
  bindAppAlertHost,
  type AppAlertButton,
  type AppAlertRequest,
} from "@/lib/appAlert";
import { alpha, colors, cut, spacing, textStyle } from "@/constants/theme";

/**
 * `cancel` → the neutral secondary (hairline border, primary-text label).
 * `destructive` → a red *outline*, never solid — the same choice
 * `app/convoy.tsx`'s own "Disband Convoy" button already makes, so a
 * destructive action reads the same way whether it is a dialog button or a
 * row on the screen behind it.
 * `default` → solid racingRed, the one primary action a dialog is allowed.
 */
function variantFor(style: AppAlertButton["style"]): "primary" | "outline" | "ghost" {
  if (style === "cancel") return "ghost";
  if (style === "destructive") return "outline";
  return "primary";
}

export default function AppAlertHost() {
  const [queue, setQueue] = useState<AppAlertRequest[]>([]);

  useEffect(() => {
    bindAppAlertHost((request) => setQueue((q) => [...q, request]));
    return () => bindAppAlertHost(null);
  }, []);

  // Tapping the scrim dismisses without firing any button — the same as
  // tapping outside a native Android alert, and safe here because a
  // `cancel`-style button in this codebase never carries a meaningful
  // `onPress` (see `lib/appAlert.ts` — there is no `cancelable` option to
  // honour because nothing sets one).
  const dismiss = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const press = useCallback(
    (button: AppAlertButton) => {
      dismiss();
      button.onPress?.();
    },
    [dismiss]
  );

  const current = queue[0] ?? null;
  if (!current) return null;

  const stacked = current.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <CutCornerCard
          corners="topRight"
          cutSize={cut.md}
          // A dialog sits above a dimmed screen — the top of the elevation
          // scale, not the standard card step.
          elevation="floating"
          style={styles.card}
          contentStyle={styles.cardContent}
        >
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.message}>{current.message}</Text> : null}
          <View style={stacked ? styles.buttonsColumn : styles.buttonsRow}>
            {current.buttons.map((button, i) => (
              <CutCornerButton
                key={`${button.text ?? "OK"}-${i}`}
                title={button.text ?? "OK"}
                variant={variantFor(button.style)}
                size="sm"
                corners="topRight"
                onPress={() => press(button)}
                style={stacked ? undefined : styles.buttonFlex}
              />
            ))}
          </View>
        </CutCornerCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: alpha(colors.voidBlack, 0.75),
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.spacingXl,
  },
  card: {
    width: "100%",
    maxWidth: 400,
  },
  cardContent: {
    padding: spacing.spacingXl,
    gap: spacing.spacingMd,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  message: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: spacing.spacingSm,
    marginTop: spacing.spacingSm,
  },
  buttonsColumn: {
    gap: spacing.spacingSm,
    marginTop: spacing.spacingSm,
  },
  buttonFlex: {
    flex: 1,
  },
});
