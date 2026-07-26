/**
 * Driveverse — ShareableCard.
 *
 * ONE component, three variants (`trip` | `rank` | `quest`), sharing a single
 * frame, branding corner and export geometry. This is the thing
 * `react-native-view-shot` snapshots into the 1080×1920 image a user posts to
 * their Story — so it is designed like a Strava run map or a Wordle grid: a
 * real stat/achievement, cleanly presented, with our branding present but not
 * shouting. Not a "share button" ad.
 *
 * GEOMETRY
 *   The card lays out at a fixed {@link CARD_WIDTH}×{@link CARD_HEIGHT} (a 9:16
 *   design canvas). view-shot rescales the snapshot to 1080×1920 on capture
 *   (see `lib/shareCard.ts`), so every device exports an identical Story-sized
 *   image. The preview modal renders this same card scaled down — what you see
 *   is exactly what gets posted.
 *
 * TOKENS
 *   Everything comes from `constants/theme.ts` and the shared components
 *   (CutCorner, RoutePreview, RankBadge). Red budget matches the rest of the
 *   app: the route trace / one accent element carries racingRed, not every
 *   number. voidBlack canvas, hairline separation, Rajdhani display, Inter
 *   body, JetBrains Mono for every measurement.
 *
 * The component is a `forwardRef` — the modal attaches the capture ref to the
 * outermost frame.
 */

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import { CutCornerBadge, CutCornerSurface } from "@/components/CutCorner";
import RoutePreview from "@/components/RoutePreview";
import RankBadge from "@/components/RankBadge";
import type { Trip } from "@/components/TripCard";
import { tripTitle } from "@/components/TripCard";
import type { Rank } from "@/constants/ranks";
import { rankLevelLabel } from "@/constants/ranks";
import type { QuestDifficulty } from "@/lib/questEngine";
import { DIFFICULTY_TIERS } from "@/lib/questEngine";
import {
  driveScore,
  formatDistance,
  formatDuration,
  formatSpeed,
} from "@/lib/tripStats";
import { decodePolyline } from "@/lib/polyline";
import { PlatinumBadge } from "@/components/platinum/PlatinumBadge";
import { platinum } from "@/constants/platinum";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  spacing,
} from "@/constants/theme";

/* ------------------------------------------------------------------ *
 * Export geometry
 * ------------------------------------------------------------------ */

/** Design canvas. 9:16, rescaled to 1080×1920 PNG on capture. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;

const FRAME_PADDING = spacing.spacingXl;
const CONTENT_WIDTH = CARD_WIDTH - FRAME_PADDING * 2;

/* ------------------------------------------------------------------ *
 * Payloads
 * ------------------------------------------------------------------ */

export interface TripSharePayload {
  trip: Trip;
}

export interface RankSharePayload {
  rank: Rank;
  level: number;
  totalXp: number;
}

export interface QuestSharePayload {
  title: string;
  difficulty: QuestDifficulty;
  xpReward: number;
  coinReward?: number;
}

/**
 * A Platinum AI showcase render, framed for sharing.
 *
 * The image is the whole point here, so this variant is the one that gives
 * its art the full canvas — everything else on the card is a caption. The
 * Platinum badge is the only status mark; the card does not also stamp a rank
 * on it, because two badges on one image is where a share card starts to look
 * like an ad.
 */
export interface ShowcaseSharePayload {
  /** Remote URL of the generated render. */
  imageUrl: string;
  carName: string;
  /** "Studio" / "Night" / "Track" — the look that was generated. */
  styleLabel: string;
  /** Optional spec line under the name, e.g. "BMW · 2019 · 340 HP". */
  specLine?: string;
}

export type ShareCardType = "trip" | "rank" | "quest" | "showcase";

export type ShareableCardProps =
  | { type: "trip"; payload: TripSharePayload }
  | { type: "rank"; payload: RankSharePayload }
  | { type: "quest"; payload: QuestSharePayload }
  | { type: "showcase"; payload: ShowcaseSharePayload };

/* ------------------------------------------------------------------ *
 * Shared frame pieces
 * ------------------------------------------------------------------ */

