import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Swords,
  Calendar,
  Coffee,
  Wrench,
  Car,
  Users,
  Store,
  AlertTriangle,
  ChevronRight,
  Star,
  Trophy,
  MapPin,
  Clock,
  Flame,
  X,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";
import { useTabNavigation } from "./_layout";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.75;

type DriveFeature = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.FC<{ size: number; color: string }>;
  color: string;
  bgColor: string;
  route?: string;
};

const DRIVE_FEATURES: DriveFeature[] = [
  {
    id: "quests",
    title: "Quests",
    subtitle: "Daily challenges & rewards",
    icon: Swords,
    color: "#FF6B35",
    bgColor: "#FF6B3515",
  },
  {
    id: "events",
    title: "Events",
    subtitle: "Car meets & rallies",
    icon: Calendar,
    color: "#FF3B6F",
    bgColor: "#FF3B6F15",
  },
  {
    id: "cafe",
    title: "Café Finder",
    subtitle: "Pit stops & hangouts",
    icon: Coffee,
    color: "#8B5CF6",
    bgColor: "#8B5CF615",
  },
  {
    id: "workshop",
    title: "Workshops",
    subtitle: "Tuning & repairs",
    icon: Wrench,
    color: "#F59E0B",
    bgColor: "#F59E0B15",
  },
  {
    id: "garage",
    title: "Garage",
    subtitle: "Your car collection",
    icon: Car,
    color: "#00D4AA",
    bgColor: "#00D4AA15",
  },
  {
    id: "community",
    title: "Community",
    subtitle: "Clubs & meetups",
    icon: Users,
    color: "#3B82F6",
    bgColor: "#3B82F615",
  },
  {
    id: "marketplace",
    title: "Marketplace",
    subtitle: "Parts & accessories",
    icon: Store,
    color: "#EC4899",
    bgColor: "#EC489915",
  },
  {
    id: "emergency",
    title: "Emergency",
    subtitle: "24/7 roadside help",
    icon: AlertTriangle,
    color: "#EF4444",
    bgColor: "#EF444415",
    route: "/request-tow",
  },
];

const ACTIVE_QUESTS = [
  {
    id: "q1",
    title: "Night Cruiser",
    description: "Drive 50 km between 8PM–2AM",
    progress: 0.65,
    reward: "250 XP",
    icon: Flame,
    color: "#FF6B35",
  },
  {
    id: "q2",
    title: "Scenic Explorer",
    description: "Visit 3 scenic route markers",
    progress: 0.33,
    reward: "150 XP",
    icon: MapPin,
    color: "#00D4AA",
  },
  {
    id: "q3",
    title: "Speed Demon",
    description: "Complete 10 highway sprints",
    progress: 0.8,
    reward: "500 XP",
    icon: Flame,
    color: "#FF3B6F",
  },
];

const UPCOMING_EVENTS = [
  {
    id: "e1",
    title: "Jakarta Midnight Rally",
    date: "Sat, 29 Jun",
    location: "SCBD Parking Lot",
    attendees: 128,
    image: null,
  },
  {
    id: "e2",
    title: "EV Showcase & Coffee",
    date: "Sun, 30 Jun",
    location: "Kemang Village",
    attendees: 56,
    image: null,
  },
];

