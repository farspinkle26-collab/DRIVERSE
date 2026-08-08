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
 *
 * THE ACTIVE DISC IS ONE VIEW THAT SLIDES, not three that switch on and off.
 * That distinction is the entire transition: a fill cannot be seen moving
 * between tabs if every tab owns its own copy of it. It sits behind the row
 * with `pointerEvents="none"`, so the glyphs draw over it and only change
 * colour, and it is translated by whole slot strides rather than by a
 * measured layout — the row is a fixed three slots at a fixed width, and
 * measuring would only buy a frame with the disc in the wrong place.
 *
 * The bar and the map screen's DRIVE slab are the app's two red chrome
 * surfaces and are deliberately built from the same parts: racingRed fill,
 * `onRacingRed` content, a lit top edge, a lift. They differ only in shape,
 * which is the rule the token file already sets — a disc for a glyph, the
 * cut for a slab.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { CutCornerSurface } from "@/components/CutCorner";
import { DriveIcon, MapIcon, ProfileIcon } from "@/components/TabIcons";
import { usePressMotion } from "@/hooks/usePressMotion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  borderWidth,
  colors,
  cut,
  duration,
  edge,
  elevation,
  onRacingRed,
  radius,
  spacing,
} from "@/constants/theme";

type TabKey = "map" | "drive" | "profile";

/**
 * Three tabs, and the middle one is not what its glyph suggests at a glance:
 * `drive` is the **Drive Hub** — the recorded-drive log, Quests and Explore —
 * not "start driving". Starting a drive is the red slab on the map screen.
 * The steering wheel is the app's mark for driving as a subject, not for the
 * record button.
 */
const TABS: { key: TabKey; label: string; Icon: typeof MapIcon }[] = [
  { key: "map", label: "Map", Icon: MapIcon },
  { key: "drive", label: "Drive Hub", Icon: DriveIcon },
  { key: "profile", label: "Profile", Icon: ProfileIcon },
];

/** Glyph size and the disc that sits behind an active one. Multiples of 4. */
const TAB_ICON_SIZE = spacing.spacingXl; // 24
const TAB_SLOT = 44;
/** Centre-to-centre between slots: the slot plus the row's gap. */
const TAB_STRIDE = TAB_SLOT + spacing.spacingSm;

/**
 * One tab. Split out of the bar so each can hold its own press animation —
 * a hook cannot be called inside a `.map()` in the parent.
 */
function TabSlot({
  tab,
  isActive,
  onPress,
}: {
  tab: (typeof TABS)[number];
  isActive: boolean;
  onPress: () => void;
}) {
  const motion = usePressMotion("scale");
  const Icon = tab.Icon;

  return (
    <Animated.View style={motion.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={tab.label}
        onPress={onPress}
        onPressIn={motion.onPressIn}
        onPressOut={motion.onPressOut}
        style={styles.slot}
      >
        <Icon
          size={TAB_ICON_SIZE}
          color={isActive ? onRacingRed : colors.textSecondary}
        />
      </Pressable>
    </Animated.View>
  );
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const activeRouteName = state.routes[state.index]?.name;
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.key === activeRouteName)
  );

  /**
   * The active disc is ONE view that slides, not three that switch on and off.
   * That is the whole transition: a fill cannot be seen moving from one tab to
   * the next if each tab owns its own copy of it. It sits behind the row, so
   * the glyphs draw over it and only need to change colour.
   */
  const indicator = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    if (reducedMotion) {
      indicator.setValue(activeIndex);
      return;
    }
    Animated.timing(indicator, {
      toValue: activeIndex,
      duration: duration.fast,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicator, reducedMotion]);

  const indicatorShift = indicator.interpolate({
    inputRange: [0, TABS.length - 1],
    outputRange: [0, TAB_STRIDE * (TABS.length - 1)],
  });

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + spacing.spacingSm }]}>
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        // The bar floats over every screen's content, so it takes the top of
        // the elevation scale. `edges` is the half that reads: see the note on
        // `elevation` in theme.ts for why the shadow does little here and does
        // nothing at all on Android.
        edges
        elevation="floating"
        contentStyle={styles.barContent}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            // The one piece of chrome red on this surface, and the only thing
            // on the bar carrying its own lift — the disc is a plain view with
            // a background, so unlike the cut surface around it this shadow
            // does render on Android too.
            elevation.raised,
            { transform: [{ translateX: indicatorShift }] },
          ]}
        />
        {TABS.map((tab) => {
          const isActive = activeRouteName === tab.key;
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
            <TabSlot
              key={tab.key}
              tab={tab}
              isActive={isActive}
              onPress={onPress}
            />
          );
        })}
      </CutCornerSurface>
    </View>
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
  /**
   * The sliding active disc. Positioned against the content box's padding so
   * it lands exactly on the first slot at rest, then translated by whole
   * strides — no measurement, because the row is a fixed three slots of a
   * fixed width and measuring would only introduce a frame where the disc is
   * in the wrong place.
   */
  indicator: {
    position: "absolute",
    left: spacing.spacingXs,
    top: spacing.spacingXs,
    width: TAB_SLOT,
    height: TAB_SLOT,
    borderRadius: radius.circle,
    backgroundColor: colors.racingRed,
    // A lit top edge, the same cue every other primary surface carries — here
    // as a plain border-top since the disc is a circle, not a cut polygon.
    borderTopWidth: borderWidth.hairline,
    borderTopColor: edge.highlightOnAccent,
  },
});
