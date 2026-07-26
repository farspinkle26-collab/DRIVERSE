/**
 * Driveverse — tab bar glyphs.
 *
 * The three primary tab marks, hand-drawn in the same register as
 * `MapGlyphs.tsx`: `strokeLinecap="square"`, `strokeLinejoin="miter"`, one
 * stroke weight, a single `color` and nothing else. They previously carried
 * three `LinearGradient` fills and hardcoded `#FFFFFF` — the last gradients
 * in the app's chrome, flagged by DRIVE_HUB_REFERENCE §5 and
 * MAP_SCREEN_REFERENCE §7.
 *
 * There is no `filled` variant any more. The active state is drawn by the
 * tab bar as a racingRed disc behind the glyph, and the glyph itself just
 * switches to `onRacingRed` — state is colour, exactly as on the map.
 *
 * The legacy icons at the bottom are untouched: they are consumed by
 * screens still on the old styling and are not part of this pass.
 */

import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

/** Chrome weight, matching the Drive Hub and the map's chrome icons. */
export const TAB_ICON_STROKE = 1.5;

interface IconProps {
  color: string;
  size?: number;
}

/** Shared stroke geometry — square caps and mitred joins, never round. */
const STROKE = {
  strokeWidth: TAB_ICON_STROKE,
  strokeLinecap: 'square' as const,
  strokeLinejoin: 'miter' as const,
};

// Map — a folded map plate with a location reticle, not a teardrop pin.
// MAP_SCREEN_REFERENCE D-8: a pin is what every map provider's default is.
export const MapIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6.5L9 4L15 6.5L21 4V17.5L15 20L9 17.5L3 20V6.5Z" stroke={color} {...STROKE} />
    <Path d="M9 4V17.5M15 6.5V20" stroke={color} {...STROKE} />
  </Svg>
);

// Drive — a steering wheel: outer rim, hub, three spokes.
export const DriveIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} {...STROKE} />
    <Circle cx={12} cy={12} r={3} stroke={color} {...STROKE} />
    <Path d="M12 3V9M4.2 16.5L9.4 13.5M19.8 16.5L14.6 13.5" stroke={color} {...STROKE} />
  </Svg>
);

// Profile — a driver in a helmet: shell, visor line, shoulders.
export const ProfileIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8.5} r={4.5} stroke={color} {...STROKE} />
    <Path d="M4 20.5C4 16.9 7.6 15 12 15C16.4 15 20 16.9 20 20.5" stroke={color} {...STROKE} />
  </Svg>
);

// Legacy icons — keep for existing screens that reference them
export const HomeIcon = MapIcon;
export const OrdersIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={4} width={18} height={16} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M7 9H17M7 13H14M7 17H11" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

export const WalletIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={6} width={20} height={12} rx={3} stroke={color} strokeWidth={2} />
    <Path d="M6 6V4C6 3.44772 6.44772 3 7 3H17C17.5523 3 18 3.44772 18 4V6" stroke={color} strokeWidth={2} />
    <Path d="M16 11H18V13H16V11Z" stroke={color} strokeWidth={1.5} />
  </Svg>
);

export const InsuranceIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z" stroke={color} strokeWidth={2} />
    <Path d="M9 12L11 14L15 10" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const AtpmIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={9} width={18} height={7} rx={2} stroke={color} strokeWidth={2} />
    <Path d="M6 9V7C6 6.44772 6.44772 6 7 6H11C11.5523 6 12 6.44772 12 7V9" stroke={color} strokeWidth={2} />
    <Circle cx={7.5} cy={18} r={2} stroke={color} strokeWidth={2} />
    <Circle cx={16.5} cy={18} r={2} stroke={color} strokeWidth={2} />
  </Svg>
);
