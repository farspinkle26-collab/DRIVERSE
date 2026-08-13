/**
 * Driveverse — a single-field name prompt, in a bottom sheet.
 *
 * Shared by every "give this a name" moment: renaming a trip
 * (`app/trip/[id].tsx`), renaming a saved route (`app/route/[id].tsx`), and
 * naming a territory pin dropped on the map (`app/(tabs)/map.tsx`). One
 * component, so all three agree pixel-for-pixel and a fix here fixes all of
 * them at once.
 *
 * KEYBOARD — `behavior="height"` on Android, not `undefined`.
 *   A transparent RN `Modal` opens its own native window on Android, and
 *   that window does not inherit the Activity's `windowSoftInputMode`
 *   (`adjustResize`) the way an ordinary screen does — so a
 *   `KeyboardAvoidingView` with no `behavior` at all does nothing, and the
 *   sheet's own `justifyContent: "flex-end"` pins it exactly where the
 *   keyboard is about to cover it. `login.tsx`, `signup.tsx` and
 *   `customize-profile.tsx` already use `"height"` on Android outside a
 *   Modal; inside one it is not just consistent, it is required.
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { CutCornerButton } from "@/components/CutCorner";
import {
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

interface RenameModalProps {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
}

const ICON_STROKE = 1.75;

export default function RenameModal({
  visible,
  title,
  initialValue,
  placeholder = "Route name",
  saving = false,
  onCancel,
  onSave,
}: RenameModalProps) {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const canSave = !!value.trim() && !saving;
  const submit = () => canSave && onSave(value.trim());

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              hitSlop={spacing.spacingSm}
            >
              <X size={20} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textSecondary}
            maxLength={100}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          <CutCornerButton
            title={saving ? "Saving…" : "Save"}
            corners="topRight"
            disabled={!canSave}
            onPress={submit}
            icon={saving ? <ActivityIndicator size="small" color={colors.voidBlack} /> : undefined}
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
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { ...textStyle("displayMd"), color: colors.textPrimary },
  input: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    color: colors.textPrimary,
    paddingHorizontal: spacing.spacingMd,
    height: 48,
    ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }),
  },
});