export default function DriveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { setActiveTab: switchTab } = useTabNavigation();
  const insets = useSafeAreaInsets();
  const [activeView, setActiveView] = useState<"features" | "quests" | "events">("features");
  const scrollY = useRef(new Animated.Value(0)).current;
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const handleFeaturePress = (feature: DriveFeature) => {
    if (feature.route) {
      router.push(feature.route as any);
    } else if (feature.id === "quests") {
      setActiveView("quests");
    } else if (feature.id === "events") {
      setActiveView("events");
    }
  };

  const handleNavigateMap = (_feature: DriveFeature) => {
    switchTab("map");
  };

  const sheetTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -30],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.container}>
      {/* Dark gradient background */}
      <LinearGradient
        colors={["#0A0A0F", "#060609", "#0A0A0F"]}
        style={styles.background}
      />

      {/* Content */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 40,
          paddingTop: insets.top + 70,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* View tabs */}
        <View style={styles.viewTabs}>
          {(["features", "quests", "events"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.viewTab,
                activeView === tab && styles.viewTabActive,
              ]}
              onPress={() => setActiveView(tab)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.viewTabText,
                  activeView === tab && styles.viewTabTextActive,
                ]}
              >
                {tab === "features" ? "Features" : tab === "quests" ? "Quests" : "Events"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Features grid */}
        {activeView === "features" && (
          <View style={styles.featuresGrid}>
            {DRIVE_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.id}
                style={[styles.featureCard, { backgroundColor: feature.bgColor }]}
                onPress={() => handleFeaturePress(feature)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[feature.color + "10", feature.color + "00"]}
                  style={styles.featureCardGradient}
                >
                  <View style={[styles.featureIcon, { backgroundColor: feature.color + "20" }]}>
                    <feature.icon size={24} color={feature.color} />
                  </View>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
                  <View style={[styles.featureArrow, { backgroundColor: feature.color + "15" }]}>
                    <ChevronRight size={14} color={feature.color} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Active quests */}
        {activeView === "quests" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Quests</Text>
            <Text style={styles.sectionSubtitle}>
              Complete quests to earn XP and unlock rewards
            </Text>
            {ACTIVE_QUESTS.map((quest) => (
              <View key={quest.id} style={styles.questCard}>
                <LinearGradient
                  colors={[quest.color + "15", "transparent"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.questGradient}
                />
                <View style={styles.questHeader}>
                  <View style={[styles.questIcon, { backgroundColor: quest.color + "20" }]}>
                    <quest.icon size={18} color={quest.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.questTitle}>{quest.title}</Text>
                    <Text style={styles.questDesc}>{quest.description}</Text>
                  </View>
                  <Text style={[styles.questReward, { color: quest.color }]}>
                    {quest.reward}
                  </Text>
                </View>
                {/* Progress bar */}
                <View style={styles.progressBar}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: `${quest.progress * 100}%`,
                        backgroundColor: quest.color,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {Math.round(quest.progress * 100)}% complete
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Upcoming events */}
        {activeView === "events" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <Text style={styles.sectionSubtitle}>
              Car meets, rallies, and community gatherings near you
            </Text>
            {UPCOMING_EVENTS.map((event) => (
              <TouchableOpacity key={event.id} style={styles.eventCard} activeOpacity={0.7}>
                <View style={styles.eventImagePlaceholder}>
                  <Calendar size={28} color="#FF6B3560" />
                </View>
                <View style={styles.eventContent}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <View style={styles.eventDetail}>
                    <Clock size={12} color="#8A8A9A" />
                    <Text style={styles.eventDetailText}>{event.date}</Text>
                  </View>
                  <View style={styles.eventDetail}>
                    <MapPin size={12} color="#8A8A9A" />
                    <Text style={styles.eventDetailText}>{event.location}</Text>
                  </View>
                  <View style={styles.eventFooter}>
                    <View style={styles.eventAttendees}>
                      <Users size={12} color="#FF6B35" />
                      <Text style={styles.eventAttendeeText}>
                        {event.attendees} attending
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.rsvpButton} activeOpacity={0.7}>
                      <Text style={styles.rsvpText}>RSVP</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  // Scroll content
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // View tabs
  viewTabs: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  viewTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  viewTabActive: {
    backgroundColor: "rgba(255, 107, 53, 0.15)",
  },
  viewTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5A5A6E",
  },
  viewTabTextActive: {
    color: "#FF6B35",
  },
  // Features grid
  featuresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  featureCard: {
    width: "47%",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  featureCardGradient: {
    padding: 18,
    minHeight: 130,
    justifyContent: "space-between",
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  featureSubtitle: {
    fontSize: 12,
    color: "#8A8A9A",
    lineHeight: 16,
  },
  featureArrow: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  // Section
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#8A8A9A",
    marginBottom: 16,
  },
  // Quest cards
  questCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  questGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  questIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  questTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  questDesc: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 2,
  },
  questReward: {
    fontSize: 13,
    fontWeight: "700",
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 2,
    marginTop: 14,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    shadowColor: "#FF6B35",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  progressText: {
    fontSize: 11,
    color: "#5A5A6E",
    marginTop: 6,
  },
  // Event cards
  eventCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  eventImagePlaceholder: {
    height: 120,
    backgroundColor: "rgba(255, 107, 53, 0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  eventDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  eventDetailText: {
    fontSize: 13,
    color: "#8A8A9A",
  },
  eventFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  eventAttendees: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eventAttendeeText: {
    fontSize: 12,
    color: "#FF6B35",
    fontWeight: "600",
  },
  rsvpButton: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rsvpText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
