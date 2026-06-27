import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
  filled?: boolean;
}

export const HomeIcon = ({ color, size = 24, filled = false }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="homeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    <Path
      d="M3 9L12 2L21 9V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9Z"
      fill={filled ? "url(#homeGradient)" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9 21V12H15V21"
      fill={filled ? "#FFFFFF" : "none"}
      stroke={filled ? "none" : color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);



export const OrdersIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="ordersGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    <Rect
      x={3}
      y={4}
      width={18}
      height={16}
      rx={2}
      fill={color === '#FF3B30' ? "url(#ordersGradient)" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M7 9H17M7 13H14M7 17H11"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      opacity={color === '#FF3B30' ? 1 : 0.8}
    />
  </Svg>
);

export const WalletIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="walletGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    <Rect
      x={2}
      y={6}
      width={20}
      height={12}
      rx={3}
      fill={color === '#FF3B30' ? "url(#walletGradient)" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M6 6V4C6 3.44772 6.44772 3 7 3H17C17.5523 3 18 3.44772 18 4V6"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M8 10H12M8 14H10"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2}
      strokeLinecap="round"
      opacity={0.9}
    />
    <Path
      d="M16 11H18V13H16V11Z"
      fill={color === '#FF3B30' ? "#FFFFFF" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={1.5}
    />
    <Path
      d="M6 11.5H8.5"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2}
      strokeLinecap="round"
      opacity={0.7}
    />
  </Svg>
);

export const ProfileIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="profileGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    <Circle
      cx={12}
      cy={12}
      r={10}
      fill={color === '#FF3B30' ? "url(#profileGradient)" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle
      cx={12}
      cy={9}
      r={3}
      fill={color === '#FF3B30' ? "#FFFFFF" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M6.168 18.849C6.94649 17.1394 8.97918 16 12 16C15.0208 16 17.0535 17.1394 17.832 18.849"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const TowingPlusIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="towingPlusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    {/* Truck body */}
    <Rect
      x={2}
      y={8}
      width={14}
      height={8}
      rx={2}
      fill={color === '#FF3B30' ? "url(#towingPlusGradient)" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Truck cab */}
    <Rect
      x={16}
      y={6}
      width={6}
      height={10}
      rx={2}
      fill={color === '#FF3B30' ? "url(#towingPlusGradient)" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Wheels */}
    <Circle
      cx={7}
      cy={18}
      r={2}
      fill={color === '#FF3B30' ? "#FFFFFF" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2}
    />
    <Circle
      cx={17}
      cy={18}
      r={2}
      fill={color === '#FF3B30' ? "#FFFFFF" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2}
    />
    {/* Plus sign */}
    <Path
      d="M9 12H11M10 11V13"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
    />
    {/* Golf flag */}
    <Path
      d="M19 9L21 7V11L19 9Z"
      fill={color === '#FF3B30' ? "#FFFFFF" : color}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={1}
    />
  </Svg>
);

export const InsuranceIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="insuranceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    <Path
      d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z"
      fill={color === '#FF3B30' ? "url(#insuranceGradient)" : "none"}
      stroke={color === '#FF3B30' ? "none" : color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M9 12L11 14L15 10"
      stroke={color === '#FF3B30' ? "#FFFFFF" : color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const AtpmIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="atpmGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A50" />
        <Stop offset="100%" stopColor="#FF6B35" />
      </LinearGradient>
    </Defs>
    <Rect x={3} y={9} width={18} height={7} rx={2} fill={color === '#FF3B30' ? 'url(#atpmGradient)' : 'none'} stroke={color === '#FF3B30' ? 'none' : color} strokeWidth={2} />
    <Path d="M6 9V7C6 6.44772 6.44772 6 7 6H11C11.5523 6 12 6.44772 12 7V9" stroke={color === '#FF3B30' ? '#FFFFFF' : color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx={7.5} cy={18} r={2} fill={color === '#FF3B30' ? '#FFFFFF' : 'none'} stroke={color === '#FF3B30' ? 'none' : color} strokeWidth={2} />
    <Circle cx={16.5} cy={18} r={2} fill={color === '#FF3B30' ? '#FFFFFF' : 'none'} stroke={color === '#FF3B30' ? 'none' : color} strokeWidth={2} />
    <Path d="M14 6H18" stroke={color === '#FF3B30' ? '#FFFFFF' : color} strokeWidth={2} strokeLinecap="round" />
    <Path d="M16 4V8" stroke={color === '#FF3B30' ? '#FFFFFF' : color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);


