/**
 * Driveverse Platinum — premium vehicle icons.
 *
 * The compact car mark, wherever a car is represented small: garage rows,
 * trip cards, the car picker. Regular drivers get lucide's `Car`, unchanged.
 * Platinum drivers can swap it for one of four bespoke silhouettes.
 *
 * WHY THEY'RE DRAWN HERE RATHER THAN RECOLOURED
 *   Four chrome copies of the same glyph would be a colour swap dressed up as
 *   a cosmetic set. These are four different profiles — a long-nosed coupe, a
 *   flared widebody, a short-deck hatch, a high-roof SUV — so a driver picks
 *   the shape that matches what they actually drive. Same 1.75 stroke, same
 *   flat-square caps, same 24-unit box as the lucide icons they sit beside,
 *   so a garage list with mixed marks still looks like one icon family.
 *
 * All four are drawn in a 24×24 viewBox and scale from `size`, exactly like
 * a lucide icon, so call sites swap between them without touching layout.
 */

import React from "react";
import { Car } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";
import {
  resolveVehicleIcon,
  type VehicleIconId,
} from "@/constants/platinumCosmetics";
import { colors } from "@/constants/theme";

export interface PremiumVehicleIconProps {
  /** Stored selection. Falls back to the default set when not entitled. */
  icon?: string | null;
  isPlatinum?: boolean;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Body outlines, one per silhouette, in a 24×24 box. */
const BODY_PATHS: Record<Exclude<VehicleIconId, "default">, string> = {
  // Long hood, cab pushed back, fast rear screen.
  coupe: "M2 15.5 L3.4 12 L8 8.6 L14.6 8.6 L19 12 L22 12.6 L22 15.5 Z",
  // Flat roof, pronounced arch flares front and rear, low ride height.
  widebody:
    "M1.5 15.5 L2.4 12.4 L6.2 9.4 L16.2 9.4 L19.6 12.4 L22.5 13 L22.5 15.5 Z M4.2 12.6 L8.4 12.6 M14.6 12.6 L19 12.6",
  // Short front overhang, upright tail, hatch line.
  hatch: "M3 15.5 L4 11.6 L8 8.4 L15.4 8.4 L18.4 11.6 L18.4 15.5 Z M15.4 8.4 L15.4 15",
  // Tall greenhouse, long flat roof, squared-off ends.
  suv: "M2.6 15.5 L2.6 11.4 L5.4 7.6 L17 7.6 L19.6 11.4 L21.4 12 L21.4 15.5 Z M5.4 11.4 L19.6 11.4",
};

/** Wheels sit on the same baseline for every body, so the set reads as one. */
const WHEELS: { cx: number; r: number }[] = [
  { cx: 7, r: 2.3 },
  { cx: 17, r: 2.3 },
];

export function PremiumVehicleIcon({
  icon,
  isPlatinum = false,
  size = 24,
  color = colors.textPrimary,
  strokeWidth = 1.75,
}: PremiumVehicleIconProps) {
  const resolved = resolveVehicleIcon(icon, isPlatinum);

  // The default is the app's existing lucide mark — not a redraw of it, so a
  // Regular driver's icon is byte-identical to what it was before Platinum.
  if (resolved === "default") {
    return <Car size={size} color={color} strokeWidth={strokeWidth} />;
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={BODY_PATHS[resolved]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
        strokeLinecap="square"
        fill="none"
      />
      {WHEELS.map((wheel) => (
        <Circle
          key={wheel.cx}
          cx={wheel.cx}
          cy={15.5}
          r={wheel.r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
        />
      ))}
    </Svg>
  );
}

export default PremiumVehicleIcon;
