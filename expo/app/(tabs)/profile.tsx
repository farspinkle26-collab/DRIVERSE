import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Car,
  Trophy,
  Clock,
  Gauge,
  MapPin,
  Settings,
  Shield,
  LogOut,
  ChevronRight,
  Star,
  Award,
  Flame,
  Wallet,
  Moon,
  Sun,
  HelpCircle,
  Share2,
  Headphones,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";
import { useTheme } from "@/hooks/useThemeStore";
import { useTabNavigation } from "./_layout";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const MOCK_GARAGE = [
  { id: "g1", name: "Porsche 911 GT3", year: "2024", color: "#FF3B6F", hp: 502, mileage: "2,340 km" },
  { id: "g2", name: "BMW M4 CSL", year: "2023", color: "#3B82F6", hp: 543, mileage: "8,120 km" },
  { id: "g3", name: "Toyota GR Supra", year: "2024", color: "#F59E0B", hp: 382, mileage: "15,400 km" },
];

const MOCK_ACHIEVEMENTS = [
  { id: "a1", title: "Night Rider", desc: "Drive 100 km at night", icon: Flame, color: "#FF6B35", earned: true },
  { id: "a2", title: "Speed Demon", desc: "Reach 200 km/h on highway", icon: Gauge, color: "#FF3B6F", earned: true },
  { id: "a3", title: "Explorer", desc: "Visit 10 scenic routes", icon: MapPin, color: "#00D4AA", earned: true },
  { id: "a4", title: "Collector", desc: "Own 5 cars in garage", icon: Car, color: "#8B5CF6", earned: false },
  { id: "a5", title: "Legend", desc: "Earn 10,000 XP total", icon: Award, color: "#FFD700", earned: false },
  { id: "a6", title: "Social", desc: "Join 5 community events", icon: Share2, color: "#EC4899", earned: false },
];

