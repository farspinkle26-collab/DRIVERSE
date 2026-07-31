import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Image } from 'react-native';

interface LoadingScreenProps {
  onFinish?: () => void;
}

// LAUNCH SAFETY — this used to read `Dimensions.get('window')` at module
// scope. `Dimensions` is backed by native constants, so that is a native read
// during bundle evaluation, in the first component the app renders: exactly
// the class of call `LAUNCH_SAFETY_REFERENCE.md` §2 forbids on anything
// reachable from `app/_layout.tsx`. It also baked the launch-time screen size
// into a stylesheet that never updates on rotation or split-screen. The
// container is `flex: 1` inside a full-screen parent, so the explicit width
// and height bought nothing to begin with.

export default function LoadingScreen({ onFinish }: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;


  useEffect(() => {
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),

    ]).start();

    // Auto finish after 2.5 seconds
    const timer = setTimeout(() => {
      if (onFinish) {
        onFinish();
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim, onFinish]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}
        >
          <Image
            source={require('@/assets/images/driverse-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    shadowColor: '#FF1E3C',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  logo: {
    width: 280,
    height: 280,
  },
});
