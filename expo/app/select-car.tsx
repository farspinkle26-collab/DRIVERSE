/**
 * Driveverse — the garage gate ("Choose your ride").
 *
 * The screen that stands between opening the app and driving: a swipeable
 * carousel of the driver's cars, a spec readout for the focused one, and a
 * single primary action that promotes it and enters the app.
 *
 * Rebuilt on the Phase 1 token system (`constants/theme.ts`,
 * `components/CutCorner.tsx`, Rajdhani / Inter / JetBrains Mono), following
 * DRIVE_HUB_REFERENCE.md, MAP_SCREEN_REFERENCE.md and
 * PROFILE_SCREEN_REFERENCE.md. Deviations are recorded in
 * GARAGE_GATE_REFERENCE.md.
 *
 * This is a re-skin: `refreshCars` / `selectCar` / `addCar`, the garage-wide
 * stats query, the snap-scroll maths and the four render states below the
 * styling layer are the original.
 *
 * Anatomy, top to bottom:
 *   header     YOUR GARAGE overline + Garage Stats link, title, welcome line
 *   carousel   one cut-corner car card per ride — the screen's showcase
 *   dots       one mark per card, active in racingRed
 *   filter     All / Sport / JDM / Daily / EV, the shared `CutCornerChip`
 *   stats      garage-wide readout strip
 *   footer     DRIVE THE <car> (the single primary action) + Manage garage
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Image,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Car,
  Gauge,
  Rocket,
  Grid2x2,
  ChevronRight,
  Plus,
  LogIn,
  Sparkles,
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
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  CutCornerBadge,
  CutCornerButton,
  CutCornerChip,
  CutCornerSurface,
  chipContentColor,
} from "@/components/CutCorner";
import { ICON_STROKE } from "@/components/TripCard";
import { appAlert } from "@/lib/appAlert";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  onRacingRed,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** Screen-edge gutter. The same 16 the Drive Hub, Map and profile use. */
const SCREEN_MARGIN = spacing.spacingLg;

/** Icon sizes. Three steps, per DRIVE_HUB_REFERENCE §6.5. */
const ICON_SM = spacing.spacingMd; // 12 — overline rows and inline metadata
const ICON_MD = spacing.spacingLg; // 16 — spec cells, chrome, list rows
const ICON_LG = spacing.spacingXl; // 24 — empty-state marks

/**
 * The showcase glyph inside the photo circle, at the profile's featured-car
 * size (PROFILE_SCREEN_REFERENCE §7). Not an icon in the 12/16/24 sense —
 * it is standing in for a photograph.
 */
const CAR_GLYPH = 64;

/** Carousel geometry. Unchanged from the original screen. */
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.76);
const CARD_GAP = spacing.spacingLg;
const SNAP = CARD_WIDTH + CARD_GAP;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

/**
 * A floor, not a fixed height: every card is at least this tall so the
 * carousel keeps one baseline, and a card with drive data grows past it
 * rather than clipping its own name. 400 = 4 × 100.
 */
const CARD_MIN_HEIGHT = 400;

/** Circular photo mask. Round because it frames a photo, not by shape policy. */
const PHOTO_SIZE = 140;

/** Pagination marks: 4pt bars, not pills. Active is wider as well as red. */
const DOT_HEIGHT = spacing.spacingXs;
const DOT_WIDTH = spacing.spacingSm;
const DOT_WIDTH_ACTIVE = spacing.spacingXl;

