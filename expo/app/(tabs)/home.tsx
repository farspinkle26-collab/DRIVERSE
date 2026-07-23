import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, ScrollView, Image, Platform, TouchableOpacity, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Shield, Car, User } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/hooks/useAuthStore";
import { useTheme } from "@/hooks/useThemeStore";
import Card from "@/components/Card";

// Home Screen - Shows different content based on user type
export default function HomeScreen() {
  const router = useRouter();
  const { user, isCustomer } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [greeting, setGreeting] = useState("Selamat siang");
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const galaxyAnim1 = useRef(new Animated.Value(0)).current;
  const galaxyAnim2 = useRef(new Animated.Value(0)).current;
  const galaxyAnim3 = useRef(new Animated.Value(0)).current;
  const galaxyRotate = useRef(new Animated.Value(0)).current;
  
  const animatedTexts = [
    "Temanmu di Jalan",
    "Cepat & Terpercaya",
    "Siap Membantu Anda"
  ];

  // No driver redirect needed since this is customer-only app

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting("Selamat pagi");
    } else if (hour < 18) {
      setGreeting("Selamat siang");
    } else {
      setGreeting("Selamat malam");
    }
  }, []);

  // Animated text cycling effect
  useEffect(() => {
    const textCycleInterval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        })
      ]).start();
      
      setTimeout(() => {
        setCurrentTextIndex((prev) => (prev + 1) % animatedTexts.length);
      }, 500);
    }, 3000);

    return () => clearInterval(textCycleInterval);
  }, [fadeAnim, animatedTexts.length]);

  // Slide animation for hero button
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: 10,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [slideAnim]);

  // Rotation animation for emergency icon
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        useNativeDriver: true,
      })
    ).start();
  }, [rotateAnim]);

  // Galaxy-like flowing animation for gradient
  useEffect(() => {
    // Main galaxy flow - slow and smooth
    Animated.loop(
      Animated.timing(galaxyAnim1, {
        toValue: 1,
        duration: 8000,
        useNativeDriver: true,
      })
    ).start();

    // Secondary galaxy flow - medium speed
    Animated.loop(
      Animated.timing(galaxyAnim2, {
        toValue: 1,
        duration: 12000,
        useNativeDriver: true,
      })
    ).start();

    // Tertiary galaxy flow - very slow
    Animated.loop(
      Animated.timing(galaxyAnim3, {
        toValue: 1,
        duration: 15000,
        useNativeDriver: true,
      })
    ).start();

    // Galaxy rotation - ultra slow
    Animated.loop(
      Animated.timing(galaxyRotate, {
        toValue: 1,
        duration: 20000,
        useNativeDriver: true,
      })
    ).start();
  }, [galaxyAnim1, galaxyAnim2, galaxyAnim3, galaxyRotate]);

  const handleInsurancePress = () => {
    router.push("/(tabs)/member-asuransi" as any);
  };

  const handleAtpmPress = () => {
    router.push("/(tabs)/atpm" as any);
  };

  const handleGoogleMapsDemo = () => {
    router.push("/google-maps-demo" as any);
  };

  // Keep app accessible without authentication
  const displayUser = user || {
    id: 'test-user',
    name: 'Test User',
    email: 'test@example.com',
    role: 'customer' as const,
    profilePicture: undefined,
    accountStatus: 'active' as const,
    verificationStatus: 'verified' as const,
    canSwitchRoles: false
  };

  return (
    <View style={[styles.safeContainer, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]} 
        contentContainerStyle={{
          paddingBottom: Platform.OS === 'android' ? 90 + insets.bottom + 20 : 110
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: theme.textLight }]}>{greeting}</Text>
          <Text style={[styles.username, { color: theme.textDark }]}>{displayUser?.name || "User"}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.avatarContainer, { borderColor: theme.primary }]}
          activeOpacity={0.7}
        >
          {displayUser?.profilePicture ? (
            <Image
              source={{ uri: displayUser.profilePicture }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: '#E5E5E5' }]}>
              <User size={20} color="#9CA3AF" />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Hero section */}
      <View style={styles.heroCard}>
        <View style={styles.galaxyContainer}>
          {/* Primary galaxy layer */}
          <Animated.View
            style={[
              styles.galaxyLayer1,
              {
                transform: [
                  {
                    translateX: galaxyAnim1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-200, 200]
                    })
                  },
                  {
                    translateY: galaxyAnim1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-50, 50]
                    })
                  },
                  {
                    rotate: galaxyRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg']
                    })
                  }
                ]
              }
            ]}
          >
            <LinearGradient
              colors={['#FF6B35', '#FF8E53', '#FFA726', '#FFD54F', '#FFCC80', '#FF8E53', '#FF6B35']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.galaxyGradient}
            />
          </Animated.View>
          
          {/* Secondary galaxy layer */}
          <Animated.View
            style={[
              styles.galaxyLayer2,
              {
                transform: [
                  {
                    translateX: galaxyAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [150, -150]
                    })
                  },
                  {
                    translateY: galaxyAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [30, -30]
                    })
                  },
                  {
                    rotate: galaxyRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['360deg', '0deg']
                    })
                  }
                ]
              }
            ]}
          >
            <LinearGradient
              colors={['#FF8E53', '#FFA726', '#FFD54F', '#FFECB3', '#FFD54F', '#FFA726', '#FF8E53']}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.galaxyGradient}
            />
          </Animated.View>
          
          {/* Tertiary galaxy layer */}
          <Animated.View
            style={[
              styles.galaxyLayer3,
              {
                transform: [
                  {
                    translateX: galaxyAnim3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-100, 300]
                    })
                  },
                  {
                    translateY: galaxyAnim3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, -40]
                    })
                  },
                  {
                    scale: galaxyAnim3.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [1, 1.2, 1]
                    })
                  }
                ]
              }
            ]}
          >
            <LinearGradient
              colors={['#FFA726', '#FFD54F', '#FFECB3', '#FFF8E1', '#FFECB3', '#FFD54F', '#FFA726']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.galaxyGradient}
            />
          </Animated.View>
        </View>
        <LinearGradient
          colors={['#FF6B35', '#FF8E53', '#FFA726']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroTextContainer}>
              <View style={styles.logoContainer}>
                <Image
                  source={{ uri: "https://r2-pub.rork.com/attachments/7nyottw17fh8finkz1o9z" }}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
                <Text style={[styles.appName, { color: theme.textOnGradient }]}>
                  Driverse
                </Text>
              </View>
              <Animated.Text
                style={[
                  styles.heroTitle,
                  {
                    color: theme.textOnGradient,
                    opacity: fadeAnim,
                    transform: [{ scale: fadeAnim }]
                  }
                ]}
              >
                {animatedTexts[currentTextIndex]}
              </Animated.Text>
              <Text style={[styles.heroSubtitle, { color: theme.textOnGradient }]}>
                Jelajahi fitur berkendara favoritmu
              </Text>
            </View>
            <Image
              source={{ 
                uri: "https://images.unsplash.com/photo-1541348263662-e068662d82af?q=80&w=300&auto=format&fit=crop" 
              }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          </View>
        </LinearGradient>
      </View>

      {/* Quick Access Banners */}
      <View style={styles.quickAccessContainer}>
        {/* Insurance Banner */}
        <Card style={[styles.quickAccessBanner, { borderColor: '#34C759' }]}>
          <TouchableOpacity onPress={handleInsurancePress} activeOpacity={0.8}>
            <View style={styles.bannerContent}>
              <View style={[styles.bannerIcon, { backgroundColor: '#34C759' + '20' }]}>
                <Shield size={20} color="#34C759" />
              </View>
              <View style={styles.bannerTextContainer}>
                <Text style={[styles.quickBannerTitle, { color: '#34C759' }]}>Asuransi</Text>
                <Text style={[styles.quickBannerSubtitle, { color: theme.textLight }]}>
                  Member Asuransi
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>

        {/* ATPM Banner */}
        <Card style={[styles.quickAccessBanner, { borderColor: '#FF9500' }]}>
          <TouchableOpacity onPress={handleAtpmPress} activeOpacity={0.8}>
            <View style={styles.bannerContent}>
              <View style={[styles.bannerIcon, { backgroundColor: '#FF9500' + '20' }]}>
                <Car size={20} color="#FF9500" />
              </View>
              <View style={styles.bannerTextContainer}>
                <Text style={[styles.quickBannerTitle, { color: '#FF9500' }]}>ATPM</Text>
                <Text style={[styles.quickBannerSubtitle, { color: theme.textLight }]}>
                  Branded Mobil
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  greeting: {
    fontSize: 16,
  },
  username: {
    fontSize: 24,
    fontWeight: "bold",
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginRight: 4,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: {
    marginBottom: 24,
    borderRadius: 20,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 8,
  },
  heroGradient: {
    borderRadius: 20,
  },
  galaxyContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 1,
  },
  galaxyLayer1: {
    position: 'absolute',
    top: -100,
    left: -200,
    right: -200,
    bottom: -100,
    opacity: 0.4,
    borderRadius: 100,
  },
  galaxyLayer2: {
    position: 'absolute',
    top: -80,
    left: -150,
    right: -150,
    bottom: -80,
    opacity: 0.3,
    borderRadius: 80,
  },
  galaxyLayer3: {
    position: 'absolute',
    top: -60,
    left: -100,
    right: -100,
    bottom: -60,
    opacity: 0.2,
    borderRadius: 60,
  },
  galaxyGradient: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 100,
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 2,
    position: 'relative',
  },
  heroTextContainer: {
    flex: 1,
    padding: 16,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  logoImage: {
    width: 32,
    height: 32,
  },
  appName: {
    fontSize: 20,
    fontWeight: "bold",
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    opacity: 0.9,
    marginBottom: 20,
    lineHeight: 22,
  },
  heroButton: {
    alignSelf: "flex-start",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  heroButtonText: {
    fontWeight: "700",
  },
  heroImage: {
    width: 120,
    height: "100%",
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    opacity: 0.8,
  },
  quickAccessContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  quickAccessBanner: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 16,
    overflow: "hidden",
  },
  quickBannerTitle: {
    fontSize: 14,
    fontWeight: "bold",
  },
  quickBannerSubtitle: {
    fontSize: 11,
    lineHeight: 14,
    opacity: 0.8,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 8,
  },
  bannerTextContainer: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  bannerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  bannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerArrow: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FF3B30",
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroButtonContainer: {
    // Container for animated hero button
  },
});