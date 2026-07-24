import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Platform,
  Image,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  Car,
  Gauge,
  Rocket,
  Grid2x2,
  Crown,
  ChevronRight,
  Plus,
  LogIn,
  Sparkles,
  TrendingUp,
  Trophy,
  Flag,
  Zap,
  MoreHorizontal,
  Route as RouteIcon,
  MapPin,
  Hexagon,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useActiveCar, GarageCar, CarCategory } from "@/hooks/useActiveCarStore";
import { useXP } from "@/hooks/useXPStore";
import { useCarDriveStats, CarDriveStats } from "@/hooks/useCarDriveStats";
import { supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.76);
const SPACING = 16;
const SNAP = CARD_WIDTH + SPACING;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return `rgba(255,59,48,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── One car hero card ─────────────────────────────────────
function CarCard({
  car,
  index,
  scrollX,
  onMenu,
  driveStats,
}: {
  car: GarageCar;
  index: number;
  scrollX: Animated.Value;
  onMenu: (car: GarageCar) => void;
  driveStats?: CarDriveStats;
}) {
  const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.88, 1, 0.88],
    extrapolate: "clamp",
  });
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.45, 1, 0.45],
    extrapolate: "clamp",
  });
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [24, 0, 24],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { transform: [{ scale }, { translateY }], opacity },
      ]}
    >
      <LinearGradient
        colors={[hexToRgba(car.color, 0.28), "#12121C", "#0C0C14"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.cardGradient}
      >
        {/* Primary ribbon */}
        {car.is_primary && (
          <View style={[styles.ribbon, { backgroundColor: hexToRgba(car.color, 0.9) }]}>
            <Crown size={12} color="#0A0A0F" />
            <Text style={styles.ribbonText}>PRIMARY</Text>
          </View>
        )}

        {/* Per-car quick menu */}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => onMenu(car)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreHorizontal size={16} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Car visual */}
        <View style={styles.carVisual}>
          <View style={[styles.carGlow, { backgroundColor: hexToRgba(car.color, 0.35) }]} />
          {car.photo_url ? (
            <Image source={{ uri: car.photo_url }} style={styles.carPhoto} resizeMode="cover" />
          ) : (
            <Car size={132} color={car.color} strokeWidth={1.4} />
          )}
        </View>

        {/* Name + make */}
        <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
        <View style={styles.carMakeRow}>
          <Text style={styles.carMake}>{car.make || "Custom"}</Text>
          {car.year ? (
            <>
              <View style={styles.dot} />
              <Text style={styles.carMake}>{car.year}</Text>
            </>
          ) : null}
        </View>

        {/* Spec bar */}
        <View style={styles.specBar}>
          <View style={styles.spec}>
            <Gauge size={16} color={car.color} />
            <Text style={styles.specValue}>{car.hp}</Text>
            <Text style={styles.specLabel}>HP</Text>
          </View>
          <View style={styles.specDivider} />
          <View style={styles.spec}>
            <Rocket size={16} color={car.color} />
            <Text style={styles.specValue}>{car.accel_0_100 || "—"}</Text>
            <Text style={styles.specLabel}>0-100 km/h</Text>
          </View>
          <View style={styles.specDivider} />
          <View style={styles.spec}>
            <Grid2x2 size={16} color={car.color} />
            <Text style={styles.specValue}>{car.drivetrain || "—"}</Text>
            <Text style={styles.specLabel}>Drivetrain</Text>
          </View>
        </View>

        {/* Drive data — accumulated from every recorded trip in this car */}
        {driveStats && driveStats.tripCount > 0 && (
          <View style={styles.driveDataBar}>
            <View style={styles.spec}>
              <RouteIcon size={14} color={car.color} />
              <Text style={styles.driveDataValue}>{formatDistance(driveStats.totalDistanceKm)}</Text>
              <Text style={styles.specLabel}>km driven</Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.spec}>
              <Hexagon size={14} color={car.color} />
              <Text style={styles.driveDataValue}>{driveStats.totalXp.toLocaleString("en-US")}</Text>
              <Text style={styles.specLabel}>XP gained</Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.spec}>
              <Gauge size={14} color={car.color} />
              <Text style={styles.driveDataValue}>{driveStats.avgSpeedKmh.toFixed(0)}</Text>
              <Text style={styles.specLabel}>km/h avg</Text>
            </View>
          </View>
        )}

        {car.license_plate ? (
          <View style={styles.plate}>
            <Text style={styles.plateText}>{car.license_plate}</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const CATEGORY_FILTERS: { key: "all" | CarCategory; label: string; icon: React.FC<{ size: number; color: string }> }[] = [
  { key: "all", label: "All Cars", icon: Car },
  { key: "sport", label: "Sport", icon: Trophy },
  { key: "jdm", label: "JDM", icon: Flag },
  { key: "daily", label: "Daily", icon: Gauge },
  { key: "ev", label: "EV", icon: Zap },
];

function formatDistance(km: number): string {
  return Math.round(km).toLocaleString("en-US");
}

export default function SelectCarScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const { cars, loadingCars, selectCar, addCar, activeCarId } = useActiveCar();
  const { totalXp } = useXP();
  const { statsByCarId } = useCarDriveStats(user?.id);

  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<Animated.FlatList<GarageCar>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entering, setEntering] = useState(false);
  const didInitialScroll = useRef(false);
  const [category, setCategory] = useState<"all" | CarCategory>("all");
  const [driveStats, setDriveStats] = useState({ totalDrives: 0, totalDistanceKm: 0 });

  // Garage-wide stats (cars owned / total drives / total distance / XP)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [{ count }, { data }] = await Promise.all([
        supabase.from("trips").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("trips").select("distance_km").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const totalDistanceKm = (data ?? []).reduce(
        (sum: number, t: { distance_km: number }) => sum + (t.distance_km ?? 0),
        0
      );
      setDriveStats({ totalDrives: count ?? 0, totalDistanceKm });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const filteredCars = useMemo(
    () => (category === "all" ? cars : cars.filter((c) => c.category === category)),
    [cars, category]
  );

  const handleCategoryChange = useCallback((next: "all" | CarCategory) => {
    setCategory(next);
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleCarMenu = useCallback(
    (car: GarageCar) => {
      const options: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [];
      if (!car.is_primary) {
        options.push({ text: "Set as Primary", onPress: () => selectCar(car.id) });
      }
      options.push({ text: "Manage in Garage", onPress: () => router.push("/(tabs)/profile" as any) });
      options.push({ text: "Cancel", style: "cancel" });
      Alert.alert(car.name, [car.make, car.year].filter(Boolean).join(" · "), options);
    },
    [selectCar, router]
  );

  // Inline add-car form (empty garage)
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMake, setNewMake] = useState("");
  const [newHp, setNewHp] = useState("300");
  const [addBusy, setAddBusy] = useState(false);

  const heroGlow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(heroGlow, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(heroGlow, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, [heroGlow]);

  // Scroll to the remembered / primary car once cars arrive
  useEffect(() => {
    if (!didInitialScroll.current && cars.length > 0) {
      const idx = Math.max(0, cars.findIndex((c) => c.id === activeCarId));
      const start = idx > 0 ? idx : 0;
      setActiveIndex(start);
      didInitialScroll.current = true;
      if (start > 0) {
        setTimeout(() => {
          listRef.current?.scrollToOffset({ offset: start * SNAP, animated: false });
        }, 50);
      }
    }
  }, [cars, activeCarId]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e: { nativeEvent: { contentOffset: { x: number } } }) => {
        const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP);
        if (idx !== activeIndex && idx >= 0 && idx < filteredCars.length) setActiveIndex(idx);
      },
    }
  );

  const enterApp = useCallback(() => {
    router.replace("/(tabs)/map" as any);
  }, [router]);

  const handleEnter = useCallback(async () => {
    const car = filteredCars[activeIndex];
    if (!car) return;
    setEntering(true);
    await selectCar(car.id);
    enterApp();
  }, [filteredCars, activeIndex, selectCar, enterApp]);

  const handleAddCar = useCallback(async () => {
    if (!newName.trim()) return;
    setAddBusy(true);
    const { error } = await addCar({
      name: newName.trim(),
      make: newMake.trim(),
      hp: parseInt(newHp, 10) || 300,
    });
    setAddBusy(false);
    if (!error) {
      setNewName("");
      setNewMake("");
      setNewHp("300");
      setShowAdd(false);
    }
  }, [newName, newMake, newHp, addCar]);

  const activeColor = filteredCars[activeIndex]?.color ?? "#FF3B30";

  // ─── Loading ─────────────────────────────────────────────
  if (authLoading || (isAuthenticated && loadingCars && cars.length === 0)) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={styles.center}>
          <ActivityIndicator color="#FF3B30" size="large" />
          <Text style={styles.loadingText}>Opening your garage…</Text>
        </View>
      </View>
    );
  }

  // ─── Guest (not signed in) ───────────────────────────────
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingHorizontal: 32 }]}>
          <LinearGradient colors={["#FF3B30", "#FF3B6F"]} style={styles.guestIcon}>
            <Car size={40} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.guestTitle}>Enter Your Garage</Text>
          <Text style={styles.guestSub}>
            Sign in to pick your ride and unlock XP, routes, and your car collection.
          </Text>
          <TouchableOpacity style={styles.guestPrimary} onPress={() => router.push("/login" as any)} activeOpacity={0.85}>
            <LinearGradient colors={["#FF3B30", "#FF3B6F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.guestPrimaryGrad}>
              <LogIn size={18} color="#FFFFFF" />
              <Text style={styles.guestPrimaryText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.guestSecondary} onPress={enterApp} activeOpacity={0.7}>
            <Text style={styles.guestSecondaryText}>Continue as Guest</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Empty garage ────────────────────────────────────────
  if (cars.length === 0) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
        <View style={[styles.emptyWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Car size={48} color="#FF3B30" strokeWidth={1.5} />
            </View>
            <Text style={styles.guestTitle}>Build Your Garage</Text>
            <Text style={styles.guestSub}>Add your first ride to hit the road in style.</Text>
          </View>

          {showAdd ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.addInput}
                placeholder="Car name (e.g. Night Fury)"
                placeholderTextColor="#5A5A6E"
                value={newName}
                onChangeText={setNewName}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TextInput
                  style={[styles.addInput, { flex: 1 }]}
                  placeholder="Make (e.g. BMW)"
                  placeholderTextColor="#5A5A6E"
                  value={newMake}
                  onChangeText={setNewMake}
                />
                <TextInput
                  style={[styles.addInput, { width: 100 }]}
                  placeholder="HP"
                  placeholderTextColor="#5A5A6E"
                  value={newHp}
                  onChangeText={setNewHp}
                  keyboardType="number-pad"
                />
              </View>
              <TouchableOpacity style={styles.cta} onPress={handleAddCar} disabled={addBusy || !newName.trim()} activeOpacity={0.85}>
                <LinearGradient colors={["#FF3B30", "#FF3B6F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
                  {addBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.ctaText}>Add to Garage</Text>}
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.skipBtn}>
                <Text style={styles.skipText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.addForm}>
              <TouchableOpacity style={styles.cta} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
                <LinearGradient colors={["#FF3B30", "#FF3B6F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaGrad}>
                  <Plus size={18} color="#FFFFFF" />
                  <Text style={styles.ctaText}>Add a Car</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={enterApp} style={styles.skipBtn}>
                <Text style={styles.skipText}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ─── Garage carousel ─────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={StyleSheet.absoluteFill} />
      {/* Color-tinted ambient glow behind the focused car */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ambientGlow,
          {
            backgroundColor: hexToRgba(activeColor, 0.5),
            opacity: heroGlow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.32] }),
          },
        ]}
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.brandRow}>
            <Sparkles size={14} color="#FF3B30" />
            <Text style={styles.brandLabel}>YOUR GARAGE</Text>
          </View>
          <TouchableOpacity
            style={styles.statsBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.75}
          >
            <TrendingUp size={14} color="#FFFFFF" />
            <Text style={styles.statsBtnText}>Garage Stats</Text>
            <ChevronRight size={14} color="#8A8A9A" />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Choose your ride</Text>
        <Text style={styles.subtitle}>
          {user?.name ? `Welcome back, ${user.name.split(" ")[0]}. ` : ""}
          Swipe to pick the car you're driving today.
        </Text>
      </View>

      {/* Carousel */}
      <View style={styles.carouselWrap}>
        {filteredCars.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyFilterText}>No cars in this category yet.</Text>
          </View>
        ) : (
          <Animated.FlatList
            ref={listRef}
            data={filteredCars}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP}
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: SIDE_PADDING }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => (
              <View style={{ width: CARD_WIDTH, marginRight: SPACING }}>
                <CarCard
                  car={item}
                  index={index}
                  scrollX={scrollX}
                  onMenu={handleCarMenu}
                  driveStats={statsByCarId[item.id]}
                />
              </View>
            )}
          />
        )}
      </View>

      {/* Pagination */}
      <View style={styles.dots}>
        {filteredCars.map((c, i) => (
          <View
            key={c.id}
            style={[
              styles.dot2,
              i === activeIndex && { backgroundColor: activeColor, width: 22 },
            ]}
          />
        ))}
      </View>

      {/* Category filter */}
      <View style={styles.categoryRow}>
        {CATEGORY_FILTERS.map((cat) => {
          const active = category === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryChip, active && styles.categoryChipActive]}
              onPress={() => handleCategoryChange(cat.key)}
              activeOpacity={0.75}
            >
              <cat.icon size={14} color={active ? "#FF3B30" : "#8A8A9A"} />
              <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Garage-wide stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statTile}>
          <Car size={16} color="#8A8A9A" />
          <Text style={styles.statValue}>{cars.length}</Text>
          <Text style={styles.statLabel}>Cars Owned</Text>
        </View>
        <View style={styles.statTile}>
          <RouteIcon size={16} color="#8A8A9A" />
          <Text style={styles.statValue}>{driveStats.totalDrives}</Text>
          <Text style={styles.statLabel}>Total Drives</Text>
        </View>
        <View style={styles.statTile}>
          <MapPin size={16} color="#8A8A9A" />
          <Text style={styles.statValue}>{formatDistance(driveStats.totalDistanceKm)} km</Text>
          <Text style={styles.statLabel}>Total Distance</Text>
        </View>
        <View style={styles.statTile}>
          <Hexagon size={16} color="#8A8A9A" />
          <Text style={styles.statValue}>{totalXp.toLocaleString("en-US")}</Text>
          <Text style={styles.statLabel}>Garage XP</Text>
        </View>
      </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.cta}
          onPress={handleEnter}
          disabled={entering || !filteredCars[activeIndex]}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[activeColor, "#FF3B6F"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGrad}
          >
            {entering ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.ctaText}>
                  {filteredCars[activeIndex] ? `Drive the ${filteredCars[activeIndex].name}` : "Select a car"}
                </Text>
                <ChevronRight size={20} color="#FFFFFF" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addGhost}
          onPress={() => router.push("/(tabs)/profile" as any)}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#8A8A9A" />
          <Text style={styles.addGhostText}>Manage garage</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060609" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#8A8A9A", fontSize: 14, marginTop: 16, fontWeight: "600" },
  ambientGlow: {
    position: "absolute",
    top: "18%",
    alignSelf: "center",
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: SCREEN_WIDTH * 0.45,
  },
  // Header
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  header: { paddingHorizontal: 24, paddingBottom: 8 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  brandLabel: { fontSize: 12, fontWeight: "800", color: "#FF3B30", letterSpacing: 2 },
  statsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 8,
  },
  statsBtnText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  title: { fontSize: 30, fontWeight: "900", color: "#FFFFFF", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#8A8A9A", marginTop: 6, lineHeight: 20 },
  // Carousel
  carouselWrap: { justifyContent: "center", paddingVertical: 12 },
  emptyFilterText: { color: "#8A8A9A", fontSize: 14, paddingVertical: 40 },
  card: {
    height: Math.min(CARD_WIDTH * 1.28, 440),
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardGradient: { flex: 1, padding: 22, alignItems: "center" },
  ribbon: {
    position: "absolute",
    top: 16,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    zIndex: 2,
  },
  ribbonText: { fontSize: 10, fontWeight: "900", color: "#0A0A0F", letterSpacing: 0.5 },
  menuBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  carVisual: {
    height: 170,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 6,
  },
  carGlow: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
  },
  carPhoto: { width: "92%", height: 170, borderRadius: 18 },
  carName: { fontSize: 24, fontWeight: "900", color: "#FFFFFF", marginTop: 4, textAlign: "center" },
  carMakeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  carMake: { fontSize: 14, color: "#B0B0BE", fontWeight: "600" },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#5A5A6E" },
  specBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginTop: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  spec: { flex: 1, alignItems: "center", gap: 3 },
  specDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.08)" },
  specValue: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  specLabel: { fontSize: 10, color: "#8A8A9A", textTransform: "uppercase", letterSpacing: 0.5 },
  colorDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.25)" },
  driveDataBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    width: "100%",
    paddingVertical: 8,
  },
  driveDataValue: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  plate: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  plateText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#CACAD5",
    letterSpacing: 2,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  // Dots
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 18, marginBottom: 4 },
  dot2: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  // Category filter chips
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 24,
    marginTop: 20,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  categoryChipActive: {
    backgroundColor: "rgba(255,59,48,0.14)",
    borderColor: "rgba(255,59,48,0.4)",
  },
  categoryChipText: { fontSize: 13, fontWeight: "600", color: "#8A8A9A" },
  categoryChipTextActive: { color: "#FF3B30" },
  // Garage-wide stats grid
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: 8,
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.03)",
    marginHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    paddingVertical: 16,
  },
  statTile: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  statLabel: { fontSize: 10, color: "#8A8A9A", textAlign: "center" },
  // Footer
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  cta: { borderRadius: 18, overflow: "hidden" },
  ctaGrad: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  addGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 14,
    paddingVertical: 8,
  },
  addGhostText: { fontSize: 14, fontWeight: "600", color: "#8A8A9A" },
  // Guest
  guestIcon: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  guestTitle: { fontSize: 26, fontWeight: "900", color: "#FFFFFF", textAlign: "center" },
  guestSub: { fontSize: 15, color: "#8A8A9A", textAlign: "center", lineHeight: 22, marginTop: 10 },
  guestPrimary: { width: "100%", borderRadius: 16, overflow: "hidden", marginTop: 28 },
  guestPrimaryGrad: {
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  guestPrimaryText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  guestSecondary: { marginTop: 14, paddingVertical: 10 },
  guestSecondaryText: { fontSize: 15, fontWeight: "600", color: "#8A8A9A" },
  // Empty garage
  emptyWrap: { flex: 1, paddingHorizontal: 24 },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 30,
    backgroundColor: "rgba(255,59,48,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.2)",
  },
  addForm: { gap: 10 },
  addInput: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 15,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  skipBtn: { alignItems: "center", paddingVertical: 10, marginTop: 2 },
  skipText: { fontSize: 14, fontWeight: "600", color: "#8A8A9A" },
});
