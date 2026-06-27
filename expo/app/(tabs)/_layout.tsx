import React, { useState, useCallback, createContext, useContext } from "react";
import { StyleSheet, View, Text, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import MapScreen from "./map";
import DriveScreen from "./drive";
import ProfileScreen from "./profile";

type TabKey = "map" | "drive" | "profile";

export const TabContext = createContext<{
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
}>({ activeTab: "map", setActiveTab: () => {} });

export function useTabNavigation() {
  return useContext(TabContext);
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "map", label: "Map" },
  { key: "drive", label: "Drive" },
  { key: "profile", label: "Profile" },
];

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabKey>("map");

  const renderContent = useCallback(() => {
    switch (activeTab) {
      case "map":
        return <MapScreen />;
      case "drive":
        return <DriveScreen />;
      case "profile":
        return <ProfileScreen />;
    }
  }, [activeTab]);

  const TabBarBg = Platform.OS === "ios" ? BlurView : View;
  const tabBarBgProps =
    Platform.OS === "ios"
      ? { intensity: 40, tint: "dark" as const, style: [styles.tabBar, { paddingTop: insets.top + 8 }] }
      : { style: [styles.tabBar, styles.tabBarAndroid, { paddingTop: insets.top + 8 }] };

  return (
    <TabContext.Provider value={{ activeTab, setActiveTab }}>
    <View style={styles.container}>
      <View style={styles.content}>{renderContent()}</View>

      <TabBarBg {...tabBarBgProps}>
        <View style={styles.tabPill}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </TabBarBg>
    </View>
    </TabContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#060609",
  },
  content: {
    flex: 1,
  },
  tabBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: "center",
    paddingBottom: 10,
  },
  tabBarAndroid: {
    backgroundColor: "rgba(6, 6, 9, 0.85)",
  },
  tabPill: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  tabItem: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 22,
  },
  tabItemActive: {
    backgroundColor: "rgba(255, 107, 53, 0.18)",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5A5A6E",
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: "#FF6B35",
  },
});