// ─── One car hero card ─────────────────────────────────────
function CarCard({
  car,
  index,
  scrollX,
  onMenu,
  driveStats,
  reducedMotion,
}: {
  car: GarageCar;
  index: number;
  scrollX: Animated.Value;
  onMenu: (car: GarageCar) => void;
  driveStats?: CarDriveStats;
  reducedMotion: boolean;
}) {
  const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP];
  // Scroll-linked, not timed: the card tracks the finger. Reduced motion
  // switches it off entirely rather than shortening it.
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.92, 1, 0.92],
    extrapolate: "clamp",
  });
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: [0.4, 1, 0.4],
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={
        reducedMotion ? undefined : { transform: [{ scale }], opacity }
      }
    >
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        style={styles.card}
        contentStyle={styles.cardContent}
      >
        <View style={styles.cardChrome}>
          {car.is_primary ? (
            <CutCornerBadge label="Primary" solid corners="topRight" />
          ) : (
            <View />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Options for ${car.name}`}
            onPress={() => onMenu(car)}
            hitSlop={spacing.spacingSm}
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
          >
            <MoreHorizontal
              size={ICON_MD}
              color={colors.textSecondary}
              strokeWidth={ICON_STROKE}
            />
          </Pressable>
        </View>

        {/* Photo mask — circular because it frames a photograph. */}
        <View style={styles.photo}>
          {car.photo_url ? (
            <Image
              source={{ uri: car.photo_url }}
              style={styles.photoImage}
              resizeMode="cover"
            />
          ) : (
            <Car
              size={CAR_GLYPH}
              color={colors.textSecondary}
              strokeWidth={ICON_STROKE}
            />
          )}
        </View>

        {/* Identity. The name is display type; make · year · plate is one
            readout line, so the year and the plate are mono. */}
        <Text style={styles.carName} numberOfLines={1}>
          {car.name}
        </Text>
        <View style={styles.carMetaRow}>
          <Text style={styles.carMake} numberOfLines={1}>
            {car.make || "Custom"}
          </Text>
          {car.year ? (
            <>
              <Text style={styles.carMetaSep}>·</Text>
              <Text style={styles.carMono}>{car.year}</Text>
            </>
          ) : null}
          {car.license_plate ? (
            <>
              <Text style={styles.carMetaSep}>·</Text>
              <Text style={styles.carMono} numberOfLines={1}>
                {car.license_plate}
              </Text>
            </>
          ) : null}
        </View>

        {/* Spec readout. A utility surface inside a brand surface: the card
            already spends the corner cut, so the strip is a plain rect. */}
        <View style={styles.specBar}>
          <SpecCell icon={Gauge} value={String(car.hp)} label="HP" />
          <View style={styles.specDivider} />
          <SpecCell icon={Rocket} value={car.accel_0_100 || "—"} label="0-100 km/h" />
          <View style={styles.specDivider} />
          <SpecCell icon={Grid2x2} value={car.drivetrain || "—"} label="Drivetrain" />
        </View>

        {/* Drive data — accumulated from every recorded trip in this car.
            One caption line rather than a second strip: the spec bar is what
            the card is for, and two strips made the card taller than the
            viewport it has to share with the carousel and the CTA. */}
        {driveStats && driveStats.tripCount > 0 ? (
          <View style={styles.driveLine}>
            <RouteIcon size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            <Text style={styles.driveLineText} numberOfLines={1}>
              <Text style={styles.driveLineValue}>
                {formatDistance(driveStats.totalDistanceKm)}
              </Text>
              {" km · "}
              <Text style={styles.driveLineValue}>
                {driveStats.totalXp.toLocaleString("en-US")}
              </Text>
              {" XP · "}
              <Text style={styles.driveLineValue}>
                {driveStats.avgSpeedKmh.toFixed(0)}
              </Text>
              {" km/h avg"}
            </Text>
          </View>
        ) : null}
      </CutCornerSurface>
    </Animated.View>
  );
}

type IconCmp = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/** One column of a readout strip: icon label, mono value, caption label. */
function SpecCell({
  icon: Icon,
  value,
  label,
}: {
  icon: IconCmp;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.specCell}>
      <Icon size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
      <Text style={styles.specValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.specLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const CATEGORY_FILTERS: { key: "all" | CarCategory; label: string; icon: IconCmp }[] = [
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
  const reducedMotion = useReducedMotion();
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
      appAlert(car.name, [car.make, car.year].filter(Boolean).join(" · "), options);
    },
    [selectCar, router]
  );

  // Inline add-car form (empty garage)
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMake, setNewMake] = useState("");
  const [newHp, setNewHp] = useState("300");
  const [addBusy, setAddBusy] = useState(false);

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

  // ─── Signed out (session expired mid-use) ────────────────
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={[styles.center, styles.gate]}>
          <View style={styles.gateMark}>
            <Car size={ICON_LG} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
          </View>
          <Text style={styles.gateTitle}>Sign back in</Text>
          <Text style={styles.gateBody}>
            Your session ended. Sign in again to get back to your garage — your
            XP, routes and car collection are waiting.
          </Text>
          <CutCornerButton
            title="Sign In"
            variant="primary"
            size="lg"
            corners="topRight"
            icon={<LogIn size={ICON_MD} color={onRacingRed} strokeWidth={ICON_STROKE} />}
            onPress={() => router.replace("/login" as any)}
            style={styles.gateAction}
          />
        </View>
      </View>
    );
  }

  // ─── Empty garage ────────────────────────────────────────
  if (cars.length === 0) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.emptyWrap,
            { paddingTop: insets.top + spacing.spacingXxl, paddingBottom: insets.bottom + spacing.spacingXl },
          ]}
        >
          <View style={[styles.center, styles.gateStack]}>
            <View style={styles.gateMark}>
              <Car size={ICON_LG} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </View>
            <Text style={styles.gateTitle}>Build your garage</Text>
            <Text style={styles.gateBody}>
              There is nothing to pick from yet. Tap Add a Car below to put your
              first ride in it.
            </Text>
          </View>

          {showAdd ? (
            <View style={styles.addForm}>
              <TextInput
                style={styles.input}
                placeholder="Car name (e.g. Night Fury)"
                placeholderTextColor={colors.textSecondary}
                value={newName}
                onChangeText={setNewName}
              />
              <View style={styles.addFormRow}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  placeholder="Make (e.g. BMW)"
                  placeholderTextColor={colors.textSecondary}
                  value={newMake}
                  onChangeText={setNewMake}
                />
                <TextInput
                  style={[styles.input, styles.inputHp, styles.inputNumeric]}
                  placeholder="HP"
                  placeholderTextColor={colors.textSecondary}
                  value={newHp}
                  onChangeText={setNewHp}
                  keyboardType="number-pad"
                />
              </View>
              <CutCornerButton
                title="Add to Garage"
                variant="primary"
                size="lg"
                corners="topRight"
                disabled={addBusy || !newName.trim()}
                icon={addBusy ? <ActivityIndicator color={onRacingRed} /> : undefined}
                onPress={handleAddCar}
              />
              <Pressable
                accessibilityRole="link"
                onPress={() => setShowAdd(false)}
                hitSlop={spacing.spacingSm}
                style={({ pressed }) => [styles.textLinkHit, pressed && styles.pressed]}
              >
                <Text style={styles.textLink}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.addForm}>
              <CutCornerButton
                title="Add a Car"
                variant="primary"
                size="lg"
                corners="topRight"
                icon={<Plus size={ICON_MD} color={onRacingRed} strokeWidth={ICON_STROKE} />}
                onPress={() => setShowAdd(true)}
              />
              <Pressable
                accessibilityRole="link"
                onPress={enterApp}
                hitSlop={spacing.spacingSm}
                style={({ pressed }) => [styles.textLinkHit, pressed && styles.pressed]}
              >
                <Text style={styles.textLink}>Skip for now</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    );
  }

  const focusedCar = filteredCars[activeIndex];

  // ─── Garage carousel ─────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.spacingLg }]}>
          <View style={styles.headerTopRow}>
            <View style={styles.brandRow}>
              <Sparkles size={ICON_SM} color={colors.racingRed} strokeWidth={ICON_STROKE} />
              <Text style={styles.brandLabel}>YOUR GARAGE</Text>
            </View>
            {/* Same link convention as the profile's "See All": red caption
                text, no chrome. */}
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/(tabs)/profile" as any)}
              hitSlop={spacing.spacingSm}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.link}>Garage Stats</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>Choose your ride</Text>
          <Text style={styles.subtitle}>
            {user?.name ? `Welcome back, ${user.name.split(" ")[0]}. ` : ""}
            Swipe to pick the car you&apos;re driving today.
          </Text>
        </View>

        {/* Carousel */}
        <View style={styles.carouselWrap}>
          {filteredCars.length === 0 ? (
            <Text style={styles.emptyFilterText}>
              No cars in this category yet. Pick All Cars to see the whole garage.
            </Text>
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
                <View style={styles.cardSlot}>
                  <CarCard
                    car={item}
                    index={index}
                    scrollX={scrollX}
                    onMenu={handleCarMenu}
                    driveStats={statsByCarId[item.id]}
                    reducedMotion={reducedMotion}
                  />
                </View>
              )}
            />
          )}
        </View>

        {/* Pagination */}
        {filteredCars.length > 1 ? (
          <View style={styles.dots}>
            {filteredCars.map((c, i) => (
              <View key={c.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
            ))}
          </View>
        ) : null}

        {/* Category filter */}
        <View style={styles.categoryRow}>
          {CATEGORY_FILTERS.map((cat) => {
            const active = category === cat.key;
            return (
              <CutCornerChip
                key={cat.key}
                label={cat.label}
                active={active}
                icon={
                  <cat.icon
                    size={ICON_SM}
                    color={chipContentColor(active)}
                    strokeWidth={ICON_STROKE}
                  />
                }
                onPress={() => handleCategoryChange(cat.key)}
              />
            );
          })}
        </View>

        {/* Garage-wide stats */}
        <View style={styles.statsStrip}>
          <SpecCell icon={Car} value={String(cars.length)} label="Cars owned" />
          <View style={styles.specDivider} />
          <SpecCell icon={RouteIcon} value={String(driveStats.totalDrives)} label="Total drives" />
          <View style={styles.specDivider} />
          <SpecCell
            icon={MapPin}
            value={formatDistance(driveStats.totalDistanceKm)}
            label="km driven"
          />
          <View style={styles.specDivider} />
          <SpecCell icon={Hexagon} value={totalXp.toLocaleString("en-US")} label="Garage XP" />
        </View>
      </ScrollView>

      {/* Footer actions — the screen's one primary action */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
        <CutCornerButton
          title={focusedCar ? `Drive the ${focusedCar.name}` : "Select a car"}
          variant="primary"
          size="lg"
          corners="topRight"
          disabled={entering || !focusedCar}
          icon={entering ? <ActivityIndicator color={onRacingRed} /> : undefined}
          trailingIcon={
            entering ? undefined : (
              <ChevronRight size={ICON_MD} color={onRacingRed} strokeWidth={ICON_STROKE} />
            )
          }
          textStyle={styles.ctaLabel}
          onPress={handleEnter}
        />

        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Manage garage"
          onPress={() => router.push("/(tabs)/profile" as any)}
          hitSlop={spacing.spacingSm}
          style={({ pressed }) => [styles.manageLink, pressed && styles.pressed]}
        >
          <Plus size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />
          <Text style={styles.manageLinkText}>Manage garage</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Overline: the app-wide small-caps label, per the profile's `OVERLINE`. */
const OVERLINE = {
  fontFamily: fontFamily.displaySemiBold,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1,
} as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
  loadingText: {
    ...textStyle("body"),
    color: colors.textSecondary,
    marginTop: spacing.spacingLg,
  },

  // Header
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: spacing.spacingLg },
  header: { paddingHorizontal: SCREEN_MARGIN, gap: spacing.spacingXs },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.spacingSm,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  brandLabel: { ...OVERLINE, color: colors.racingRed },
  link: {
    ...textStyle("caption"),
    color: colors.racingRed,
  },
  title: {
    ...textStyle("displayXl"),
    color: colors.textPrimary,
  },
  subtitle: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },

  // Carousel
  carouselWrap: { paddingVertical: spacing.spacingLg },
  cardSlot: { width: CARD_WIDTH, marginRight: CARD_GAP },
  emptyFilterText: {
    ...textStyle("body"),
    color: colors.textSecondary,
    paddingHorizontal: SCREEN_MARGIN,
    paddingVertical: spacing.spacingXxl,
    textAlign: "center",
  },
  card: { minHeight: CARD_MIN_HEIGHT },
  cardContent: {
    flex: 1,
    padding: spacing.spacingLg,
    alignItems: "center",
  },
  cardChrome: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  menuBtn: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },

  // Photo mask
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.circle,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    marginTop: spacing.spacingSm,
    marginBottom: spacing.spacingMd,
  },
  photoImage: { width: "100%", height: "100%" },

  // Identity
  carName: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  carMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    marginTop: spacing.spacingXs,
  },
  carMake: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  carMetaSep: {
    ...textStyle("caption"),
    color: colors.hairline,
  },
  carMono: {
    ...textStyle("caption", { fontFamily: fontFamily.dataRegular }),
    color: colors.textSecondary,
  },

  // Readout strips
  specBar: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    marginTop: "auto",
    paddingVertical: spacing.spacingMd,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },
  driveLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    marginTop: spacing.spacingMd,
  },
  driveLineText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  driveLineValue: {
    ...textStyle("caption", { fontFamily: fontFamily.dataRegular }),
    color: colors.textPrimary,
  },
  specCell: {
    flex: 1,
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingHorizontal: spacing.spacingXs,
  },
  specDivider: {
    width: borderWidth.hairline,
    marginVertical: spacing.spacingXs,
    backgroundColor: colors.hairline,
  },
  specValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  specLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  // Pagination
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.spacingXs,
    marginBottom: spacing.spacingLg,
  },
  dot: {
    width: DOT_WIDTH,
    height: DOT_HEIGHT,
    backgroundColor: colors.hairline,
  },
  dotActive: {
    width: DOT_WIDTH_ACTIVE,
    backgroundColor: colors.racingRed,
  },

  // Category filter
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.spacingSm,
    paddingHorizontal: SCREEN_MARGIN,
    marginBottom: spacing.spacingLg,
  },

  // Garage-wide stats
  statsStrip: {
    flexDirection: "row",
    alignItems: "stretch",
    marginHorizontal: SCREEN_MARGIN,
    paddingVertical: spacing.spacingMd,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
  },

  // Footer
  footer: {
    paddingHorizontal: SCREEN_MARGIN,
    paddingTop: spacing.spacingMd,
    gap: spacing.spacingSm,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    backgroundColor: colors.voidBlack,
  },
  ctaLabel: { flexShrink: 1 },
  manageLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm,
    paddingVertical: spacing.spacingSm,
  },
  manageLinkText: {
    ...textStyle("body"),
    color: colors.racingRed,
  },

  // Gate states (guest / empty garage)
  gateStack: { gap: spacing.spacingMd },
  gate: { paddingHorizontal: SCREEN_MARGIN, gap: spacing.spacingMd },
  gateMark: {
    width: spacing.spacingXxl + spacing.spacingXl,
    height: spacing.spacingXxl + spacing.spacingXl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    marginBottom: spacing.spacingSm,
  },
  gateTitle: {
    ...textStyle("displayXl"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  gateBody: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
  },
  gateAction: { alignSelf: "stretch", marginTop: spacing.spacingMd },
  textLinkHit: { paddingVertical: spacing.spacingSm, alignSelf: "center" },
  textLink: {
    ...textStyle("body"),
    color: colors.racingRed,
  },

  // Empty garage
  emptyWrap: { flex: 1, paddingHorizontal: SCREEN_MARGIN },
  addForm: { gap: spacing.spacingMd },
  addFormRow: { flexDirection: "row", gap: spacing.spacingSm },
  input: {
    ...textStyle("body"),
    color: colors.textPrimary,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
  },
  inputFlex: { flex: 1 },
  inputHp: { width: 96 },
  inputNumeric: { fontFamily: fontFamily.dataRegular },
});
