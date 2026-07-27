/**
 * Driveverse — the unified driver profile.
 *
 * Rebuilt on the Phase 1 token system (`constants/theme.ts`,
 * `components/CutCorner.tsx`, Rajdhani / Inter / JetBrains Mono), following
 * the pattern set by DRIVE_HUB_REFERENCE.md and MAP_SCREEN_REFERENCE.md.
 * Deviations are recorded in PROFILE_SCREEN_REFERENCE.md.
 *
 * The page renders the exact same layout for the signed-in user and for any
 * other driver — the only differences are which actions are enabled
 * (editing, add-car, premium generation and the notification/message
 * inboxes belong to the signed-in viewer). Pass a `userId` to view someone
 * else; omit it for the current user.
 *
 * Anatomy, top to bottom:
 *   chrome     back (other drivers) + notifications + messages
 *   identity   avatar with level badge, name, rank, location/vehicle tags,
 *              and the CURRENT RANK card — the page's primary rank surface
 *   telemetry  LEVEL n / xp / xp-required, solid racingRed progress
 *   stats      Cars / Friends / Trips / Day Streak, the shareable moment
 *   selector   Garage / Trips / Friends, the shared `CutCornerChip`
 *   content    the selected tab
 *   settings   a utility list: hairline dividers, no cards
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePickerExpo from "expo-image-picker";
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Crown,
  Flame,
  Globe2,
  HelpCircle,
  Info,
  Lock,
  MailOpen,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Radio,
  Route as RouteIcon,
  Search,
  Share2,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Trash,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useXP } from "@/hooks/useXPStore";
import { useQuests } from "@/hooks/useQuestStore";
import { useEvents } from "@/hooks/useEventsStore";
import { useCarDriveStats, CarDriveStats } from "@/hooks/useCarDriveStats";
import { rankForLevel, rankProgress } from "@/constants/ranks";
import { flagForCountry } from "@/constants/countries";
import RankBadge from "@/components/RankBadge";
import ShareCardModal from "@/components/ShareCardModal";
import TripCard, { ICON_STROKE } from "@/components/TripCard";
import { PlatinumNameBadge, PlatinumWordmark } from "@/components/platinum/PlatinumBadge";
import PlatinumAura from "@/components/platinum/PlatinumAura";
import ProfileFrame from "@/components/platinum/ProfileFrame";
import PremiumVehicleIcon from "@/components/platinum/PremiumVehicleIcon";
import ShowcaseModal from "@/components/platinum/ShowcaseModal";
import CosmeticsPicker from "@/components/platinum/CosmeticsPicker";
import TierLimitNotice, {
  PlatinumLockedRow,
} from "@/components/platinum/TierLimitNotice";
import { platinum } from "@/constants/platinum";
import { usePlatinum } from "@/hooks/usePlatinumStore";
import { useIsDriverPlatinum } from "@/hooks/usePlatinumDirectory";
import { useCosmetics } from "@/hooks/useCosmeticsStore";
import {
  chipContentColor,
  CutCornerButton,
  CutCornerChip,
  CutCornerSurface,
} from "@/components/CutCorner";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { tripCode } from "@/lib/tripStats";
import { supabase } from "@/lib/supabase";
import { generateCarImage } from "@/lib/generateCarImage";
import { parseLimitRejection } from "@/lib/platinumLimits";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

/** Screen-edge gutter. Same 16 the Drive Hub and the map use. */
const SCREEN_MARGIN = spacing.spacingLg;

/** Width available inside a full-bleed card, i.e. minus gutters + padding. */
const CARD_INNER_WIDTH = SCREEN_WIDTH - SCREEN_MARGIN * 2 - spacing.spacingLg * 2;

/** Icon sizes. Three steps, per DRIVE_HUB_REFERENCE §6.5. */
const ICON_SM = spacing.spacingMd; // 12 — inside tags and list metadata
const ICON_MD = spacing.spacingLg; // 16 — list rows, stat cells, chrome
const ICON_LG = spacing.spacingXl; // 24 — empty-state marks

/** Avatar geometry. Multiples of 4; `radius.circle` is blessed for avatars. */
const AVATAR_SIZE = 72;
const AVATAR_RING = borderWidth.emphasis;

/**
 * The live-activity dot is the one status colour left on the page. A live
 * feed is a real-time state, not a brand surface, and green is what every
 * product on a driver's phone uses for it. See PROFILE_SCREEN_REFERENCE D-3.
 */
const LIVE_GREEN = "#22C55E";

// XP curve mirror of useXPStore so we can render other users' level bars.
function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.6, level - 1));
}

// ─── Types ─────────────────────────────────────────────────
interface CarItem {
  id: string;
  name: string;
  make: string;
  model: string;
  year: string;
  color: string;
  color_name: string;
  hp: number;
  mileage_km: number;
  license_plate: string;
  is_primary: boolean;
  photo_url?: string | null;
}

interface TripItem {
  id: string;
  name: string | null;
  destination_name: string;
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  route_polyline: string;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  xp_earned: number;
  was_faster_than_estimation: boolean;
  completed_at: string;
  is_public: boolean;
}

function tripDisplayName(trip: TripItem): string {
  if (trip.name?.trim()) return trip.name;
  if (trip.destination_name && trip.destination_name !== "Unknown") return trip.destination_name;
  if (trip.origin_name) return trip.origin_name;
  return "Unnamed drive";
}

interface FriendItem {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  friend_profile?: { name: string; avatar?: string };
}

interface MessageItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

type FriendState = "none" | "pending_sent" | "pending_received" | "friends" | "self";
type ProfileTab = "garage" | "trips" | "friends";

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

/**
 * A tag: an inert label attached to a value (location, current vehicle).
 * Utility surface — plain rectangle at `radius.sharp`, hairline outline,
 * Inter text. Not a chip, not a button, so it does not take the cut.
 */