const MOCK_STATS = {
  totalKm: 12340,
  topSpeed: 245,
  avgSpeed: 67,
  hoursDriven: 184,
  questsCompleted: 27,
  eventsAttended: 8,
  carsCollected: 3,
  xpEarned: 3450,
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { setActiveTab: switchTab } = useTabNavigation();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<"garage" | "achievements" | "stats">("garage");

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const success = await logout();
          if (success) switchTab("map");
        },
      },
    ]);
  };

  const handleTopUp = () => router.push("/top-up" as any);
  const handleTransactionHistory = () => router.push("/transaction-history" as any);
  const handlePaymentHistory = () => router.push("/payment-history" as any);

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.background} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: insets.top + 70 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {/* Avatar + badge */}
          <View style={styles.avatarSection}>
            <LinearGradient
              colors={["#FF6B35", "#FF8A50"]}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>
                  {(user?.name ?? "D")[0].toUpperCase()}
                </Text>
              </View>
            </LinearGradient>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>12</Text>
            </View>
          </View>

          <Text style={styles.userName}>{user?.name ?? "Driver"}</Text>
          <Text style={styles.userTitle}>Legendary Driver</Text>

          {/* Quick stats row */}
          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{MOCK_STATS.carsCollected}</Text>
              <Text style={styles.quickStatLabel}>Cars</Text>
            </View>
            <View style={styles.quickStatDiv} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{MOCK_STATS.questsCompleted}</Text>
              <Text style={styles.quickStatLabel}>Quests</Text>
            </View>
            <View style={styles.quickStatDiv} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{MOCK_STATS.xpEarned.toLocaleString()}</Text>
              <Text style={styles.quickStatLabel}>XP</Text>
            </View>
          </View>
        </View>

        {/* Wallet Card */}
        <View style={[styles.walletCard, { marginHorizontal: 20 }]}>
          <LinearGradient
            colors={["#1A1A2E", "#121220"]}
            style={styles.walletGradient}
          >
            <View style={styles.walletRow}>
              <View style={styles.walletLeft}>
                <Wallet size={16} color="#8A8A9A" />
                <Text style={styles.walletLabel}>DRIVEVERSE BALANCE</Text>
              </View>
              <Text style={styles.walletAmount}>Rp 2,450,000</Text>
            </View>
            <View style={styles.walletActions}>
              <TouchableOpacity
                style={[styles.walletBtn, { backgroundColor: "#FF6B35" }]}
                onPress={handleTopUp}
                activeOpacity={0.7}
              >
                <Text style={styles.walletBtnText}>Top Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.walletBtn, { backgroundColor: "rgba(255,255,255,0.06)" }]}
                onPress={handleTransactionHistory}
                activeOpacity={0.7}
              >
                <Text style={styles.walletBtnText}>History</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* Content Tabs */}
        <View style={styles.contentTabs}>
          {(["garage", "achievements", "stats"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.contentTab, activeTab === tab && styles.contentTabActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.contentTabText, activeTab === tab && styles.contentTabTextActive]}>
                {tab === "garage" ? "Garage" : tab === "achievements" ? "Achievements" : "Stats"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Garage */}
        {activeTab === "garage" && (
          <View style={styles.section}>
            {MOCK_GARAGE.map((car) => (
              <TouchableOpacity key={car.id} style={styles.garageCard} activeOpacity={0.7}>
                <View style={styles.garageCardContent}>
                  <View style={[styles.carColorBar, { backgroundColor: car.color }]} />
                  <View style={styles.carInfo}>
                    <Text style={styles.carName}>{car.name}</Text>
                    <View style={styles.carMeta}>
                      <Text style={styles.carMetaText}>{car.year}</Text>
                      <Text style={styles.carMetaDot}>•</Text>
                      <Text style={[styles.carMetaText, { color: car.color }]}>{car.hp} HP</Text>
                      <Text style={styles.carMetaDot}>•</Text>
                      <Text style={styles.carMetaText}>{car.mileage}</Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color="#5A5A6E" />
                </View>
              </TouchableOpacity>
            ))}

            {/* Add car button */}
            <TouchableOpacity style={styles.addCarButton} activeOpacity={0.7}>
              <View style={styles.addCarIcon}>
                <Car size={20} color="#FF6B35" />
              </View>
              <Text style={styles.addCarText}>Add a car to your garage</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Achievements */}
        {activeTab === "achievements" && (
          <View style={styles.section}>
            {MOCK_ACHIEVEMENTS.map((ach) => (
              <View
                key={ach.id}
                style={[styles.achievementCard, !ach.earned && styles.achievementLocked]}
              >
                <View
                  style={[
                    styles.achievementIcon,
                    {
                      backgroundColor: ach.earned ? ach.color + "20" : "rgba(255,255,255,0.03)",
                    },
                  ]}
                >
                  <ach.icon size={22} color={ach.earned ? ach.color : "#3A3A4E"} />
                  {ach.earned && (
                    <View style={[styles.achievementCheck, { backgroundColor: ach.color }]}>
                      <Star size={8} color="#FFFFFF" fill="#FFFFFF" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.achievementTitle, !ach.earned && { color: "#5A5A6E" }]}>
                    {ach.title}
                  </Text>
                  <Text style={styles.achievementDesc}>{ach.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Stats */}
        {activeTab === "stats" && (
          <View style={styles.section}>
            <View style={styles.statsGrid}>
              {[
                { label: "Total Distance", value: `${(MOCK_STATS.totalKm / 1000).toFixed(1)}k km`, icon: MapPin },
                { label: "Top Speed", value: `${MOCK_STATS.topSpeed} km/h`, icon: Gauge },
                { label: "Avg Speed", value: `${MOCK_STATS.avgSpeed} km/h`, icon: Clock },
                { label: "Hours Driven", value: `${MOCK_STATS.hoursDriven}h`, icon: Flame },
                { label: "Quests Done", value: String(MOCK_STATS.questsCompleted), icon: Trophy },
                { label: "Events Joined", value: String(MOCK_STATS.eventsAttended), icon: Star },
              ].map((stat, i) => (
                <View key={i} style={styles.statCard}>
                  <stat.icon size={18} color="#FF6B35" />
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Settings Section */}
        <View style={[styles.settingsSection, { marginHorizontal: 20 }]}>
          <Text style={styles.settingsTitle}>Settings</Text>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              {isDark ? <Moon size={18} color="#8A8A9A" /> : <Sun size={18} color="#FFD700" />}
              <Text style={styles.settingText}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: "#2A2A3A", true: "#FF6B3530" }}
              thumbColor={isDark ? "#FF6B35" : "#5A5A6E"}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/terms-and-conditions" as any)}>
            <View style={styles.settingLeft}>
              <Shield size={18} color="#8A8A9A" />
              <Text style={styles.settingText}>Privacy & Terms</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <HelpCircle size={18} color="#8A8A9A" />
              <Text style={styles.settingText}>Help & Support</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <Headphones size={18} color="#8A8A9A" />
              <Text style={styles.settingText}>Contact Us</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingRow, styles.logoutRow]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <LogOut size={18} color="#EF4444" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#060609",
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  // Profile header
  profileHeader: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  avatarSection: {
    marginBottom: 12,
    position: "relative",
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  avatarInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#0A0A0F",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FF6B35",
  },
  levelBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },
  levelText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#000",
  },
  userName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  userTitle: {
    fontSize: 14,
    color: "#FF6B35",
    fontWeight: "600",
    marginBottom: 20,
  },
  quickStats: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  quickStat: {
    alignItems: "center",
    flex: 1,
  },
  quickStatDiv: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  quickStatLabel: {
    fontSize: 11,
    color: "#8A8A9A",
    marginTop: 2,
  },
  // Wallet
  walletCard: {
    marginTop: 24,
    marginBottom: 8,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  walletGradient: {
    padding: 20,
  },
  walletRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  walletLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#5A5A6E",
    letterSpacing: 1,
  },
  walletAmount: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  walletActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  walletBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  walletBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // Content tabs
  contentTabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 4,
  },
  contentTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  contentTabActive: {
    backgroundColor: "rgba(255, 107, 53, 0.12)",
  },
  contentTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5A5A6E",
  },
  contentTabTextActive: {
    color: "#FF6B35",
  },
  // Content section
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  // Garage
  garageCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  garageCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  carColorBar: {
    width: 4,
    height: 72,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  carInfo: {
    flex: 1,
    padding: 16,
  },
  carName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  carMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  carMetaText: {
    fontSize: 12,
    color: "#8A8A9A",
  },
  carMetaDot: {
    color: "#3A3A4E",
    fontSize: 10,
  },
  addCarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    borderStyle: "dashed",
  },
  addCarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  addCarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  // Achievements
  achievementCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  achievementLocked: {
    opacity: 0.5,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  achievementCheck: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  achievementTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  achievementDesc: {
    fontSize: 12,
    color: "#8A8A9A",
  },
  // Stats
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "30%",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 10,
    color: "#8A8A9A",
    marginTop: 4,
    textAlign: "center",
  },
  // Settings
  settingsSection: {
    marginTop: 24,
    marginBottom: 4,
  },
  settingsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5A5A6E",
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: "uppercase" as const,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  logoutRow: {
    paddingTop: 20,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EF4444",
  },
});
