import React from "react";
import { StyleSheet, View, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MapIcon, DriveIcon, ProfileIcon } from "../../components/TabIcons";
import { alpha, colors } from "../../constants/theme";

type TabKey = "map" | "drive" | "profile";

const TABS: { key: TabKey; Icon: typeof MapIcon }[] = [
  { key: "map", Icon: MapIcon },
  { key: "drive", Icon: DriveIcon },
  { key: "profile", Icon: ProfileIcon },
];

// Floating pill navigation bar. Rendered as the tab navigator's custom
// tabBar so taps go through React Navigation and reliably switch screens.
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRouteName = state.routes[state.index]?.name;

  const TabBarBg = Platform.OS === "ios" ? BlurView : View;
  const tabBarBgProps =
    Platform.OS === "ios"
      ? { intensity: 25, tint: "dark" as const, style: [styles.tabBar, { paddingBottom: insets.bottom + 6 }] }
      : { style: [styles.tabBar, styles.tabBarAndroid, { paddingBottom: insets.bottom + 6 }] };

  return (
    <TabBarBg {...tabBarBgProps}>
      <View style={styles.tabPill}>
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
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, isActive && styles.tabItemActive]}
              onPress={onPress}
              activeOpacity={0.7}
            >
              <IconComponent
                size={22}
                color={isActive ? colors.racingRed : colors.textSecondary}
                filled={isActive}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </TabBarBg>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#161628" },
      }}
    >
      {/* Primary tabs shown in the floating pill */}
      <Tabs.Screen name="map" />
      <Tabs.Screen name="drive" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: "center",
    paddingTop: 10,
  },
  tabBarAndroid: {
    backgroundColor: alpha(colors.carbonSurface, 0.92),
  },
  tabPill: {
    flexDirection: "row",
    backgroundColor: alpha(colors.carbonSurface, 0.92),
    borderRadius: 30,
    padding: 5,
    borderWidth: 1,
    borderColor: colors.hairline,
    gap: 6,
  },
  tabItem: {
    width: 52,
    height: 44,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  tabItemActive: {
    backgroundColor: alpha(colors.racingRed, 0.16),
  },
});