/**
 * A faint telemetry grid behind the content, the same visual idea as the
 * trip-card trace frame. Low enough opacity to read as texture, never as a
 * competing element.
 */
function GridBackdrop() {
  const step = spacing.spacingXxl; // 32
  const verticals = [];
  for (let x = step; x < CARD_WIDTH; x += step) {
    verticals.push(
      <Line
        key={`v${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={CARD_HEIGHT}
        stroke={colors.hairline}
        strokeWidth={0.5}
      />
    );
  }
  const horizontals = [];
  for (let y = step; y < CARD_HEIGHT; y += step) {
    horizontals.push(
      <Line
        key={`h${y}`}
        x1={0}
        y1={y}
        x2={CARD_WIDTH}
        y2={y}
        stroke={colors.hairline}
        strokeWidth={0.5}
      />
    );
  }
  return (
    <Svg
      width={CARD_WIDTH}
      height={CARD_HEIGHT}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {verticals}
      {horizontals}
    </Svg>
  );
}

/**
 * The branding mark. Bottom of the card, subtle — logo glyph + wordmark in
 * Rajdhani, textSecondary. Present, not a banner: this is the one place the
 * card admits where it came from.
 */
function BrandCorner() {
  return (
    <View style={styles.brand}>
      <Image
        source={require("@/assets/images/driverse-logo.png")}
        style={styles.brandLogo}
        resizeMode="contain"
      />
      <Text style={styles.brandWordmark}>DRIVEVERSE</Text>
    </View>
  );
}

/** Small uppercased eyebrow above a variant's headline. */
function Overline({ label, color = colors.textSecondary }: { label: string; color?: string }) {
  return <Text style={[styles.overline, { color }]}>{label}</Text>;
}

/* ------------------------------------------------------------------ *
 * A single big readout: mono value + Inter unit + Inter caption label.
 * ------------------------------------------------------------------ */

function BigStat({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.bigStat}>
      <View style={styles.bigStatValueRow}>
        <Text style={[styles.bigStatValue, accent && { color: colors.racingRed }]}>
          {value}
        </Text>
        {unit ? <Text style={styles.bigStatUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Variant: Trip
 * ------------------------------------------------------------------ */

function TripVariant({ trip }: TripSharePayload) {
  const distance = formatDistance(trip.distance_km);
  const duration = formatDuration(trip.duration_seconds);
  const speed = formatSpeed(trip.avg_speed_kmh);
  const score = driveScore(trip);

  // A very short / instant trip may have no recorded trace — fall back to a
  // stat-only layout rather than a broken empty map box.
  const hasRoute =
    !!trip.route_polyline && decodePolyline(trip.route_polyline).length > 1;

  return (
    <View style={styles.variant}>
      <View style={styles.tripHeader}>
        <Overline label="TRIP LOGGED" />
        <Text style={styles.tripTitle} numberOfLines={1}>
          {tripTitle(trip)}
        </Text>
        <View style={styles.legs}>
          <Text style={styles.legLabel} numberOfLines={1}>
            {trip.origin_name || "Start"}
          </Text>
          <Text style={styles.legArrow}>→</Text>
          <Text style={styles.legLabel} numberOfLines={1}>
            {trip.destination_name || "Finish"}
          </Text>
        </View>
      </View>

      {hasRoute ? (
        <View style={styles.mapWrap}>
          <RoutePreview
            polyline={trip.route_polyline as string}
            width={CONTENT_WIDTH}
            height={220}
            color={colors.racingRed}
            strokeWidth={4}
          />
        </View>
      ) : (
        // Stat-only fallback: a single dominant distance readout stands in for
        // the map, so the card still has a centre of gravity.
        <View style={styles.noRoute}>
          <Text style={styles.noRouteValue}>{distance.value}</Text>
          <Text style={styles.noRouteUnit}>{distance.unit.toUpperCase()}</Text>
        </View>
      )}

      {/* Readouts — the visual centrepiece, all JetBrains Mono. */}
      <View style={styles.statGrid}>
        {hasRoute ? (
          <BigStat label="DISTANCE" value={distance.value} unit={distance.unit} />
        ) : null}
        <BigStat label="TIME" value={duration.value} unit={duration.unit} />
        <BigStat label="AVG SPEED" value={speed.value} unit={speed.unit} />
        <BigStat label="SCORE" value={String(score)} accent={score >= 90} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Variant: Rank-up / Milestone
 * ------------------------------------------------------------------ */

function RankVariant({ rank, level, totalXp }: RankSharePayload) {
  return (
    <View style={[styles.variant, styles.centeredVariant]}>
      <Overline label="RANK UNLOCKED" color={rank.color} />
      <RankBadge rank={rank} size={200} glow />
      <Text style={styles.rankReached}>Reached {rank.name}</Text>

      <View style={styles.rankStatsRow}>
        <BigStat label="LEVEL" value={String(level)} />
        <View style={styles.statDivider} />
        <BigStat label="TOTAL XP" value={formatXp(totalXp)} />
      </View>

      <CutCornerBadge
        label={rankLevelLabel(rank)}
        color={colors.hairline}
        textColor={colors.textSecondary}
        numeric
        corners="topRight"
        style={styles.rankBandBadge}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Variant: Quest completion (lightweight — these fire often)
 * ------------------------------------------------------------------ */

function QuestVariant({ title, difficulty, xpReward, coinReward }: QuestSharePayload) {
  const tier = DIFFICULTY_TIERS[difficulty];
  return (
    <View style={[styles.variant, styles.centeredVariant]}>
      <Overline label="QUEST COMPLETE" />
      <CutCornerBadge
        label={tier.label}
        color={colors.textSecondary}
        corners="topRight"
        style={styles.questTierBadge}
      />
      <Text style={styles.questTitle}>{title}</Text>

      <View style={styles.rankStatsRow}>
        <BigStat label="XP EARNED" value={`+${xpReward}`} accent />
        {coinReward != null ? (
          <>
            <View style={styles.statDivider} />
            <BigStat label="COINS" value={`+${coinReward}`} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Variant: Showcase (Platinum)
 * ------------------------------------------------------------------ */

function ShowcaseVariant({
  imageUrl,
  carName,
  styleLabel,
  specLine,
}: ShowcaseSharePayload) {
  return (
    <View style={styles.variant}>
      <View style={styles.showcaseHeader}>
        <Overline label="AI SHOWCASE" color={platinum.chrome} />
        <PlatinumBadge size={spacing.spacingXl} />
      </View>

      {/* The render gets the canvas. Cut corner on the frame so the art
          carries the brand shape without a border competing with it. */}
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={alpha(platinum.chrome, 0.35)}
        borderWidth={borderWidth.hairline}
        cutSize={cut.lg}
        corners="topRight"
        style={styles.showcaseFrame}
        contentStyle={styles.showcaseFrameContent}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.showcaseImage}
          resizeMode="cover"
        />
      </CutCornerSurface>

      <View style={styles.showcaseCaption}>
        <Text style={styles.showcaseCarName} numberOfLines={1}>
          {carName}
        </Text>
        {specLine ? (
          <Text style={styles.showcaseSpec} numberOfLines={1}>
            {specLine}
          </Text>
        ) : null}
        <Text style={styles.showcaseStyle}>{styleLabel.toUpperCase()}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * ShareableCard
 * ------------------------------------------------------------------ */

export const ShareableCard = React.forwardRef<View, ShareableCardProps>(
  function ShareableCard(props, ref) {
    return (
      <View ref={ref} style={styles.frame} collapsable={false}>
        <GridBackdrop />

        {/* A single cut-corner accent panel gives the whole card the brand
            shape without boxing every element. */}
        <View style={styles.frameInner}>
          {props.type === "trip" ? <TripVariant {...props.payload} /> : null}
          {props.type === "rank" ? <RankVariant {...props.payload} /> : null}
          {props.type === "quest" ? <QuestVariant {...props.payload} /> : null}
          {props.type === "showcase" ? <ShowcaseVariant {...props.payload} /> : null}
        </View>

        <BrandCorner />

        {/* Corner tick marks — a telemetry framing detail, drawn as short
            racingRed hairlines at the top-right cut. */}
        <View style={styles.cornerAccent} pointerEvents="none">
          <CutCornerSurface
            fill="transparent"
            borderColor={alpha(colors.racingRed, 0.5)}
            borderWidth={borderWidth.hairline}
            cutSize={cut.lg}
            corners="topRight"
            style={styles.cornerAccentSurface}
            contentStyle={styles.cornerAccentContent}
          />
        </View>
      </View>
    );
  }
);

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Compact XP for the card: 12500 → "12.5K", 1_200_000 → "1.2M". */
function formatXp(xp: number): string {
  const n = Math.max(0, Math.floor(xp || 0));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default ShareableCard;

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  frame: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: colors.voidBlack,
    overflow: "hidden",
  },
  frameInner: {
    flex: 1,
    paddingHorizontal: FRAME_PADDING,
    paddingTop: spacing.spacingXxxl,
    // Extra bottom room so content never collides with the brand mark.
    paddingBottom: spacing.spacingXxxl + spacing.spacingXl,
  },
  cornerAccent: {
    position: "absolute",
    top: spacing.spacingLg,
    right: spacing.spacingLg,
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
  },
  cornerAccentSurface: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
  },
  cornerAccentContent: {
    flex: 1,
  },

  // Variants
  variant: {
    flex: 1,
    gap: spacing.spacingXl,
  },
  centeredVariant: {
    alignItems: "center",
    justifyContent: "center",
  },

  overline: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.textSecondary,
  },

  // Showcase (Platinum)
  showcaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  showcaseFrame: {
    width: "100%",
    // 4:3, the aspect the generator returns. Fixed so the caption below it
    // lands in the same place on every card.
    aspectRatio: 4 / 3,
  },
  showcaseFrameContent: {
    flex: 1,
  },
  showcaseImage: {
    flex: 1,
    width: "100%",
  },
  showcaseCaption: {
    gap: spacing.spacingXs,
  },
  showcaseCarName: {
    fontFamily: fontFamily.displayBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  showcaseSpec: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 13,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
  showcaseStyle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    letterSpacing: 2,
    color: platinum.chrome,
  },

  // Trip
  tripHeader: {
    gap: spacing.spacingSm,
  },
  tripTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  legs: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  legLabel: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  legArrow: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 13,
    color: colors.racingRed,
  },
  mapWrap: {
    alignItems: "center",
  },
  noRoute: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXs,
  },
  noRouteValue: {
    fontFamily: fontFamily.dataBold,
    fontSize: 96,
    lineHeight: 100,
    letterSpacing: -2,
    color: colors.textPrimary,
  },
  noRouteUnit: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 16,
    letterSpacing: 4,
    color: colors.textSecondary,
  },

  // Stat grid (trip)
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.spacingLg,
  },
  bigStat: {
    width: "50%",
    gap: spacing.spacingXs,
  },
  bigStatValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  bigStatValue: {
    fontFamily: fontFamily.dataBold,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
  bigStatUnit: {
    fontFamily: fontFamily.bodyRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  bigStatLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },

  // Rank
  rankReached: {
    fontFamily: fontFamily.displayBold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: 0.4,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: spacing.spacingSm,
  },
  rankStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXl,
    marginTop: spacing.spacingMd,
  },
  statDivider: {
    width: borderWidth.hairline,
    height: spacing.spacingXl,
    backgroundColor: colors.hairline,
  },
  rankBandBadge: {
    marginTop: spacing.spacingLg,
  },

  // Quest
  questTierBadge: {
    marginTop: spacing.spacingSm,
  },
  questTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: 0.4,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
  },

  // Brand
  brand: {
    position: "absolute",
    left: FRAME_PADDING,
    bottom: spacing.spacingXl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    opacity: 0.9,
  },
  brandLogo: {
    width: spacing.spacingLg,
    height: spacing.spacingLg,
  },
  brandWordmark: {
    fontFamily: fontFamily.displayBold,
    fontSize: 13,
    letterSpacing: 3,
    color: colors.textSecondary,
  },
});
