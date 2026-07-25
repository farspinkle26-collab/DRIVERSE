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
  Image,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import { CHROME_ICON_STROKE } from "@/components/MapGlyphs";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  onRacingRed,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.76);
const SPACING = 16;
const SNAP = CARD_WIDTH + SPACING;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

// A car's paint colour is user-chosen content (like a place name or a
// license plate), not app chrome — it's the one place in this screen that
// legitimately sits outside the six-value palette. Everything else below
// (backgrounds, buttons, labels) is tokens.
function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return alpha(colors.racingRed, opacity);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
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
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={car.is_primary ? colors.racingRed : colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.lg}
        corners="topRight"
        style={styles.cardSurface}
        contentStyle={styles.cardGradient}
      >
        {/* Primary ribbon */}
        {car.is_primary && (
          <View style={styles.ribbon}>
            <Crown size={12} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.ribbonText}>PRIMARY</Text>
          </View>
        )}

        {/* Per-car quick menu */}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => onMenu(car)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MoreHorizontal size={16} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
        </TouchableOpacity>

        {/* Car visual */}
        <View style={styles.carVisual}>
          <View style={[styles.carGlow, { backgroundColor: hexToRgba(car.color, 0.35) }]} />
          {car.photo_url ? (
            <Image source={{ uri: car.photo_url }} style={styles.carPhoto} resizeMode="cover" />
          ) : (
            <Car size={132} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
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
            <Gauge size={16} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.specValue}>{car.hp}</Text>
            <Text style={styles.specLabel}>HP</Text>
          </View>
          <View style={styles.specDivider} />
          <View style={styles.spec}>
            <Rocket size={16} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.specValue}>{car.accel_0_100 || "—"}</Text>
            <Text style={styles.specLabel}>0-100 km/h</Text>
          </View>
          <View style={styles.specDivider} />
          <View style={styles.spec}>
            <Grid2x2 size={16} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.specValue}>{car.drivetrain || "—"}</Text>
            <Text style={styles.specLabel}>Drivetrain</Text>
          </View>
        </View>

        {/* Drive data — accumulated from every recorded trip in this car */}
        {driveStats && driveStats.tripCount > 0 && (
          <View style={styles.driveDataBar}>
            <View style={styles.spec}>
              <RouteIcon size={14} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
              <Text style={styles.driveDataValue}>{formatDistance(driveStats.totalDistanceKm)}</Text>
              <Text style={styles.specLabel}>km driven</Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.spec}>
              <Hexagon size={14} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
              <Text style={styles.driveDataValue}>{driveStats.totalXp.toLocaleString("en-US")}</Text>
              <Text style={styles.specLabel}>XP gained</Text>
            </View>
            <View style={styles.specDivider} />
            <View style={styles.spec}>
              <Gauge size={14} color={car.color} strokeWidth={CHROME_ICON_STROKE} />
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
      </CutCornerSurface>
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

  const activeColor = filteredCars[activeIndex]?.color ?? colors.racingRed;

  // ─── Loading ─────────────────────────────────────────────
  if (authLoading || (isAuthenticated && loadingCars && cars.length === 0)) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.racingRed} size="large" />
          <Text style={styles.loadingText}>Opening your garage…</Text>
        </View>
      </View>
    );
  }

  // ─── Guest (not signed in) ───────────────────────────────
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={[styles.center, { paddingHorizontal: spacing.spacingXxl }]}>
          <CutCornerSurface
            fill={colors.racingRed}
            borderColor={colors.racingRed}
            borderWidth={borderWidth.hairline}
            cutSize={cut.lg}
            corners="topRight"
            style={styles.guestIcon}
            contentStyle={styles.guestIconContent}
          >
            <Car size={40} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />
          </CutCornerSurface>
          <Text style={styles.guestTitle}>ENTER YOUR GARAGE</Text>
          <Text style={styles.guestSub}>
            Sign in to pick your ride and unlock XP, routes, and your car collection.
          </Text>
          <CutCornerButton
            title="Sign In"
            onPress={() => router.push("/login" as any)}
            icon={<LogIn size={18} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
            style={styles.guestPrimary}
          />
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
        <View style={[styles.emptyWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Car size={48} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
            </View>
            <Text style={styles.guestTitle}>BUILD YOUR GARAGE</Text>
            <Text style={styles.guestSub}>Add your first ride to hit the road in style.</Text>
          </View>

          {showAdd ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.addInput}
                placeholder="Car name (e.g. Night Fury)"
                placeholderTextColor={colors.textSecondary}
                value={newName}
                onChangeText={setNewName}
              />
              <View style={{ flexDirection: "row", gap: spacing.spacingSm + 2 }}>
                <TextInput
                  style={[styles.addInput, { flex: 1 }]}
                  placeholder="Make (e.g. BMW)"
                  placeholderTextColor={colors.textSecondary}
                  value={newMake}
                  onChangeText={setNewMake}
                />
                <TextInput
                  style={[styles.addInput, { width: 100 }]}
                  placeholder="HP"
                  placeholderTextColor={colors.textSecondary}
                  value={newHp}
                  onChangeText={setNewHp}
                  keyboardType="number-pad"
                />
              </View>
              <CutCornerButton
                title="Add to Garage"
                onPress={handleAddCar}
                disabled={addBusy || !newName.trim()}
                icon={addBusy ? <ActivityIndicator color={onRacingRed} /> : undefined}
              />
              <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.skipBtn}>
                <Text style={styles.skipText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.addForm}>
              <CutCornerButton
                title="Add a Car"
                onPress={() => setShowAdd(true)}
                icon={<Plus size={18} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
              />
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
            <Sparkles size={14} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.brandLabel}>YOUR GARAGE</Text>
          </View>
          <TouchableOpacity
            style={styles.statsBtn}
            onPress={() => router.push("/(tabs)/profile" as any)}
            activeOpacity={0.75}
          >
            <TrendingUp size={14} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.statsBtnText}>Garage Stats</Text>
            <ChevronRight size={14} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>CHOOSE YOUR RIDE</Text>
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
              <cat.icon size={14} color={active ? colors.racingRed : colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
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
          <Car size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          <Text style={styles.statValue}>{cars.length}</Text>
          <Text style={styles.statLabel}>Cars Owned</Text>
        </View>
        <View style={styles.statTile}>
          <RouteIcon size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          <Text style={styles.statValue}>{driveStats.totalDrives}</Text>
          <Text style={styles.statLabel}>Total Drives</Text>
        </View>
        <View style={styles.statTile}>
          <MapPin size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          <Text style={styles.statValue}>{formatDistance(driveStats.totalDistanceKm)} km</Text>
          <Text style={styles.statLabel}>Total Distance</Text>
        </View>
        <View style={styles.statTile}>
          <Hexagon size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          <Text style={styles.statValue}>{totalXp.toLocaleString("en-US")}</Text>
          <Text style={styles.statLabel}>Garage XP</Text>
        </View>
      </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <CutCornerButton
          title={filteredCars[activeIndex] ? `Drive the ${filteredCars[activeIndex].name}` : "Select a car"}
          size="lg"
          onPress={handleEnter}
          disabled={entering || !filteredCars[activeIndex]}
          icon={entering ? <ActivityIndicator color={onRacingRed} /> : undefined}
        />

        <TouchableOpacity
          style={styles.addGhost}
          onPress={() => router.push("/(tabs)/profile" as any)}
          activeOpacity={0.7}
        >
          <Plus size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          <Text style={styles.addGhostText}>Manage garage</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { ...textStyle("body"), color: colors.textSecondary, marginTop: spacing.spacingLg },
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
  scrollContent: { paddingBottom: spacing.spacingMd },
  header: { paddingHorizontal: spacing.spacingXl, paddingBottom: spacing.spacingSm },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm - 2, marginBottom: spacing.spacingSm },
  brandLabel: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 12 }), color: colors.racingRed, letterSpacing: 2 },
  statsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm - 2,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingSm - 1,
    borderRadius: radius.sharp,
    marginBottom: spacing.spacingSm,
  },
  statsBtnText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 12 }), color: colors.textPrimary },
  title: { ...textStyle("displayXl", { fontSize: 30, lineHeight: 34 }), color: colors.textPrimary },
  subtitle: { ...textStyle("body", { fontSize: 14 }), color: colors.textSecondary, marginTop: spacing.spacingSm - 2 },
  // Carousel
  carouselWrap: { justifyContent: "center", paddingVertical: spacing.spacingMd },
  emptyFilterText: { ...textStyle("body", { fontSize: 14 }), color: colors.textSecondary, paddingVertical: spacing.spacingXxxl - spacing.spacingXs },
  card: {
    height: Math.min(CARD_WIDTH * 1.28, 440),
  },
  cardSurface: { flex: 1 },
  cardGradient: { flex: 1, padding: spacing.spacingXl - 2, alignItems: "center" },
  ribbon: {
    position: "absolute",
    top: spacing.spacingLg,
    left: spacing.spacingLg,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.spacingSm + 2,
    paddingVertical: spacing.spacingXs + 1,
    borderRadius: radius.sharp,
    backgroundColor: colors.racingRed,
    zIndex: 2,
  },
  ribbonText: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 10, lineHeight: 12 }), color: onRacingRed, letterSpacing: 0.5 },
  menuBtn: {
    position: "absolute",
    top: spacing.spacingLg,
    right: spacing.spacingLg,
    width: 28,
    height: 28,
    borderRadius: radius.sharp,
    backgroundColor: alpha(colors.voidBlack, 0.5),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  carVisual: {
    height: 170,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.spacingSm,
    marginBottom: spacing.spacingSm - 2,
  },
  carGlow: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
  },
  carPhoto: { width: "92%", height: 170, borderRadius: radius.sharp },
  carName: { ...textStyle("displayXl", { fontSize: 24, lineHeight: 28 }), color: colors.textPrimary, marginTop: spacing.spacingXs, textAlign: "center" },
  carMakeRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm, marginTop: spacing.spacingXs },
  carMake: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 14 }), color: colors.textSecondary },
  dot: { width: 3, height: 3, borderRadius: radius.circle, backgroundColor: colors.textSecondary },
  specBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    paddingVertical: spacing.spacingMd + 2,
    paddingHorizontal: spacing.spacingSm,
    marginTop: spacing.spacingXl,
    width: "100%",
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  spec: { flex: 1, alignItems: "center", gap: 3 },
  specDivider: { width: borderWidth.hairline, height: 34, backgroundColor: colors.hairline },
  specValue: { ...textStyle("dataLg", { fontSize: 17, lineHeight: 20 }), color: colors.textPrimary },
  specLabel: { ...textStyle("caption", { fontSize: 10, lineHeight: 12 }), color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  driveDataBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.spacingSm + 2,
    width: "100%",
    paddingVertical: spacing.spacingSm,
  },
  driveDataValue: { ...textStyle("dataSm", { fontSize: 14 }), color: colors.textPrimary },
  plate: {
    marginTop: spacing.spacingMd + 2,
    backgroundColor: colors.carbonSurface,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingMd + 2,
    paddingVertical: spacing.spacingSm - 2,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  plateText: {
    ...textStyle("dataSm", { fontSize: 13, letterSpacing: 2 }),
    color: colors.textSecondary,
  },
  // Dots
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.spacingSm - 2, marginTop: spacing.spacingLg + 2, marginBottom: spacing.spacingXs },
  dot2: { width: 8, height: 8, borderRadius: radius.circle, backgroundColor: colors.hairline },
  // Category filter chips
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingSm,
    paddingHorizontal: spacing.spacingXl,
    marginTop: spacing.spacingXl,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm - 2,
    paddingHorizontal: spacing.spacingMd + 2,
    paddingVertical: spacing.spacingSm,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  categoryChipActive: {
    backgroundColor: alpha(colors.racingRed, 0.14),
    borderColor: alpha(colors.racingRed, 0.4),
  },
  categoryChipText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 13 }), color: colors.textSecondary },
  categoryChipTextActive: { color: colors.racingRed },
  // Garage-wide stats grid
  statsGrid: {
    flexDirection: "row",
    paddingHorizontal: spacing.spacingSm,
    marginTop: spacing.spacingXl,
    backgroundColor: colors.carbonSurface,
    marginHorizontal: spacing.spacingXl,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    paddingVertical: spacing.spacingLg,
  },
  statTile: { flex: 1, alignItems: "center", gap: 4 },
  statValue: { ...textStyle("dataSm", { fontFamily: fontFamily.dataBold, fontSize: 16 }), color: colors.textPrimary },
  statLabel: { ...textStyle("caption", { fontSize: 10, lineHeight: 12 }), color: colors.textSecondary, textAlign: "center" },
  // Footer
  footer: { paddingHorizontal: spacing.spacingXl, paddingTop: spacing.spacingMd },
  addGhost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm - 2,
    marginTop: spacing.spacingMd + 2,
    paddingVertical: spacing.spacingSm,
  },
  addGhostText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 14 }), color: colors.textSecondary },
  // Guest
  guestIcon: {
    width: 84,
    height: 84,
    marginBottom: spacing.spacingXl,
  },
  guestIconContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  guestTitle: { ...textStyle("displayXl", { fontSize: 26, lineHeight: 30 }), color: colors.textPrimary, textAlign: "center" },
  guestSub: { ...textStyle("body", { fontSize: 15 }), color: colors.textSecondary, textAlign: "center", marginTop: spacing.spacingSm + 2 },
  guestPrimary: { width: "100%", marginTop: spacing.spacingXl + 4 },
  guestSecondary: { marginTop: spacing.spacingMd + 2, paddingVertical: spacing.spacingSm + 2 },
  guestSecondaryText: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold, fontSize: 15 }), color: colors.textSecondary },
  // Empty garage
  emptyWrap: { flex: 1, paddingHorizontal: spacing.spacingXl },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: radius.sharp,
    backgroundColor: alpha(colors.racingRed, 0.1),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.spacingXl - 2,
    borderWidth: borderWidth.hairline,
    borderColor: alpha(colors.racingRed, 0.2),
  },
  addForm: { gap: spacing.spacingSm + 2 },
  addInput: {
    backgroundColor: colors.voidBlack,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingLg,
    height: 50,
    color: colors.textPrimary,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    ...textStyle("body", { fontSize: 15 }),
  },
  skipBtn: { alignItems: "center", paddingVertical: spacing.spacingSm + 2, marginTop: 2 },
  skipText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 14 }), color: colors.textSecondary },
});
