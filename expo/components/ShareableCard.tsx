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
import DriverseLogo from "@/components/DriverseLogo";
import SpeedTrace, { SpeedLegend } from "@/components/SpeedTrace";
import RankBadge from "@/components/RankBadge";
import type { Trip } from "@/components/TripCard";
import { endpointLabels, shareTripTitle } from "@/lib/tripEndpoints";
import type { Rank } from "@/constants/ranks";
import { rankLevelLabel } from "@/constants/ranks";
import type { QuestDifficulty } from "@/lib/questEngine";
import { DIFFICULTY_TIERS } from "@/lib/questEngine";
import {
  driveScore,
  formatDistance,
  formatDuration,
  formatShareStamp,
  formatSpeed,
} from "@/lib/tripStats";
import { decodePolyline } from "@/lib/polyline";
import { speedDomain, speedProfileForTrip } from "@/lib/speedTrace";
import { speedUnitForCountry } from "@/lib/speedUnits";
import { useAuth } from "@/hooks/useAuthStore";
import { PlatinumBadge } from "@/components/platinum/PlatinumBadge";
import { platinum } from "@/constants/platinum";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  onRacingRed,
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

/**
 * How the drive's route is drawn — the driver's choice, made in the share
 * sheet before posting.
 *
 *   `map`    a still of the real map (Mapbox tiles on the native map surface),
 *            produced by `components/TripMapSnapshot.tsx`, with the speed
 *            heatmap drawn over it. The default when a map can be produced.
 *   `trace`  the route shape alone on the card's own black, no tiles. Faster,
 *            and the honest choice for a driver who does not want to publish a
 *            legible map of where they live.
 *   `hidden` no route at all — a stats-only card. Same reason, taken further.
 */
export type TripRouteStyle = "map" | "trace" | "hidden";

/**
 * The car a drive was recorded in, flattened to what the card draws. A subset
 * of `GarageCar` on purpose: the card should not be able to render a field
 * that the garage adds later without someone deciding it belongs here.
 */
export interface ShareTripCar {
  name: string;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  /** Hex, from the garage. Used for the swatch when there is no photo. */
  color?: string | null;
  hp?: number | null;
  photo_url?: string | null;
}

