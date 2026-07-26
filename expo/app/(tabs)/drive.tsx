/**
 * Driveverse — Drive Hub.
 *
 * The reference screen for the Phase 1 token system: every colour, size,
 * space and shape on it comes from `constants/theme.ts` or
 * `components/CutCorner.tsx`. Deviations are listed in
 * DRIVE_HUB_REFERENCE.md — nothing here invents a value quietly.
 *
 * Three views behind one header: TRIPS (the recorded-drive log, and the
 * reason the screen exists), QUESTS, and EXPLORE. The stats strip and the
 * NEW TRIP action stay put across all three so the screen has one fixed
 * frame.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Calendar,
  Car,
  ChevronRight,
  Coffee,
  Route as RouteIcon,
  Swords,
  Target,
  Users,
  Wrench,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useQuests } from "@/hooks/useQuestStore";
import { useDriveHub } from "@/hooks/useDriveHub";
import {
  CutCornerBadge,
  CutCornerButton,
  CutCornerSurface,
} from "@/components/CutCorner";
import HubStatStrip from "@/components/HubStatStrip";
import TripCard, { ICON_STROKE } from "@/components/TripCard";
import { tripCode } from "@/lib/tripStats";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  spacing,
  textStyle,
} from "@/constants/theme";
import {
  isComplete,
  progressLabel,
  progressPercent,
  type DailyQuest,
} from "@/lib/questEngine";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** One screen-edge margin, used by every block on the screen. */
const SCREEN_MARGIN = spacing.spacingLg;
/** Width available inside a card, i.e. for the route trace. */
const CARD_INNER_WIDTH = SCREEN_WIDTH - SCREEN_MARGIN * 2 - spacing.spacingLg * 2;
/** Clearance for the floating tab bar. */
const TAB_BAR_CLEARANCE = spacing.spacingXxxl * 2;

type HubView = "trips" | "quests" | "explore";

const VIEWS: { key: HubView; label: string }[] = [
  { key: "trips", label: "Trips" },
  { key: "quests", label: "Quests" },
  { key: "explore", label: "Explore" },
];

/* ------------------------------------------------------------------ *
 * Explore tiles
 * ------------------------------------------------------------------ */

/**
 * The tiles previously carried photographic backgrounds under a gradient
 * overlay. Both are gone: React Native cannot clip a bitmap to the cut
 * polygon (there is no clip-path), so a full-bleed photo squares off the
 * corner the shape exists to cut. Flat surfaces keep the motif honest.
 * The artwork is still in assets/images/features for surfaces that are
 * plain rectangles.
 */
type Feature = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  route?: string;
};

const FEATURES: Feature[] = [
  { id: "quests", title: "Quests", subtitle: "Daily challenges", icon: Swords },
  {
    id: "events",
    title: "Events",
    subtitle: "Meets & rallies",
    icon: Calendar,
    route: "/community?tab=events",
  },
  {
    id: "cafe",
    title: "Cafés",
    subtitle: "Pit stops",
    icon: Coffee,
    route: "/nearby-places?type=cafe",
  },
  {
    id: "workshop",
    title: "Workshops",
    subtitle: "Tuning & repairs",
    icon: Wrench,
    route: "/nearby-places?type=workshop",
  },
  {
    id: "garage",
    title: "Garage",
    subtitle: "Your cars",
    icon: Car,
    route: "/select-car",
  },
  {
    id: "community",
    title: "Community",
    subtitle: "Convoys & drivers",
    icon: Users,
    route: "/community?tab=convoy",
  },
];

/* ------------------------------------------------------------------ *
 * Quest card
 * ------------------------------------------------------------------ */

/**
 * Quest cards carry the same shape and red budget as trip cards: one cut
 * corner, hairline outline, and exactly one red element — the progress
 * fill. The per-quest `accent_color` stored on the template is ignored;
 * it predates the palette and is where the purple and blue on this screen
 * used to come from.
 */
