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

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import {
  Calendar,
  Car,
  ChevronRight,
  Flag,
  Flame,
  Gauge,
  Handshake,
  Route as RouteIcon,
  Share2,
  Swords,
  Target,
  Users,
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
import ShareCardModal from "@/components/ShareCardModal";
import MainQuestChain from "@/components/MainQuestChain";
import TripCard, { ICON_STROKE } from "@/components/TripCard";
import { tripCode } from "@/lib/tripStats";
import { speedUnitForCountry } from "@/lib/speedUnits";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  spacing,
  textStyle,
} from "@/constants/theme";
import {
  DIFFICULTY_TIERS,
  isComplete,
  progressLabel,
  progressPercent,
  type DailyQuest,
} from "@/lib/questEngine";
import { questSymbolName, ringGeometry, type QuestSymbol } from "@/lib/questRing";

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
 * The lucide component for each name `questSymbolName()` can return. The
 * resolution itself is pure and tested in `lib/questRing.ts`; this map is
 * only the name → component half, which cannot live there without pulling
 * React into a module the tests deliberately keep free of it.
 */
const SYMBOL_COMPONENTS: Record<
  QuestSymbol,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = { Car, Gauge, Route: RouteIcon, Flame, Users, Handshake, Flag };

/** Medallion diameter and the weight of the arc drawn around it. */
const MEDALLION = 64;
const RING_STROKE = 3;

/**
 * The symbol medallion: the quest's own icon inside a ring whose red arc is
 * the same progress the bar below reports, drawn twice because the card is
 * scanned twice — once down the left edge for "what and how far", once
 * across for the detail.
 *
 * SVG, not a rotated View: an arc is the one shape a border cannot make.
 * This is a plain stroked circle with a dash pattern — no `Mask`, no
 * `#RRGGBBAA` fill, so it steers clear of both react-native-svg traps this
 * codebase has hit (`MapPolyline.tsx`'s header is the account).
 */
