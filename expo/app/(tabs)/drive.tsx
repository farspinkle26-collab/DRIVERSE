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
  Alert,
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
  Trophy,
  MapPin,
  Clock,
  Flame,
  Route,
  Sunrise,
  Camera,
  Fuel,
  Mountain,
  Moon,
  Zap,
  Flag,
  Compass,
  Award,
  Medal,
  Gem,
  Coins,
  Check,
  Sparkles,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";
import { useQuests } from "@/hooks/useQuestStore";
import {
  DIFFICULTY_TIERS,
  progressPercent,
  progressLabel,
  isComplete,
  type DailyQuest,
} from "@/lib/questEngine";

// Map the icon-name strings stored on templates/badges to components.
type IconCmp = React.FC<{ size: number; color: string }>;
const QUEST_ICONS: Record<string, IconCmp> = {
  Flame, MapPin, Route, Car, Coffee, Sunrise, Camera, Fuel, Mountain,
  Moon, Zap, Users, Flag, Compass, Swords, Trophy, Award, Medal, Gem,
  Coins, Star: Sparkles,
};
function questIcon(name: string): IconCmp {
  return QUEST_ICONS[name] ?? Flame;
}

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
    id: "routes",
    title: "Routes",
    subtitle: "Save & share your drives",
    icon: Route,
    color: "#00D4AA",
    bgColor: "#00D4AA15",
    route: "/routes",
  },
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

// ─── Live daily quest card ───────────────────────────────────────────
function QuestCard({
  quest,
  onClaim,
}: {
  quest: DailyQuest;
  onClaim: (q: DailyQuest) => void;
}) {
  const Icon = questIcon(quest.icon);
  const tier = DIFFICULTY_TIERS[quest.difficulty];
  const done = quest.status === "completed";
  const ready = quest.status === "active" && isComplete(quest);
  const pct = progressPercent(quest);

  return (
    <View style={styles.questCard}>
      <LinearGradient
        colors={[quest.accent_color + "15", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.questGradient}
      />
      <View style={styles.questHeader}>
        <View style={[styles.questIcon, { backgroundColor: quest.accent_color + "20" }]}>
          <Icon size={18} color={quest.accent_color} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.questTitleRow}>
            <Text style={styles.questTitle}>{quest.title}</Text>
            <View style={[styles.diffPill, { backgroundColor: tier.color + "22" }]}>
              <Text style={[styles.diffPillText, { color: tier.color }]}>
                {tier.label}
              </Text>
            </View>
          </View>
          <Text style={styles.questDesc}>{quest.description}</Text>
        </View>
      </View>

      {/* Reward row */}
      <View style={styles.rewardRow}>
        <View style={styles.rewardChip}>
          <Sparkles size={12} color="#FBBF24" />
          <Text style={styles.rewardChipText}>{quest.xp_reward} XP</Text>
        </View>
        <View style={styles.rewardChip}>
          <Coins size={12} color="#FFD700" />
          <Text style={styles.rewardChipText}>{quest.coin_reward}</Text>
        </View>
        {quest.badge_id ? (
          <View style={styles.rewardChip}>
            <Award size={12} color="#A855F7" />
            <Text style={styles.rewardChipText}>Badge</Text>
          </View>
        ) : null}
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: `${done ? 100 : pct}%`,
              backgroundColor: done ? "#22C55E" : quest.accent_color,
            },
          ]}
        />
      </View>

      <View style={styles.questFooterRow}>
        <Text style={styles.progressText}>
          {done ? "Completed" : progressLabel(quest)}
        </Text>
        {done ? (
          <View style={styles.doneBadge}>
            <Check size={12} color="#22C55E" />
            <Text style={styles.doneBadgeText}>Claimed</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.claimButton,
              { backgroundColor: ready ? "#22C55E" : quest.accent_color + "22" },
            ]}
            onPress={() => onClaim(quest)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.claimButtonText,
                { color: ready ? "#FFFFFF" : quest.accent_color },
              ]}
            >
              {ready ? "Claim Reward" : "Mark Complete"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

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
  const insets = useSafeAreaInsets();
  const [activeView, setActiveView] = useState<"features" | "quests" | "events">("features");
  const scrollY = useRef(new Animated.Value(0)).current;
  const [sheetExpanded, setSheetExpanded] = useState(true);

  const {
    quests,
    allDone,
    coins,
    streak,
    loading: questsLoading,
    generating: questsGenerating,
    generateQuests,
    completeQuest,
  } = useQuests();

  const handleClaimQuest = useCallback(
    async (quest: DailyQuest) => {
      const { result, error } = await completeQuest(quest.id);
      if (error) {
        Alert.alert("Quest", error);
        return;
      }
      if (result?.awarded) {
        const badgeNote =
          result.new_badges.length > 0
            ? `\nNew badge${result.new_badges.length > 1 ? "s" : ""} unlocked!`
            : "";
        Alert.alert(
          "Quest Complete! 🏁",
          `+${result.xp_reward} XP · +${result.coin_reward} coins${badgeNote}`
        );
      }
    },
    [completeQuest]
  );

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
    router.push("/(tabs)/map" as any);
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
            <View style={styles.questsHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Daily Quests</Text>
                <Text style={styles.sectionSubtitle}>
                  Refreshes every 24h · earn XP, coins & badges
                </Text>
              </View>
              <View style={styles.statPills}>
                <View style={styles.statPill}>
                  <Coins size={13} color="#FFD700" />
                  <Text style={styles.statPillText}>{coins}</Text>
                </View>
                <View style={styles.statPill}>
                  <Flame size={13} color="#FF6B35" />
                  <Text style={styles.statPillText}>{streak}d</Text>
                </View>
              </View>
            </View>

            {questsLoading && quests.length === 0 ? (
              <Text style={styles.questEmpty}>
                {questsGenerating ? "Generating today's quests…" : "Loading quests…"}
              </Text>
            ) : quests.length === 0 ? (
              <TouchableOpacity
                style={styles.generateButton}
                onPress={() => generateQuests()}
                activeOpacity={0.8}
              >
                <Sparkles size={16} color="#FFFFFF" />
                <Text style={styles.generateButtonText}>Generate Daily Quests</Text>
              </TouchableOpacity>
            ) : (
              <>
                {quests.map((quest) => (
                  <QuestCard key={quest.id} quest={quest} onClaim={handleClaimQuest} />
                ))}
                {allDone && (
                  <View style={styles.allDoneBanner}>
                    <Trophy size={16} color="#FBBF24" />
                    <Text style={styles.allDoneText}>
                      All quests complete! New ones arrive tomorrow.
                    </Text>
                  </View>
                )}
              </>
            )}
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
  // Quests header (coins / streak)
  questsHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  statPills: {
    flexDirection: "row",
    gap: 8,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  statPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  questTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  diffPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  diffPillText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rewardRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  rewardChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rewardChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#C9C9D4",
  },
  questFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  claimButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
  },
  claimButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  doneBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  doneBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#22C55E",
  },
  questEmpty: {
    fontSize: 13,
    color: "#8A8A9A",
    paddingVertical: 20,
    textAlign: "center",
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF6B35",
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  allDoneBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(251, 191, 36, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.2)",
    padding: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  allDoneText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FBBF24",
    flex: 1,
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
