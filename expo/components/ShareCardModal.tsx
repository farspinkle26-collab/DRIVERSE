/**
 * Driveverse — ShareCardModal.
 *
 * The preview-before-you-post step. A bad first impression here (ugly card,
 * wrong data) undermines the whole growth loop, so the user always sees the
 * exact 1080×1920 image they're about to share, not a fire-and-forget hand-off.
 *
 * FLOW
 *   1. Renders `<ShareableCard>` at native design size (off to the side, ref'd
 *      for capture) and a scaled-down copy the user actually looks at.
 *   2. Primary CTA "Add to Instagram Story" — the DIRECT integration — is the
 *      loudest action when Instagram is installed. It captures the card to a
 *      PNG and drops it straight into IG's Story composer.
 *   3. "More options" opens the generic OS share sheet (TikTok, WhatsApp,
 *      Messages, save to camera roll…). This is also the graceful fallback
 *      when Instagram isn't installed or the direct path is unavailable.
 *   4. Capture/share shows a per-button loading state (view-shot can take a
 *      beat on slow devices) rather than freezing the UI, and a cancelled
 *      share just closes the modal — never an error.
 *
 * The same modal serves all three card types; callers pass `type` + `payload`
 * exactly as `<ShareableCard>` takes them.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Instagram, Share2, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  CutCornerButton,
} from "@/components/CutCorner";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  ShareableCard,
  type ShareableCardProps,
} from "@/components/ShareableCard";
import {
  captureCard,
  isInstagramInstalled,
  shareToInstagramStory,
  shareViaSheet,
  type ShareOutcome,
} from "@/lib/shareCard";
import {
  borderWidth,
  colors,
  onRacingRed,
  spacing,
  textStyle,
} from "@/constants/theme";

type ShareCardModalProps = ShareableCardProps & {
  visible: boolean;
  onClose: () => void;
  /**
   * Optional caption tagged onto the generic-sheet share (WhatsApp/Messages
   * pick it up; Instagram Stories ignores text). Defaults per card type.
   */
  caption?: string;
};

/** What a pressed button is currently doing, for the loading state. */
type Busy = "instagram" | "sheet" | null;

export default function ShareCardModal(props: ShareCardModalProps) {
  const { visible, onClose, caption, ...cardProps } = props;
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);

  const [igInstalled, setIgInstalled] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // Fit the natural-size card into the space above the action bar.
  const { width: screenW, height: screenH } = Dimensions.get("window");

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(null);
    let active = true;
    isInstagramInstalled().then((v) => {
      if (active) setIgInstalled(v);
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const finish = useCallback(
    (outcome: ShareOutcome) => {
      if (outcome.status === "shared") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => {}
        );
        onClose();
        return;
      }
      if (outcome.status === "error") {
        setError(outcome.message || "Couldn't share that. Try again.");
      }
      // "cancelled" / "unavailable" that reached here: no error, stay open so
      // the user can pick another destination.
      setBusy(null);
    },
    [onClose]
  );

  const handleInstagram = useCallback(async () => {
    setError(null);
    setBusy("instagram");
    try {
      const uri = await captureCard(cardRef);
      const outcome = await shareToInstagramStory(uri);
      // If the direct path can't run (no backend / IG vanished), fall back to
      // the generic sheet transparently rather than dead-ending the user.
      if (outcome.status === "unavailable") {
        finish(await shareViaSheet(uri, caption));
        return;
      }
      finish(outcome);
    } catch (e) {
      finish({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [caption, finish]);

  const handleMore = useCallback(async () => {
    setError(null);
    setBusy("sheet");
    try {
      const uri = await captureCard(cardRef);
      finish(await shareViaSheet(uri, caption));
    } catch (e) {
      finish({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [caption, finish]);

  // Scale the card down to fit the preview area (leave room for header +
  // action bar). Never scale UP past 1× — the card is the source of truth.
  const previewMaxW = screenW - spacing.spacingXl * 2;
  const previewMaxH = screenH - insets.top - insets.bottom - 260;
  const scale = Math.min(previewMaxW / CARD_WIDTH, previewMaxH / CARD_HEIGHT, 1);
  const boxW = CARD_WIDTH * scale;
  const boxH = CARD_HEIGHT * scale;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SHARE</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close share preview"
            hitSlop={spacing.spacingSm}
            onPress={onClose}
            style={styles.closeBtn}
          >
            <X size={spacing.spacingXl} color={colors.textPrimary} strokeWidth={1.5} />
          </Pressable>
        </View>

        {/* Preview */}
        <View style={styles.previewArea}>
          <View style={[styles.previewBox, { width: boxW, height: boxH }]}>
            {/* Natural-size card, centre-scaled to land at the box's top-left.
                The ref points here so view-shot captures full resolution
                regardless of the on-screen scale. */}
            <View
              style={[
                styles.previewCard,
                {
                  transform: [{ scale }],
                  top: (boxH - CARD_HEIGHT) / 2,
                  left: (boxW - CARD_WIDTH) / 2,
                },
              ]}
            >
              <ShareableCard ref={cardRef} {...(cardProps as ShareableCardProps)} />
            </View>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Actions */}
        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
          {igInstalled ? (
            <CutCornerButton
              title={busy === "instagram" ? "Opening…" : "Add to Instagram Story"}
              corners="topRight"
              disabled={busy != null}
              onPress={handleInstagram}
              icon={
                busy === "instagram" ? (
                  <ActivityIndicator size="small" color={onRacingRed} />
                ) : (
                  <Instagram size={spacing.spacingLg} color={onRacingRed} strokeWidth={1.5} />
                )
              }
            />
          ) : null}

          <CutCornerButton
            title={busy === "sheet" ? "Preparing…" : "More options"}
            variant={igInstalled ? "ghost" : "primary"}
            corners="topRight"
            disabled={busy != null}
            onPress={handleMore}
            icon={
              busy === "sheet" ? (
                <ActivityIndicator
                  size="small"
                  color={igInstalled ? colors.textPrimary : onRacingRed}
                />
              ) : (
                <Share2
                  size={spacing.spacingLg}
                  color={igInstalled ? colors.textPrimary : onRacingRed}
                  strokeWidth={1.5}
                />
              )
            }
          />

          <Text style={styles.hint}>
            {igInstalled
              ? "Posts a 1080×1920 story image. More options covers TikTok, WhatsApp, Messages and saving to your camera roll."
              : "Opens the share sheet — TikTok, WhatsApp, Messages, or save to your camera roll."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.spacingLg,
    paddingVertical: spacing.spacingMd,
  },
  headerTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  closeBtn: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    alignItems: "center",
    justifyContent: "center",
  },
  previewArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.spacingXl,
  },
  previewBox: {
    // A hairline frame around the exact export, so the preview reads as "this
    // is the image", not a loose composition.
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
    ...Platform.select({
      // A faint lift so the black card separates from the black backdrop.
      ios: { shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 12 },
      default: {},
    }),
  },
  previewCard: {
    position: "absolute",
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  error: {
    ...textStyle("caption"),
    color: colors.racingRed,
    textAlign: "center",
    paddingHorizontal: spacing.spacingXl,
    marginBottom: spacing.spacingSm,
  },
  actions: {
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingLg,
    gap: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  hint: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
  },
});
