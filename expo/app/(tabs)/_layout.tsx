import { Tabs } from "expo-router";
import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { BlurView } from "expo-blur";
import { MapIcon, DriveIcon, ProfileIcon } from "@/components/TabIcons";

const TAB_BAR_HEIGHT = 72;

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="map"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FF6B35",
        tabBarInactiveTintColor: "#5A5A6E",
        tabBarStyle: {
          position: "absolute",
          bottom: 24,
          left: 20,
          right: 20,
          height: TAB_BAR_HEIGHT,
          backgroundColor: "rgba(18, 18, 26, 0.92)",
          borderTopWidth: 0,
          borderRadius: 36,
          elevation: 0,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
          paddingBottom: 0,
          paddingTop: 8,
          borderWidth: 1,
          borderColor: "rgba(255, 255, 255, 0.06)",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 2,
          letterSpacing: 0.3,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="map"
        options={{
          title: "Map",
          tabBarIcon: ({ color, focused }) => (
            <MapIcon color={color} size={22} filled={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="drive"
        options={{
          title: "Drive",
          tabBarIcon: ({ color, focused }) => (
            <DriveIcon color={color} size={22} filled={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <ProfileIcon color={color} size={22} filled={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
