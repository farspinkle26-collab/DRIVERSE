/**
 * Driveverse — the floating tab bar.
 *
 * Rendered as the navigator's custom `tabBar` so taps go through React
 * Navigation and reliably switch screens. Rebuilt on the Phase 1 tokens:
 * it was the last surface in the app carrying `expo-blur`, an orange glow
 * `shadowColor`, an `elevation` stack and three gradient icon fills, and it
 * draws over the map, the Drive Hub and the profile alike — which is why
 * both DRIVE_HUB_REFERENCE §5 and MAP_SCREEN_REFERENCE §7 flagged it.
 *
 * Shape: the bar is a brand surface, so it takes the cut rather than a
 * fully-rounded pill (`theme.ts` — "there is no pill token on purpose").
 * The active indicator keeps `radius.circle`: it is a disc behind a glyph,
 * one of the genuinely circular things the token file allows, and it is the
 * screen's only piece of chrome red.
 */

import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CutCornerSurface } from "@/components/CutCorner";
import TutorialTarget from "@/components/TutorialTarget";
import { DriveIcon, MapIcon, ProfileIcon } from "@/components/TabIcons";
import {
  borderWidth,
  colors,
  cut,
  onRacingRed,
  radius,
  spacing,
} from "@/constants/theme";

type TabKey = "map" | "drive" | "profile";

const TABS: { key: TabKey; label: string; Icon: typeof MapIcon }[] = [
  { key: "map", label: "Map", Icon: MapIcon },
  { key: "drive", label: "Drive", Icon: DriveIcon },
  { key: "profile", label: "Profile", Icon: ProfileIcon },
];

/** Glyph size and the disc that sits behind an active one. Multiples of 4. */
const TAB_ICON_SIZE = spacing.spacingXl; // 24
const TAB_SLOT = 44;

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRouteName = state.routes[state.index]?.name;

  return (
    <TutorialTarget
      id="tabs"
      style={[styles.bar, { paddingBottom: insets.bottom + spacing.spacingSm }]}
    >
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.barContent}
      >
        {TABS.map((tab) => {
          const isActive = activeRouteName === tab.key;
          const IconComponent = tab.Icon;
          const route = state.routes.find((r) => r.name === tab.key);

          const onPress = () => {
            if (!route) return;
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isActive && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              onPress={onPress}
              // Pressable has no built-in feedback; losing the press
              // response on the nav bar would be a real regression.
              style={({ pressed }) => [
                styles.slot,
                isActive && styles.slotActive,
                pressed && !isActive && styles.pressed,
              ]}
            >
              <IconComponent
                size={TAB_ICON_SIZE}
                color={isActive ? onRacingRed : colors.textSecondary}
              />
            </Pressable>
          );
        })}
      </CutCornerSurface>
    </TutorialTarget>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.voidBlack },
      }}
    >
      {/* Primary tabs shown in the floating bar */}
      <Tabs.Screen name="map" />
      <Tabs.Screen name="drive" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: "center",
    paddingTop: spacing.spacingMd,
    // The bar floats over map tiles and long scrolls, so the strip behind
    // it has to stop content showing through. A surface step, not a blur —
    // `expo-blur` was the old answer and it only ever ran on iOS, so the
    // two platforms did not match.
    backgroundColor: colors.voidBlack,
  },
  barContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    padding: spacing.spacingXs,
  },
  slot: {
    width: TAB_SLOT,
    height: TAB_SLOT,
    borderRadius: radius.circle,
    alignItems: "center",
    justifyContent: "center",
  },
  slotActive: {
    backgroundColor: colors.racingRed,
  },
  pressed: {
    opacity: 0.7,
  },
});
