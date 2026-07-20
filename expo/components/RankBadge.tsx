import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Crown,
  Trophy,
  Flame,
  Zap,
  Gauge,
  Flag,
  Lock,
  Shield,
} from "lucide-react-native";
import { Rank } from "@/constants/ranks";

interface RankBadgeProps {
  rank: Rank;
  size?: number;
  locked?: boolean;
  glow?: boolean;
}

// Icons for tiers that don't have bespoke art yet.
const EMBLEM_ICON: Record<string, React.FC<{ size: number; color: string; strokeWidth?: number }>> = {
  racer: Flame,
  "pro-racer": Zap,
  "master-racer": Gauge,
  "apex-racer": Flag,
  "street-legend": Trophy,
  "driving-legend": Trophy,
  king: Crown,
};

/**
 * A rank emblem. Uses the tier's provided badge art when available,
 * otherwise renders a generated shield in the tier's colors so ranks
 * without art still look intentional. `locked` dims + adds a lock.
 */
function RankBadgeBase({ rank, size = 120, locked = false, glow = false }: RankBadgeProps) {
  const Icon = EMBLEM_ICON[rank.id] ?? Shield;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {glow && !locked && (
        <View
          style={[
            styles.glow,
            {
              width: size * 0.92,
              height: size * 0.92,
              borderRadius: size,
              backgroundColor: rank.color,
            },
          ]}
        />
      )}

      {rank.badge ? (
        <Image
          source={rank.badge}
          style={{ width: size, height: size, opacity: locked ? 0.28 : 1 }}
          resizeMode="contain"
        />
      ) : (
        // Generated emblem
        <View style={{ width: size, height: size, opacity: locked ? 0.32 : 1 }}>
          <LinearGradient
            colors={[rank.color, rank.colorDark]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.emblem, { borderRadius: size * 0.22 }]}
          >
            <View style={[styles.emblemInner, { borderRadius: size * 0.18 }]}>
              {rank.emoji ? (
                <Text style={{ fontSize: size * 0.4 }}>{rank.emoji}</Text>
              ) : (
                <Icon size={size * 0.42} color="#FFFFFF" strokeWidth={1.6} />
              )}
            </View>
          </LinearGradient>
        </View>
      )}

      {locked && (
        <View style={styles.lockOverlay} pointerEvents="none">
          <Lock size={size * 0.24} color="#B0B0BE" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    opacity: 0.28,
  },
  emblem: {
    flex: 1,
    padding: "8%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  emblemInner: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default React.memo(RankBadgeBase);
