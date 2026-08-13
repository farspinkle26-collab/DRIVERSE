/**
 * Driveverse — the account-deletion confirmation.
 *
 * App Store Guideline 5.1.1(v) requires self-service account deletion, and
 * explicitly permits a confirmation step to prevent an accidental tap — this
 * is that step. Type-to-confirm rather than a single "are you sure" alert:
 * deleting a car (`components/ProfileScreen.tsx`'s `handleDeleteCar`) is a
 * two-button `appAlert`, and this is a different order of irreversible —
 * every trip, every car, every friend, every message — so it earns a
 * heavier gesture than the one that already exists for a lighter delete.
 *
 * What actually happens on confirm is `lib/deleteAccount.ts`, which calls
 * the `delete-account` edge function — see that function's header for what
 * is and isn't covered and why.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, X } from "lucide-react-native";
import { CutCornerButton } from "@/components/CutCorner";
import { deleteAccount } from "@/lib/deleteAccount";
import {
  alpha,
  borderWidth,
  colors,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called once the account is actually gone — sign out and leave the screen. */
  onDeleted: () => void;
}

const CONFIRM_WORD = "DELETE";
const ICON_STROKE = 1.75;

export default function DeleteAccountModal({
  visible,
  onClose,
  onDeleted,
}: DeleteAccountModalProps) {
  const insets = useSafeAreaInsets();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_WORD && !deleting;

  const reset = useCallback(() => {
    setConfirmText("");
    setDeleting(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (deleting) return; // a delete in flight is not cancellable mid-request
    reset();
    onClose();
  }, [deleting, reset, onClose]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      onDeleted();
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Couldn't delete your account. Try again.");
    }
  }, [canConfirm, onDeleted]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.spacingXl }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.warnIcon}>
                <AlertTriangle size={18} color={colors.racingRed} strokeWidth={ICON_STROKE} />
              </View>
              <Text style={styles.title}>DELETE ACCOUNT</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={handleClose}
              hitSlop={spacing.spacingSm}
              disabled={deleting}
            >
              <X size={20} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>

          <Text style={styles.body}>
            This permanently deletes your account and everything tied to
            it — every trip, car, saved place, message, friend and convoy.
            There is no undo, and no way to get it back afterward.
          </Text>

          <Text style={styles.label}>
            Type {CONFIRM_WORD} to confirm
          </Text>
          <TextInput
            style={styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_WORD}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <CutCornerButton
            title={deleting ? "Deleting…" : "Permanently Delete Account"}
            corners="topRight"
            disabled={!canConfirm}
            onPress={handleConfirm}
            icon={deleting ? <ActivityIndicator size="small" color={colors.voidBlack} /> : undefined}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderLeftWidth: borderWidth.hairline,
    borderRightWidth: borderWidth.hairline,
    borderColor: colors.racingRed,
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  warnIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.circle,
    backgroundColor: alpha(colors.racingRed, 0.12),
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...textStyle("displayMd"), color: colors.textPrimary, letterSpacing: 1 },
  body: { ...textStyle("body"), color: colors.textSecondary },
  label: { ...textStyle("caption"), color: colors.textSecondary },
  input: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    color: colors.textPrimary,
    paddingHorizontal: spacing.spacingMd,
    height: 48,
    ...textStyle("body"),
  },
  error: { ...textStyle("caption"), color: colors.racingRed },
});
