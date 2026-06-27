import { Tabs } from "expo-router";
import React from "react";
import { useTheme } from "@/hooks/useThemeStore";
import { HomeIcon, OrdersIcon, ProfileIcon, TowingPlusIcon, InsuranceIcon, AtpmIcon } from "@/components/TabIcons";
import { Activity } from "lucide-react-native";

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        tabBarActiveTintColor: '#FF3B30',
        tabBarInactiveTintColor: '#A0A0A0',
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        headerStyle: {
          backgroundColor: theme.card,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        },
        headerTitleStyle: {
          fontWeight: "600",
          fontSize: 18,
          color: theme.textDark,
        },
        headerTintColor: theme.textDark,
      }}
    >
      {/* Home Tab */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Beranda",
          tabBarIcon: ({ color, focused }) => <HomeIcon color={color} size={24} filled={focused} />,
        }}
      />
      
      {/* Orders Tab */}
      <Tabs.Screen
        name="orders"
        options={{
          title: "Pesanan",
          tabBarIcon: ({ color, focused }) => <OrdersIcon color={color} size={24} />,
        }}
      />
      
      {/* Transactions Tab */}
      <Tabs.Screen
        name="transactions"
        options={{
          title: "Transaksi",
          tabBarIcon: ({ color, focused }) => <Activity color={color} size={24} />,
        }}
      />
      
      {/* Towing+ Tab */}
      <Tabs.Screen
        name="towing-plus"
        options={{
          title: "Towing+",
          tabBarIcon: ({ color, focused }) => <TowingPlusIcon color={color} size={24} />,
        }}
      />
      
      {/* Insurance Tab */}
      <Tabs.Screen
        name="member-asuransi"
        options={{
          title: "Asuransi",
          tabBarIcon: ({ color, focused }) => <InsuranceIcon color={color} size={24} />,
        }}
      />
      
      {/* ATPM Tab */}
      <Tabs.Screen
        name="atpm"
        options={{
          title: "ATPM",
          tabBarIcon: ({ color, focused }) => <AtpmIcon color={color} size={24} />,
        }}
      />
      
      {/* Profile Tab */}
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, focused }) => <ProfileIcon color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}