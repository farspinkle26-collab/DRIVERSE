import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePickerExpo from "expo-image-picker";
import {
  Car,
  Route as RouteIcon,
  Users,
  MessageCircle,
  Bell,
  Flame,
  Pencil,
  Info,
  ChevronRight,
  Plus,
  Sparkles,
  Lock,
  Check,
  X,
  ArrowLeft,
  UserPlus,
  UserCheck,
  Clock,
  Search,
  CheckCircle2,
  Circle,
  Trash2,
  Zap,
  Timer,
  Gauge,
  Trophy,
  MapPin,
  Star,
  Radio,
  MailOpen,
  Shield,
  HelpCircle,
  Crown,
  Calendar,
  MoreVertical,
  Globe2,
} from "lucide-react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import MapboxTileLayer from "./MapboxTileLayer";
import { useAuth } from "@/hooks/useAuthStore";
import { useXP } from "@/hooks/useXPStore";
import { useQuests } from "@/hooks/useQuestStore";
import { useEvents } from "@/hooks/useEventsStore";
import { useCarDriveStats, CarDriveStats } from "@/hooks/useCarDriveStats";
import { rankForLevel, rankProgress } from "@/constants/ranks";
import RankBadge from "@/components/RankBadge";
import { supabase } from "@/lib/supabase";
import { uploadCarPhoto } from "@/lib/uploadCarPhoto";
import { decodePolyline, regionForPath } from "@/lib/polyline";
import { useTheme } from "@/hooks/useThemeStore";
import { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from "@/constants/mapStyles";
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

function TripMiniMap({ trip }: { trip: TripItem }) {
  const { isDark } = useTheme();
  const mapRef = useRef<MapView>(null);
  const coords = trip.route_polyline ? decodePolyline(trip.route_polyline) : [];
  const hasPath = coords.length > 1;
  const hasPoints = hasPath || (trip.origin_lat && trip.origin_lng);
  if (!hasPoints) return null;

  // Points to frame the camera around: the recorded road path if we have
  // one, otherwise just the origin/destination pair.
  const fitPoints = hasPath
    ? coords
    : [
        { latitude: trip.origin_lat, longitude: trip.origin_lng },
        ...(trip.destination_lat && trip.destination_lng
          ? [{ latitude: trip.destination_lat, longitude: trip.destination_lng }]
          : []),
      ];

  const region = regionForPath(fitPoints, hasPath ? 1.4 : 1.8);

  // initialRegion alone can render at a stale/default zoom in liteMode on
  // Android before the view has laid out, so fit explicitly once ready.
  const fitToPoints = () => {
    if (fitPoints.length > 1) {
      mapRef.current?.fitToCoordinates(fitPoints, {
        edgePadding: { top: 24, right: 24, bottom: 24, left: 24 },
        animated: false,
      });
    }
  };

  return (
    <View style={styles.tripMapWrap} pointerEvents="none">
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "web" ? undefined : PROVIDER_GOOGLE}
        initialRegion={region}
        onMapReady={fitToPoints}
        onLayout={fitToPoints}
        customMapStyle={isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        liteMode={Platform.OS === "android"}
      >
        <MapboxTileLayer dark={isDark} />

        {hasPath && (
          <>
            <Polyline coordinates={coords} strokeWidth={7} strokeColor={alpha(colors.racingRed, 0.25)} lineCap="round" />
            <Polyline coordinates={coords} strokeWidth={3.5} strokeColor={colors.racingRed} lineCap="round" />
          </>
        )}
        <Marker coordinate={{ latitude: trip.origin_lat, longitude: trip.origin_lng }} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.tripMapDot, { backgroundColor: colors.textPrimary }]} />
        </Marker>
        {trip.destination_lat && trip.destination_lng ? (
          <Marker
            coordinate={{ latitude: trip.destination_lat, longitude: trip.destination_lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.tripMapDot, { backgroundColor: colors.racingRed }]} />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

// Price for the premium car render, in IDR.
const PREMIUM_CAR_PRICE = 49000;

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
  return "Unknown";
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

/**
 * The unified Driveverse profile page. Renders the exact same layout for
 * the signed-in user and for any other driver — the only differences are
 * which actions are enabled (editing, add-car, premium generation and the
 * notification/message inboxes belong to the signed-in viewer). Pass a
 * `userId` to view someone else; omit it for the current user.
 */
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

  // ─── Target profile + stats ────────────────────────────────
  const [profileName, setProfileName] = useState<string>(user?.name ?? "Driver");
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>(user?.profilePicture);
  const [otherLevel, setOtherLevel] = useState(1);
  const [otherXp, setOtherXp] = useState(0);
  const [otherTotalXp, setOtherTotalXp] = useState(0);
  const [otherStreak, setOtherStreak] = useState(0);

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
  const [purchasing, setPurchasing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingCountry, setEditingCountry] = useState(false);
  const [countryDraft, setCountryDraft] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [tripMenuTrip, setTripMenuTrip] = useState<TripItem | null>(null);

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
      .select("id, name, avatar")
      .eq("id", targetId)
      .single();
    if (data) {
      setProfileName(data.name ?? "Driver");
      setProfileAvatar(data.avatar ?? undefined);
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
  const handleAddCar = useCallback(async () => {
    if (!user || !newCarName.trim()) return;
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
    if (!error) {
      setNewCarName("");
      setNewCarMake("");
      setShowAddCar(false);
      loadCars();
    }
  }, [user, newCarName, newCarMake, newCarYear, newCarHP, cars.length, loadCars]);

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

  // ─── Premium car generation (paywalled) ────────────────────
  const openPremium = useCallback((car: CarItem) => {
    setPremiumTargetCar(car);
    setPremiumOpen(true);
  }, []);

  // After a successful (simulated) payment, let the driver attach the
  // generated render. Storing a photo_url marks the car as premium.
  const runGeneration = useCallback(async (car: CarItem) => {
    if (!user) return;
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Permission needed", "We need photo access to save your generated car.");
          return;
        }
      }
      const result = await ImagePickerExpo.launchImageLibraryAsync({ allowsEditing: true, aspect: [16, 10], quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;
      const localUri = result.assets[0].uri;
      // The picker returns a device-local URI that doesn't survive app
      // restarts, so upload it to Supabase Storage and persist the public URL.
      const publicUrl = await uploadCarPhoto(user.id, car.id, localUri);
      const { error } = await supabase.from("car_collections").update({ photo_url: publicUrl }).eq("id", car.id);
      if (error) Alert.alert("Error", error.message);
      else {
        await loadCars();
        Alert.alert("Unlocked!", `${car.name} has been generated and added to your garage.`);
      }
    } catch {
      Alert.alert("Error", "Could not save your generated car.");
    }
  }, [user, loadCars]);

  const handlePayPremium = useCallback(async () => {
    if (!premiumTargetCar) return;
    setPurchasing(true);
    // Simulate the payment authorization round-trip.
    setTimeout(async () => {
      setPurchasing(false);
      setPremiumOpen(false);
      const car = premiumTargetCar;
      setPremiumTargetCar(null);
      await runGeneration(car);
    }, 1400);
  }, [premiumTargetCar, runGeneration]);

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
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };
  const timeAgo = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };
  const tripDateLabel = (dateStr: string): string => {
    const d = new Date(dateStr);
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
    const now = new Date();
    const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
    if (isSameDay(d, now)) return `Today, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return `Yesterday, ${time}`;
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
  };
  const tripCode = (index: number): string => `R-${String(trips.length - index).padStart(3, "0")}`;

  // ─── Not authenticated ─────────────────────────────────────
  if (!isAuthenticated && isSelf) {
    return (
      <View style={styles.container}>
        <View style={[styles.loginPrompt, { paddingTop: insets.top + 100 }]}>
          <CutCornerSurface
            fill={colors.racingRed}
            borderColor={colors.racingRed}
            borderWidth={borderWidth.hairline}
            cutSize={cut.lg}
            corners="topRight"
            style={styles.loginIcon}
            contentStyle={styles.loginIconContent}
          >
            <Car size={40} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />
          </CutCornerSurface>
          <Text style={styles.loginTitle}>JOIN THE DRIVE</Text>
          <Text style={styles.loginDesc}>
            Sign up to track your rides, collect cars, earn XP, and connect with fellow drivers.
          </Text>
          <CutCornerButton
            title="Sign In"
            onPress={() => router.push("/login" as any)}
            style={styles.loginBtn}
          />
          <TouchableOpacity style={styles.loginBtnSecondary} onPress={() => router.push("/signup" as any)} activeOpacity={0.7}>
            <Text style={styles.loginBtnSecondaryText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const stats = [
    { icon: Car, value: cars.length, label: "Cars" },
    { icon: Users, value: acceptedFriends.length, label: "Friends" },
    { icon: RouteIcon, value: trips.length, label: "Trips" },
    { icon: Flame, value: streak, label: "Day Streak" },
  ];

  const TABS: { key: ProfileTab; label: string; icon: typeof Car; badge?: number }[] = [
    { key: "garage", label: "Garage", icon: Car },
    { key: "trips", label: "Trips", icon: RouteIcon },
    { key: "friends", label: "Friends", icon: Users },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingTop: insets.top + 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.racingRed} />}
      >
        {/* ═══ TOP BAR: back (other) + bell + messages ═══ */}
        <View style={styles.topBar}>
          {!isSelf ? (
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <ArrowLeft size={20} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: spacing.spacingXxl + spacing.spacingSm }} />
          )}
          <View style={styles.topBarActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setNotifOpen(true)} activeOpacity={0.7}>
              <Bell size={20} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
              {notifCount > 0 && (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>{notifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={openMessages} activeOpacity={0.7}>
              <MessageCircle size={20} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />
              {unreadMessages > 0 && (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>{unreadMessages}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ═══ IDENTITY + CURRENT RANK ═══ */}
        <View style={styles.identityRow}>
          <TouchableOpacity
            style={styles.avatarSection}
            onPress={handleChangeAvatar}
            activeOpacity={isSelf ? 0.85 : 1}
            disabled={!isSelf || uploadingAvatar}
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
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{level}</Text>
            </View>
          </TouchableOpacity>

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
              {isSelf && !editingName && (
                <TouchableOpacity
                  onPress={() => { setNameDraft(profileName); setEditingName(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Pencil size={15} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.rankSubtitle}>{rank.name}</Text>
            {isSelf && (
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
                  <View style={styles.countryChip}>
                    <MapPin size={12} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                    <Text style={styles.countryChipText}>{user?.country || "Set your country"}</Text>
                  </View>
                )}
                {!editingCountry && (
                  <TouchableOpacity
                    onPress={() => { setCountryDraft(user?.country ?? ""); setEditingCountry(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Pencil size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {primaryCar && (
              <View style={styles.drivingChip}>
                <Car size={12} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
                <Text style={styles.drivingChipText} numberOfLines={1}>
                  Driving <Text style={styles.drivingChipCar}>{primaryCar.name}</Text>
                </Text>
              </View>
            )}
          </View>

          {/* Current rank card */}
          <Pressable style={({ pressed }) => [pressed && styles.pressed]} onPress={() => router.push("/ranks" as any)}>
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.sm}
              corners="topRight"
              style={styles.rankCard}
              contentStyle={styles.rankCardContent}
            >
              <Text style={styles.rankCardLabel}>CURRENT RANK</Text>
              <RankBadge rank={rank} size={54} />
              <Text style={styles.rankCardName}>{rank.name}</Text>
              <View style={styles.rankDivisionRow}>
                <Info size={11} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              </View>
            </CutCornerSurface>
          </Pressable>
        </View>

        {/* ═══ LEVEL / XP BAR ═══ */}
        <View style={styles.xpBlock}>
          <View style={styles.xpRow}>
            <Text style={styles.xpLevelLabel}>LEVEL {level}</Text>
            <Text style={styles.xpValue}>{xpCurrentLevel} / {xpRequired} XP</Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.min(xpProgress * 100, 100)}%` }]} />
          </View>
          <Text style={styles.xpToNext}>{Math.max(xpRequired - xpCurrentLevel, 0)} XP to next level</Text>
        </View>

        {/* ═══ FRIEND ACTION (other user) ═══ */}
        {!isSelf && (
          <View style={styles.friendActionRow}>
            {friendState === "none" && (
              <CutCornerButton
                title="Add Friend"
                onPress={handleAddFriendById}
                disabled={friendActionLoading}
                icon={friendActionLoading ? <ActivityIndicator color={onRacingRed} /> : <UserPlus size={17} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
                style={{ flex: 1 }}
              />
            )}
            {friendState === "pending_sent" && (
              <View style={styles.statusPill}>
                <Clock size={15} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.statusPillText}>Request Pending</Text>
              </View>
            )}
            {friendState === "pending_received" && pendingRequests.find((r) => r.user_id === targetId) && (
              <View style={styles.friendActionSplit}>
                <CutCornerButton
                  title="Accept"
                  onPress={() => { const req = pendingRequests.find((r) => r.user_id === targetId); if (req) handleAcceptRequest(req.id); }}
                  icon={<UserCheck size={17} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
                  style={{ flex: 1 }}
                />
              </View>
            )}
            {friendState === "friends" && (
              <View style={[styles.statusPill, { flex: 1 }]}>
                <UserCheck size={15} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} /><Text style={[styles.statusPillText, { color: colors.textPrimary }]}>Friends</Text>
              </View>
            )}
            <CutCornerButton
              title="Message"
              variant="ghost"
              onPress={() => { if (targetId) router.push(`/messages/${targetId}` as any); }}
              icon={<MessageCircle size={17} color={colors.textPrimary} strokeWidth={CHROME_ICON_STROKE} />}
            />
          </View>
        )}

        {/* ═══ STAT CARDS ═══ */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <CutCornerSurface
              key={s.label}
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.sm}
              corners="topRight"
              style={{ flex: 1 }}
              contentStyle={styles.statCard}
            >
              <s.icon size={16} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </CutCornerSurface>
          ))}
        </View>

        {/* ═══ CONTENT TABS ═══ */}
        <View style={styles.contentTabs}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.contentTab, activeTab === tab.key && styles.contentTabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <tab.icon size={15} color={activeTab === tab.key ? colors.racingRed : colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              <Text style={[styles.contentTabText, activeTab === tab.key && styles.contentTabTextActive]}>{tab.label}</Text>
              {tab.badge ? (
                <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{tab.badge}</Text></View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══ GARAGE TAB ═══ */}
        {activeTab === "garage" && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={{ marginTop: spacing.spacingXl }} />
            ) : primaryCar ? (
              <FeaturedCar
                car={primaryCar}
                isSelf={isSelf}
                onGenerate={() => openPremium(primaryCar)}
                onDelete={() => handleDeleteCar(primaryCar.id)}
                driveStats={statsByCarId[primaryCar.id]}
              />
            ) : (
              <View style={styles.emptyState}>
                <Car size={40} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                <Text style={styles.emptyText}>No cars yet</Text>
                <Text style={styles.emptySub}>{isSelf ? "Add your first ride to the garage" : "This driver hasn't added a car"}</Text>
              </View>
            )}

            {/* Secondary cars */}
            {otherCars.map((car) => (
              <Pressable
                key={car.id}
                onLongPress={isSelf ? () => handleDeleteCar(car.id) : undefined}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <CutCornerSurface
                  fill={colors.carbonSurface}
                  borderColor={car.is_primary ? colors.racingRed : colors.hairline}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.sm}
                  corners="topRight"
                  style={styles.garageCard}
                  contentStyle={styles.garageCardContent}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carName}>{car.name}</Text>
                    <View style={styles.carMeta}>
                      <Text style={styles.carMetaText}>{car.make}</Text>
                      <Text style={styles.carMetaDot}>•</Text>
                      <Text style={styles.carMetaText}>{car.year}</Text>
                      <Text style={styles.carMetaDot}>•</Text>
                      <Text style={styles.carMetaHp}>{car.hp} HP</Text>
                    </View>
                    <CarDriveDataRow stats={statsByCarId[car.id]} />
                  </View>
                  {isSelf && (
                    <TouchableOpacity onPress={() => handleSetPrimary(car.id)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {car.is_primary ? <CheckCircle2 size={18} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /> : <Circle size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />}
                    </TouchableOpacity>
                  )}
                </CutCornerSurface>
              </Pressable>
            ))}

            {/* Add a car (self only) */}
            {isSelf && (showAddCar ? (
              <View style={styles.addCarForm}>
                <TextInput style={styles.addCarInput} placeholder="Car name (e.g. Night Fury)" placeholderTextColor={colors.textSecondary} value={newCarName} onChangeText={setNewCarName} />
                <View style={styles.addCarFormRow}>
                  <TextInput style={[styles.addCarInput, { flex: 1 }]} placeholder="Make (e.g. BMW)" placeholderTextColor={colors.textSecondary} value={newCarMake} onChangeText={setNewCarMake} />
                  <TextInput style={[styles.addCarInput, { flex: 1, marginLeft: spacing.spacingSm }]} placeholder="Year" placeholderTextColor={colors.textSecondary} value={newCarYear} onChangeText={setNewCarYear} keyboardType="number-pad" />
                </View>
                <TextInput style={styles.addCarInput} placeholder="HP" placeholderTextColor={colors.textSecondary} value={newCarHP} onChangeText={setNewCarHP} keyboardType="number-pad" />
                <View style={styles.addCarActions}>
                  <CutCornerButton title="Cancel" variant="ghost" onPress={() => setShowAddCar(false)} style={{ flex: 1 }} />
                  <CutCornerButton title="Add Car" onPress={handleAddCar} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addCarButton} onPress={() => setShowAddCar(true)} activeOpacity={0.7}>
                <View style={styles.addCarIcon}><Plus size={20} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /></View>
                <Text style={styles.addCarText}>Add a car to your garage</Text>
              </TouchableOpacity>
            ))}

            {/* Rank progress card */}
            <Pressable onPress={() => router.push("/ranks" as any)} style={({ pressed }) => pressed && styles.pressed}>
              <CutCornerSurface
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.seasonCard}
                contentStyle={styles.seasonCardContent}
              >
                <View style={styles.seasonBadgeWrap}>
                  <RankBadge rank={rank} size={54} />
                </View>
                <View style={styles.seasonMiddle}>
                  <Text style={styles.seasonLabel}>RANK PROGRESS</Text>
                  <Text style={styles.seasonName}>{rank.name}</Text>
                  <View style={styles.seasonTrack}>
                    <View style={[styles.seasonFill, { width: `${Math.min(rankProg.progress * 100, 100)}%` }]} />
                  </View>
                  <Text style={styles.seasonXp}>{rankProg.next ? `${rankProg.levelsToNext} levels to next rank` : "Top rank reached"}</Text>
                </View>
                <View style={styles.seasonDivider} />
                <View style={styles.seasonNext}>
                  <Text style={styles.seasonNextLabel}>NEXT RANK</Text>
                  {rankProg.next && (
                    <>
                      <RankBadge rank={rankProg.next} size={30} />
                      <Text style={styles.seasonNextName}>{rankProg.next.name}</Text>
                      <Text style={styles.seasonNextXp}>Lv {rankProg.next.minLevel}</Text>
                    </>
                  )}
                  <ChevronRight size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} style={{ position: "absolute", right: 0, top: "50%" }} />
                </View>
              </CutCornerSurface>
            </Pressable>

            {/* Live Feed + Inbox */}
            <View style={styles.feedRow}>
              <View style={styles.feedCol}>
                <View style={styles.feedHeader}>
                  <View style={styles.feedTitleRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.feedTitle}>LIVE FEED</Text>
                  </View>
                  <Text style={styles.feedSeeAll}>See All</Text>
                </View>
                {events.slice(0, 3).map((e) => (
                  <TouchableOpacity key={e.id} style={styles.feedItem} activeOpacity={0.7} onPress={() => router.push("/(tabs)/map" as any)}>
                    <View style={styles.feedIcon}>
                      {e.is_live ? <Radio size={13} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /> : <MapPin size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.feedItemTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={styles.feedItemSub} numberOfLines={1}>
                        {e.is_live ? "Live now" : `${e.participant_count} joined`}
                      </Text>
                    </View>
                    <Text style={styles.feedTime}>{timeAgo(e.starts_at)}</Text>
                  </TouchableOpacity>
                ))}
                {events.length === 0 && <Text style={styles.feedEmpty}>No nearby activity</Text>}
              </View>

              <View style={styles.feedCol}>
                <View style={styles.feedHeader}>
                  <Text style={styles.feedTitle}>INBOX</Text>
                  <View style={styles.feedHeaderRight}>
                    {unreadMessages > 0 && <View style={styles.feedHeaderBadge}><Text style={styles.feedHeaderBadgeText}>{unreadMessages}</Text></View>}
                    <TouchableOpacity onPress={() => router.push("/messages" as any)}><Text style={styles.feedSeeAll}>See All</Text></TouchableOpacity>
                  </View>
                </View>
                {/* Reward notification */}
                <TouchableOpacity style={styles.feedItem} activeOpacity={0.7} onPress={() => router.push("/ranks" as any)}>
                  <View style={styles.feedIcon}><Trophy size={13} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedItemTitle} numberOfLines={1}>Rank Rewards</Text>
                    <Text style={styles.feedItemSub} numberOfLines={1}>You&apos;ve earned {totalXp} XP!</Text>
                  </View>
                </TouchableOpacity>
                {inboxConversations(messages, user?.id).slice(0, 2).map(([partnerId, last]) => {
                  const p = getFriendInfo(partnerId);
                  return (
                    <TouchableOpacity key={partnerId} style={styles.feedItem} activeOpacity={0.7} onPress={() => router.push(`/messages/${partnerId}` as any)}>
                      <View style={styles.feedIcon}><MessageCircle size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.feedItemTitle} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.feedItemSub} numberOfLines={1}>{last.sender_id === user?.id ? "You: " : ""}{last.content}</Text>
                      </View>
                      <Text style={styles.feedTime}>{timeAgo(last.created_at)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {messages.length === 0 && <Text style={styles.feedEmpty}>No messages yet</Text>}
              </View>
            </View>
          </View>
        )}

        {/* ═══ TRIPS TAB ═══ */}
        {activeTab === "trips" && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={{ marginTop: spacing.spacingXl }} />
            ) : trips.length === 0 ? (
              <View style={styles.emptyState}>
                <RouteIcon size={40} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                <Text style={styles.emptyText}>No trips recorded</Text>
                <Text style={styles.emptySub}>{isSelf ? "Start recording a drive to see it here" : "This driver has no trips yet"}</Text>
              </View>
            ) : (
              trips.map((trip, idx) => (
                <Pressable
                  key={trip.id}
                  onPress={() => router.push(`/trip/${trip.id}` as any)}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <CutCornerSurface
                    fill={colors.carbonSurface}
                    borderColor={colors.hairline}
                    borderWidth={borderWidth.hairline}
                    cutSize={cut.sm}
                    corners="topRight"
                    style={styles.tripCard}
                    contentStyle={styles.tripCardContent}
                  >
                  <View style={styles.tripHeader}>
                    <View style={styles.tripTitleRow}>
                      <View style={styles.tripCodeBadge}><Text style={styles.tripCodeText}>{tripCode(idx)}</Text></View>
                      <Text style={styles.tripDest} numberOfLines={1}>{tripDisplayName(trip)}</Text>
                      {trip.was_faster_than_estimation && (
                        <View style={styles.tripFast}><Zap size={11} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.tripFastText}>FAST</Text></View>
                      )}
                      {isSelf && !trip.is_public && <Lock size={12} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />}
                    </View>
                    <View style={styles.tripHeaderRight}>
                      <View style={styles.tripDateBadge}>
                        <Calendar size={11} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                        <Text style={styles.tripDateText}>{tripDateLabel(trip.completed_at)}</Text>
                      </View>
                      {isSelf && (
                        <TouchableOpacity
                          style={styles.tripMenuBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => { e.stopPropagation(); setTripMenuTrip(trip); }}
                        >
                          <MoreVertical size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.tripAddresses}>
                    <View style={styles.tripAddressRow}>
                      <View style={[styles.tripAddressDot, { backgroundColor: colors.textPrimary }]} />
                      <Text style={styles.tripAddressText} numberOfLines={1}>{trip.origin_name || "Unknown origin"}</Text>
                    </View>
                    <View style={styles.tripAddressRow}>
                      <View style={[styles.tripAddressDot, { backgroundColor: colors.racingRed }]} />
                      <Text style={styles.tripAddressText} numberOfLines={1}>{trip.destination_name || "Unknown destination"}</Text>
                    </View>
                  </View>
                  <TripMiniMap trip={trip} />
                  <View style={styles.tripStats}>
                    <View style={styles.tripStat}><RouteIcon size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.tripStatText}>{trip.distance_km.toFixed(1)} km</Text></View>
                    <View style={styles.tripStat}><Timer size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.tripStatText}>{formatDuration(trip.duration_seconds)}</Text></View>
                    <View style={styles.tripStat}><Gauge size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.tripStatText}>{trip.avg_speed_kmh.toFixed(0)} km/h</Text></View>
                    <View style={styles.tripStat}><Trophy size={13} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.tripStatText}>+{trip.xp_earned}</Text></View>
                  </View>
                  </CutCornerSurface>
                </Pressable>
              ))
            )}
          </View>
        )}

        {/* ═══ FRIENDS TAB ═══ */}
        {activeTab === "friends" && (
          <View style={styles.section}>
            {isSelf && (
              <>
                <View style={styles.searchRow}>
                  <View style={styles.searchInputWrap}>
                    <Search size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} style={{ marginRight: spacing.spacingSm }} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search drivers by name..."
                      placeholderTextColor={colors.textSecondary}
                      value={friendQuery}
                      onChangeText={setFriendQuery}
                      onSubmitEditing={handleSearchFriends}
                      returnKeyType="search"
                    />
                    {friendQuery.length > 0 && (
                      <TouchableOpacity onPress={() => { setFriendQuery(""); setFriendResults([]); }}><X size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
                    )}
                  </View>
                  <CutCornerButton title="Find" size="sm" onPress={handleSearchFriends} />
                </View>
                {friendResults.map((r) => (
                  <View key={r.id} style={styles.friendCard}>
                    <TouchableOpacity style={styles.friendInfo} onPress={() => router.push(`/user/${r.id}` as any)} activeOpacity={0.7}>
                      <View style={styles.friendAvatar}>
                        {r.avatar ? <Image source={{ uri: r.avatar }} style={styles.friendAvatarImg} /> : <Text style={styles.friendAvatarText}>{r.name[0]?.toUpperCase()}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>{r.name}</Text>
                        <Text style={styles.friendStatus}>{rankForLevel(r.level).name} · Level {r.level}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.friendAddBtn} onPress={() => handleAddSearchFriend(r.id, r.name)} activeOpacity={0.7}><UserPlus size={16} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={{ marginTop: spacing.spacingXl }} />
            ) : acceptedFriends.length === 0 && friendResults.length === 0 ? (
              <View style={[styles.emptyState, { marginTop: spacing.spacingXl }]}>
                <Users size={40} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                <Text style={styles.emptyText}>No friends yet</Text>
                <Text style={styles.emptySub}>{isSelf ? "Search for drivers and add them" : "This driver has no friends yet"}</Text>
              </View>
            ) : (
              acceptedFriends.map((f) => {
                const otherId = f.user_id === targetId ? f.friend_id : f.user_id;
                return (
                  <View key={f.id} style={styles.friendCard}>
                    <TouchableOpacity style={styles.friendInfo} onPress={() => router.push(`/user/${otherId}` as any)} activeOpacity={0.7}>
                      <View style={styles.friendAvatar}>
                        {f.friend_profile?.avatar ? <Image source={{ uri: f.friend_profile.avatar }} style={styles.friendAvatarImg} /> : <Text style={styles.friendAvatarText}>{(f.friend_profile?.name ?? "?")[0]?.toUpperCase()}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>{f.friend_profile?.name ?? "Unknown"}</Text>
                        <Text style={styles.friendStatus}>Friend</Text>
                      </View>
                    </TouchableOpacity>
                    {isSelf && (
                      <TouchableOpacity style={styles.friendMsgBtn} onPress={() => router.push(`/messages/${otherId}` as any)}><MessageCircle size={17} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ═══ SETTINGS (self only) ═══ */}
        {isSelf && (
          <View style={styles.settingsSection}>
            <Text style={styles.settingsTitle}>Settings</Text>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/messages" as any)}>
              <View style={styles.settingLeft}><MessageCircle size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.settingText}>Messages</Text></View>
              <View style={styles.settingRight}>
                {unreadMessages > 0 && <View style={styles.settingBadge}><Text style={styles.settingBadgeText}>{unreadMessages}</Text></View>}
                <ChevronRight size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/convoy" as any)}>
              <View style={styles.settingLeft}><Crown size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.settingText}>Convoy</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/ranks" as any)}>
              <View style={styles.settingLeft}><Trophy size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.settingText}>Levels & Ranks</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/terms-and-conditions" as any)}>
              <View style={styles.settingLeft}><Shield size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.settingText}>Privacy & Terms</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
              <View style={styles.settingLeft}><HelpCircle size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.settingText}>Help & Support</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ═══ NOTIFICATIONS MODAL ═══ */}
      <Modal visible={notifOpen} transparent animationType="slide" onRequestClose={() => setNotifOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNotifOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleRow}><Bell size={18} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.modalTitle}>Notifications</Text></View>
            <TouchableOpacity onPress={() => setNotifOpen(false)}><X size={20} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalSection}>Friend Requests</Text>
            {pendingRequests.length === 0 ? (
              <View style={styles.notifEmpty}>
                <MailOpen size={32} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
                <Text style={styles.emptySub}>No pending friend requests</Text>
              </View>
            ) : (
              pendingRequests.map((req) => (
                <View key={req.id} style={styles.notifRow}>
                  <TouchableOpacity style={styles.friendInfo} activeOpacity={0.7} onPress={() => { setNotifOpen(false); router.push(`/user/${req.user_id}` as any); }}>
                    <View style={styles.friendAvatar}>
                      {req.friend_profile?.avatar ? <Image source={{ uri: req.friend_profile.avatar }} style={styles.friendAvatarImg} /> : <Text style={styles.friendAvatarText}>{(req.friend_profile?.name ?? "?")[0]?.toUpperCase()}</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>{req.friend_profile?.name ?? "A driver"}</Text>
                      <Text style={styles.friendStatus}>wants to be friends</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.notifActions}>
                    <TouchableOpacity style={styles.notifAccept} onPress={() => handleAcceptRequest(req.id)}><Check size={18} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
                    <TouchableOpacity style={styles.notifDecline} onPress={() => handleDeclineRequest(req.id)}><X size={18} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ PREMIUM PAYWALL MODAL ═══ */}
      <Modal visible={premiumOpen} transparent animationType="slide" onRequestClose={() => setPremiumOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !purchasing && setPremiumOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.premiumHero}>
            <View style={styles.premiumBadge}><Sparkles size={14} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.premiumBadgeText}>PREMIUM</Text></View>
            <Text style={styles.premiumTitle}>Generate Your Car</Text>
            <Text style={styles.premiumDesc}>
              Turn {premiumTargetCar?.name ?? "your car"} into a stunning, photorealistic render for your garage and profile — visible to every driver who views your page.
            </Text>
          </View>
          <View style={styles.premiumPerks}>
            {["Photorealistic AI car render", "Featured on your public profile", "Premium showcase card"].map((perk) => (
              <View key={perk} style={styles.premiumPerkRow}><Check size={16} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} /><Text style={styles.premiumPerkText}>{perk}</Text></View>
            ))}
          </View>
          <View style={styles.premiumPriceRow}>
            <Text style={styles.premiumPriceLabel}>One-time</Text>
            <Text style={styles.premiumPrice}>Rp {PREMIUM_CAR_PRICE.toLocaleString("id-ID")}</Text>
          </View>
          <CutCornerButton
            title="Pay & Generate"
            onPress={handlePayPremium}
            disabled={purchasing}
            icon={purchasing ? <ActivityIndicator color={onRacingRed} /> : <Lock size={16} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
            style={styles.premiumPayBtn}
          />
          <TouchableOpacity onPress={() => !purchasing && setPremiumOpen(false)} disabled={purchasing}>
            <Text style={styles.premiumCancel}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ═══ TRIP PRIVACY MENU ═══ */}
      <Modal visible={!!tripMenuTrip} transparent animationType="fade" onRequestClose={() => setTripMenuTrip(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setTripMenuTrip(null)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{tripMenuTrip ? tripDisplayName(tripMenuTrip) : ""}</Text>
            <TouchableOpacity onPress={() => setTripMenuTrip(null)}><X size={20} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} /></TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.tripMenuOption}
            activeOpacity={0.7}
            onPress={() => tripMenuTrip && handleToggleTripVisibility(tripMenuTrip)}
          >
            {tripMenuTrip?.is_public ? (
              <>
                <Lock size={18} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripMenuOptionTitle}>Make Private</Text>
                  <Text style={styles.tripMenuOptionSub}>Only you will be able to see this trip</Text>
                </View>
              </>
            ) : (
              <>
                <Globe2 size={18} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripMenuOptionTitle}>Make Public</Text>
                  <Text style={styles.tripMenuOptionSub}>Other drivers will be able to see this trip</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ─── Featured car card (premium showcase) ──────────────────
function CarDriveDataRow({ stats }: { stats?: CarDriveStats }) {
  if (!stats || stats.tripCount === 0) return null;
  return (
    <View style={styles.driveDataRow}>
      <View style={styles.driveDataItem}>
        <RouteIcon size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
        <Text style={styles.driveDataText}>{Math.round(stats.totalDistanceKm).toLocaleString("en-US")} km</Text>
      </View>
      <View style={styles.driveDataItem}>
        <Gauge size={13} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
        <Text style={styles.driveDataText}>{stats.avgSpeedKmh.toFixed(0)} km/h avg</Text>
      </View>
      <View style={styles.driveDataItem}>
        <Trophy size={13} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
        <Text style={styles.driveDataText}>{stats.totalXp.toLocaleString("en-US")} XP</Text>
      </View>
    </View>
  );
}

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
    <CutCornerSurface
      fill={colors.carbonSurface}
      borderColor={colors.racingRed}
      borderWidth={borderWidth.hairline}
      cutSize={cut.md}
      corners="topRight"
      style={styles.featuredCard}
      contentStyle={styles.featuredBg}
    >
      <View style={styles.featuredTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.featuredNameRow}>
            <Text style={styles.featuredName} numberOfLines={1}>{car.name}</Text>
            {hasRender && <Star size={15} color={colors.racingRed} fill={colors.racingRed} />}
          </View>
          <View style={styles.carMeta}>
            <Text style={styles.carMetaText}>{car.make}</Text>
            <Text style={styles.carMetaDot}>•</Text>
            <Text style={styles.carMetaText}>{car.year}</Text>
            <Text style={styles.carMetaDot}>•</Text>
            <Text style={styles.carMetaHp}>{car.hp} HP</Text>
          </View>
        </View>
        {isSelf && (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Trash2 size={16} color={colors.textSecondary} strokeWidth={CHROME_ICON_STROKE} />
          </TouchableOpacity>
        )}
      </View>

      {hasRender ? (
        <Image source={{ uri: car.photo_url as string }} style={styles.featuredImage} resizeMode="cover" />
      ) : (
        <View style={styles.featuredLocked}>
          <View style={styles.featuredCarSilhouette}>
            <Car size={64} color={colors.hairline} strokeWidth={CHROME_ICON_STROKE} />
          </View>
          <View style={styles.premiumLockPill}>
            <Sparkles size={12} color={colors.racingRed} strokeWidth={CHROME_ICON_STROKE} />
            <Text style={styles.premiumLockText}>PREMIUM</Text>
          </View>
          {isSelf ? (
            <CutCornerButton
              title="Generate My Car"
              size="sm"
              onPress={onGenerate}
              icon={<Sparkles size={15} color={onRacingRed} strokeWidth={CHROME_ICON_STROKE} />}
            />
          ) : (
            <Text style={styles.featuredLockedNote}>Not generated yet</Text>
          )}
        </View>
      )}
      <CarDriveDataRow stats={driveStats} />
    </CutCornerSurface>
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

// ─── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidBlack },
  pressed: { opacity: 0.7 },

  // Login prompt
  loginPrompt: { flex: 1, alignItems: "center", paddingHorizontal: spacing.spacingXxl },
  loginIcon: { width: 80, height: 80, marginBottom: spacing.spacingXl },
  loginIconContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  loginTitle: { ...textStyle("displayXl"), color: colors.textPrimary, marginBottom: spacing.spacingSm },
  loginDesc: { ...textStyle("body"), color: colors.textSecondary, textAlign: "center", marginBottom: spacing.spacingXxl },
  loginBtn: { width: "100%", marginBottom: spacing.spacingMd },
  loginBtnSecondary: { width: "100%", height: 52, borderRadius: radius.sharp, justifyContent: "center", alignItems: "center", backgroundColor: colors.carbonSurface, borderWidth: borderWidth.hairline, borderColor: colors.hairline },
  loginBtnSecondaryText: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textPrimary },

  // Top bar
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.spacingLg, marginBottom: spacing.spacingSm },
  topBarActions: { flexDirection: "row", gap: spacing.spacingSm },
  iconBtn: { width: 42, height: 42, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, borderWidth: borderWidth.hairline, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  iconBadge: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.voidBlack },
  iconBadgeText: { ...textStyle("caption", { fontFamily: fontFamily.dataBold, fontSize: 10, lineHeight: 12 }), color: onRacingRed },

  // Identity
  identityRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: spacing.spacingLg, gap: spacing.spacingMd, marginBottom: spacing.spacingMd },
  avatarSection: { position: "relative" },
  avatarRing: { width: 70, height: 70, borderRadius: radius.circle, justifyContent: "center", alignItems: "center", padding: 3, borderWidth: borderWidth.hairline, borderColor: colors.racingRed },
  avatarInner: { width: 62, height: 62, borderRadius: radius.circle, backgroundColor: colors.carbonSurface, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarLetter: { ...textStyle("displayXl", { fontSize: 26, lineHeight: 30 }), color: colors.racingRed },
  avatarImage: { width: 62, height: 62, borderRadius: radius.circle },
  levelBadge: { position: "absolute", bottom: -2, right: -2, minWidth: 24, height: 24, paddingHorizontal: 5, borderRadius: radius.circle, backgroundColor: colors.racingRed, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: colors.voidBlack },
  levelBadgeText: { ...textStyle("dataSm", { fontFamily: fontFamily.dataBold, fontSize: 12, lineHeight: 14 }), color: onRacingRed },
  identityInfo: { flex: 1, paddingTop: spacing.spacingXs + 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  userName: { ...textStyle("displayMd", { fontSize: 22, lineHeight: 26 }), color: colors.textPrimary, flexShrink: 1 },
  nameInput: { ...textStyle("displayMd", { fontSize: 22, lineHeight: 26 }), color: colors.textPrimary, borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.racingRed, flex: 1, paddingVertical: 0 },
  rankSubtitle: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold, fontSize: 14 }), color: colors.racingRed, marginTop: 2 },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.carbonSurface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  countryChipText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold }), color: colors.textSecondary },
  countryInput: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 13 }), color: colors.textPrimary, borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.racingRed, flex: 1, paddingVertical: 0 },
  drivingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: alpha(colors.racingRed, 0.1),
    borderWidth: borderWidth.hairline,
    borderColor: alpha(colors.racingRed, 0.35),
    borderRadius: radius.sharp,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: 3,
    marginTop: spacing.spacingSm - 2,
    alignSelf: "flex-start",
  },
  drivingChipText: { ...textStyle("caption", { fontSize: 11 }), color: colors.textSecondary },
  drivingChipCar: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 11 }), color: colors.textPrimary },

  // Current rank card
  rankCard: { width: 108 },
  rankCardContent: { alignItems: "center", paddingVertical: spacing.spacingSm + 2, paddingHorizontal: spacing.spacingXs + 2 },
  rankCardLabel: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 8, lineHeight: 10 }), color: colors.textSecondary, letterSpacing: 0.8, marginBottom: spacing.spacingXs },
  rankCardName: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 13, lineHeight: 16 }), color: colors.textPrimary, marginTop: spacing.spacingXs },
  rankDivisionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },

  // XP block
  xpBlock: { paddingHorizontal: spacing.spacingLg, marginBottom: spacing.spacingLg },
  xpRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.spacingSm - 2 },
  xpLevelLabel: { ...textStyle("dataSm", { fontFamily: fontFamily.dataBold }), color: colors.textPrimary, letterSpacing: 0.5 },
  xpValue: { ...textStyle("dataSm"), color: colors.textSecondary },
  xpTrack: { height: 7, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, overflow: "hidden" },
  xpFill: { height: "100%", borderRadius: radius.sharp, backgroundColor: colors.racingRed },
  xpToNext: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 11 }), color: colors.racingRed, marginTop: spacing.spacingSm - 2 },

  // Friend action row
  friendActionRow: { flexDirection: "row", gap: spacing.spacingSm, paddingHorizontal: spacing.spacingLg, marginBottom: spacing.spacingLg },
  friendActionSplit: { flex: 1, flexDirection: "row", gap: spacing.spacingSm },
  statusPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.spacingSm, height: 48, paddingHorizontal: spacing.spacingLg, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, borderWidth: borderWidth.hairline, borderColor: colors.hairline },
  statusPillText: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textSecondary },

  // Stat cards
  statsRow: { flexDirection: "row", gap: spacing.spacingSm, paddingHorizontal: spacing.spacingLg, marginBottom: spacing.spacingLg },
  statCard: { alignItems: "center", paddingVertical: spacing.spacingMd },
  statValue: { ...textStyle("dataLg", { fontSize: 19, lineHeight: 22 }), color: colors.textPrimary },
  statLabel: { ...textStyle("caption", { fontSize: 10, lineHeight: 12 }), color: colors.textSecondary, marginTop: 1 },

  // Content tabs
  contentTabs: { flexDirection: "row", gap: spacing.spacingXs + 2, paddingHorizontal: spacing.spacingLg, marginBottom: spacing.spacingMd },
  contentTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: spacing.spacingSm + 2, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, borderWidth: borderWidth.hairline, borderColor: colors.hairline },
  contentTabActive: { backgroundColor: alpha(colors.racingRed, 0.14), borderColor: alpha(colors.racingRed, 0.4) },
  contentTabText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 12 }), color: colors.textSecondary },
  contentTabTextActive: { color: colors.racingRed },
  tabBadge: { minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center" },
  tabBadgeText: { ...textStyle("caption", { fontFamily: fontFamily.dataBold, fontSize: 9, lineHeight: 11 }), color: onRacingRed },

  section: { paddingHorizontal: spacing.spacingLg },

  // Empty states
  emptyState: { alignItems: "center", paddingVertical: spacing.spacingXxxl - spacing.spacingXs },
  emptyText: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textSecondary, marginTop: spacing.spacingMd },
  emptySub: { ...textStyle("caption", { fontSize: 13 }), color: colors.textSecondary, textAlign: "center", marginTop: spacing.spacingSm - 2 },

  // Featured car
  featuredCard: { marginBottom: spacing.spacingMd },
  featuredBg: { padding: spacing.spacingLg },
  featuredTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.spacingMd },
  featuredNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  featuredName: { ...textStyle("displayMd", { fontSize: 20, lineHeight: 24 }), color: colors.textPrimary },
  featuredImage: { width: "100%", height: 170, borderRadius: radius.sharp, backgroundColor: colors.voidBlack },
  featuredLocked: { height: 170, borderRadius: radius.sharp, backgroundColor: colors.voidBlack, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  featuredCarSilhouette: { position: "absolute", opacity: 0.5 },
  premiumLockPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: alpha(colors.voidBlack, 0.5), borderWidth: borderWidth.hairline, borderColor: alpha(colors.racingRed, 0.4), borderRadius: radius.sharp, paddingHorizontal: spacing.spacingSm + 2, paddingVertical: spacing.spacingXs, marginBottom: spacing.spacingMd + 2 },
  premiumLockText: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 10, lineHeight: 12 }), color: colors.racingRed, letterSpacing: 1 },
  featuredLockedNote: { ...textStyle("caption", { fontSize: 13 }), color: colors.textSecondary },

  // Per-car drive data (distance / avg speed / XP earned in this car)
  driveDataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd + 2,
    marginTop: spacing.spacingMd,
    paddingTop: spacing.spacingMd,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
  },
  driveDataItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  driveDataText: { ...textStyle("dataSm", { fontSize: 12 }), color: colors.textSecondary },

  // Garage secondary cards
  garageCard: { marginBottom: spacing.spacingSm + 2 },
  garageCardContent: { flexDirection: "row", alignItems: "center", padding: spacing.spacingMd + 2 },
  carName: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold, fontSize: 15 }), color: colors.textPrimary },
  carMeta: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm - 2, marginTop: 3 },
  carMetaText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 12 }), color: colors.textSecondary },
  carMetaHp: { ...textStyle("dataSm", { fontSize: 12 }), color: colors.racingRed },
  carMetaDot: { ...textStyle("caption", { fontSize: 12 }), color: colors.hairline },

  // Add car
  addCarButton: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd, padding: spacing.spacingMd + 2, borderRadius: radius.sharp, borderWidth: borderWidth.hairline, borderColor: colors.hairline, borderStyle: "dashed", marginBottom: spacing.spacingLg },
  addCarIcon: { width: 34, height: 34, borderRadius: radius.sharp, backgroundColor: alpha(colors.racingRed, 0.14), alignItems: "center", justifyContent: "center" },
  addCarText: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 14 }), color: colors.textSecondary },
  addCarForm: { backgroundColor: colors.carbonSurface, borderWidth: borderWidth.hairline, borderColor: colors.hairline, borderRadius: radius.sharp, padding: spacing.spacingMd + 2, marginBottom: spacing.spacingLg, gap: spacing.spacingSm + 2 },
  addCarFormRow: { flexDirection: "row" },
  addCarInput: { backgroundColor: colors.voidBlack, borderRadius: radius.sharp, paddingHorizontal: spacing.spacingMd, paddingVertical: spacing.spacingSm + 2, color: colors.textPrimary, borderWidth: borderWidth.hairline, borderColor: colors.hairline, ...textStyle("body", { fontSize: 14 }) },
  addCarActions: { flexDirection: "row", gap: spacing.spacingSm + 2, marginTop: 2 },

  // Rank progress card
  seasonCard: { marginBottom: spacing.spacingLg },
  seasonCardContent: { flexDirection: "row", alignItems: "center", padding: spacing.spacingMd + 2 },
  seasonBadgeWrap: { marginRight: spacing.spacingMd },
  seasonMiddle: { flex: 1 },
  seasonLabel: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 10 }), color: colors.racingRed, letterSpacing: 1 },
  seasonName: { ...textStyle("displayMd", { fontSize: 17, lineHeight: 20 }), color: colors.textPrimary, marginTop: 2, marginBottom: spacing.spacingSm },
  seasonTrack: { height: 6, borderRadius: radius.sharp, backgroundColor: colors.voidBlack, overflow: "hidden" },
  seasonFill: { height: "100%", borderRadius: radius.sharp, backgroundColor: colors.racingRed },
  seasonXp: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 11 }), color: colors.textSecondary, marginTop: spacing.spacingSm - 2 },
  seasonDivider: { width: borderWidth.hairline, alignSelf: "stretch", backgroundColor: colors.hairline, marginHorizontal: spacing.spacingMd },
  seasonNext: { width: 88, alignItems: "center", justifyContent: "center" },
  seasonNextLabel: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 8, lineHeight: 10 }), color: colors.textSecondary, letterSpacing: 0.6, marginBottom: spacing.spacingXs },
  seasonNextName: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 12 }), color: colors.textPrimary, marginTop: 3 },
  seasonNextXp: { ...textStyle("dataSm", { fontSize: 10, lineHeight: 12 }), color: colors.textSecondary, marginTop: 1 },

  // Live feed + inbox
  feedRow: { flexDirection: "row", gap: spacing.spacingSm + 2, marginBottom: spacing.spacingSm },
  feedCol: { flex: 1, backgroundColor: colors.carbonSurface, borderRadius: radius.sharp, borderWidth: borderWidth.hairline, borderColor: colors.hairline, padding: spacing.spacingMd },
  feedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.spacingSm + 2 },
  feedTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs + 2 },
  liveDot: { width: 7, height: 7, borderRadius: radius.circle, backgroundColor: colors.racingRed },
  feedTitle: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 10, lineHeight: 12 }), color: colors.textSecondary, letterSpacing: 0.5 },
  feedHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs + 2 },
  feedHeaderBadge: { minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center" },
  feedHeaderBadgeText: { ...textStyle("caption", { fontFamily: fontFamily.dataBold, fontSize: 9, lineHeight: 11 }), color: onRacingRed },
  feedSeeAll: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 10 }), color: colors.racingRed },
  feedItem: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm, paddingVertical: spacing.spacingXs + 2 },
  feedIcon: { width: 26, height: 26, borderRadius: radius.sharp, backgroundColor: colors.voidBlack, alignItems: "center", justifyContent: "center" },
  feedItemTitle: { ...textStyle("caption", { fontFamily: fontFamily.bodySemiBold, fontSize: 11 }), color: colors.textPrimary },
  feedItemSub: { ...textStyle("caption", { fontSize: 10, lineHeight: 12 }), color: colors.textSecondary, marginTop: 1 },
  feedTime: { ...textStyle("dataSm", { fontSize: 9, lineHeight: 11 }), color: colors.textSecondary },
  feedEmpty: { ...textStyle("caption", { fontSize: 11 }), color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.spacingMd },

  // Trips
  tripCard: { marginBottom: spacing.spacingSm + 2 },
  tripCardContent: { padding: spacing.spacingMd + 2 },
  tripHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.spacingSm + 2, gap: spacing.spacingSm },
  tripTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm, flex: 1, flexWrap: "wrap" },
  tripCodeBadge: { borderWidth: borderWidth.hairline, borderColor: alpha(colors.racingRed, 0.4), borderRadius: radius.sharp, paddingHorizontal: spacing.spacingSm, paddingVertical: 3 },
  tripCodeText: { ...textStyle("dataSm", { fontSize: 11 }), color: colors.racingRed },
  tripHeaderRight: { flexDirection: "row", alignItems: "center", gap: spacing.spacingXs + 2 },
  tripDateBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.voidBlack, paddingHorizontal: spacing.spacingSm + 1, paddingVertical: spacing.spacingXs + 1, borderRadius: radius.sharp },
  tripDateText: { ...textStyle("dataSm", { fontSize: 11 }), color: colors.textSecondary },
  tripMenuBtn: { padding: spacing.spacingXs },
  tripDest: { ...textStyle("displayMd", { fontSize: 16, lineHeight: 19 }), color: colors.textPrimary },
  tripFast: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: alpha(colors.racingRed, 0.12), paddingHorizontal: spacing.spacingSm, paddingVertical: 3, borderRadius: radius.sharp },
  tripFastText: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 9, lineHeight: 11 }), color: colors.racingRed },
  tripAddresses: { marginBottom: spacing.spacingSm + 2, gap: spacing.spacingSm - 2 },
  tripAddressRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  tripAddressDot: { width: 8, height: 8, borderRadius: radius.circle },
  tripAddressText: { ...textStyle("caption", { fontFamily: fontFamily.bodyMedium, fontSize: 12.5 }), color: colors.textSecondary, flex: 1 },
  tripStats: { flexDirection: "row", justifyContent: "space-between" },
  tripStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  tripStatText: { ...textStyle("dataSm", { fontSize: 12 }), color: colors.textSecondary },
  tripMapWrap: { height: 120, borderRadius: radius.sharp, overflow: "hidden", marginBottom: spacing.spacingSm + 2, backgroundColor: colors.voidBlack },
  tripMenuOption: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd, paddingVertical: spacing.spacingMd, marginBottom: spacing.spacingSm },
  tripMenuOptionTitle: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold }), color: colors.textPrimary },
  tripMenuOptionSub: { ...textStyle("caption"), color: colors.textSecondary, marginTop: 2 },
  tripMapDot: { width: 12, height: 12, borderRadius: radius.circle, borderWidth: 2, borderColor: colors.voidBlack },

  // Friend search + cards
  searchRow: { flexDirection: "row", gap: spacing.spacingSm, marginBottom: spacing.spacingMd },
  searchInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.voidBlack, borderRadius: radius.sharp, paddingHorizontal: spacing.spacingMd, borderWidth: borderWidth.hairline, borderColor: colors.hairline },
  searchInput: { flex: 1, color: colors.textPrimary, paddingVertical: spacing.spacingSm + 3, ...textStyle("body", { fontSize: 14 }) },
  friendCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.carbonSurface, borderRadius: radius.sharp, borderWidth: borderWidth.hairline, borderColor: colors.hairline, padding: spacing.spacingMd, marginBottom: spacing.spacingSm + 2 },
  friendInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  friendAvatar: { width: 44, height: 44, borderRadius: radius.circle, backgroundColor: alpha(colors.racingRed, 0.12), alignItems: "center", justifyContent: "center", overflow: "hidden" },
  friendAvatarImg: { width: 44, height: 44, borderRadius: radius.circle },
  friendAvatarText: { ...textStyle("displayMd", { fontSize: 17, lineHeight: 20 }), color: colors.racingRed },
  friendName: { ...textStyle("body", { fontFamily: fontFamily.bodySemiBold, fontSize: 15 }), color: colors.textPrimary },
  friendStatus: { ...textStyle("caption"), color: colors.textSecondary, marginTop: 1 },
  friendAddBtn: { width: 40, height: 40, borderRadius: radius.sharp, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center" },
  friendMsgBtn: { width: 40, height: 40, borderRadius: radius.sharp, backgroundColor: alpha(colors.racingRed, 0.12), alignItems: "center", justifyContent: "center" },

  // Settings
  settingsSection: { paddingHorizontal: spacing.spacingLg, marginTop: spacing.spacingXl },
  settingsTitle: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 13 }), color: colors.textSecondary, letterSpacing: 0.5, marginBottom: spacing.spacingMd, textTransform: "uppercase" },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.spacingMd, borderBottomWidth: borderWidth.hairline, borderBottomColor: colors.hairline },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: spacing.spacingMd },
  settingRight: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  settingText: { ...textStyle("body", { fontFamily: fontFamily.bodyMedium }), color: colors.textPrimary },
  settingBadge: { minWidth: 20, height: 20, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  settingBadgeText: { ...textStyle("caption", { fontFamily: fontFamily.dataBold, fontSize: 11 }), color: onRacingRed },

  // Modals
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: alpha(colors.voidBlack, 0.75) },
  modalSheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.carbonSurface, paddingHorizontal: spacing.spacingXl, paddingTop: spacing.spacingMd, borderTopWidth: borderWidth.hairline, borderColor: colors.hairline },
  modalHandle: { width: 40, height: 4, borderRadius: radius.sharp, backgroundColor: colors.hairline, alignSelf: "center", marginBottom: spacing.spacingMd + 2 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.spacingMd + 2 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm },
  modalTitle: { ...textStyle("displayMd", { fontSize: 18, lineHeight: 22 }), color: colors.textPrimary },
  modalSection: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 11 }), color: colors.textSecondary, letterSpacing: 0.5, marginBottom: spacing.spacingMd, textTransform: "uppercase" },
  notifEmpty: { alignItems: "center", paddingVertical: spacing.spacingXxl - 2, gap: spacing.spacingMd },
  notifRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.voidBlack, borderRadius: radius.sharp, borderWidth: borderWidth.hairline, borderColor: colors.hairline, padding: spacing.spacingMd, marginBottom: spacing.spacingSm + 2 },
  notifActions: { flexDirection: "row", gap: spacing.spacingSm },
  notifAccept: { width: 40, height: 40, borderRadius: radius.sharp, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center" },
  notifDecline: { width: 40, height: 40, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, borderWidth: borderWidth.hairline, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },

  // Premium modal
  premiumHero: { borderRadius: radius.sharp, backgroundColor: alpha(colors.racingRed, 0.1), borderWidth: borderWidth.hairline, borderColor: alpha(colors.racingRed, 0.3), padding: spacing.spacingLg + 2, marginBottom: spacing.spacingLg, alignItems: "center" },
  premiumBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: alpha(colors.voidBlack, 0.3), borderRadius: radius.sharp, paddingHorizontal: spacing.spacingSm + 2, paddingVertical: spacing.spacingXs, marginBottom: spacing.spacingMd, borderWidth: borderWidth.hairline, borderColor: alpha(colors.racingRed, 0.4) },
  premiumBadgeText: { ...textStyle("caption", { fontFamily: fontFamily.displaySemiBold, fontSize: 10, lineHeight: 12 }), color: colors.racingRed, letterSpacing: 1 },
  premiumTitle: { ...textStyle("displayXl", { fontSize: 22, lineHeight: 26 }), color: colors.textPrimary, marginBottom: spacing.spacingSm },
  premiumDesc: { ...textStyle("caption", { fontSize: 13, lineHeight: 19 }), color: colors.textSecondary, textAlign: "center" },
  premiumPerks: { gap: spacing.spacingSm + 2, marginBottom: spacing.spacingLg + 2 },
  premiumPerkRow: { flexDirection: "row", alignItems: "center", gap: spacing.spacingSm + 2 },
  premiumPerkText: { ...textStyle("body", { fontFamily: fontFamily.bodyMedium, fontSize: 14 }), color: colors.textPrimary },
  premiumPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.spacingMd, borderTopWidth: borderWidth.hairline, borderTopColor: colors.hairline, marginBottom: spacing.spacingLg },
  premiumPriceLabel: { ...textStyle("caption", { fontFamily: fontFamily.bodyMedium, fontSize: 14 }), color: colors.textSecondary },
  premiumPrice: { ...textStyle("dataLg", { fontSize: 22, lineHeight: 26 }), color: colors.racingRed },
  premiumPayBtn: { marginBottom: spacing.spacingMd },
  premiumCancel: { ...textStyle("caption", { fontFamily: fontFamily.bodyMedium, fontSize: 14 }), color: colors.textSecondary, textAlign: "center", paddingVertical: spacing.spacingXs + 2 },
});