function Tag({
  icon,
  children,
  onPress,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.tag}>
      {icon}
      <View style={styles.tagLabelWrap}>{children}</View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

/** Chrome icon button: utility square, hairline, optional mono count. */
function ChromeButton({
  icon,
  count,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  count?: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} new` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.chromeBtn, pressed && styles.pressed]}
    >
      {icon}
      {count ? (
        <View style={styles.chromeCount}>
          <Text style={styles.chromeCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A progress track. Utility surface: plain rect, no cut, solid racingRed
 * fill — the token file's "separation is hairlines and surface steps"
 * applies to the track, and the fill is flat because nothing on this page
 * gradients any more.
 */
function ProgressTrack({ progress }: { progress: number }) {
  return (
    <View style={styles.track}>
      <View
        style={[styles.trackFill, { width: `${Math.min(Math.max(progress, 0), 1) * 100}%` }]}
      />
    </View>
  );
}

/** Empty / signed-out message. Names the control the user should press. */
function ProfileMessage({
  icon: Icon = Car,
  heading,
  body,
  action,
}: {
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  heading: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.message}>
      <Icon size={ICON_LG} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
      <Text style={styles.messageHeading}>{heading}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      {action ? (
        <CutCornerButton
          title={action.label}
          variant="outline"
          size="sm"
          corners="topRight"
          onPress={action.onPress}
          style={styles.messageAction}
        />
      ) : null}
    </View>
  );
}

/** Bottom sheet shell. Brand surface: carbon, hairline, one cut corner. */
function Sheet({
  children,
  bottomInset,
}: {
  children: React.ReactNode;
  bottomInset: number;
}) {
  return (
    <CutCornerSurface
      fill={colors.carbonSurface}
      borderColor={colors.hairline}
      borderWidth={borderWidth.hairline}
      cutSize={cut.lg}
      corners="topRight"
      style={styles.sheet}
      contentStyle={[styles.sheetContent, { paddingBottom: bottomInset + spacing.spacingXl }]}
    >
      {children}
    </CutCornerSurface>
  );
}

/* ------------------------------------------------------------------ *
 * Screen
 * ------------------------------------------------------------------ */

export default function ProfileScreen({ userId }: { userId?: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, updateProfilePicture, updateCountry } = useAuth();
  const selfXP = useXP();
  const { streak: selfStreak } = useQuests();
  const { events } = useEvents();

  const isSelf = !userId || userId === user?.id;
  const targetId = isSelf ? user?.id : userId;
  const { statsByCarId } = useCarDriveStats(targetId);

  // ─── Platinum ──────────────────────────────────────────────
  // The signed-in driver's own status comes from the RevenueCat SDK (the one
  // gate); another driver's comes from the narrow display lookup. Two sources
  // because only one of them is answerable on the client — see
  // `hooks/usePlatinumDirectory.ts`.
  const {
    isPlatinum: selfIsPlatinum,
    limit: platinumLimit,
    openPaywall,
    openCustomerCenter,
  } = usePlatinum();
  const otherIsPlatinum = useIsDriverPlatinum(isSelf ? null : targetId);
  const viewedIsPlatinum = isSelf ? selfIsPlatinum : otherIsPlatinum;
  const cosmetics = useCosmetics();
  const [showcaseCar, setShowcaseCar] = useState<CarItem | null>(null);
  const [cosmeticsOpen, setCosmeticsOpen] = useState(false);

  // ─── Target profile + stats ────────────────────────────────
  const [profileName, setProfileName] = useState<string>(user?.name ?? "Driver");
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>(user?.profilePicture);
  const [otherLevel, setOtherLevel] = useState(1);
  const [otherXp, setOtherXp] = useState(0);
  const [otherTotalXp, setOtherTotalXp] = useState(0);
  const [otherStreak, setOtherStreak] = useState(0);
  const [otherVehicleIcon, setOtherVehicleIcon] = useState<string | null>(null);
  const [otherProfileFrame, setOtherProfileFrame] = useState<string | null>(null);
  const [otherCountry, setOtherCountry] = useState<string | null>(null);

  const [cars, setCars] = useState<CarItem[]>([]);
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Signed-in viewer's inboxes ────────────────────────────
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendItem[]>([]);

  // ─── Friendship vs viewed user ─────────────────────────────
  const [friendState, setFriendState] = useState<FriendState>(isSelf ? "self" : "none");
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  // ─── UI state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ProfileTab>("garage");
  const [notifOpen, setNotifOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [premiumTargetCar, setPremiumTargetCar] = useState<CarItem | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingCountry, setEditingCountry] = useState(false);
  const [countryDraft, setCountryDraft] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [tripMenuTrip, setTripMenuTrip] = useState<TripItem | null>(null);
  const [showShareRank, setShowShareRank] = useState(false);

  // ─── Add-car form ──────────────────────────────────────────
  const [showAddCar, setShowAddCar] = useState(false);
  const [newCarName, setNewCarName] = useState("");
  const [newCarMake, setNewCarMake] = useState("");
  const [newCarYear, setNewCarYear] = useState("2024");
  const [newCarHP, setNewCarHP] = useState("300");

  // ─── Friend search (self) ──────────────────────────────────
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<Array<{ id: string; name: string; level: number; avatar?: string }>>([]);

  // ─── Data loaders ──────────────────────────────────────────
  const loadTargetProfile = useCallback(async () => {
    if (!targetId) return;
    if (isSelf) {
      setProfileName(user?.name ?? "Driver");
      setProfileAvatar(user?.profilePicture);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, name, avatar, vehicle_icon, profile_frame, country")
      .eq("id", targetId)
      .single();
    if (data) {
      setProfileName(data.name ?? "Driver");
      setProfileAvatar(data.avatar ?? undefined);
      // Another driver's cosmetics come off their profile row; the store only
      // holds the signed-in driver's own.
      setOtherVehicleIcon(data.vehicle_icon ?? null);
      setOtherProfileFrame(data.profile_frame ?? null);
      setOtherCountry(data.country ?? null);
    }
    const { data: xp } = await supabase
      .from("user_xp")
      .select("level, xp, total_xp")
      .eq("user_id", targetId)
      .single();
    if (xp) {
      setOtherLevel(xp.level ?? 1);
      setOtherXp(xp.xp ?? 0);
      setOtherTotalXp(xp.total_xp ?? 0);
    }
    const { data: stats } = await supabase
      .from("user_quest_stats")
      .select("current_streak")
      .eq("user_id", targetId)
      .single();
    if (stats) setOtherStreak(stats.current_streak ?? 0);
  }, [targetId, isSelf, user]);

  const loadCars = useCallback(async () => {
    if (!targetId) return;
    const { data } = await supabase
      .from("car_collections")
      .select("*")
      .eq("user_id", targetId)
      .order("is_primary", { ascending: false });
    if (data) setCars(data as CarItem[]);
  }, [targetId]);

  const loadTrips = useCallback(async () => {
    if (!targetId) return;
    const { data } = await supabase
      .from("trips")
      .select("*")
      .eq("user_id", targetId)
      .order("completed_at", { ascending: false })
      .limit(20);
    if (data) setTrips(data as TripItem[]);
  }, [targetId]);

  const loadFriends = useCallback(async () => {
    if (!targetId) return;
    const { data: sent } = await supabase
      .from("friends")
      .select("*, profiles!friends_friend_id_fkey(name, avatar)")
      .eq("user_id", targetId);
    const { data: received } = await supabase
      .from("friends")
      .select("*, profiles!friends_user_id_fkey(name, avatar)")
      .eq("friend_id", targetId);
    const normalize = (rows: any[]): FriendItem[] =>
      (rows ?? []).map((row) => {
        const p = row.profiles ?? {};
        return { ...row, friend_profile: { name: p.name, avatar: p.avatar } } as FriendItem;
      });
    const all = [...normalize(sent ?? []), ...normalize(received ?? [])].filter(
      (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i
    );
    setFriends(all);
  }, [targetId]);

  // Signed-in viewer's private inboxes (always about `user`, not target).
  const loadInboxes = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    const { data: dms } = await supabase
      .from("direct_messages")
      .select("*")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (dms) setMessages(dms as MessageItem[]);

    // Incoming friend requests → the notifications bell.
    const { data: reqs } = await supabase
      .from("friends")
      .select("*, profiles!friends_user_id_fkey(name, avatar)")
      .eq("friend_id", user.id)
      .eq("status", "pending");
    const normalized = (reqs ?? []).map((row: any) => ({
      ...row,
      friend_profile: { name: row.profiles?.name, avatar: row.profiles?.avatar },
    })) as FriendItem[];
    setPendingRequests(normalized);
  }, [isAuthenticated, user]);

  const loadFriendState = useCallback(async () => {
    if (isSelf) {
      setFriendState("self");
      return;
    }
    if (!user || !targetId) return;
    const { data } = await supabase
      .from("friends")
      .select("*")
      .or(
        `and(user_id.eq.${user.id},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${user.id})`
      )
      .limit(1);
    const r = data?.[0];
    if (!r) setFriendState("none");
    else if (r.status === "accepted") setFriendState("friends");
    else if (r.user_id === user.id) setFriendState("pending_sent");
    else setFriendState("pending_received");
  }, [isSelf, user, targetId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadTargetProfile(),
      loadCars(),
      loadTrips(),
      loadFriends(),
      loadFriendState(),
      // The bell + messages inboxes always belong to the signed-in viewer,
      // so they load even while viewing another driver's profile.
      loadInboxes(),
    ]);
    setLoading(false);
  }, [loadTargetProfile, loadCars, loadTrips, loadFriends, loadFriendState, loadInboxes]);

  useEffect(() => {
    if (isAuthenticated) loadAll();
  }, [isAuthenticated, targetId, loadAll]);

  // Live-update the viewer's inbox preview (unread badge, feed) as DMs arrive.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const channel = supabase
      .channel(`dm_${user.id}_${targetId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as MessageItem;
          if (msg.sender_id !== user.id && msg.receiver_id !== user.id) return;
          setMessages((prev) => [msg, ...prev]);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user, targetId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ─── Derived rank / xp values ──────────────────────────────
  const level = isSelf ? selfXP.level : otherLevel;
  const totalXp = isSelf ? selfXP.totalXp : otherTotalXp;
  const xpCurrentLevel = isSelf ? selfXP.xpCurrentLevel : otherXp;
  const xpRequired = isSelf ? selfXP.xpRequired : xpForLevel(otherLevel);
  const xpProgress = xpRequired > 0 ? xpCurrentLevel / xpRequired : 0;
  const streak = isSelf ? selfStreak : otherStreak;

  const rank = rankForLevel(level);
  const rankProg = rankProgress(level);

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const primaryCar = cars.find((c) => c.is_primary) ?? cars[0] ?? null;
  const otherCars = cars.filter((c) => c.id !== primaryCar?.id);

  const unreadMessages = messages.filter((m) => !m.is_read && m.receiver_id === user?.id).length;
  const notifCount = pendingRequests.length;

  // ─── Actions: avatar / name (self) ─────────────────────────
  const pickAndSetAvatar = useCallback(async (useCamera: boolean) => {
    try {
      if (Platform.OS !== "web") {
        const perm = useCamera
          ? await ImagePickerExpo.requestCameraPermissionsAsync()
          : await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Permission needed", "We need access to update your profile picture.");
          return;
        }
      }
      const result = useCamera
        ? await ImagePickerExpo.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePickerExpo.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingAvatar(true);
      const ok = await updateProfilePicture(result.assets[0].uri);
      if (ok) setProfileAvatar(result.assets[0].uri);
      else Alert.alert("Error", "Could not update your profile picture.");
    } catch {
      Alert.alert("Error", "Something went wrong updating your photo.");
    } finally {
      setUploadingAvatar(false);
    }
  }, [updateProfilePicture]);

  const handleChangeAvatar = useCallback(() => {
    if (!isSelf) return;
    Alert.alert("Profile Picture", "Choose a new profile picture", [
      { text: "Take Photo", onPress: () => pickAndSetAvatar(true) },
      { text: "Choose from Library", onPress: () => pickAndSetAvatar(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [isSelf, pickAndSetAvatar]);

  const saveName = useCallback(async () => {
    const next = nameDraft.trim();
    if (!user || !next) {
      setEditingName(false);
      return;
    }
    setProfileName(next);
    setEditingName(false);
    await supabase.from("profiles").update({ name: next }).eq("id", user.id);
  }, [nameDraft, user]);

  const saveCountry = useCallback(async () => {
    const next = countryDraft.trim();
    setEditingCountry(false);
    if (!user || !next) return;
    await updateCountry(next);
  }, [countryDraft, user, updateCountry]);

  // ─── Actions: garage ───────────────────────────────────────
  //
  // Regular garages hold 2 cars, Platinum is uncapped. The cap is checked in
  // two places on purpose: here, so the driver sees the paywall at the moment
  // they reach for a third slot, and in `enforce_garage_limit()`, so the cap
  // survives a client that skips this.
  const garageLimit = platinumLimit("garageCars");
  const atGarageLimit = garageLimit !== null && cars.length >= garageLimit;

  /** Opens the add-car form, or the paywall when the garage is full. */
  const handleOpenAddCar = useCallback(() => {
    if (atGarageLimit) {
      openPaywall("garage");
      return;
    }
    setShowAddCar(true);
  }, [atGarageLimit, openPaywall]);

  const handleAddCar = useCallback(async () => {
    if (!user || !newCarName.trim()) return;
    if (atGarageLimit) {
      setShowAddCar(false);
      openPaywall("garage");
      return;
    }
    const { error } = await supabase.from("car_collections").insert({
      user_id: user.id,
      name: newCarName.trim(),
      make: newCarMake.trim() || "Custom",
      model: "",
      year: newCarYear || "2024",
      color: colors.racingRed,
      color_name: "Custom",
      hp: parseInt(newCarHP, 10) || 300,
      mileage_km: 0,
      is_primary: cars.length === 0,
    });
    if (error) {
      // The trigger caught a race the local count missed (a car added on
      // another device). Still the paywall, not a raw Postgres message.
      const rejection = parseLimitRejection(error);
      if (rejection) {
        setShowAddCar(false);
        loadCars();
        openPaywall(rejection.benefit);
      }
      return;
    }
    setNewCarName("");
    setNewCarMake("");
    setShowAddCar(false);
    loadCars();
  }, [user, newCarName, newCarMake, newCarYear, newCarHP, cars.length, loadCars, atGarageLimit, openPaywall]);

  const handleDeleteCar = useCallback((carId: string) => {
    Alert.alert("Remove Car", "Are you sure you want to remove this car?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await supabase.from("car_collections").delete().eq("id", carId);
          loadCars();
        },
      },
    ]);
  }, [loadCars]);

  // ─── Actions: trip privacy ──────────────────────────────────
  const handleToggleTripVisibility = useCallback(async (trip: TripItem) => {
    const nextPublic = !trip.is_public;
    setTripMenuTrip(null);
    setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, is_public: nextPublic } : t)));
    const { error } = await supabase.from("trips").update({ is_public: nextPublic }).eq("id", trip.id);
    if (error) {
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? { ...t, is_public: !nextPublic } : t)));
      Alert.alert("Error", "Could not update trip privacy.");
    }
  }, []);

  const handleSetPrimary = useCallback(async (carId: string) => {
    if (!user) return;
    await supabase.from("car_collections").update({ is_primary: false }).eq("user_id", user.id);
    await supabase.from("car_collections").update({ is_primary: true }).eq("id", carId);
    loadCars();
  }, [user, loadCars]);

  // ─── AI car render (Gemini Lite) ────────────────────────────
  const openPremium = useCallback((car: CarItem) => {
    setPremiumTargetCar(car);
    setPremiumOpen(true);
  }, []);

  // Picks the driver's own car photo, sends it to the generate-car-image
  // edge function (Gemini 3.1 Flash Lite Image), and refreshes the garage
  // once the restyled render is saved. Storing a photo_url is what marks
  // the car as generated/featured everywhere else in this file.
  const handleGenerate = useCallback(async () => {
    if (!user || !premiumTargetCar) return;
    const car = premiumTargetCar;
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Permission needed", "We need photo access to generate your car.");
          return;
        }
      }
      const result = await ImagePickerExpo.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [16, 10],
        quality: 0.9,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? (asset.uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");

      setGenerating(true);
      await generateCarImage(car.id, asset.base64, mimeType);
      setGenerating(false);
      setPremiumOpen(false);
      setPremiumTargetCar(null);
      await loadCars();
      Alert.alert("Ready!", `${car.name} has been generated and added to your garage.`);
    } catch (err) {
      setGenerating(false);
      Alert.alert("Error", err instanceof Error ? err.message : "Could not generate your car.");
    }
  }, [user, premiumTargetCar, loadCars]);

  // ─── Actions: friends ──────────────────────────────────────
  const handleAddFriendById = useCallback(async () => {
    if (!user || !targetId) return;
    setFriendActionLoading(true);
    const { error } = await supabase.from("friends").insert({ user_id: user.id, friend_id: targetId, status: "pending" });
    setFriendActionLoading(false);
    if (error) Alert.alert("Error", error.message);
    else {
      setFriendState("pending_sent");
      Alert.alert("Sent!", `Friend request sent to ${profileName}.`);
    }
  }, [user, targetId, profileName]);

  const handleAcceptRequest = useCallback(async (friendshipId: string) => {
    await supabase.from("friends").update({ status: "accepted" }).eq("id", friendshipId);
    await Promise.all([loadInboxes(), loadFriends(), loadFriendState()]);
  }, [loadInboxes, loadFriends, loadFriendState]);

  const handleDeclineRequest = useCallback(async (friendshipId: string) => {
    await supabase.from("friends").delete().eq("id", friendshipId);
    await Promise.all([loadInboxes(), loadFriends(), loadFriendState()]);
  }, [loadInboxes, loadFriends, loadFriendState]);

  const handleSearchFriends = useCallback(async () => {
    if (!friendQuery.trim() || !user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, name, avatar")
      .ilike("name", `%${friendQuery.trim()}%`)
      .neq("id", user.id)
      .limit(10);
    if (data) {
      const ids = data.map((p: { id: string }) => p.id);
      const levelMap: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: xpData } = await supabase.from("user_xp").select("user_id, level").in("user_id", ids);
        (xpData ?? []).forEach((x: { user_id: string; level: number }) => { levelMap[x.user_id] = x.level; });
      }
      setFriendResults(
        data.map((p: { id: string; name: string; avatar?: string }) => ({
          id: p.id, name: p.name, level: levelMap[p.id] ?? 1, avatar: p.avatar,
        }))
      );
    }
  }, [friendQuery, user]);

  const handleAddSearchFriend = useCallback(async (friendId: string, name: string) => {
    if (!user) return;
    const { error } = await supabase.from("friends").insert({ user_id: user.id, friend_id: friendId, status: "pending" });
    if (error) Alert.alert("Error", error.message);
    else {
      Alert.alert("Sent!", `Friend request sent to ${name}`);
      loadFriends();
    }
  }, [user, loadFriends]);

  // ─── Actions: messages ─────────────────────────────────────
  const getFriendInfo = useCallback((partnerId: string): { name: string; avatar?: string } => {
    const f = friends.find((fr) => fr.user_id === partnerId || fr.friend_id === partnerId);
    if (f?.friend_profile?.name) return { name: f.friend_profile.name, avatar: f.friend_profile.avatar };
    const req = pendingRequests.find((r) => r.user_id === partnerId);
    if (req?.friend_profile?.name) return { name: req.friend_profile.name, avatar: req.friend_profile.avatar };
    return { name: "Driver" };
  }, [friends, pendingRequests]);

  // ─── Header message button opens the full-screen Messages page ─
  const openMessages = useCallback(() => {
    if (!isSelf && targetId) router.push(`/messages/${targetId}` as any);
    else router.push("/messages" as any);
  }, [isSelf, targetId, router]);

  // ─── Helpers ───────────────────────────────────────────────
  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  // ─── Not authenticated ─────────────────────────────────────
  if (!isAuthenticated && isSelf) {
    return (
      <View style={styles.container}>
        <View style={[styles.signedOut, { paddingTop: insets.top + spacing.spacingXxxl }]}>
          <ProfileMessage
            icon={Car}
            heading="Join the drive"
            body="A profile holds your garage, your trip log and your XP, so it needs an account. Tap Sign In below, or create one from the sign-in screen."
            action={{ label: "Sign In", onPress: () => router.push("/login" as any) }}
          />
          <CutCornerButton
            title="Create Account"
            variant="ghost"
            size="md"
            corners="topRight"
            onPress={() => router.push("/signup" as any)}
            style={styles.signedOutSecondary}
          />
        </View>
      </View>
    );
  }

  const stats: { key: string; icon: typeof Car; value: number; label: string }[] = [
    { key: "cars", icon: Car, value: cars.length, label: "Cars" },
    { key: "friends", icon: Users, value: acceptedFriends.length, label: "Friends" },
    { key: "trips", icon: RouteIcon, value: trips.length, label: "Trips" },
    { key: "streak", icon: Flame, value: streak, label: "Day Streak" },
  ];

  const TABS: { key: ProfileTab; label: string; icon: typeof Car }[] = [
    { key: "garage", label: "Garage", icon: Car },
    { key: "trips", label: "Trips", icon: RouteIcon },
    { key: "friends", label: "Friends", icon: Users },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 120, paddingTop: insets.top + spacing.spacingSm },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.racingRed} />
        }
      >
        {/* ═══ CHROME: back (other) + notifications + messages ═══ */}
        <View style={styles.chromeRow}>
          {!isSelf ? (
            <ChromeButton
              label="Back"
              onPress={() => router.back()}
              icon={
                <ArrowLeft size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
              }
            />
          ) : (
            <View />
          )}
          <View style={styles.chromeActions}>
            <ChromeButton
              label="Notifications"
              count={notifCount}
              onPress={() => setNotifOpen(true)}
              icon={<Bell size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />}
            />
            <ChromeButton
              label="Messages"
              count={unreadMessages}
              onPress={openMessages}
              icon={
                <MessageCircle size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
              }
            />
          </View>
        </View>

        {/* ═══ IDENTITY + CURRENT RANK ═══ */}
        <View style={styles.identityRow}>
          <Pressable
            accessibilityRole={isSelf ? "button" : undefined}
            accessibilityLabel={isSelf ? "Change profile picture" : undefined}
            onPress={handleChangeAvatar}
            disabled={!isSelf || uploadingAvatar}
            style={({ pressed }) => [styles.avatarWrap, pressed && isSelf && styles.pressed]}
          >
            {/* Aura outside, frame inside, avatar innermost. Both render as
                nothing for a Regular driver, and both draw past the avatar
                box without moving the level badge — `avatarWrap` is pinned to
                AVATAR_SIZE and the overlay is centred inside it. */}
            <PlatinumAura
              show={viewedIsPlatinum}
              size={AVATAR_SIZE}
              emphasis
              style={styles.avatarAura}
            >
              <ProfileFrame
                frame={isSelf ? cosmetics.selectedProfileFrame : otherProfileFrame}
                isPlatinum={viewedIsPlatinum}
                size={AVATAR_SIZE}
              >
                <View style={styles.avatarRing}>
                  <View style={styles.avatarInner}>
                    {uploadingAvatar ? (
                      <ActivityIndicator color={colors.racingRed} />
                    ) : profileAvatar ? (
                      <Image source={{ uri: profileAvatar }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarLetter}>{(profileName ?? "D")[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                </View>
              </ProfileFrame>
            </PlatinumAura>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{level}</Text>
            </View>
          </Pressable>

          <View style={styles.identityInfo}>
            <View style={styles.nameRow}>
              {editingName ? (
                <TextInput
                  style={styles.nameInput}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                  placeholderTextColor={colors.textSecondary}
                />
              ) : (
                <Text style={styles.userName} numberOfLines={1}>{profileName}</Text>
              )}
              {/* Subscription status, next to the name. Distinct from the
                  rank badge below it, which is progression. */}
              <PlatinumNameBadge
                show={viewedIsPlatinum && !editingName}
                name={profileName}
              />
              {isSelf && !editingName && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit name"
                  onPress={() => { setNameDraft(profileName); setEditingName(true); }}
                  hitSlop={spacing.spacingSm}
                >
                  <Pencil size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                </Pressable>
              )}
            </View>

            <Text style={styles.rankSubtitle}>{rank.name}</Text>

            {isSelf ? (
              <View style={styles.nameRow}>
                {editingCountry ? (
                  <TextInput
                    style={styles.countryInput}
                    value={countryDraft}
                    onChangeText={setCountryDraft}
                    autoFocus
                    onBlur={saveCountry}
                    onSubmitEditing={saveCountry}
                    placeholder="Country"
                    placeholderTextColor={colors.textSecondary}
                  />
                ) : (
                  <Tag
                    icon={
                      user?.country ? (
                        <Text style={styles.countryFlag}>{flagForCountry(user.country)}</Text>
                      ) : (
                        <MapPin size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      )
                    }
                  >
                    <Text style={styles.tagText} numberOfLines={1}>
                      {user?.country || "Set your nation"}
                    </Text>
                  </Tag>
                )}
                {!editingCountry && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit nation"
                    onPress={() => { setCountryDraft(user?.country ?? ""); setEditingCountry(true); }}
                    hitSlop={spacing.spacingSm}
                  >
                    <Pencil size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                  </Pressable>
                )}
              </View>
            ) : otherCountry ? (
              <View style={styles.nameRow}>
                <Tag icon={<Text style={styles.countryFlag}>{flagForCountry(otherCountry)}</Text>}>
                  <Text style={styles.tagText} numberOfLines={1}>
                    {otherCountry}
                  </Text>
                </Tag>
              </View>
            ) : null}

            {primaryCar && (
              <Tag
                icon={<Car size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              >
                <Text style={styles.tagText} numberOfLines={1}>
                  Driving <Text style={styles.tagTextStrong}>{primaryCar.name}</Text>
                </Text>
              </Tag>
            )}
          </View>

          {/* Current rank — the page's PRIMARY rank surface: filled card,
              with the on-demand "Share your rank" affordance stacked under it. */}
          <View style={styles.rankColumn}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Current rank ${rank.name}`}
            onPress={() => router.push("/ranks" as any)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.md}
              corners="topRight"
              style={styles.rankCard}
              contentStyle={styles.rankCardContent}
            >
              <Text style={styles.overline}>CURRENT RANK</Text>
              <RankBadge rank={rank} size={54} />
              <Text style={styles.rankCardName} numberOfLines={1}>{rank.name}</Text>
              <Info size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </CutCornerSurface>
          </Pressable>

          {isSelf ? (
            <CutCornerButton
              title="Share"
              variant="ghost"
              size="sm"
              corners="topRight"
              onPress={() => setShowShareRank(true)}
              style={styles.shareRankButton}
              icon={
                <Share2 size={ICON_SM} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
              }
            />
          ) : null}
          </View>
        </View>

        {/* ═══ LEVEL / XP ═══ */}
        <View style={styles.block}>
          <View style={styles.xpRow}>
            <Text style={styles.xpLevel}>LEVEL {level}</Text>
            <Text style={styles.xpValue}>{xpCurrentLevel} / {xpRequired} XP</Text>
          </View>
          <ProgressTrack progress={xpProgress} />
          <Text style={styles.xpToNext}>
            {Math.max(xpRequired - xpCurrentLevel, 0)} XP to next level
          </Text>
        </View>

        {/* ═══ FRIEND ACTION (other driver) ═══ */}
        {!isSelf && (
          <View style={styles.friendActionRow}>
            {friendState === "none" && (
              <CutCornerButton
                title={friendActionLoading ? "Sending…" : "Add Friend"}
                variant="primary"
                size="md"
                corners="topRight"
                disabled={friendActionLoading}
                onPress={handleAddFriendById}
                style={styles.friendActionPrimary}
                icon={
                  <UserPlus size={ICON_MD} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                }
              />
            )}
            {friendState === "pending_sent" && (
              <View style={styles.friendStatus}>
                <Clock size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.friendStatusText}>Request pending</Text>
              </View>
            )}
            {friendState === "pending_received" && pendingRequests.find((r) => r.user_id === targetId) && (
              <CutCornerButton
                title="Accept"
                variant="primary"
                size="md"
                corners="topRight"
                onPress={() => {
                  const req = pendingRequests.find((r) => r.user_id === targetId);
                  if (req) handleAcceptRequest(req.id);
                }}
                style={styles.friendActionPrimary}
                icon={
                  <UserCheck size={ICON_MD} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                }
              />
            )}
            {friendState === "friends" && (
              <View style={styles.friendStatus}>
                <UserCheck size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
                <Text style={[styles.friendStatusText, { color: colors.textPrimary }]}>Friends</Text>
              </View>
            )}
            <CutCornerButton
              title="Message"
              variant="ghost"
              size="md"
              corners="topRight"
              onPress={() => { if (targetId) router.push(`/messages/${targetId}` as any); }}
              icon={
                <MessageCircle size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
              }
            />
          </View>
        )}

        {/* ═══ STATS ═══ */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <CutCornerSurface
              key={s.key}
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.sm}
              corners="topRight"
              style={styles.statCard}
              contentStyle={styles.statCardContent}
            >
              <s.icon size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </CutCornerSurface>
          ))}
        </View>

        {/* ═══ TAB SELECTOR ═══ */}
        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <CutCornerChip
                key={tab.key}
                label={tab.label}
                active={isActive}
                onPress={() => setActiveTab(tab.key)}
                style={styles.tabChip}
                icon={
                  <tab.icon
                    size={ICON_SM}
                    color={chipContentColor(isActive)}
                    strokeWidth={ICON_STROKE}
                  />
                }
              />
            );
          })}
        </View>

        {/* ═══ GARAGE ═══ */}
        {activeTab === "garage" && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={styles.loader} />
            ) : primaryCar ? (
              <FeaturedCar
                car={primaryCar}
                isSelf={isSelf}
                onGenerate={() => openPremium(primaryCar)}
                onDelete={() => handleDeleteCar(primaryCar.id)}
                driveStats={statsByCarId[primaryCar.id]}
              />
            ) : (
              <ProfileMessage
                icon={Car}
                heading="No cars yet"
                body={
                  isSelf
                    ? "Your garage is empty. Tap Add a car below to put your first ride in it."
                    : "This driver hasn't added a car to their garage yet."
                }
              />
            )}

            {/* Secondary cars */}
            {otherCars.map((car) => (
              <GarageCard
                key={car.id}
                car={car}
                isSelf={isSelf}
                stats={statsByCarId[car.id]}
                vehicleIcon={isSelf ? cosmetics.selectedVehicleIcon : otherVehicleIcon}
                isPlatinum={viewedIsPlatinum}
                onSetPrimary={() => handleSetPrimary(car.id)}
                onDelete={() => handleDeleteCar(car.id)}
              />
            ))}

            {/* Garage usage. Shows "1 of 2 cars" under the cap and the
                upgrade prompt at it, so the limit is never a surprise the
                first time the add button refuses. */}
            {isSelf && (
              <TierLimitNotice
                current={cars.length}
                cap={garageLimit}
                noun="cars"
                benefit="garage"
                atCapMessage="Go Platinum for unlimited garage slots."
                style={styles.blockCard}
              />
            )}

            {/* AI Showcase — Platinum only. Locked drivers get the same
                chrome row every other Platinum gate uses, not a hidden
                feature: a perk nobody can see is a perk nobody buys. */}
            {isSelf && primaryCar && (
              selfIsPlatinum ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Generate an AI showcase of ${primaryCar.name}`}
                  onPress={() => setShowcaseCar(primaryCar)}
                  style={({ pressed }) => [styles.blockCard, pressed && styles.pressed]}
                >
                  <CutCornerSurface
                    fill={colors.voidBlack}
                    borderColor={platinum.chromeDeep}
                    borderWidth={borderWidth.hairline}
                    cutSize={cut.md}
                    corners="topRight"
                    contentStyle={styles.addCarPrompt}
                  >
                    <Sparkles size={ICON_MD} color={platinum.chrome} strokeWidth={ICON_STROKE} />
                    <Text style={styles.showcasePromptText}>Generate Showcase</Text>
                  </CutCornerSurface>
                </Pressable>
              ) : (
                <PlatinumLockedRow
                  label="AI Car Showcase"
                  detail="Turn a phone photo into a studio render."
                  benefit="showcase"
                  style={styles.blockCard}
                />
              )
            )}

            {/* Cosmetics — icon + frame picker. Everyone can open it; the
                locked options raise the paywall when tapped. */}
            {isSelf && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vehicle icons and profile frames"
                onPress={() => setCosmeticsOpen(true)}
                style={({ pressed }) => [styles.blockCard, pressed && styles.pressed]}
              >
                <CutCornerSurface
                  fill={colors.voidBlack}
                  borderColor={colors.hairline}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.md}
                  corners="topRight"
                  contentStyle={styles.addCarPrompt}
                >
                  <PremiumVehicleIcon
                    icon={cosmetics.selectedVehicleIcon}
                    isPlatinum={selfIsPlatinum}
                    size={ICON_MD}
                    color={colors.textSecondary}
                    strokeWidth={ICON_STROKE}
                  />
                  <Text style={styles.addCarPromptText}>Icons & frames</Text>
                </CutCornerSurface>
              </Pressable>
            )}

            {/* Add a car (self only) */}
            {isSelf && (showAddCar ? (
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.blockCard}
                contentStyle={styles.addCarForm}
              >
                <TextInput
                  style={styles.input}
                  placeholder="Car name (e.g. Night Fury)"
                  placeholderTextColor={colors.textSecondary}
                  value={newCarName}
                  onChangeText={setNewCarName}
                />
                <View style={styles.addCarFormRow}>
                  <TextInput
                    style={[styles.input, styles.inputFlex]}
                    placeholder="Make (e.g. BMW)"
                    placeholderTextColor={colors.textSecondary}
                    value={newCarMake}
                    onChangeText={setNewCarMake}
                  />
                  <TextInput
                    style={[styles.input, styles.inputFlex, styles.inputNumeric]}
                    placeholder="Year"
                    placeholderTextColor={colors.textSecondary}
                    value={newCarYear}
                    onChangeText={setNewCarYear}
                    keyboardType="number-pad"
                  />
                </View>
                <TextInput
                  style={[styles.input, styles.inputNumeric]}
                  placeholder="HP"
                  placeholderTextColor={colors.textSecondary}
                  value={newCarHP}
                  onChangeText={setNewCarHP}
                  keyboardType="number-pad"
                />
                <View style={styles.addCarActions}>
                  <CutCornerButton
                    title="Cancel"
                    variant="ghost"
                    size="sm"
                    corners="topRight"
                    onPress={() => setShowAddCar(false)}
                    style={styles.addCarAction}
                  />
                  <CutCornerButton
                    title="Add Car"
                    variant="primary"
                    size="sm"
                    corners="topRight"
                    onPress={handleAddCar}
                    style={styles.addCarAction}
                  />
                </View>
              </CutCornerSurface>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  atGarageLimit
                    ? "Garage full. Upgrade to Platinum for unlimited slots."
                    : "Add a car to your garage"
                }
                onPress={handleOpenAddCar}
                style={({ pressed }) => [styles.blockCard, pressed && styles.pressed]}
              >
                <CutCornerSurface
                  fill={colors.voidBlack}
                  borderColor={colors.hairline}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.md}
                  corners="topRight"
                  contentStyle={styles.addCarPrompt}
                >
                  <Plus size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                  <Text style={styles.addCarPromptText}>Add a car to your garage</Text>
                </CutCornerSurface>
              </Pressable>
            ))}

            {/* Rank progress — SECONDARY to the header's rank card: no fill. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rank progress"
              onPress={() => router.push("/ranks" as any)}
              style={({ pressed }) => [styles.blockCard, pressed && styles.pressed]}
            >
              <CutCornerSurface
                fill={colors.voidBlack}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                contentStyle={styles.rankProgress}
              >
                <RankBadge rank={rank} size={40} />
                <View style={styles.rankProgressMiddle}>
                  <Text style={styles.overline}>RANK PROGRESS</Text>
                  <Text style={styles.rankProgressName} numberOfLines={1}>{rank.name}</Text>
                  <ProgressTrack progress={rankProg.progress} />
                  <Text style={styles.rankProgressNote}>
                    {rankProg.next
                      ? `${rankProg.levelsToNext} levels to next rank`
                      : "Top rank reached"}
                  </Text>
                </View>
                {rankProg.next ? (
                  <>
                    <View style={styles.verticalDivider} />
                    <View style={styles.rankNext}>
                      <Text style={styles.overline}>NEXT RANK</Text>
                      <RankBadge rank={rankProg.next} size={30} />
                      {/* Two lines, not one: "Street Explorer" truncates
                          in this column, and a truncated rank name is the
                          one thing the card exists to show. */}
                      <Text style={styles.rankNextName} numberOfLines={2}>
                        {rankProg.next.name}
                      </Text>
                      <Text style={styles.rankNextLevel}>Lv {rankProg.next.minLevel}</Text>
                    </View>
                    <ChevronRight
                      size={ICON_MD}
                      color={colors.textSecondary}
                      strokeWidth={ICON_STROKE}
                    />
                  </>
                ) : null}
              </CutCornerSurface>
            </Pressable>

            {/* Live Feed + Inbox */}
            <View style={styles.feedRow}>
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.feedCol}
                contentStyle={styles.feedColContent}
              >
                <View style={styles.feedHeader}>
                  <View style={styles.feedTitleRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.overline}>LIVE FEED</Text>
                  </View>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push("/(tabs)/map" as any)}
                    hitSlop={spacing.spacingSm}
                  >
                    <Text style={styles.seeAll}>See All</Text>
                  </Pressable>
                </View>
                {events.slice(0, 3).map((e) => (
                  <FeedItem
                    key={e.id}
                    icon={
                      e.is_live ? (
                        <Radio size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      ) : (
                        <MapPin size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      )
                    }
                    title={e.title}
                    preview={e.is_live ? "Live now" : `${e.participant_count} joined`}
                    time={timeAgo(e.starts_at)}
                    onPress={() => router.push("/(tabs)/map" as any)}
                  />
                ))}
                {events.length === 0 && (
                  <Text style={styles.feedEmpty}>No nearby activity yet.</Text>
                )}
              </CutCornerSurface>

              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.feedCol}
                contentStyle={styles.feedColContent}
              >
                <View style={styles.feedHeader}>
                  <Text style={styles.overline}>INBOX</Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push("/messages" as any)}
                    hitSlop={spacing.spacingSm}
                  >
                    <Text style={styles.seeAll}>See All</Text>
                  </Pressable>
                </View>
                <FeedItem
                  icon={<Trophy size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
                  title="Rank Rewards"
                  preview={`You've earned ${totalXp} XP`}
                  onPress={() => router.push("/ranks" as any)}
                />
                {inboxConversations(messages, user?.id).slice(0, 2).map(([partnerId, last]) => {
                  const p = getFriendInfo(partnerId);
                  return (
                    <FeedItem
                      key={partnerId}
                      icon={
                        <MessageCircle
                          size={ICON_SM}
                          color={colors.textSecondary}
                          strokeWidth={ICON_STROKE}
                        />
                      }
                      title={p.name}
                      preview={`${last.sender_id === user?.id ? "You: " : ""}${last.content}`}
                      time={timeAgo(last.created_at)}
                      onPress={() => router.push(`/messages/${partnerId}` as any)}
                    />
                  );
                })}
                {messages.length === 0 && (
                  <Text style={styles.feedEmpty}>No messages yet.</Text>
                )}
              </CutCornerSurface>
            </View>
          </View>
        )}

        {/* ═══ TRIPS ═══ */}
        {activeTab === "trips" && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={styles.loader} />
            ) : trips.length === 0 ? (
              <ProfileMessage
                icon={RouteIcon}
                heading="No trips recorded"
                body={
                  isSelf
                    ? "Nothing has been logged yet. Tap DRIVE on the map to record your first one."
                    : "This driver hasn't recorded a public trip yet."
                }
              />
            ) : (
              trips.map((trip, idx) => (
                <View key={trip.id} style={styles.blockCard}>
                  <TripCard
                    trip={trip}
                    code={tripCode(idx, trips.length)}
                    traceWidth={CARD_INNER_WIDTH}
                    showMenu={isSelf}
                    onPress={() => router.push(`/trip/${trip.id}` as any)}
                    onMenuPress={() => setTripMenuTrip(trip)}
                  />
                </View>
              ))
            )}
          </View>
        )}

        {/* ═══ FRIENDS ═══ */}
        {activeTab === "friends" && (
          <View style={styles.section}>
            {isSelf && (
              <>
                <View style={styles.searchRow}>
                  <View style={styles.searchField}>
                    <Search size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search drivers by name"
                      placeholderTextColor={colors.textSecondary}
                      value={friendQuery}
                      onChangeText={setFriendQuery}
                      onSubmitEditing={handleSearchFriends}
                      returnKeyType="search"
                    />
                    {friendQuery.length > 0 && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        onPress={() => { setFriendQuery(""); setFriendResults([]); }}
                        hitSlop={spacing.spacingSm}
                      >
                        <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                      </Pressable>
                    )}
                  </View>
                  {/* `ghost`, not `primary`: the active FRIENDS chip is
                      already the viewport's one red control, and two red
                      slabs side by side stop either reading as the accent. */}
                  <CutCornerButton
                    title="Find"
                    variant="ghost"
                    size="sm"
                    corners="topRight"
                    onPress={handleSearchFriends}
                  />
                </View>
                {friendResults.map((r) => (
                  <DriverRow
                    key={r.id}
                    name={r.name}
                    meta={`${rankForLevel(r.level).name} · Level ${r.level}`}
                    avatar={r.avatar}
                    onPress={() => router.push(`/user/${r.id}` as any)}
                    action={{
                      label: `Add ${r.name}`,
                      icon: (
                        <UserPlus size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                      ),
                      onPress: () => handleAddSearchFriend(r.id, r.name),
                    }}
                  />
                ))}
              </>
            )}

            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={styles.loader} />
            ) : acceptedFriends.length === 0 && friendResults.length === 0 ? (
              <ProfileMessage
                icon={Users}
                heading="No friends yet"
                body={
                  isSelf
                    ? "Nobody is on your list yet. Search a driver's name above and tap Find to send a request."
                    : "This driver hasn't added anyone yet."
                }
              />
            ) : (
              acceptedFriends.map((f) => {
                const otherId = f.user_id === targetId ? f.friend_id : f.user_id;
                return (
                  <DriverRow
                    key={f.id}
                    name={f.friend_profile?.name ?? "Unknown"}
                    meta="Friend"
                    avatar={f.friend_profile?.avatar}
                    onPress={() => router.push(`/user/${otherId}` as any)}
                    action={
                      isSelf
                        ? {
                            label: `Message ${f.friend_profile?.name ?? "driver"}`,
                            icon: (
                              <MessageCircle
                                size={ICON_MD}
                                color={colors.textPrimary}
                                strokeWidth={ICON_STROKE}
                              />
                            ),
                            onPress: () => router.push(`/messages/${otherId}` as any),
                          }
                        : undefined
                    }
                  />
                );
              })
            )}
          </View>
        )}

        {/* ═══ SETTINGS (self only) — a utility list, not cards ═══ */}
        {isSelf && (
          <View style={styles.settings}>
            <Text style={styles.settingsTitle}>SETTINGS</Text>
            {/* The dedicated Platinum entry point. Chrome, not racingRed —
                it is a status row, not the screen's primary action.

                It changes destination with the driver's tier: a Regular driver
                gets the paywall, a subscriber gets the Customer Center. Sending
                an existing subscriber to a screen selling them what they
                already own is the single most common way this row goes wrong. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selfIsPlatinum
                  ? "Manage your Driveverse Platinum subscription"
                  : "Upgrade to Driveverse Platinum"
              }
              onPress={() =>
                selfIsPlatinum ? void openCustomerCenter() : openPaywall()
              }
              style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
            >
              <View style={styles.settingLeft}>
                <PlatinumWordmark size={ICON_MD} label="DRIVEVERSE PLATINUM" />
              </View>
              <View style={styles.settingRight}>
                <Text style={styles.platinumStatus}>
                  {selfIsPlatinum ? "ACTIVE" : "UPGRADE"}
                </Text>
                <ChevronRight size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              </View>
            </Pressable>
            <SettingRow
              icon={<MessageCircle size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              label="Messages"
              count={unreadMessages}
              onPress={() => router.push("/messages" as any)}
            />
            <SettingRow
              icon={<Crown size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              label="Convoy"
              onPress={() => router.push("/convoy" as any)}
            />
            <SettingRow
              icon={<Bookmark size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              label="Saved Places"
              onPress={() => router.push("/saved-places" as any)}
            />
            <SettingRow
              icon={<Trophy size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              label="Levels & Ranks"
              onPress={() => router.push("/ranks" as any)}
            />
            <SettingRow
              icon={<Shield size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              label="Privacy & Terms"
              onPress={() => router.push("/terms-and-conditions" as any)}
            />
            <SettingRow
              icon={<HelpCircle size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />}
              label="Help & Support"
            />
          </View>
        )}
      </ScrollView>

      {/* ═══ NOTIFICATIONS ═══ */}
      <Modal visible={notifOpen} transparent animationType="slide" onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNotifOpen(false)} />
        <Sheet bottomInset={insets.bottom}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>NOTIFICATIONS</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setNotifOpen(false)}
              hitSlop={spacing.spacingSm}
            >
              <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>
          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.overline}>FRIEND REQUESTS</Text>
            {pendingRequests.length === 0 ? (
              <ProfileMessage
                icon={MailOpen}
                heading="Nothing waiting"
                body="No driver has asked to connect yet. Find people from the Friends tab on your profile."
              />
            ) : (
              pendingRequests.map((req) => (
                <DriverRow
                  key={req.id}
                  name={req.friend_profile?.name ?? "A driver"}
                  meta="wants to be friends"
                  avatar={req.friend_profile?.avatar}
                  onPress={() => { setNotifOpen(false); router.push(`/user/${req.user_id}` as any); }}
                  action={{
                    label: "Accept",
                    icon: <Check size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />,
                    onPress: () => handleAcceptRequest(req.id),
                  }}
                  secondaryAction={{
                    label: "Decline",
                    icon: <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />,
                    onPress: () => handleDeclineRequest(req.id),
                  }}
                />
              ))
            )}
          </ScrollView>
        </Sheet>
      </Modal>

      {/* ═══ AI SHOWCASE (Platinum) ═══ */}
      <ShowcaseModal
        visible={showcaseCar !== null}
        onClose={() => setShowcaseCar(null)}
        car={
          showcaseCar
            ? {
                id: showcaseCar.id,
                name: showcaseCar.name,
                make: showcaseCar.make,
                year: showcaseCar.year,
                hp: showcaseCar.hp,
              }
            : null
        }
      />

      {/* ═══ COSMETICS PICKER ═══ */}
      <CosmeticsPicker
        visible={cosmeticsOpen}
        onClose={() => setCosmeticsOpen(false)}
      />

      {/* ═══ AI CAR GENERATION (Gemini Lite) ═══ */}
      <Modal visible={premiumOpen} transparent animationType="slide" onRequestClose={() => setPremiumOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !generating && setPremiumOpen(false)} />
        <Sheet bottomInset={insets.bottom}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>GENERATE YOUR CAR</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => !generating && setPremiumOpen(false)}
              hitSlop={spacing.spacingSm}
            >
              <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>
          <Text style={styles.premiumBody}>
            Upload a photo of {premiumTargetCar?.name ?? "your car"} and Gemini will re-light it into a
            studio-grade showcase render for your garage and profile — visible to every driver who
            views your page.
          </Text>
          <View style={styles.premiumPerks}>
            {["AI-generated studio car render", "Featured on your public profile", "Free, powered by Gemini Lite"].map((perk) => (
              <View key={perk} style={styles.premiumPerkRow}>
                <Check size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.premiumPerkText}>{perk}</Text>
              </View>
            ))}
          </View>
          <CutCornerButton
            title={generating ? "Generating…" : "Choose Photo & Generate"}
            variant="primary"
            size="lg"
            corners="topRight"
            disabled={generating}
            onPress={handleGenerate}
            icon={
              generating ? (
                <ActivityIndicator size="small" color={colors.voidBlack} />
              ) : (
                <Sparkles size={ICON_MD} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
              )
            }
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => !generating && setPremiumOpen(false)}
            disabled={generating}
          >
            <Text style={styles.premiumCancel}>Maybe later</Text>
          </Pressable>
        </Sheet>
      </Modal>

      {/* ═══ TRIP PRIVACY MENU ═══ */}
      <Modal visible={!!tripMenuTrip} transparent animationType="fade" onRequestClose={() => setTripMenuTrip(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTripMenuTrip(null)} />
        <Sheet bottomInset={insets.bottom}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {tripMenuTrip ? tripDisplayName(tripMenuTrip).toUpperCase() : ""}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => setTripMenuTrip(null)}
              hitSlop={spacing.spacingSm}
            >
              <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => tripMenuTrip && handleToggleTripVisibility(tripMenuTrip)}
            style={({ pressed }) => [styles.sheetOption, pressed && styles.pressed]}
          >
            {tripMenuTrip?.is_public ? (
              <Lock size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
            ) : (
              <Globe2 size={ICON_MD} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
            )}
            <View style={styles.sheetOptionText}>
              <Text style={styles.sheetOptionTitle}>
                {tripMenuTrip?.is_public ? "Make private" : "Make public"}
              </Text>
              <Text style={styles.sheetOptionSub}>
                {tripMenuTrip?.is_public
                  ? "Only you will be able to see this trip."
                  : "Other drivers will be able to see this trip."}
              </Text>
            </View>
          </Pressable>
        </Sheet>
      </Modal>

      {isSelf ? (
        <ShareCardModal
          visible={showShareRank}
          onClose={() => setShowShareRank(false)}
          type="rank"
          payload={{ rank, level, totalXp }}
          caption={`${rank.name} on Driveverse`}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Rows and cards
 * ------------------------------------------------------------------ */

/**
 * Settings row. Utility list: hairline divider, no card, no cut.
 *
 * `onPress` is optional because Help & Support has no destination yet —
 * the row was already inert before this pass and inventing a route it
 * would 404 on is worse than leaving it as it was.
 */
function SettingRow({
  icon,
  label,
  count,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} unread` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
    >
      <View style={styles.settingLeft}>
        {icon}
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <View style={styles.settingRight}>
        {count ? <Text style={styles.settingCount}>{count}</Text> : null}
        <ChevronRight size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
      </View>
    </Pressable>
  );
}

/** Live Feed / Inbox list item. Icon sits in a small carbon circle. */
function FeedItem({
  icon,
  title,
  preview,
  time,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  preview: string;
  time?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${preview}`}
      onPress={onPress}
      style={({ pressed }) => [styles.feedItem, pressed && styles.pressed]}
    >
      <View style={styles.feedIcon}>{icon}</View>
      <View style={styles.feedItemText}>
        <Text style={styles.feedItemTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.feedItemPreview} numberOfLines={1}>{preview}</Text>
      </View>
      {time ? <Text style={styles.feedItemTime}>{time}</Text> : null}
    </Pressable>
  );
}

