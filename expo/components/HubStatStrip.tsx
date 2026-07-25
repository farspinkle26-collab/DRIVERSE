/**
 * Driveverse — the Drive Hub's stats header strip.
 *
 * Five counts across one cut-corner surface: Cars, Drivers, Trips, Alerts,
 * Streak. Cells are divided by hairlines rather than being five separate
 * cards, so the strip reads as one instrument cluster and the corner cut
 * is spent once instead of five times.
 *
 * Icons are all lucide, all `ICON_STROKE` (1.5), all at 16pt, all
 * textSecondary — the icon is a label, not decoration. A count of zero is
 * still rendered: an empty garage is information.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Bell, Car, Flame, Route, Users } from "lucide-react-native";
import { CutCornerSurface } from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import {
  borderWidth,
  colors,
  cut,
  spacing,
  textStyle,
} from "@/constants/theme";

type IconCmp = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

export interface HubStat {
  key: string;
  label: string;
  value: number;
  icon: IconCmp;
  /** Non-zero alerts are the one cell allowed to take the accent. */
  accent?: boolean;
  onPress?: () => void;
}

export interface HubStatStripProps {
  cars: number;
  drivers: number;
  trips: number;
  alerts: number;
  streak: number;
  onPressCars?: () => void;
  onPressDrivers?: () => void;
  onPressTrips?: () => void;
  onPressAlerts?: () => void;
}

const ICON_SIZE = spacing.spacingLg;

function StatCell({ stat }: { stat: HubStat }) {
  const Icon = stat.icon;
  const accented = stat.accent && stat.value > 0;
  const body = (
    <View style={styles.cell}>
      <Icon
        size={ICON_SIZE}
        color={accented ? colors.racingRed : colors.textSecondary}
        strokeWidth={ICON_STROKE}
      />
      <Text style={[styles.value, accented && { color: colors.racingRed }]}>
        {stat.value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {stat.label}
      </Text>
    </View>
  );

  if (!stat.onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stat.value} ${stat.label}`}
      onPress={stat.onPress}
      style={styles.cellPressable}
    >
      {body}
    </Pressable>
  );
}

export function HubStatStrip({
  cars,
  drivers,
  trips,
  alerts,
  streak,
  onPressCars,
  onPressDrivers,
  onPressTrips,
  onPressAlerts,
}: HubStatStripProps) {
  const stats: HubStat[] = [
    { key: "cars", label: "Cars", value: cars, icon: Car, onPress: onPressCars },
    { key: "drivers", label: "Drivers", value: drivers, icon: Users, onPress: onPressDrivers },
    { key: "trips", label: "Trips", value: trips, icon: Route, onPress: onPressTrips },
    { key: "alerts", label: "Alerts", value: alerts, icon: Bell, accent: true, onPress: onPressAlerts },
    { key: "streak", label: "Streak", value: streak, icon: Flame },
  ];

  return (
    <CutCornerSurface
      fill={colors.carbonSurface}
      borderColor={colors.hairline}
      borderWidth={borderWidth.hairline}
      cutSize={cut.md}
      corners="topRight"
      contentStyle={styles.strip}
    >
      {stats.map((stat, i) => (
        <React.Fragment key={stat.key}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <StatCell stat={stat} />
        </React.Fragment>
      ))}
    </CutCornerSurface>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: spacing.spacingMd,
  },
  cellPressable: {
    flex: 1,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingHorizontal: spacing.spacingXs,
  },
  value: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  label: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  divider: {
    width: borderWidth.hairline,
    marginVertical: spacing.spacingXs,
    backgroundColor: colors.hairline,
  },
});

export default HubStatStrip;
