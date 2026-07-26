import React, { useState, useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Globe, Lock, Users, Flag } from "lucide-react-native";
import { useParty } from "@/hooks/usePartyStore";
import { CutCornerButton } from "@/components/CutCorner";
import TierLimitNotice from "@/components/platinum/TierLimitNotice";
import { ICON_STROKE } from "@/components/TripCard";
import { borderWidth, colors, fontFamily, radius, spacing, textStyle } from "@/constants/theme";

interface CreateConvoyModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Capacity choices, filtered by the organiser's tier at render time.
 *
 * The old list offered up to "Unlimited", which is no longer true for anyone:
 * Regular convoys hold 2 and Platinum 8. Offering a number the store will
 * then clamp would be a menu that lies, so the options are derived from the
 * cap rather than fixed — and the ceiling itself is always the last option,
 * labelled "Max".
 */
function capacityOptions(cap: number | null): { label: string; value: number }[] {
  // `null` would mean a genuinely uncapped tier; kept so the function stays
  // correct if convoy capacity is ever lifted entirely.
  if (cap === null) {
    return [
      { label: "Unlimited", value: 0 },
      { label: "5", value: 5 },
      { label: "10", value: 10 },
      { label: "25", value: 25 },
    ];
  }
  const steps = [2, 4, 6, 8].filter((n) => n < cap);
  return [...steps.map((n) => ({ label: String(n), value: n })), { label: `${cap} · Max`, value: cap }];
}

export default function CreateConvoyModal({ visible, onClose, onCreated }: CreateConvoyModalProps) {
  const insets = useSafeAreaInsets();
  const { createParty, convoyMemberLimit } = useParty();
  const options = useMemo(
    () => capacityOptions(convoyMemberLimit),
    [convoyMemberLimit]
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "invite_only">("public");
  // Default to the organiser's ceiling rather than "unlimited", which no
  // tier offers any more.
  const [maxMembers, setMaxMembers] = useState(convoyMemberLimit ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && !submitting;

  const reset = useCallback(() => {
    setName("");
    setDescription("");
    setVisibility("public");
    setMaxMembers(convoyMemberLimit ?? 0);
    setError(null);
    setSubmitting(false);
  }, [convoyMemberLimit]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const ok = await createParty(name, { visibility, description, maxMembers });
    if (!ok) {
      setError("Couldn't create convoy. Please try again.");
      setSubmitting(false);
      return;
    }
    reset();
    onCreated();
  }, [canSubmit, createParty, name, visibility, description, maxMembers, reset, onCreated]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.sheetWrap}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Flag size={18} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                </View>
                <Text style={styles.headerTitle}>START A CONVOY</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={handleClose}>
                <X size={18} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Convoy name</Text>
              <TextInput
                style={styles.input}
                placeholder="Midnight Runners"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                maxLength={30}
              />

              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="What's this crew about?"
                placeholderTextColor={colors.textSecondary}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={200}
              />

              <Text style={styles.label}>Who can join</Text>
              <View style={styles.chipRow}>
                <Pressable
                  style={[styles.chip, visibility === "public" && styles.chipActive]}
                  onPress={() => setVisibility("public")}
                >
                  <Globe size={14} color={visibility === "public" ? colors.textPrimary : colors.textSecondary} strokeWidth={ICON_STROKE} />
                  <Text style={[styles.chipText, visibility === "public" && styles.chipTextActive]}>Anyone can join</Text>
                </Pressable>
                <Pressable
                  style={[styles.chip, visibility === "invite_only" && styles.chipActive]}
                  onPress={() => setVisibility("invite_only")}
                >
                  <Lock size={14} color={visibility === "invite_only" ? colors.textPrimary : colors.textSecondary} strokeWidth={ICON_STROKE} />
                  <Text style={[styles.chipText, visibility === "invite_only" && styles.chipTextActive]}>Invite only</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Max members</Text>
              <View style={styles.chipRow}>
                {options.map((o) => {
                  const active = maxMembers === o.value;
                  return (
                    <Pressable
                      key={o.label}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setMaxMembers(o.value)}
                    >
                      <Users size={13} color={active ? colors.textPrimary : colors.textSecondary} strokeWidth={ICON_STROKE} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Says the ceiling out loud, and offers the way past it, rather
                  than letting a Regular organiser find out when the third
                  driver can't get in. */}
              {convoyMemberLimit !== null && (
                <TierLimitNotice
                  current={convoyMemberLimit}
                  cap={convoyMemberLimit}
                  noun="drivers"
                  benefit="convoy"
                  atCapMessage={`Regular convoys hold ${convoyMemberLimit}. Go Platinum to roll 8 deep.`}
                  style={styles.limitNotice}
                />
              )}

              {error && <Text style={styles.errorText}>{error}</Text>}

              <CutCornerButton
                title="Create Convoy"
                corners="topRight"
                disabled={!canSubmit}
                icon={submitting ? undefined : <Flag size={18} color={colors.voidBlack} strokeWidth={ICON_STROKE} />}
                onPress={handleSubmit}
                style={styles.submitBtn}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.6)", justifyContent: "flex-end" },
  sheetWrap: { justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderLeftWidth: borderWidth.hairline,
    borderRightWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingXl,
    paddingTop: spacing.spacingLg,
    maxHeight: "88%",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.spacingMd },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sharp,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  headerTitle: { ...textStyle("displayMd"), color: colors.textPrimary },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
    marginTop: spacing.spacingLg,
    marginBottom: spacing.spacingSm,
  },
  input: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    color: colors.textPrimary,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
    ...textStyle("body"),
  },
  inputMultiline: { minHeight: 60, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.spacingSm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.voidBlack,
  },
  chipActive: { borderColor: colors.textPrimary, backgroundColor: colors.hairline },
  chipText: {
    ...textStyle("caption", { fontFamily: fontFamily.bodyMedium }),
    color: colors.textSecondary,
  },
  chipTextActive: { color: colors.textPrimary },
  limitNotice: { marginTop: spacing.spacingLg },
  errorText: { ...textStyle("caption"), color: colors.racingRed, marginTop: spacing.spacingMd },
  submitBtn: { marginTop: spacing.spacingXl, width: "100%" },
});