/** Driver list row: avatar, name, meta, up to two icon actions. */
function DriverRow({
  name,
  meta,
  avatar,
  onPress,
  action,
  secondaryAction,
}: {
  name: string;
  meta: string;
  avatar?: string;
  onPress: () => void;
  action?: { label: string; icon: React.ReactNode; onPress: () => void };
  secondaryAction?: { label: string; icon: React.ReactNode; onPress: () => void };
}) {
  return (
    <View style={styles.driverRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${meta}`}
        onPress={onPress}
        style={({ pressed }) => [styles.driverInfo, pressed && styles.pressed]}
      >
        <View style={styles.driverAvatar}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.driverAvatarImage} />
          ) : (
            <Text style={styles.driverAvatarLetter}>{name[0]?.toUpperCase() ?? "?"}</Text>
          )}
        </View>
        <View style={styles.driverText}>
          <Text style={styles.driverName} numberOfLines={1}>{name}</Text>
          <Text style={styles.driverMeta} numberOfLines={1}>{meta}</Text>
        </View>
      </Pressable>
      {secondaryAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondaryAction.label}
          onPress={secondaryAction.onPress}
          style={({ pressed }) => [styles.driverAction, pressed && styles.pressed]}
        >
          {secondaryAction.icon}
        </Pressable>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={({ pressed }) => [styles.driverAction, pressed && styles.pressed]}
        >
          {action.icon}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Per-car drive data: distance / avg speed / XP earned in this car. */
function CarDriveDataRow({ stats }: { stats?: CarDriveStats }) {
  if (!stats || stats.tripCount === 0) return null;
  return (
    <View style={styles.driveDataRow}>
      <CarDatum
        label="DIST"
        value={Math.round(stats.totalDistanceKm).toLocaleString("en-US")}
        unit="km"
      />
      <View style={styles.verticalDivider} />
      <CarDatum label="AVG" value={stats.avgSpeedKmh.toFixed(0)} unit="km/h" />
      <View style={styles.verticalDivider} />
      <CarDatum label="XP" value={stats.totalXp.toLocaleString("en-US")} />
    </View>
  );
}

function CarDatum({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.carDatum}>
      <Text style={styles.carDatumLabel}>{label}</Text>
      <View style={styles.carDatumValueRow}>
        <Text style={styles.carDatumValue}>{value}</Text>
        {unit ? <Text style={styles.carDatumUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** The `make · year · hp` readout. A data line, so it is set in mono. */
function CarSpecLine({ car }: { car: CarItem }) {
  return (
    <View style={styles.specLine}>
      <Text style={styles.specText} numberOfLines={1}>{car.make}</Text>
      <Text style={styles.specDot}>·</Text>
      <Text style={styles.specText}>{car.year}</Text>
      <Text style={styles.specDot}>·</Text>
      <Text style={styles.specText}>{car.hp} HP</Text>
    </View>
  );
}

/** Secondary garage card. Brand surface with the racingRed edge accent. */
function GarageCard({
  car,
  isSelf,
  stats,
  vehicleIcon,
  isPlatinum,
  onSetPrimary,
  onDelete,
}: {
  car: CarItem;
  isSelf: boolean;
  stats?: CarDriveStats;
  /** The driver's selected vehicle icon; falls back for non-Platinum. */
  vehicleIcon?: string | null;
  isPlatinum: boolean;
  onSetPrimary: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.blockCard}>
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.garageCard}
      >
        <View style={styles.edgeAccent} />
        <View style={styles.garageCardText}>
          <View style={styles.carNameRow}>
            {/* The compact car mark. Regular drivers get the default lucide
                glyph; Platinum drivers get whichever silhouette they picked. */}
            <PremiumVehicleIcon
              icon={vehicleIcon}
              isPlatinum={isPlatinum}
              size={ICON_MD}
              color={colors.textSecondary}
              strokeWidth={ICON_STROKE}
            />
            <Text style={styles.carName} numberOfLines={1}>{car.name}</Text>
          </View>
          <CarSpecLine car={car} />
          <CarDriveDataRow stats={stats} />
        </View>
        {isSelf && (
          <View style={styles.garageCardActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={car.is_primary ? "Primary car" : `Make ${car.name} your primary car`}
              onPress={onSetPrimary}
              hitSlop={spacing.spacingSm}
              style={({ pressed }) => pressed && styles.pressed}
            >
              {car.is_primary ? (
                <CheckCircle2 size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />
              ) : (
                <Circle size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${car.name}`}
              onPress={onDelete}
              hitSlop={spacing.spacingSm}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Trash size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>
        )}
      </CutCornerSurface>
    </View>
  );
}

