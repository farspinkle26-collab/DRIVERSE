import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop, G } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
  filled?: boolean;
}

// Map icon — styled compass/map pin
export const MapIcon = ({ color, size = 24, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="mapGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF6B35" />
        <Stop offset="100%" stopColor="#FF8A50" />
      </LinearGradient>
    </Defs>
    <Path
      d="M12 2L3 9V20L12 16L21 20V9L12 2Z"
      fill={filled ? "url(#mapGrad)" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle
      cx={12}
      cy={11}
      r={3}
      fill={filled ? "#FFFFFF" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2}
    />
  </Svg>
);

// Drive icon — steering wheel / racing
export const DriveIcon = ({ color, size = 24, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="driveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF6B35" />
        <Stop offset="100%" stopColor="#FF3B6F" />
      </LinearGradient>
    </Defs>
    <Circle
      cx={12}
      cy={12}
      r={10}
      fill={filled ? "url(#driveGrad)" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2}
    />
    <Path
      d="M12 2V7M12 17V22M2 12H7M17 12H22"
      stroke={filled ? "#FFFFFF" : color}
      strokeWidth={2}
      strokeLinecap="round"
      opacity={0.6}
    />
    <Circle
      cx={12}
      cy={12}
      r={3}
      fill={filled ? "#FFFFFF" : color}
      stroke={filled ? "none" : color}
      strokeWidth={1.5}
    />
  </Svg>
);

// Profile icon — person with racing helmet style
export const ProfileIcon = ({ color, size = 24, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="profileGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF6B35" />
        <Stop offset="100%" stopColor="#FF8A50" />
      </LinearGradient>
    </Defs>
    <Circle
      cx={12}
      cy={12}
      r={10}
      fill={filled ? "url(#profileGrad)" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2}
    />
    <Circle
      cx={12}
      cy={9}
      r={3}
      fill={filled ? "#FFFFFF" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2}
    />
    <Path
      d="M5.5 20C6.5 17.5 9 16 12 16C15 16 17.5 17.5 18.5 20"
      stroke={filled ? "#FFFFFF" : color}
      strokeWidth={2}
      strokeLinecap="round"
    />
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

export const TowingPlusIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={2} y={8} width={14} height={8} rx={2} stroke={color} strokeWidth={2} />
    <Rect x={16} y={6} width={6} height={10} rx={2} stroke={color} strokeWidth={2} />
    <Circle cx={7} cy={18} r={2} stroke={color} strokeWidth={2} />
    <Circle cx={17} cy={18} r={2} stroke={color} strokeWidth={2} />
    <Path d="M9 12H11M10 11V13" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
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
