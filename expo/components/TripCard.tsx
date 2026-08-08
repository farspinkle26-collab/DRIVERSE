/**
 * Driveverse — trip card. The reference implementation for the token
 * system; other list cards should copy its structure.
 *
 * Anatomy, top to bottom:
 *   header    route code badge (racingRed, outlined) + trip title (Rajdhani)
 *   meta      absolute timestamp + privacy state (Inter/caption, secondary)
 *   route     origin and destination labels (Inter/caption, secondary)
 *   trace     the recorded line, which draws itself in on mount
 *   readouts  distance as the hero (dataLg), then time / avg / XP (dataSm),
 *             with the score badge as the one qualitative mark
 *
 * Red budget: two elements per card — the route code badge and the route
 * trace. The score badge joins them only at `SCORE_STANDOUT` and above, so
 * a standout drive is visible while scrolling. Everything else is
 * textPrimary or textSecondary.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Lock, MoreVertical } from "lucide-react-native";
import { CutCornerBadge, CutCornerPressable } from "@/components/CutCorner";
import RouteLine from "@/components/RouteLine";
import {
  borderWidth,
  colors,
  cut,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import {
  driveScore,
  formatDistance,
  formatDuration,
  formatSpeed,
  formatTripTimestamp,
  SCORE_STANDOUT,
} from "@/lib/tripStats";
import type { SpeedUnit } from "@/lib/speedUnits";

/** Every icon on the Drive Hub is drawn at this weight. See ICON_STROKE. */
export const ICON_STROKE = 1.5;

export interface Trip {
  id: string;
  name?: string | null;
  origin_name?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_name?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  route_polyline?: string | null;
  /**
   * One whole km/h reading per point of `route_polyline`, comma-separated —
   * what the speed heatmap on the share card is drawn from. Written by the
   * recorder; absent on every drive logged before
   * `database_migration_trip_speed_profile.sql`, which `lib/speedTrace.ts`
   * handles by deriving a profile from the geometry instead.
   */
  speed_profile?: string | null;
  /** The garage car this drive was recorded in, if one was selected. */
  car_id?: string | null;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh?: number | null;
  estimated_duration_seconds?: number | null;
  xp_earned?: number | null;
  completed_at: string;
  is_public?: boolean | null;
}

export function tripTitle(trip: Trip): string {
  if (trip.name?.trim()) return trip.name.trim();
  if (trip.destination_name && trip.destination_name !== "Unknown") {
    return trip.destination_name;
  }
  if (trip.origin_name) return trip.origin_name;
  return "Unnamed drive";
}

interface StatProps {
  label: string;
  value: string;
  unit?: string;
}

/** Secondary readout: mono value, Inter label. */
function Stat({ label, value, unit }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

export interface TripCardProps {
  trip: Trip;
  /** Card position in the list, newest first — drives the route code. */
  code: string;
  /** Width available for the trace, i.e. card width minus its padding. */
  traceWidth: number;
  showMenu?: boolean;
  onPress?: () => void;
  onMenuPress?: () => void;
  /** The viewer's own regional unit (`speedUnitForCountry`). Defaults to km/h. */
  speedUnit?: SpeedUnit;
}

export function TripCard({
  trip,
  code,
  traceWidth,
  showMenu = false,
  onPress,
  onMenuPress,
  speedUnit = "kmh",
}: TripCardProps) {
  const [pressed, setPressed] = React.useState(false);

  const distance = formatDistance(trip.distance_km);
  const time = formatDuration(trip.duration_seconds);
  const speed = formatSpeed(trip.avg_speed_kmh, speedUnit);
  const score = driveScore(trip);
  const standout = score >= SCORE_STANDOUT;

  return (
    <CutCornerPressable
      testID="trip-card"
      accessibilityRole="button"
      accessibilityLabel={`Trip ${code}, ${tripTitle(trip)}, ${distance.value} kilometres, score ${score}`}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      fill={pressed ? colors.hairline : colors.carbonSurface}
      borderColor={colors.hairline}
      borderWidth={borderWidth.hairline}
      cutSize={cut.md}
      corners="topRight"
      padding={0}
      contentStyle={styles.card}
    >
      {/* Header */}
      <View style={styles.header}>
        <CutCornerBadge label={code} numeric corners="topRight" />
        <Text style={styles.title} numberOfLines={1}>
          {tripTitle(trip)}
        </Text>
        {trip.is_public === false ? (
          <Lock size={12} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
        ) : null}
        {showMenu ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trip options"
            hitSlop={spacing.spacingSm}
            onPress={(e) => {
              e.stopPropagation();
              onMenuPress?.();
            }}
          >
            <MoreVertical
              size={16}
              color={colors.textSecondary}
              strokeWidth={ICON_STROKE}
            />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.timestamp}>{formatTripTimestamp(trip.completed_at)}</Text>

      {/* Origin → destination */}
      <View style={styles.legs}>
        <View style={styles.leg}>
          <View style={styles.legMarkerStart} />
          <Text style={styles.legLabel} numberOfLines={1}>
            {trip.origin_name || "Unknown origin"}
          </Text>
        </View>
        <View style={styles.legConnector} />
        <View style={styles.leg}>
          <View style={styles.legMarkerEnd} />
          <Text style={styles.legLabel} numberOfLines={1}>
            {trip.destination_name || "Unknown destination"}
          </Text>
        </View>
      </View>

      <RouteLine
        polyline={trip.route_polyline}
        width={traceWidth}
        height={96}
        origin={{ lat: trip.origin_lat, lng: trip.origin_lng }}
        destination={{ lat: trip.destination_lat, lng: trip.destination_lng }}
      />

      {/* Hero readout + score */}
      <View style={styles.heroRow}>
        <View style={styles.heroValueRow}>
          <Text style={styles.heroValue}>{distance.value}</Text>
          <Text style={styles.heroUnit}>{distance.unit}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreLabel}>SCORE</Text>
          <CutCornerBadge
            label={String(score)}
            numeric
            solid={standout}
            color={standout ? colors.racingRed : colors.hairline}
            textColor={colors.textPrimary}
            corners="topRight"
            style={styles.scoreChip}
          />
        </View>
      </View>

      <View style={styles.statsRow}>
        <Stat label="TIME" value={time.value} unit={time.unit} />
        <View style={styles.statDivider} />
        <Stat label="AVG" value={speed.value} unit={speed.unit} />
        <View style={styles.statDivider} />
        <Stat label="XP" value={`+${trip.xp_earned ?? 0}`} />
      </View>
    </CutCornerPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flex: 1,
  },
  timestamp: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    // Sits with the header, not as its own block.
    marginTop: -spacing.spacingSm,
  },
  legs: {
    gap: spacing.spacingXs,
  },
  leg: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  legMarkerStart: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.textSecondary,
  },
  legMarkerEnd: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: colors.racingRed,
  },
  // Ties the two markers together, aligned to their centres.
  legConnector: {
    width: borderWidth.hairline,
    height: spacing.spacingSm,
    marginLeft: spacing.spacingXs - borderWidth.hairline / 2,
    backgroundColor: colors.hairline,
  },
  legLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    flex: 1,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  heroValue: {
    ...textStyle("dataLg"),
    color: colors.textPrimary,
  },
  heroUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  scoreLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  scoreChip: {
    minWidth: spacing.spacingXxxl,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingTop: spacing.spacingMd,
  },
  stat: {
    flex: 1,
    gap: spacing.spacingXs,
  },
  statLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.spacingXs,
  },
  statValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  statUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  statDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    marginHorizontal: spacing.spacingMd,
    backgroundColor: colors.hairline,
  },
});

export default React.memo(TripCard);