/** The garage's featured car — the profile's showcase surface. */
function FeaturedCar({
  car,
  isSelf,
  onGenerate,
  onDelete,
  driveStats,
}: {
  car: CarItem;
  isSelf: boolean;
  onGenerate: () => void;
  onDelete: () => void;
  driveStats?: CarDriveStats;
}) {
  const hasRender = !!car.photo_url;
  return (
    <View style={styles.blockCard}>
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.featuredCard}
      >
        <View style={styles.edgeAccent} />
        <View style={styles.featuredTop}>
          <View style={styles.featuredHeading}>
            <View style={styles.featuredNameRow}>
              <Text style={styles.featuredName} numberOfLines={1}>{car.name}</Text>
              {hasRender && (
                <Star size={ICON_SM} color={colors.textPrimary} fill={colors.textPrimary} />
              )}
            </View>
            <CarSpecLine car={car} />
          </View>
          {isSelf && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${car.name}`}
              onPress={onDelete}
              hitSlop={spacing.spacingSm}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Trash2 size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          )}
        </View>

        {hasRender ? (
          <Image source={{ uri: car.photo_url as string }} style={styles.featuredImage} resizeMode="cover" />
        ) : (
          <View style={styles.featuredLocked}>
            <View style={styles.featuredSilhouette}>
              <Car size={64} color={colors.hairline} strokeWidth={ICON_STROKE} />
            </View>
            <View style={styles.featuredLockedInner}>
              <View style={styles.premiumTag}>
                <Sparkles size={ICON_SM} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                <Text style={styles.premiumTagText}>AI RENDER</Text>
              </View>
              {isSelf ? (
                <CutCornerButton
                  title="Generate My Car"
                  variant="primary"
                  size="sm"
                  corners="topRight"
                  onPress={onGenerate}
                  icon={
                    <Sparkles size={ICON_SM} color={colors.voidBlack} strokeWidth={ICON_STROKE} />
                  }
                />
              ) : (
                <Text style={styles.featuredLockedNote}>Not generated yet</Text>
              )}
            </View>
          </View>
        )}
        <CarDriveDataRow stats={driveStats} />
      </CutCornerSurface>
    </View>
  );
}

// Group DMs into latest-per-partner conversations, newest first.
function inboxConversations(messages: MessageItem[], myId?: string): Array<[string, MessageItem]> {
  const convos = new Map<string, MessageItem>();
  messages.forEach((m) => {
    const partnerId = m.sender_id === myId ? m.receiver_id : m.sender_id;
    const existing = convos.get(partnerId);
    if (!existing || new Date(m.created_at) > new Date(existing.created_at)) convos.set(partnerId, m);
  });
  return Array.from(convos.entries()).sort(
    (a, b) => new Date(b[1].created_at).getTime() - new Date(a[1].created_at).getTime()
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

/**
 * Rajdhani caps at 11 for a card's own overline. The type scale has no
 * step between `caption` (12 Inter) and `displayMd` (20 Rajdhani), and an
 * overline is neither — it is a control-sized label, which is exactly what
 * `CutCornerBadge` and the map's filter chips already set by hand.
 */
const OVERLINE = {
  fontFamily: fontFamily.displaySemiBold,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 1,
  color: colors.textSecondary,
} as const;

/** Caption-sized mono, for timestamps and small counts. */
const CAPTION_MONO = textStyle("caption", { fontFamily: fontFamily.dataRegular });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  scroll: { gap: spacing.spacingLg },
  pressed: { opacity: 0.7 },
  loader: { marginTop: spacing.spacingXl },
  block: { paddingHorizontal: SCREEN_MARGIN, gap: spacing.spacingSm },
  section: { paddingHorizontal: SCREEN_MARGIN },
  blockCard: { marginBottom: spacing.spacingLg },
  overline: OVERLINE,
  verticalDivider: {
    width: borderWidth.hairline,
    alignSelf: "stretch",
    marginHorizontal: spacing.spacingMd,
    backgroundColor: colors.hairline,
  },

  // Signed out
  signedOut: { flex: 1, paddingHorizontal: SCREEN_MARGIN },
  signedOutSecondary: { alignSelf: "center" },

  // Chrome
  chromeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SCREEN_MARGIN,
  },
  chromeActions: { flexDirection: "row", gap: spacing.spacingSm },
  chromeBtn: {
    width: spacing.spacingXxl + spacing.spacingSm, // 40
    height: spacing.spacingXxl + spacing.spacingSm,
    borderRadius: radius.sharp,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  chromeCount: {
    position: "absolute",
    top: -spacing.spacingXs,
    right: -spacing.spacingXs,
    minWidth: spacing.spacingLg,
    paddingHorizontal: spacing.spacingXs,
    borderRadius: radius.sharp,
    backgroundColor: colors.racingRed,
    alignItems: "center",
    justifyContent: "center",
  },
  chromeCountText: {
    ...CAPTION_MONO,
    color: colors.voidBlack,
  },

  // Identity
  identityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: SCREEN_MARGIN,
    gap: spacing.spacingMd,
  },
  /**
   * Pinned to the avatar's own size so the Platinum frame and aura — which
   * are deliberately larger than the avatar — overflow visually without
   * pushing the level badge outward. The badge's absolute anchor stays the
   * 72pt box it has always been.
   */
  avatarWrap: {
    position: "relative",
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarAura: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.circle,
    borderWidth: AVATAR_RING,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInner: {
    width: AVATAR_SIZE - AVATAR_RING * 2 - spacing.spacingXs,
    height: AVATAR_SIZE - AVATAR_RING * 2 - spacing.spacingXs,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarLetter: {
    ...textStyle("displayMd"),
    color: colors.textSecondary,
  },
  levelBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    minWidth: spacing.spacingXl,
    height: spacing.spacingXl,
    paddingHorizontal: spacing.spacingXs,
    borderRadius: radius.circle,
    backgroundColor: colors.racingRed,
    borderWidth: borderWidth.emphasis,
    borderColor: colors.voidBlack,
    alignItems: "center",
    justifyContent: "center",
  },
  levelBadgeText: {
    ...CAPTION_MONO,
    color: colors.voidBlack,
  },
  identityInfo: { flex: 1, gap: spacing.spacingXs },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  userName: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flexShrink: 1,
  },
  nameInput: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.racingRed,
    flex: 1,
    paddingVertical: 0,
  },
  rankSubtitle: {
    ...textStyle("body"),
    color: colors.racingRed,
  },
  countryInput: {
    ...textStyle("body"),
    color: colors.textPrimary,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.racingRed,
    flex: 1,
    paddingVertical: 0,
  },
  countryFlag: {
    fontSize: 14,
  },

  // Tags — utility rectangles, never the cut
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    alignSelf: "flex-start",
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
  },
  tagLabelWrap: { flexShrink: 1 },
  tagText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  tagTextStrong: { color: colors.textPrimary },

  // Current rank card
  rankColumn: { gap: spacing.spacingSm, alignItems: "stretch" },
  shareRankButton: { width: 108 },
  rankCard: { width: 108 },
  rankCardContent: {
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingSm,
  },
  rankCardName: {
    ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold }),
    color: colors.textPrimary,
    textAlign: "center",
  },

  // XP
  xpRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  xpLevel: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  xpValue: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  track: {
    height: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  trackFill: { height: "100%", backgroundColor: colors.racingRed },
  xpToNext: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  // Friend action (other driver)
  friendActionRow: {
    flexDirection: "row",
    gap: spacing.spacingSm,
    paddingHorizontal: SCREEN_MARGIN,
  },
  friendActionPrimary: { flex: 1 },
  friendStatus: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingVertical: spacing.spacingMd,
  },
  friendStatusText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    gap: spacing.spacingSm,
    paddingHorizontal: SCREEN_MARGIN,
  },
  statCard: { flex: 1 },
  statCardContent: {
    alignItems: "center",
    gap: spacing.spacingXs,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingXs,
  },
  statValue: {
    ...textStyle("dataLg"),
    color: colors.textPrimary,
  },
  statLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  // Tab selector — the same chip the map's filter bar uses
  tabRow: {
    flexDirection: "row",
    gap: spacing.spacingSm,
    paddingHorizontal: SCREEN_MARGIN,
  },
  tabChip: { flex: 1 },

  // Empty / signed-out message
  message: {
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingVertical: spacing.spacingXxl,
    paddingHorizontal: spacing.spacingLg,
  },
  messageHeading: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  messageBody: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
  },
  messageAction: { marginTop: spacing.spacingSm },

  // Car cards
  edgeAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: spacing.spacingXs,
    backgroundColor: colors.racingRed,
  },
  featuredCard: { padding: spacing.spacingLg, gap: spacing.spacingMd },
  featuredTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.spacingSm },
  featuredHeading: { flex: 1, gap: spacing.spacingXs },
  featuredNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  featuredName: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flexShrink: 1,
  },
  featuredImage: {
    width: "100%",
    height: 176, // 4 × 44
    backgroundColor: colors.voidBlack,
  },
  featuredLocked: {
    height: 176,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // No extra opacity: the silhouette already draws in `hairline`, and
  // dimming it further left it invisible against `voidBlack`.
  featuredSilhouette: { position: "absolute" },
  featuredLockedInner: { alignItems: "center", gap: spacing.spacingMd },
  premiumTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingXs,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
  },
  premiumTagText: { ...OVERLINE },
  featuredLockedNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  garageCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
  },
  garageCardText: { flex: 1, gap: spacing.spacingXs },
  garageCardActions: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  carNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  carName: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flexShrink: 1,
  },
  specLine: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  specText: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  specDot: {
    ...textStyle("dataSm"),
    color: colors.hairline,
  },

  // Per-car drive data
  driveDataRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.spacingXs,
    paddingTop: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  carDatum: { flex: 1, gap: spacing.spacingXs },
  carDatumLabel: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  carDatumValueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.spacingXs },
  carDatumValue: {
    ...textStyle("dataSm"),
    color: colors.textPrimary,
  },
  carDatumUnit: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  // Add a car
  addCarPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
  },
  addCarPromptText: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  /** Same row shape as the add-car prompt, chrome label. */
  showcasePromptText: {
    ...textStyle("body"),
    color: platinum.chrome,
  },
  addCarForm: { padding: spacing.spacingLg, gap: spacing.spacingMd },
  addCarFormRow: { flexDirection: "row", gap: spacing.spacingSm },
  addCarActions: { flexDirection: "row", gap: spacing.spacingSm },
  addCarAction: { flex: 1 },
  input: {
    ...textStyle("body"),
    color: colors.textPrimary,
    backgroundColor: colors.voidBlack,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
  },
  inputFlex: { flex: 1 },
  inputNumeric: { fontFamily: fontFamily.dataRegular },

  // Rank progress — secondary framing: no fill, smaller badge
  rankProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
  },
  rankProgressMiddle: { flex: 1, gap: spacing.spacingXs },
  rankProgressName: {
    ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold }),
    color: colors.textPrimary,
  },
  rankProgressNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  rankNext: { width: 88, alignItems: "center", gap: spacing.spacingXs },
  rankNextName: {
    ...textStyle("caption"),
    color: colors.textPrimary,
    textAlign: "center",
  },
  rankNextLevel: {
    ...CAPTION_MONO,
    color: colors.textSecondary,
  },

  // Live feed + inbox
  feedRow: { flexDirection: "row", gap: spacing.spacingMd, marginBottom: spacing.spacingLg },
  feedCol: { flex: 1 },
  feedColContent: { padding: spacing.spacingMd, gap: spacing.spacingSm },
  feedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  feedTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs },
  liveDot: {
    width: spacing.spacingSm,
    height: spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: LIVE_GREEN,
  },
  seeAll: {
    ...textStyle("caption"),
    color: colors.racingRed,
  },
  feedItem: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  feedIcon: {
    width: spacing.spacingXl,
    height: spacing.spacingXl,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  feedItemText: { flex: 1 },
  feedItemTitle: {
    ...textStyle("caption"),
    color: colors.textPrimary,
  },
  feedItemPreview: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  feedItemTime: {
    ...CAPTION_MONO,
    color: colors.textSecondary,
  },
  feedEmpty: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    paddingVertical: spacing.spacingMd,
  },

  // Friend search + driver rows
  searchRow: {
    flexDirection: "row",
    gap: spacing.spacingSm,
    marginBottom: spacing.spacingLg,
  },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingMd,
  },
  searchInput: {
    ...textStyle("body"),
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: spacing.spacingMd,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.hairline,
  },
  driverInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  driverAvatar: {
    width: spacing.spacingXxl + spacing.spacingSm, // 40
    height: spacing.spacingXxl + spacing.spacingSm,
    borderRadius: radius.circle,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  driverAvatarImage: { width: "100%", height: "100%" },
  driverAvatarLetter: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  driverText: { flex: 1 },
  driverName: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  driverMeta: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  driverAction: {
    width: spacing.spacingXxl,
    height: spacing.spacingXxl,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },

  // Settings — hairline-divided rows, no cards
  settings: { paddingHorizontal: SCREEN_MARGIN, marginTop: spacing.spacingSm },
  settingsTitle: {
    ...OVERLINE,
    marginBottom: spacing.spacingSm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.spacingLg,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.hairline,
  },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  settingRight: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  settingLabel: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  settingCount: {
    ...CAPTION_MONO,
    color: colors.racingRed,
  },
  platinumStatus: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    color: platinum.chrome,
  },

  // Sheets
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheetContent: {
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingLg,
    gap: spacing.spacingLg,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
    flex: 1,
  },
  sheetScroll: { maxHeight: 400 },
  sheetOption: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  sheetOptionText: { flex: 1, gap: spacing.spacingXs },
  sheetOptionTitle: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  sheetOptionSub: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  // Premium sheet
  premiumBody: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },
  premiumPerks: { gap: spacing.spacingMd },
  premiumPerkRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  premiumPerkText: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  premiumCancel: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
  },
});
