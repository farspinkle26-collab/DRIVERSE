import React from "react";
import { StyleSheet, View, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Slot, usePathname, useRouter } from "expo-router";
import { MapIcon, DriveIcon, ProfileIcon } from "../../components/TabIcons";

type TabKey = "map" | "drive" | "profile";

const TABS: { key: TabKey; Icon: typeof MapIcon }[] = [
  { key: "map", Icon: MapIcon },
  { key: "drive", Icon: DriveIcon },
  { key: "profile", Icon: ProfileIcon },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab: TabKey =
    TABS.find((tab) => pathname.endsWith(`/${tab.key}`))?.key ?? "map";

  const TabBarBg = Platform.OS === "ios" ? BlurView : View;
  const tabBarBgProps =
    Platform.OS === "ios"
      ? { intensity: 25, tint: "dark" as const, style: [styles.tabBar, { paddingBottom: insets.bottom + 6 }] }
      : { style: [styles.tabBar, styles.tabBarAndroid, { paddingBottom: insets.bottom + 6 }] };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Slot />
      </View>

      {/* Bottom floating nav bar with icons */}
      <TabBarBg {...tabBarBgProps}>
        <View style={styles.tabPill}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const IconComponent = tab.Icon;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => router.navigate(`/(tabs)/${tab.key}` as any)}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#161628",
  },
  content: {
    flex: 1,
  },
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
    backgroundColor: "rgba(26, 26, 46, 0.85)",
    borderRadius: 30,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.07)",
    gap: 4,
  },
  tabItem: {
    width: 48,
    height: 44,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  tabItemActive: {
    backgroundColor: "rgba(255, 107, 53, 0.15)",
  },
});
