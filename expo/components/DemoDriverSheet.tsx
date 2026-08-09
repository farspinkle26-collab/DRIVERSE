/**
 * Driveverse — "profile" for a demo driver. TEMPORARY, part of the promo
 * capture scaffolding in `lib/demoDrivers.ts` — delete together.
 *
 * WHY THIS EXISTS INSTEAD OF REUSING `ProfileScreen`
 *
 * A real driver's marker opens `/user/[id]`, which is `ProfileScreen` reading
 * `profiles` and `car_collections` from Supabase by id. A `demo-driver-N` id
 * has no row in either table — routing one through that screen would show an
 * empty or broken profile, the opposite of what a promo capture needs. This
 * is a small local sheet fed entirely from `lib/demoDrivers.ts`'s synthetic
 * data instead: no navigation, no query, nothing that can 404.
 *
 * It deliberately has no edit affordance of any kind — no photo upload, no
 * name change, nothing `isSelf` would unlock on a real profile. There is
 * nothing here to edit: the account does not exist.
 */

import React from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { CutCornerBadge, CutCornerSurface } from "@/components/CutCorner";
import { demoAvatarSource, demoCarFor } from "@/lib/demoDrivers";
import type { OnlineUser } from "@/hooks/onlineUsersMerge";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const CHROME_ICON_STROKE = 1.5;

export default function DemoDriverSheet({
  driver,
  onClose,
}: {
  driver: OnlineUser | null;
  onClose: () => void;
}) {
  if (!driver) return null;
  const car = demoCarFor(driver.user_id);
  const avatar = demoAvatarSource(driver.avatar);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SheetContent driver={driver} car={car} avatar={avatar} onClose={onClose} />
    </Modal>
  );
}

function SheetContent({
  driver,
  car,
  avatar,
  onClose,
}: {
  driver: OnlineUser;
  car: ReturnType<typeof demoCarFor>;
  avatar: ReturnType<typeof demoAvatarSource>;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sheetWrap, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.sheetContent}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          hitSlop={spacing.spacingSm}
          style={styles.closeBtn}
        >
          <X size={spacing.spacingLg} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
        </Pressable>

        <View style={styles.header}>
          <View style={styles.avatar}>
            {avatar ? (
              <Image source={avatar} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>{(driver.name?.[0] ?? "D").toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>{driver.name}</Text>
            <CutCornerBadge label={`LV. ${driver.level}`} numeric corners="topRight" />
          </View>
        </View>

        {car ? (
          <View style={styles.carCard}>
            <View style={[styles.carSwatch, { backgroundColor: car.color }]} />
            <View style={styles.carText}>
              <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
              <Text style={styles.carSpec} numberOfLines={1}>
                {car.make} {car.model} · {car.year} · {car.hp} HP
              </Text>
            </View>
          </View>
        ) : null}
      </CutCornerSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.spacingLg,
  },
  sheetContent: {
    padding: spacing.spacingLg,
    gap: spacing.spacingLg,
  },
  closeBtn: {
    position: "absolute",
    top: spacing.spacingMd,
    right: spacing.spacingMd,
    zIndex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.circle,
    borderWidth: borderWidth.emphasis,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.voidBlack,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  headerText: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  name: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  carCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingLg,
  },
  carSwatch: {
    width: 56,
    height: 40,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  carText: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  carName: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  carSpec: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
});
