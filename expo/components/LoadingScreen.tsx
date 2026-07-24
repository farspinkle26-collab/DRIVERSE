import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import Svg, { Path, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

interface LoadingScreenProps {
  onFinish?: () => void;
}

const { width, height } = Dimensions.get('window');

export default function LoadingScreen({ onFinish }: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 450, useNativeDriver: true }),
        ])
      ).start();

    pulse(dot1, 0);
    pulse(dot2, 150);
    pulse(dot3, 300);

    // Auto finish after 2.5 seconds
    const timer = setTimeout(() => {
      if (onFinish) {
        onFinish();
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, dot1, dot2, dot3, onFinish]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Svg width={280} height={90} viewBox="0 0 300 100">
          <Defs>
            <LinearGradient id="dGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FF3B30" />
              <Stop offset="1" stopColor="#D40F2C" />
            </LinearGradient>
          </Defs>

          <Path d="M0,72 L48,72 L62,83 L48,94 L0,94 L12,83 Z" fill="url(#dGradient)" />
          <Path d="M16,42 L48,42 L58,51.5 L48,61 L16,61 L23,51.5 Z" fill="url(#dGradient)" />
          <Path
            d="M35,6 L68,6 C96,6 110,26 110,50 C110,74 96,94 68,94 L35,94 L35,70 L58,70 C70,70 78,62 78,50 C78,38 70,30 58,30 L35,30 Z"
            fill="url(#dGradient)"
            fillRule="evenodd"
          />

          <SvgText
            x="120"
            y="65"
            fontSize="42"
            fontWeight="800"
            fontStyle="italic"
            fill="none"
            stroke="#1A1A1A"
            strokeWidth={1.4}
            letterSpacing={1}
          >
            DRIVERSE
          </SvgText>
        </Svg>

        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: dot1 }]} />
          <Animated.View style={[styles.dot, { opacity: dot2 }]} />
          <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width,
    height,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    marginTop: 28,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D40F2C',
  },
});