function QuestCard({ quest }: { quest: DailyQuest }) {
  const done = quest.status === "completed";
  const ready = quest.status === "active" && isComplete(quest);
  const pct = done ? 100 : progressPercent(quest);

  return (
    <CutCornerSurface
      fill={colors.carbonSurface}
      borderColor={colors.hairline}
      borderWidth={borderWidth.hairline}
      cutSize={cut.md}
      corners="topRight"
      contentStyle={styles.questCard}
    >
      <View style={styles.questHeader}>
        <Text style={styles.questTitle} numberOfLines={1}>
          {quest.title}
        </Text>
        <CutCornerBadge
          label={quest.difficulty}
          color={colors.textSecondary}
          corners="topRight"
        />
      </View>

      <Text style={styles.questDesc} numberOfLines={2}>
        {quest.description}
      </Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(pct)}%` }]} />
      </View>

      <View style={styles.questFooter}>
        <Text style={styles.questProgress}>
          {done ? "Completed" : ready ? "Finishing…" : progressLabel(quest)}
        </Text>
        <View style={styles.questRewards}>
          <Text style={styles.rewardValue}>+{quest.xp_reward}</Text>
          <Text style={styles.rewardUnit}>XP</Text>
          <Text style={styles.rewardValue}>+{quest.coin_reward}</Text>
          <Text style={styles.rewardUnit}>coins</Text>
        </View>
      </View>
    </CutCornerSurface>
  );
}

/* ------------------------------------------------------------------ *
 * Empty / signed-out states
 * ------------------------------------------------------------------ */

function HubMessage({
  icon: Icon = RouteIcon,
  heading,
  body,
  action,
}: {
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  heading: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.message}>
      <Icon
        size={spacing.spacingXl}
        color={colors.textSecondary}
        strokeWidth={ICON_STROKE}
      />
      <Text style={styles.messageHeading}>{heading}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      {action ? (
        <CutCornerButton
          title={action.label}
          variant="outline"
          size="sm"
          corners="topRight"
          onPress={action.onPress}
          style={styles.messageAction}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export default function DriveHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useAuth();
  const [view, setView] = useState<HubView>("trips");

  const {
    trips,
    cars,
    drivers,
    alerts,
    streak,
    loading,
    refreshing,
    refresh,
  } = useDriveHub();

  const {
    quests,
    loading: questsLoading,
    generating: questsGenerating,
    generateQuests,
  } = useQuests();

  const startTrip = useCallback(() => {
    router.push("/(tabs)/map" as any);
  }, [router]);

  const openFeature = useCallback(
    (feature: Feature) => {
      if (feature.route) router.push(feature.route as any);
      else if (feature.id === "quests") setView("quests");
    },
    [router]
  );

  const tripList = useMemo(
    () =>
      trips.map((trip, i) => (
        <TripCard
          key={trip.id}
          trip={trip}
          code={tripCode(i, trips.length)}
          traceWidth={CARD_INNER_WIDTH}
          showMenu={false}
          onPress={() => router.push(`/trip/${trip.id}` as any)}
        />
      )),
    [trips, router]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + spacing.spacingLg,
            paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.racingRed}
            colors={[colors.racingRed]}
            progressBackgroundColor={colors.carbonSurface}
          />
        }
      >
        {/* Title + primary action */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>DRIVE HUB</Text>
            <Text style={styles.subtitle}>Every drive you have recorded</Text>
          </View>
          <CutCornerButton
            title="New Trip"
            size="sm"
            corners="topRight"
            onPress={startTrip}
          />
        </View>

        <HubStatStrip
          cars={cars}
          drivers={drivers}
          trips={trips.length}
          alerts={alerts}
          streak={streak}
          onPressCars={() => router.push("/select-car" as any)}
          onPressDrivers={() => router.push("/(tabs)/profile" as any)}
          onPressTrips={() => setView("trips")}
          onPressAlerts={() => router.push("/messages" as any)}
        />

        {/* View switch */}
        <View style={styles.viewTabs}>
          {VIEWS.map((tab) => {
            const active = view === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={styles.viewTab}
                onPress={() => setView(tab.key)}
              >
                <Text style={[styles.viewTabLabel, active && styles.viewTabLabelActive]}>
                  {tab.label.toUpperCase()}
                </Text>
                <View
                  style={[styles.viewTabRule, active && styles.viewTabRuleActive]}
                />
              </Pressable>
            );
          })}
        </View>

        {/* ─── TRIPS ─────────────────────────────────────────── */}
        {view === "trips" ? (
          !isAuthenticated ? (
            <HubMessage
              heading="SIGN IN TO SEE YOUR DRIVES"
              body="Your trips, cars and streak live on your account."
              action={{ label: "Sign In", onPress: () => router.replace("/sign-in" as any) }}
            />
          ) : loading && trips.length === 0 ? (
            <ActivityIndicator color={colors.racingRed} style={styles.loader} />
          ) : trips.length === 0 ? (
            // No second button here on purpose: the copy points at the
            // NEW TRIP action already sitting in the header, and two
            // identical buttons in one viewport is a choice the driver
            // should not have to make.
            <HubMessage
              heading="NO TRIPS YET"
              body="Tap New Trip to record your first drive."
            />
          ) : (
            <View style={styles.list}>{tripList}</View>
          )
        ) : null}

        {/* ─── QUESTS ────────────────────────────────────────── */}
        {view === "quests" ? (
          questsLoading && quests.length === 0 ? (
            <ActivityIndicator color={colors.racingRed} style={styles.loader} />
          ) : quests.length === 0 ? (
            <HubMessage
              icon={Target}
              heading="NO QUESTS TODAY"
              body={
                questsGenerating
                  ? "Building today's quests — this takes a moment."
                  : "Generate today's set to start earning XP as you drive."
              }
              action={
                questsGenerating
                  ? undefined
                  : { label: "Generate Quests", onPress: () => generateQuests() }
              }
            />
          ) : (
            <View style={styles.list}>
              {quests.map((quest) => (
                <QuestCard key={quest.id} quest={quest} />
              ))}
            </View>
          )
        ) : null}

        {/* ─── EXPLORE ───────────────────────────────────────── */}
        {view === "explore" ? (
          <View style={styles.grid}>
            {FEATURES.map((feature) => (
              <Pressable
                key={feature.id}
                accessibilityRole="button"
                accessibilityLabel={feature.title}
                style={styles.gridItem}
                onPress={() => openFeature(feature)}
              >
                <CutCornerSurface
                  fill={colors.carbonSurface}
                  borderColor={colors.hairline}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.md}
                  corners="topRight"
                  contentStyle={styles.featureContent}
                >
                  <feature.icon
                    size={spacing.spacingXl}
                    color={colors.textPrimary}
                    strokeWidth={ICON_STROKE}
                  />
                  <View style={styles.featureFooter}>
                    <View style={styles.featureLabels}>
                      <Text style={styles.featureTitle} numberOfLines={1}>
                        {feature.title}
                      </Text>
                      <Text style={styles.featureSubtitle} numberOfLines={1}>
                        {feature.subtitle}
                      </Text>
                    </View>
                    <ChevronRight
                      size={spacing.spacingLg}
                      color={colors.textSecondary}
                      strokeWidth={ICON_STROKE}
                    />
                  </View>
                </CutCornerSurface>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  scrollContent: {
    paddingHorizontal: SCREEN_MARGIN,
    gap: spacing.spacingXl,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.spacingLg,
  },
  headerText: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  title: {
    ...textStyle("displayXl"),
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  // View switch
  viewTabs: {
    flexDirection: "row",
    gap: spacing.spacingXl,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.hairline,
  },
  viewTab: {
    gap: spacing.spacingSm,
  },
  viewTabLabel: {
    // Control labels are sized by the control, as with CutCornerButton.
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  viewTabLabelActive: {
    color: colors.textPrimary,
  },
  viewTabRule: {
    height: borderWidth.emphasis,
    backgroundColor: "transparent",
    marginBottom: -borderWidth.hairline,
  },
  viewTabRuleActive: {
    backgroundColor: colors.racingRed,
  },
  // Lists
  list: {
    gap: spacing.spacingLg,
  },
  loader: {
    marginTop: spacing.spacingXxl,
  },
  // Quest card
  questCard: {
    padding: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  questHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  questTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flex: 1,
  },
  questDesc: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    marginTop: -spacing.spacingSm,
  },
  progressTrack: {
    height: spacing.spacingXs,
    backgroundColor: colors.hairline,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.racingRed,
  },
  questFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.spacingSm,
  },
  questProgress: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flex: 1,
  },
  questRewards: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  rewardValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  rewardUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    marginRight: spacing.spacingSm,
  },
  // Explore grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingLg,
  },
  gridItem: {
    width: (SCREEN_WIDTH - SCREEN_MARGIN * 2 - spacing.spacingLg) / 2,
  },
  featureContent: {
    padding: spacing.spacingLg,
    // 4 × spacingXxl (128) — tall enough for the icon plus two labels.
    height: spacing.spacingXxl * 4,
    justifyContent: "space-between",
  },
  featureFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.spacingSm,
  },
  featureLabels: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  featureTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  featureSubtitle: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  // Empty / signed-out
  message: {
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingVertical: spacing.spacingXxl,
    paddingHorizontal: spacing.spacingLg,
  },
  messageHeading: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  messageBody: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
  },
  messageAction: {
    marginTop: spacing.spacingSm,
  },
});
