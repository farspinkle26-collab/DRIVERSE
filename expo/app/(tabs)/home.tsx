import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, Text, View, ScrollView, Image, Platform, TouchableOpacity, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, Truck, Wrench, AlertTriangle, Shield, Car, Plus, Zap, User, Search, Info } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import Button from "@/components/Button";
import { useAuth } from "@/hooks/useAuthStore";
import { useTowing } from "@/hooks/useTowingStore";
import { useTheme } from "@/hooks/useThemeStore";
import RequestCard from "@/components/RequestCard";
import DriverCard from "@/components/DriverCard";
import Card from "@/components/Card";
import TowingTypeDetailModal from "@/components/TowingTypeDetailModal";
import { towingTypes } from "@/constants/mockData";
import { TowingType } from "@/types";

// Home Screen - Shows different content based on user type
export default function HomeScreen() {
  const router = useRouter();
  const { user, isCustomer } = useAuth();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { 
    activeRequest, 
    requestHistory,
    availableDrivers
  } = useTowing();
  const [greeting, setGreeting] = useState("Selamat siang");
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [selectedTowingType, setSelectedTowingType] = useState<TowingType | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const galaxyAnim1 = useRef(new Animated.Value(0)).current;
  const galaxyAnim2 = useRef(new Animated.Value(0)).current;
  const galaxyAnim3 = useRef(new Animated.Value(0)).current;
  const galaxyRotate = useRef(new Animated.Value(0)).current;
  
  const animatedTexts = [
    "Temanmu di Jalan",
    "Layanan Derek 24/7",
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

  // Pulse animation for service icons
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [pulseAnim]);

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

  const handleRequestTow = () => {
    router.push("/request-tow" as any);
  };

  const handleViewActiveRequest = () => {
    router.push({
      pathname: "/request-details" as any,
      params: { id: activeRequest?.id }
    });
  };

  const handleViewHistory = () => {
    router.push("/(tabs)/orders" as any);
  };

  const handleServiceSelect = (serviceType: string) => {
    router.push({
      pathname: "/request-tow" as any,
      params: { serviceType }
    });
  };

  const handleTowingPlusPress = () => {
    router.push("/towing-plus" as any);
  };

  const handleInsurancePress = () => {
    router.push("/(tabs)/member-asuransi" as any);
  };

  const handleAtpmPress = () => {
    router.push("/(tabs)/atpm" as any);
  };

  const handleGoogleMapsDemo = () => {
    router.push("/google-maps-demo" as any);
  };

  const handleTowingRecommendation = () => {
    router.push("/towing-recommendation" as any);
  };

  const handleShowTowingInfo = (serviceId: string) => {
    const towingType = towingTypes.find(type => {
      // Map service IDs to towing type IDs
      const serviceToTypeMap: { [key: string]: string } = {
        'hydraulic': '1',
        'ladder': '2', 
        'accident': '3',
        'service': '4',
        'roller_tire': '5',
        'free_wheel': '6',
        'selfloader': '10',
        'dolly': '5', // Uses same as roller_tire for now
        'double_deck': '7',
        'moge_transport': '8',
        'basement_towing': '9'
      };
      return type.id === serviceToTypeMap[serviceId];
    });
    
    if (towingType) {
      setSelectedTowingType(towingType);
      setIsModalVisible(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalVisible(false);
    setSelectedTowingType(null);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const towingServices = [
    {
      id: "hydraulic",
      title: "Hidraulik",
      description: towingTypes[0]?.description || "Derek dengan sistem hidraulik",
      basePrice: 800000,
      pricePerKm: 20000,
      iconUrl: towingTypes[0]?.icon,
      color: "#FF3B30"
    },
    {
      id: "ladder",
      title: "Tangga",
      description: towingTypes[1]?.description || "Derek dengan tanduk di belakang",
      basePrice: 595000,
      pricePerKm: 15000,
      iconUrl: towingTypes[1]?.icon,
      color: "#007AFF"
    },
    {
      id: "accident",
      title: "Katrol",
      description: towingTypes[2]?.description || "Derek dengan sistem katrol di belakang",
      basePrice: 1200000,
      pricePerKm: 50000,
      iconUrl: towingTypes[2]?.icon,
      color: "#FF9500"
    },
    {
      id: "service",
      title: "Service Car",
      description: towingTypes[3]?.description || "Layanan perbaikan di tempat",
      basePrice: 350000,
      pricePerKm: 0,
      maxDistance: 8,
      iconUrl: towingTypes[3]?.icon,
      color: "#34C759"
    },
    {
      id: "roller_tire",
      title: "Derek Sepatu Roda",
      description: towingTypes[4]?.description || "Derek dengan sepatu roda di belakang",
      basePrice: 2000000,
      pricePerKm: 30000,
      iconUrl: towingTypes[4]?.icon,
      color: "#8E44AD"
    },
    {
      id: "free_wheel",
      title: "Free Wheel",
      description: towingTypes[5]?.description || "Alat bantu netral matic/lock sistem (hanya ban)",
      basePrice: 600000,
      pricePerKm: 0,
      iconUrl: towingTypes[5]?.icon,
      color: "#E67E22"
    },
    {
      id: "selfloader",
      title: "Selfloader",
      description: towingTypes[9]?.description || "Derek dengan sistem self-loading",
      basePrice: 2500000,
      pricePerKm: 50000,
      iconUrl: towingTypes[9]?.icon,
      color: "#2C3E50"
    },
    {
      id: "dolly",
      title: "Dolly",
      description: towingTypes[4]?.description || "Derek dengan sepatu roda di belakang",
      basePrice: 5000000,
      pricePerKm: 100000,
      iconUrl: towingTypes[4]?.icon,
      color: "#C0392B"
    },
    {
      id: "double_deck",
      title: "Double Deck",
      description: towingTypes[6]?.description || "Derek untuk multiple kendaraan",
      basePrice: 4000000,
      pricePerKm: 0,
      iconUrl: towingTypes[6]?.icon,
      color: "#16A085"
    },
    {
      id: "moge_transport",
      title: "Moge",
      description: towingTypes[7]?.description || "Derek khusus untuk motor besar",
      basePrice: 500000,
      pricePerKm: 8000,
      iconUrl: towingTypes[7]?.icon,
      color: "#D35400"
    },
    {
      id: "basement_towing",
      title: "Derek Basement",
      description: "Rp1.000.000 per kasus",
      basePrice: 1000000,
      pricePerKm: 0,
      iconUrl: "https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/rgm4m2b4uacm3vlp8fzmp",
      color: "#7D3C98"
    }
  ];

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
                  Towing Online
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
                Minta layanan derek hanya dengan beberapa ketukan
              </Text>
              <Animated.View style={[styles.heroButtonContainer, { transform: [{ translateX: slideAnim }] }]}>
                <Button
                  title="Minta Derek"
                  onPress={handleRequestTow}
                  variant="primary"
                  size="medium"
                  style={[styles.heroButton, { backgroundColor: theme.white, borderColor: theme.white }]}
                  textStyle={[styles.heroButtonText, { color: theme.primary }]}
                  icon={<MapPin size={18} color={theme.primary} />}
                />
              </Animated.View>
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
        {/* Towing+ Banner */}
        <Card style={[styles.quickAccessBanner, { borderColor: theme.primary }]}>
          <TouchableOpacity onPress={handleTowingPlusPress} activeOpacity={0.8}>
            <View style={styles.bannerContent}>
              <View style={[styles.bannerIcon, { backgroundColor: theme.primary + '20' }]}>
                <Plus size={20} color={theme.primary} />
              </View>
              <View style={styles.bannerTextContainer}>
                <Text style={[styles.quickBannerTitle, { color: theme.primary }]}>Towing+</Text>
                <Text style={[styles.quickBannerSubtitle, { color: theme.textLight }]}>
                  Transportasi & Golf Car
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>

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
      </View>

      <View style={styles.quickAccessContainer}>
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

        {/* Towing Recommendation Banner */}
        <Card style={[styles.quickAccessBanner, { borderColor: '#007AFF' }]}>
          <TouchableOpacity onPress={handleTowingRecommendation} activeOpacity={0.8}>
            <View style={styles.bannerContent}>
              <View style={[styles.bannerIcon, { backgroundColor: '#007AFF' + '20' }]}>
                <Search size={20} color="#007AFF" />
              </View>
              <View style={styles.bannerTextContainer}>
                <Text style={[styles.quickBannerTitle, { color: '#007AFF' }]}>Cari Derek</Text>
                <Text style={[styles.quickBannerSubtitle, { color: theme.textLight }]}>
                  Jenis yang pas untukmu
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>
      </View>

      <View style={styles.quickAccessContainer}>
        {/* Emergency Banner */}
        <Card style={[styles.quickAccessBanner, { borderColor: '#FF3B30' }]}>
          <TouchableOpacity onPress={() => handleServiceSelect('accident')} activeOpacity={0.8}>
            <View style={styles.bannerContent}>
              <Animated.View 
                style={[
                  styles.bannerIcon, 
                  { 
                    backgroundColor: '#FF3B30' + '20',
                    transform: [{ 
                      rotate: rotateAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg']
                      })
                    }]
                  }
                ]}
              >
                <AlertTriangle size={20} color="#FF3B30" />
              </Animated.View>
              <View style={styles.bannerTextContainer}>
                <Text style={[styles.quickBannerTitle, { color: '#FF3B30' }]}>Darurat</Text>
                <Text style={[styles.quickBannerSubtitle, { color: theme.textLight }]}>
                  Derek Kecelakaan
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </Card>
      </View>

      {/* Active request section */}
      {activeRequest && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Permintaan Aktif</Text>
          </View>
          <RequestCard
            request={activeRequest}
            onViewDetails={handleViewActiveRequest}
          />
        </View>
      )}

      {/* Recent history section */}
      {requestHistory.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textDark }]}>Riwayat Terbaru</Text>
            <Button
              title="Lihat Semua"
              onPress={handleViewHistory}
              variant="text"
              size="small"
            />
          </View>
          {requestHistory.slice(0, 2).map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onViewDetails={() => router.push({
                pathname: "/request-details" as any,
                params: { id: request.id }
              })}
            />
          ))}
        </View>
      )}



      {/* All Towing Services section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Animated.Text 
            style={[
              styles.sectionTitle, 
              { 
                color: theme.textDark,
                transform: [{ scale: pulseAnim }]
              }
            ]}
          >
            Semua Layanan Derek & Towing
          </Animated.Text>
        </View>
        {towingServices.map((service) => (
          <Card key={service.id} style={[styles.serviceCard, { borderLeftColor: service.color }]}>
            <View style={styles.serviceContent}>
              <View style={styles.serviceHeader}>
                <Animated.View 
                  style={[
                    styles.serviceIcon, 
                    { 
                      backgroundColor: service.color + '20',
                      transform: [{ scale: pulseAnim }]
                    }
                  ]}
                >
                  {service.iconUrl ? (
                    <Image 
                      source={{ uri: service.iconUrl }} 
                      style={styles.serviceIconImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Truck size={24} color={service.color} />
                  )}
                </Animated.View>
                <View style={styles.serviceInfo}>
                  <Text style={[styles.serviceTitle, { color: theme.textDark }]}>{service.title}</Text>
                  <Text style={[styles.servicePrice, { color: service.color }]}>
                    {service.pricePerKm === 0 ? formatPrice(service.basePrice) : `Mulai ${formatPrice(service.basePrice)}`}
                  </Text>
                </View>
                <View style={styles.serviceActions}>
                  <TouchableOpacity
                    onPress={() => handleShowTowingInfo(service.id)}
                    style={[styles.infoButton, { backgroundColor: '#F5F5F5' }]}
                    activeOpacity={0.7}
                  >
                    <Info size={16} color={theme.textLight} />
                  </TouchableOpacity>
                  <Button
                    title="Pilih"
                    onPress={() => handleServiceSelect(service.id)}
                    variant="outline"
                    size="small"
                    style={[styles.serviceButton, { borderColor: service.color }]}
                    textStyle={{ color: service.color, fontSize: 12 }}
                  />
                </View>
              </View>
              <Text style={[styles.serviceDescription, { color: theme.textLight }]}>
                {service.description}
              </Text>
            </View>
          </Card>
        ))}
      </View>
      </ScrollView>
      
      {/* Towing Type Detail Modal */}
      <TowingTypeDetailModal
        visible={isModalVisible}
        onClose={handleCloseModal}
        towingType={selectedTowingType}
        onSelectService={handleServiceSelect}
      />
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
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  serviceCard: {
    marginBottom: 12,
    borderLeftWidth: 4,
    padding: 16,
  },
  serviceContent: {
    gap: 12,
  },
  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  serviceIconImage: {
    width: 30,
    height: 30,
  },
  serviceInfo: {
    flex: 1,
    gap: 4,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  servicePrice: {
    fontSize: 14,
    fontWeight: "700",
  },
  serviceButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 60,
  },
  serviceDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginLeft: 60,
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
  serviceActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroButtonContainer: {
    // Container for animated hero button
  },
});