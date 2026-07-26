/**
 * Driveverse Platinum — the cosmetics picker.
 *
 * One sheet, two sets: vehicle icons and profile frames. Reached from the
 * profile's Garage tab.
 *
 * OPEN TO EVERYONE, ON PURPOSE
 *   A Regular driver can open this and see all of it. The locked options are
 *   drawn at full fidelity with a lock mark rather than hidden, because a
 *   cosmetic nobody can see is a cosmetic nobody buys — and because hiding
 *   them would make the picker look empty rather than aspirational. Tapping a
 *   locked option raises the paywall on the Cosmetics row.
 *
 *   The default options stay available to everyone, and a driver whose
 *   subscription lapses keeps their selection highlighted here even while it
 *   renders as the default elsewhere — see `constants/platinumCosmetics.ts`.
 */

import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lock, X } from "lucide-react-native";
import { PlatinumBadge } from "@/components/platinum/PlatinumBadge";
import PremiumVehicleIcon from "@/components/platinum/PremiumVehicleIcon";
import ProfileFrame from "@/components/platinum/ProfileFrame";
import { platinum } from "@/constants/platinum";
import {
  PROFILE_FRAMES,
  VEHICLE_ICONS,
  type ProfileFrameId,
  type VehicleIconId,
} from "@/constants/platinumCosmetics";
import {
  alpha,
  borderWidth,
  colors,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { useCosmetics } from "@/hooks/useCosmeticsStore";

const ICON_MD = spacing.spacingLg;
const ICON_STROKE = 1.75;

/** Swatch geometry. Large enough that four frames are distinguishable. */
const SWATCH = 56;

export interface CosmeticsPickerProps {
  visible: boolean;
  onClose: () => void;
}

export default function CosmeticsPicker({ visible, onClose }: CosmeticsPickerProps) {
  const insets = useSafeAreaInsets();
  const {
    isPlatinum,
    selectedVehicleIcon,
    selectedProfileFrame,
    selectVehicleIcon,
    selectProfileFrame,
  } = useCosmetics();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <PlatinumBadge size={spacing.spacingXl} />
            <Text style={styles.title}>ICONS & FRAMES</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={spacing.spacingSm}
          >
            <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {!isPlatinum && (
            <Text style={styles.intro}>
              The standard set is yours. The rest unlock with Platinum.
            </Text>
          )}

          {/* ═══ VEHICLE ICONS ═══ */}
          <Text style={styles.overline}>VEHICLE ICON</Text>
          <View style={styles.grid}>
            {VEHICLE_ICONS.map((option) => {
              const locked = option.platinum && !isPlatinum;
              const active = option.id === selectedVehicleIcon;
              return (
                <Swatch
                  key={option.id}
                  label={option.label}
                  note={option.note}
                  locked={locked}
                  active={active}
                  onPress={() => selectVehicleIcon(option.id as VehicleIconId)}
                >
                  <PremiumVehicleIcon
                    icon={option.id}
                    // Draw the real artwork even when locked — the point of
                    // the picker is to show what Platinum actually looks like.
                    isPlatinum
                    size={SWATCH * 0.6}
                    color={locked ? platinum.chromeDeep : active ? platinum.chrome : colors.textPrimary}
                    strokeWidth={1.75}
                  />
                </Swatch>
              );
            })}
          </View>

          {/* ═══ PROFILE FRAMES ═══ */}
          <Text style={styles.overline}>PROFILE FRAME</Text>
          <View style={styles.grid}>
            {PROFILE_FRAMES.map((option) => {
              const locked = option.platinum && !isPlatinum;
              const active = option.id === selectedProfileFrame;
              return (
                <Swatch
                  key={option.id}
                  label={option.label}
                  note={option.note}
                  locked={locked}
                  active={active}
                  onPress={() => selectProfileFrame(option.id as ProfileFrameId)}
                >
                  {option.id === "default" ? (
                    // "Standard" draws no frame at all, so the picker shows
                    // the plain avatar ring it stands for rather than a blank.
                    <View style={[styles.frameFill, styles.frameFillDefault]} />
                  ) : (
                    <ProfileFrame frame={option.id} isPlatinum size={SWATCH * 0.62}>
                      <View style={styles.frameFill} />
                    </ProfileFrame>
                  )}
                </Swatch>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Swatch
 * ------------------------------------------------------------------ */

function Swatch({
  label,
  note,
  locked,
  active,
  onPress,
  children,
}: {
  label: string;
  note: string;
  locked: boolean;
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active, disabled: false }}
      accessibilityLabel={
        locked ? `${label}. Platinum only. ${note}` : `${label}. ${note}`
      }
      onPress={onPress}
      style={({ pressed }) => [styles.swatchWrap, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.swatch,
          active && styles.swatchActive,
          locked && styles.swatchLocked,
        ]}
      >
        {children}
        {locked && (
          <View style={styles.lockMark}>
            <Lock size={spacing.spacingMd} color={platinum.chromeDim} strokeWidth={2} />
          </View>
        )}
      </View>
      <Text
        style={[styles.swatchLabel, active && styles.swatchLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "85%",
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingLg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.spacingLg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  intro: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    marginBottom: spacing.spacingLg,
  },
  overline: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginBottom: spacing.spacingMd,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingMd,
    marginBottom: spacing.spacingXl,
  },
  swatchWrap: {
    alignItems: "center",
    gap: spacing.spacingXs,
    width: SWATCH + spacing.spacingLg,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    backgroundColor: colors.voidBlack,
  },
  swatchActive: {
    borderColor: platinum.chrome,
    borderWidth: borderWidth.emphasis,
    backgroundColor: alpha(platinum.chrome, 0.08),
  },
  swatchLocked: {
    opacity: 0.55,
  },
  lockMark: {
    position: "absolute",
    right: spacing.spacingXs,
    bottom: spacing.spacingXs,
  },
  /** Stands in for an avatar so a frame has something to frame. */
  frameFill: {
    width: SWATCH * 0.62,
    height: SWATCH * 0.62,
    borderRadius: radius.circle,
    backgroundColor: colors.hairline,
  },
  frameFillDefault: {
    borderWidth: borderWidth.hairline,
    borderColor: colors.textSecondary,
  },
  swatchLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  swatchLabelActive: {
    color: platinum.chrome,
  },
});