function QuestMedallion({ symbol, pct }: { symbol: QuestSymbol; pct: number }) {
  const Symbol = SYMBOL_COMPONENTS[symbol];
  const { radius, dash, gap } = ringGeometry(MEDALLION, RING_STROKE, pct);
  const centre = MEDALLION / 2;

  return (
    <View style={styles.medallion}>
      <Svg width={MEDALLION} height={MEDALLION} pointerEvents="none">
        {/* Track first, arc over it — same order as the bar below. */}
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={colors.hairline}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {dash > 0 ? (
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={colors.racingRed}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${gap}`}
            // SVG starts an arc at 3 o'clock; progress reads from 12.
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ) : null}
      </Svg>
      <View style={styles.medallionGlyph} pointerEvents="none">
        <Symbol
          size={spacing.spacingXxl}
          color={colors.textPrimary}
          strokeWidth={ICON_STROKE}
        />
      </View>
    </View>
  );
}

/**
 * Quest cards carry the same shape as trip cards — one cut corner, hairline
 * outline — with the symbol medallion on the left and the readout on the
 * right. The per-quest `accent_color` stored on the template is still
 * ignored; it predates the palette and is where the purple and blue on this
 * screen used to come from.
 *
 * The difficulty badge is the one sanctioned exception to the six-colour
 * palette on this screen, and it takes its green/amber/red from
 * `DIFFICULTY_TIERS` rather than inventing hexes here — the tier colour is
 * already the shared model's, mirrored in SQL. Difficulty is the one thing
 * on the card a driver sorts by at a glance, and three identical grey
 * badges cannot be sorted by at a glance.
 */
function QuestCard({ quest, onShare }: { quest: DailyQuest; onShare?: () => void }) {
  const done = quest.status === "completed";
  const ready = quest.status === "active" && isComplete(quest);
  const pct = done ? 100 : progressPercent(quest);
  const tier = DIFFICULTY_TIERS[quest.difficulty];

  return (
    <CutCornerSurface
      fill={colors.carbonSurface}
      borderColor={colors.hairline}
      borderWidth={borderWidth.hairline}
      cutSize={cut.md}
      corners="topRight"
      contentStyle={styles.questCard}
    >
      {/* Edge marker. Full-height on the straight side, so it never meets
          the cut corner and never has to be mitred to it. */}
      <View style={styles.questEdge} pointerEvents="none" />

      <QuestMedallion symbol={questSymbolName(quest)} pct={pct} />

      <View style={styles.questBody}>
        <View style={styles.questHeader}>
          <Text style={styles.questTitle} numberOfLines={1}>
            {quest.title}
          </Text>
          <CutCornerBadge
            label={quest.difficulty}
            color={tier.color}
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
          {done && onShare ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Share ${quest.title}`}
              onPress={onShare}
              hitSlop={spacing.spacingSm}
              style={styles.questShare}
            >
              <Share2 size={spacing.spacingLg} color={colors.racingRed} strokeWidth={ICON_STROKE} />
              <Text style={styles.questShareText}>SHARE</Text>
            </Pressable>
          ) : (
            <Text style={styles.questProgress} numberOfLines={1}>
              {done ? "Completed" : ready ? "Finishing…" : progressLabel(quest)}
            </Text>
          )}
          <View style={styles.questRewards}>
            <Text style={styles.rewardValue}>
              +{quest.xp_reward.toLocaleString("en-US")}
            </Text>
            <Text style={styles.rewardUnitXp}>XP</Text>
            <View style={styles.rewardDivider} />
            <Text style={styles.rewardValue}>
              +{quest.coin_reward.toLocaleString("en-US")}
            </Text>
            <Text style={styles.rewardUnit}>coins</Text>
          </View>
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
  const { isAuthenticated, user } = useAuth();
  const speedUnit = useMemo(() => speedUnitForCountry(user?.country), [user?.country]);
  // `?view=quests` — how the map's First Mile nudge lands on the right tab,
  // matching the `/community?tab=convoy` convention already in use.
  //
  // `at` is a nonce the caller bumps on every tap. Without it a second tap
  // would do nothing: this tab stays mounted, so `view` would already be
  // whatever the driver last switched it to, and an effect keyed only on
  // `view=quests` sees no change to react to.
  const { view: viewParam, at: viewNonce } = useLocalSearchParams<{
    view?: string;
    at?: string;
  }>();
  const [view, setView] = useState<HubView>(
    viewParam === "quests" || viewParam === "explore" ? (viewParam as HubView) : "trips"
  );

  useEffect(() => {
    if (viewParam === "quests" || viewParam === "explore" || viewParam === "trips") {
      setView(viewParam as HubView);
    }
  }, [viewParam, viewNonce]);
  const [shareQuest, setShareQuest] = useState<DailyQuest | null>(null);

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
          speedUnit={speedUnit}
        />
      )),
    [trips, router, speedUnit]
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
              action={{ label: "Sign In", onPress: () => router.push("/login" as any) }}
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
        {/* The First Mile chain sits ABOVE the daily set, and renders
            nothing at all once it is finished. A driver on their first day
            has no idea what a daily quest is worth yet; the guided chain is
            what tells them. See components/MainQuestChain.tsx. */}
        {view === "quests" ? <MainQuestChain /> : null}

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
                <QuestCard
                  key={quest.id}
                  quest={quest}
                  onShare={() => setShareQuest(quest)}
                />
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

      {shareQuest ? (
        <ShareCardModal
          visible={!!shareQuest}
          onClose={() => setShareQuest(null)}
          type="quest"
          payload={{
            title: shareQuest.title,
            difficulty: shareQuest.difficulty,
            xpReward: shareQuest.xp_reward,
            coinReward: shareQuest.coin_reward,
          }}
          caption={`Quest complete: ${shareQuest.title} on Driveverse`}
        />
      ) : null}
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
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.spacingLg,
    paddingLeft: spacing.spacingLg + spacing.spacingXs,
    gap: spacing.spacingLg,
  },
  questEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: borderWidth.emphasis,
    backgroundColor: colors.racingRed,
  },
  medallion: {
    width: MEDALLION,
    height: MEDALLION,
    alignItems: "center",
    justifyContent: "center",
  },
  medallionGlyph: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  questBody: {
    flex: 1,
    gap: spacing.spacingSm,
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
  questShare: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  questShareText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.racingRed,
  },
  questRewards: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
  },
  rewardValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  rewardUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  /** XP is the quest's headline reward, so its unit carries the accent. */
  rewardUnitXp: {
    ...textStyle("caption"),
    color: colors.racingRed,
  },
  rewardDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    marginVertical: spacing.spacingXs,
    marginHorizontal: spacing.spacingXs,
    backgroundColor: colors.hairline,
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