export interface TripSharePayload {
  trip: Trip;
  /** The car this drive was logged with, when one is known. */
  car?: ShareTripCar | null;
  /** Show the car strip. Ignored when `car` is absent. Default: true. */
  showCar?: boolean;
  /** Default: `map`. */
  routeStyle?: TripRouteStyle;
  /** Colour the route by speed rather than flat red. Default: true. */
  speedHeat?: boolean;
  /**
   * A map still from `TripMapSnapshot`. Until it arrives (or if it never
   * does) a `map` card draws the SVG trace instead, so the block is never
   * empty and never pops from blank to image.
   */
  mapImageUri?: string | null;
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
 * The branding mark. Bottom of the card, subtle. Present, not a banner:
 * this is the one place the card admits where it came from.
 *
 * It draws {@link DriverseLogo}, the vector lockup, rather than the splash
 * PNG it used to scale into a 16pt box — that asset is a photograph with the
 * logo glowing on top of it, so at this size it rendered as a grey smudge
 * beside a hand-typed (and misspelled) wordmark. The mark is the only red on
 * the card besides the route trace, and the wordmark stays textSecondary so
 * the branding never outweighs the drive.
 */
function BrandCorner() {
  return (
    <DriverseLogo
      size={spacing.spacingLg}
      markColor={colors.racingRed}
      wordmarkColor={colors.textSecondary}
      style={styles.brand}
    />
  );
}

/** Small uppercased eyebrow above a variant's headline. */
function Overline({ label, color = colors.textSecondary }: { label: string; color?: string }) {
  return <Text style={[styles.overline, { color }]}>{label}</Text>;
}

/* ------------------------------------------------------------------ *
 * A single big readout: mono value + Inter unit + Inter caption label.
 * ------------------------------------------------------------------ */

/**
 * Sized to its content, not to a fraction of the row: the rank and quest rows
 * are centred, and two fixed 50% halves plus the divider and its gaps overflow
 * the row and push the left stat's label off the card edge.
 */
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
        <Text
          style={[styles.bigStatValue, accent && { color: colors.racingRed }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
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

/**
 * Height of the route block, in the two layouts that exist.
 *
 * Fixed rather than flexed, because the trace is an SVG that has to be told
 * its size and the map still is captured at a known aspect. Two values, not
 * one: dropping the car strip frees 60pt, and a card that leaves that as a
 * hole above the brand mark looks like a layout bug rather than a choice.
 */
const ROUTE_HEIGHT_WITH_CAR = 200;
export const ROUTE_HEIGHT_NO_CAR = 244;

/**
 * Size the map still should be captured at: the block's exact width, and its
 * taller height. One capture serves both layouts — the shorter one crops it
 * vertically (`resizeMode="cover"`), which is invisible, where re-capturing on
 * every car toggle would be a second and a half of blank map.
 */
export const MAP_SNAPSHOT_WIDTH = CONTENT_WIDTH;
export const MAP_SNAPSHOT_HEIGHT = ROUTE_HEIGHT_NO_CAR;

/**
 * A compact mono readout in the stat row under the hero. Three of these fit
 * across the card with hairline dividers between them.
 */
function SmallStat({
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
    <View style={styles.smallStat}>
      <Text style={styles.smallStatLabel}>{label}</Text>
      <View style={styles.smallStatValueRow}>
        <Text
          style={[styles.smallStatValue, accent && { color: colors.racingRed }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {value}
        </Text>
        {unit ? <Text style={styles.smallStatUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The car the drive was logged in, as one strip along the bottom of the card.
 *
 * A photo where the garage has one, a colour swatch where it does not — never
 * a placeholder car icon, which is the single most template-looking element a
 * card like this can carry. The spec line is assembled from whatever the
 * garage actually knows, so a car entered as just a name renders as just a
 * name rather than as "Custom · 2024 · 300 hp" boilerplate.
 */
function CarStrip({ car }: { car: ShareTripCar }) {
  const specs = [
    [car.make, car.model].filter(Boolean).join(" ").trim(),
    car.year ? String(car.year).trim() : "",
    car.hp && car.hp > 0 ? `${Math.round(car.hp)} HP` : "",
  ].filter((part) => part.length > 0 && part.toLowerCase() !== "custom");

  return (
    <View style={styles.carStrip}>
      {car.photo_url ? (
        <Image source={{ uri: car.photo_url }} style={styles.carPhoto} resizeMode="cover" />
      ) : (
        <View
          style={[
            styles.carSwatch,
            { backgroundColor: car.color || colors.carbonSurface },
          ]}
        />
      )}
      <View style={styles.carLabels}>
        <Text style={styles.carLabel}>DRIVEN IN</Text>
        <Text style={styles.carName} numberOfLines={1}>
          {car.name}
        </Text>
      </View>
      {specs.length > 0 ? (
        <Text style={styles.carSpec} numberOfLines={1}>
          {specs.join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

function TripVariant({
  trip,
  car,
  showCar = true,
  routeStyle = "map",
  speedHeat = true,
  mapImageUri,
}: TripSharePayload) {
  // The card always represents the signed-in driver's own trip, so their own
  // regional unit is also the only one available here — the payload carries
  // no driver identity to look a different one up from. See lib/speedUnits.ts.
  const { user } = useAuth();
  const speedUnit = speedUnitForCountry(user?.country);
  const distance = formatDistance(trip.distance_km);
  const duration = formatDuration(trip.duration_seconds);
  const avg = formatSpeed(trip.avg_speed_kmh, speedUnit);
  const top = formatSpeed(trip.top_speed_kmh ?? 0, speedUnit);
  const score = driveScore(trip);
  const stamp = formatShareStamp(trip.completed_at);

  const points = React.useMemo(
    () => (trip.route_polyline ? decodePolyline(trip.route_polyline) : []),
    [trip.route_polyline]
  );
  const profile = React.useMemo(
    () => speedProfileForTrip(trip, points),
    [trip, points]
  );
  const domain = React.useMemo(
    () => speedDomain(profile.speeds),
    [profile.speeds]
  );

  // A very short / instant drive may have no recorded trace. It cannot show a
  // route whatever the driver picked, and saying so is better than framing an
  // empty box.
  const hasRoute = points.length > 1;
  const showRoute = hasRoute && routeStyle !== "hidden";
  // Heat needs a profile to be about anything; a flat line is what an
  // untimed, unscaled drive honestly is.
  const heat = speedHeat && profile.source !== "none";

  // Where the drive actually started and ended, resolved by the map when it
  // recorded the trip. `lib/tripEndpoints` is what stops the field names
  // ("Current Location", "Dropped Pin", "Unknown") reaching the card — an
  // unnamed leg reads Point A → Point B instead.
  const legs = endpointLabels(trip);
  const showCarStrip = !!car && showCar;
  const routeHeight = showCarStrip ? ROUTE_HEIGHT_WITH_CAR : ROUTE_HEIGHT_NO_CAR;

  return (
    <View style={[styles.variant, styles.tripVariant]}>
      <View style={styles.tripHeader}>
        <View style={styles.tripEyebrow}>
          <Overline label="TRIP LOGGED" />
          {stamp ? <Text style={styles.stamp}>{stamp}</Text> : null}
        </View>
        <Text style={styles.tripTitle} numberOfLines={1}>
          {shareTripTitle(trip)}
        </Text>
        <View style={styles.legs}>
          <Text style={styles.legLabel} numberOfLines={1}>
            {legs.origin}
          </Text>
          <Text style={styles.legArrow}>→</Text>
          <Text style={styles.legLabel} numberOfLines={1}>
            {legs.destination}
          </Text>
        </View>
      </View>

      {showRoute ? (
        <View style={styles.routeBlock}>
          <CutCornerSurface
            fill={colors.voidBlack}
            borderColor={colors.hairline}
            borderWidth={borderWidth.hairline}
            cutSize={cut.lg}
            corners="topRight"
            style={[styles.routeFrame, { height: routeHeight }]}
            contentStyle={styles.routeFrameContent}
          >
            {routeStyle === "map" && mapImageUri ? (
              <Image
                source={{ uri: mapImageUri }}
                style={styles.mapImage}
                resizeMode="cover"
              />
            ) : (
              <SpeedTrace
                points={points}
                speeds={profile.speeds}
                domain={domain}
                width={CONTENT_WIDTH}
                height={routeHeight}
                strokeWidth={4}
                flat={!heat}
              />
            )}
          </CutCornerSurface>
          {heat ? (
            <SpeedLegend topSpeedKmh={domain.max} width={CONTENT_WIDTH} unit={speedUnit} />
          ) : null}
        </View>
      ) : null}

      {/* Hero: distance dominates, the score sits beside it as a mark rather
          than as a fourth equal number. With the route hidden it grows to fill
          the space the map would have taken — a stats-only card wants a centre
          of gravity, not a gap. */}
      <View style={[styles.heroRow, !showRoute && styles.heroRowTall]}>
        <View style={styles.hero}>
          <View style={styles.heroValueRow}>
            <Text
              style={[styles.heroValue, !showRoute && styles.heroValueTall]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {distance.value}
            </Text>
            <Text style={styles.heroUnit}>{distance.unit}</Text>
          </View>
          <Text style={styles.heroLabel}>DISTANCE</Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreLabel}>SCORE</Text>
          <CutCornerBadge
            label={String(score)}
            numeric
            solid={score >= 90}
            color={score >= 90 ? colors.racingRed : colors.hairline}
            textColor={score >= 90 ? onRacingRed : colors.textPrimary}
            corners="topRight"
          />
        </View>
      </View>

      {/* Time, average and — the one the drive is actually bragging about —
          top speed. Always three columns, so the row never reflows. */}
      <View style={styles.statRow}>
        <SmallStat label="TIME" value={duration.value} unit={duration.unit} />
        <View style={styles.statColDivider} />
        <SmallStat label="AVG" value={avg.value} unit={avg.unit} />
        <View style={styles.statColDivider} />
        <SmallStat label="TOP" value={top.value} unit={top.unit} accent />
      </View>

      {showCarStrip ? <CarStrip car={car as ShareTripCar} /> : null}
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
    paddingTop: spacing.spacingXxl,
    // Room for the brand mark, which is absolutely positioned over this.
    paddingBottom: spacing.spacingXxxl,
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
  /**
   * The trip card carries five blocks (header, route, hero, stats, car) where
   * the others carry three, so it takes the tighter gap. Every combination of
   * the route/car toggles has been sized against `CARD_HEIGHT` at this value —
   * widen it and the fullest card (map + car) overflows the frame.
   */
  tripVariant: {
    gap: spacing.spacingLg,
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

  // Trip — header
  tripHeader: {
    gap: spacing.spacingSm,
  },
  tripEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /** The drive's own date. Mono, so it reads as a record, not a caption. */
  stamp: {
    fontFamily: fontFamily.dataRegular,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.textSecondary,
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

  // Trip — route block
  routeBlock: {
    gap: spacing.spacingSm,
  },
  routeFrame: {
    width: CONTENT_WIDTH,
  },
  routeFrameContent: {
    flex: 1,
    overflow: "hidden",
  },
  mapImage: {
    flex: 1,
    width: "100%",
  },

  // Trip — hero readout
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  heroRowTall: {
    flex: 1,
    alignItems: "center",
  },
  heroValueTall: {
    fontSize: 88,
    lineHeight: 92,
    letterSpacing: -4,
  },
  hero: {
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.spacingXs,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  heroValue: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: fontFamily.dataBold,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -2,
    color: colors.textPrimary,
  },
  heroUnit: {
    flexShrink: 0,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 15,
    color: colors.textSecondary,
  },
  heroLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textSecondary,
  },
  scoreBlock: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.spacingXs,
    paddingBottom: spacing.spacingXs,
  },
  scoreLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.textSecondary,
  },

  // Trip — secondary stat row
  statRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  statColDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    marginHorizontal: spacing.spacingMd,
    backgroundColor: colors.hairline,
  },
  smallStat: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  smallStatLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
  smallStatValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  smallStatValue: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: fontFamily.dataBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  smallStatUnit: {
    flexShrink: 0,
    fontFamily: fontFamily.bodyRegular,
    fontSize: 11,
    color: colors.textSecondary,
  },

  // Trip — car strip
  carStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  carPhoto: {
    width: spacing.spacingXxl + spacing.spacingSm,
    height: spacing.spacingXl + spacing.spacingXs,
    backgroundColor: colors.carbonSurface,
  },
  carSwatch: {
    width: spacing.spacingXxl + spacing.spacingSm,
    height: spacing.spacingXl + spacing.spacingXs,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  carLabels: {
    flex: 1,
    gap: 2,
  },
  carLabel: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.textSecondary,
  },
  carName: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  carSpec: {
    fontFamily: fontFamily.dataRegular,
    fontSize: 10,
    letterSpacing: 0,
    color: colors.textSecondary,
    flexShrink: 1,
  },

  // Big stat (rank / quest rows)
  bigStat: {
    gap: spacing.spacingXs,
  },
  bigStatValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  bigStatValue: {
    flexShrink: 1,
    minWidth: 0,
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

  // Brand — position only. The lockup owns its own layout, so setting
  // flexDirection/gap here would fight DriverseLogo's proportional spacing.
  brand: {
    position: "absolute",
    left: FRAME_PADDING,
    bottom: spacing.spacingXl,
    opacity: 0.9,
  },
});
