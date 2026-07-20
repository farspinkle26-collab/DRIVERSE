import React from "react";
import { StyleSheet, View, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MapIcon, DriveIcon, ProfileIcon } from "../../components/TabIcons";

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
                color={isActive ? "#FF6B35" : "#5A5A6E"}
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

      {/* Screens inside the (tabs) group that are pushed as full pages and
          must not appear as their own pill button. */}
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="atpm" options={{ href: null }} />
      <Tabs.Screen name="towing-plus" options={{ href: null }} />
      <Tabs.Screen name="member-asuransi" options={{ href: null }} />
      <Tabs.Screen name="transactions" options={{ href: null }} />
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
    backgroundColor: "rgba(22, 22, 40, 0.9)",
  },
  tabPill: {
    flexDirection: "row",
    backgroundColor: "rgba(20, 20, 36, 0.92)",
    borderRadius: 30,
    padding: 5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 14,
  },
  tabItem: {
    width: 52,
    height: 44,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  tabItemActive: {
    backgroundColor: "rgba(255, 107, 53, 0.16)",
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
});
