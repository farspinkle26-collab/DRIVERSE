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
import { LinearGradient } from "expo-linear-gradient";
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
import { CutCornerCard, CutCornerSurface } from "@/components/CutCorner";
import { colors, fontFamily, onRacingRed, radius, spacing } from "@/constants/theme";

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
            <Polyline coordinates={coords} strokeWidth={7} strokeColor="rgba(255,107,53,0.25)" lineCap="round" />
            <Polyline coordinates={coords} strokeWidth={3.5} strokeColor="#FF6B35" lineCap="round" />
          </>
        )}
        <Marker coordinate={{ latitude: trip.origin_lat, longitude: trip.origin_lng }} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={[styles.tripMapDot, { backgroundColor: "#00D4AA" }]} />
        </Marker>
        {trip.destination_lat && trip.destination_lng ? (
          <Marker
            coordinate={{ latitude: trip.destination_lat, longitude: trip.destination_lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={[styles.tripMapDot, { backgroundColor: "#FF3B6F" }]} />
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
      color: "#FF6B35",
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
          <LinearGradient colors={["#FF6B35", "#FF3B6F"]} style={styles.loginIcon}>
            <Car size={40} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.loginTitle}>Join the Drive</Text>
          <Text style={styles.loginDesc}>
            Sign up to track your rides, collect cars, earn XP, and connect with fellow drivers.
          </Text>
          <TouchableOpacity style={styles.loginBtn} onPress={() => router.push("/login" as any)} activeOpacity={0.85}>
            <LinearGradient colors={["#FF6B35", "#FF3B6F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.loginBtnGrad}>
              <Text style={styles.loginBtnText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>
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
              <ArrowLeft size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 42 }} />
          )}
          <View style={styles.topBarActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setNotifOpen(true)} activeOpacity={0.7}>
              <Bell size={20} color={colors.textPrimary} />
              {notifCount > 0 && (
                <View style={styles.iconBadge}>
                  <Text style={styles.iconBadgeText}>{notifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={openMessages} activeOpacity={0.7}>
              <MessageCircle size={20} color={colors.textPrimary} />
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
                  <Pencil size={15} color={colors.textSecondary} />
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
                    <MapPin size={12} color={colors.textSecondary} />
                    <Text style={styles.countryChipText}>{user?.country || "Set your country"}</Text>
                  </View>
                )}
                {!editingCountry && (
                  <TouchableOpacity
                    onPress={() => { setCountryDraft(user?.country ?? ""); setEditingCountry(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Pencil size={13} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {primaryCar && (
              <View style={styles.drivingChip}>
                <Car size={12} color={colors.textSecondary} />
                <Text style={styles.drivingChipText} numberOfLines={1}>
                  Driving <Text style={styles.drivingChipCar}>{primaryCar.name}</Text>
                </Text>
              </View>
            )}
          </View>

          {/* Current rank card — the viewer's rank right now (primary). */}
          <CutCornerCard
            style={styles.rankCard}
            contentStyle={styles.rankCardContent}
            cutSize={spacing.spacingMd}
            corners="topRight"
          >
            <TouchableOpacity
              style={styles.rankCardTouchable}
              activeOpacity={0.85}
              onPress={() => router.push("/ranks" as any)}
            >
              <Text style={styles.rankCardLabel}>CURRENT RANK</Text>
              <RankBadge rank={rank} size={54} />
              <Text style={styles.rankCardName}>{rank.name}</Text>
              <View style={styles.rankDivisionRow}>
                <Info size={11} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </CutCornerCard>
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
              <TouchableOpacity style={styles.primaryAction} onPress={handleAddFriendById} disabled={friendActionLoading} activeOpacity={0.85}>
                <LinearGradient colors={["#FF6B35", "#FF3B6F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryActionGrad}>
                  {friendActionLoading ? <ActivityIndicator color="#FFFFFF" /> : (<><UserPlus size={17} color="#FFFFFF" /><Text style={styles.primaryActionText}>Add Friend</Text></>)}
                </LinearGradient>
              </TouchableOpacity>
            )}
            {friendState === "pending_sent" && (
              <View style={[styles.statusPill, { borderColor: "rgba(255,215,0,0.3)" }]}>
                <Clock size={15} color="#FFD700" /><Text style={[styles.statusPillText, { color: "#FFD700" }]}>Request Pending</Text>
              </View>
            )}
            {friendState === "pending_received" && pendingRequests.find((r) => r.user_id === targetId) && (
              <View style={styles.friendActionSplit}>
                <TouchableOpacity
                  style={[styles.primaryAction, { flex: 1 }]}
                  onPress={() => { const req = pendingRequests.find((r) => r.user_id === targetId); if (req) handleAcceptRequest(req.id); }}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={["#22C55E", "#16A34A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryActionGrad}>
                    <UserCheck size={17} color="#FFFFFF" /><Text style={styles.primaryActionText}>Accept</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            {friendState === "friends" && (
              <View style={[styles.statusPill, { borderColor: "rgba(34,197,94,0.3)", flex: 1 }]}>
                <UserCheck size={15} color="#22C55E" /><Text style={[styles.statusPillText, { color: "#22C55E" }]}>Friends</Text>
              </View>
            )}
            <TouchableOpacity style={styles.secondaryAction} onPress={() => { if (targetId) router.push(`/messages/${targetId}` as any); }} activeOpacity={0.85}>
              <MessageCircle size={17} color="#FF6B35" /><Text style={styles.secondaryActionText}>Message</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ STAT CARDS ═══ */}
        <View style={styles.statsRow}>
          {stats.map((s) => (
            <CutCornerCard
              key={s.label}
              style={styles.statCard}
              contentStyle={styles.statCardContent}
              cutSize={spacing.spacingSm}
              corners="topRight"
            >
              <s.icon size={18} color={colors.textSecondary} strokeWidth={1.75} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </CutCornerCard>
          ))}
        </View>

        {/* ═══ CONTENT TABS ═══ */}
        <View style={styles.contentTabs}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
              style={styles.contentTabTouchable}
            >
              <CutCornerSurface
                fill={activeTab === tab.key ? colors.racingRed : colors.carbonSurface}
                borderColor={activeTab === tab.key ? colors.racingRed : colors.hairline}
                cutSize={spacing.spacingSm}
                corners="topRight"
                contentStyle={styles.contentTabContent}
              >
                <tab.icon size={15} color={activeTab === tab.key ? onRacingRed : colors.textSecondary} strokeWidth={1.75} />
                <Text style={[styles.contentTabText, activeTab === tab.key && styles.contentTabTextActive]}>{tab.label}</Text>
                {tab.badge ? (
                  <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{tab.badge}</Text></View>
                ) : null}
              </CutCornerSurface>
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══ GARAGE TAB ═══ */}
        {activeTab === "garage" && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color={colors.racingRed} style={{ marginTop: 20 }} />
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
                <Car size={40} color={colors.hairline} strokeWidth={1.5} />
                <Text style={styles.emptyText}>No cars yet</Text>
                <Text style={styles.emptySub}>{isSelf ? "Add your first ride to the garage" : "This driver hasn't added a car"}</Text>
              </View>
            )}

            {/* Secondary cars */}
            {otherCars.map((car) => (
              <CutCornerCard
                key={car.id}
                style={styles.garageCard}
                contentStyle={styles.garageCardContent}
                cutSize={spacing.spacingSm}
                corners="topRight"
              >
                <TouchableOpacity
                  style={styles.garageCardTouchable}
                  activeOpacity={0.8}
                  onLongPress={isSelf ? () => handleDeleteCar(car.id) : undefined}
                >
                  <View style={[styles.carColorBar, { backgroundColor: colors.racingRed }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carName}>{car.name}</Text>
                    <View style={styles.carMeta}>
                      <Text style={styles.carMetaText}>{car.make} · {car.year} · {car.hp} HP</Text>
                    </View>
                    <CarDriveDataRow stats={statsByCarId[car.id]} />
                  </View>
                  {isSelf && (
                    <TouchableOpacity onPress={() => handleSetPrimary(car.id)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      {car.is_primary ? <CheckCircle2 size={18} color={colors.racingRed} strokeWidth={1.75} /> : <Circle size={18} color={colors.textSecondary} strokeWidth={1.75} />}
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </CutCornerCard>
            ))}

            {/* Add a car (self only) */}
            {isSelf && (showAddCar ? (
              <View style={styles.addCarForm}>
                <TextInput style={styles.addCarInput} placeholder="Car name (e.g. Night Fury)" placeholderTextColor={colors.textSecondary} value={newCarName} onChangeText={setNewCarName} />
                <View style={styles.addCarFormRow}>
                  <TextInput style={[styles.addCarInput, { flex: 1 }]} placeholder="Make (e.g. BMW)" placeholderTextColor={colors.textSecondary} value={newCarMake} onChangeText={setNewCarMake} />
                  <TextInput style={[styles.addCarInput, { flex: 1, marginLeft: 8 }]} placeholder="Year" placeholderTextColor={colors.textSecondary} value={newCarYear} onChangeText={setNewCarYear} keyboardType="number-pad" />
                </View>
                <TextInput style={styles.addCarInput} placeholder="HP" placeholderTextColor={colors.textSecondary} value={newCarHP} onChangeText={setNewCarHP} keyboardType="number-pad" />
                <View style={styles.addCarActions}>
                  <TouchableOpacity style={styles.addCarCancel} onPress={() => setShowAddCar(false)}><Text style={styles.addCarCancelText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.addCarSubmit} onPress={handleAddCar}><Text style={styles.addCarSubmitText}>Add Car</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              <CutCornerCard
                style={styles.addCarButton}
                contentStyle={styles.addCarButtonContent}
                cutSize={spacing.spacingSm}
                corners="topRight"
                borderColor={colors.hairline}
              >
                <TouchableOpacity style={styles.addCarTouchable} onPress={() => setShowAddCar(true)} activeOpacity={0.7}>
                  <Plus size={20} color={colors.racingRed} strokeWidth={1.75} />
                  <Text style={styles.addCarText}>Add a car to your garage</Text>
                </TouchableOpacity>
              </CutCornerCard>
            ))}

            {/* Rank progress card — secondary framing of the same rank shown
                in the header's Current Rank card above; kept quieter (no
                racingRed label, thinner emphasis) so the two don't compete. */}
            <CutCornerCard
              style={styles.seasonCard}
              contentStyle={styles.seasonCardContent}
              cutSize={spacing.spacingMd}
              corners="topRight"
            >
              <TouchableOpacity style={styles.seasonTouchable} activeOpacity={0.9} onPress={() => router.push("/ranks" as any)}>
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
                  <ChevronRight size={16} color={colors.textSecondary} style={{ position: "absolute", right: 0, top: "50%" }} />
                </View>
              </TouchableOpacity>
            </CutCornerCard>

            {/* Live Feed + Inbox */}
            <View style={styles.feedRow}>
              <CutCornerCard style={styles.feedCol} contentStyle={styles.feedColContent} cutSize={spacing.spacingSm} corners="topRight">
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
                      {e.is_live ? <Radio size={13} color={colors.textSecondary} strokeWidth={1.75} /> : <MapPin size={13} color={colors.textSecondary} strokeWidth={1.75} />}
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
                {events.length === 0 && <Text style={styles.feedEmpty}>No nearby activity yet.</Text>}
              </CutCornerCard>

              <CutCornerCard style={styles.feedCol} contentStyle={styles.feedColContent} cutSize={spacing.spacingSm} corners="topRight">
                <View style={styles.feedHeader}>
                  <Text style={styles.feedTitle}>INBOX</Text>
                  <View style={styles.feedHeaderRight}>
                    {unreadMessages > 0 && <View style={styles.feedHeaderBadge}><Text style={styles.feedHeaderBadgeText}>{unreadMessages}</Text></View>}
                    <TouchableOpacity onPress={() => router.push("/messages" as any)}><Text style={styles.feedSeeAll}>See All</Text></TouchableOpacity>
                  </View>
                </View>
                {/* Reward notification */}
                <TouchableOpacity style={styles.feedItem} activeOpacity={0.7} onPress={() => router.push("/ranks" as any)}>
                  <View style={styles.feedIcon}><Trophy size={13} color={colors.textSecondary} strokeWidth={1.75} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.feedItemTitle} numberOfLines={1}>Rank Rewards</Text>
                    <Text style={styles.feedItemSub} numberOfLines={1}>You&apos;ve earned {totalXp} XP!</Text>
                  </View>
                </TouchableOpacity>
                {inboxConversations(messages, user?.id).slice(0, 2).map(([partnerId, last]) => {
                  const p = getFriendInfo(partnerId);
                  return (
                    <TouchableOpacity key={partnerId} style={styles.feedItem} activeOpacity={0.7} onPress={() => router.push(`/messages/${partnerId}` as any)}>
                      <View style={styles.feedIcon}><MessageCircle size={13} color={colors.textSecondary} strokeWidth={1.75} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.feedItemTitle} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.feedItemSub} numberOfLines={1}>{last.sender_id === user?.id ? "You: " : ""}{last.content}</Text>
                      </View>
                      <Text style={styles.feedTime}>{timeAgo(last.created_at)}</Text>
                    </TouchableOpacity>
                  );
                })}
                {messages.length === 0 && <Text style={styles.feedEmpty}>No messages yet</Text>}
              </CutCornerCard>
            </View>
          </View>
        )}

        {/* ═══ TRIPS TAB ═══ */}
        {activeTab === "trips" && (
          <View style={styles.section}>
            {loading ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
            ) : trips.length === 0 ? (
              <View style={styles.emptyState}>
                <RouteIcon size={40} color="#3A3A4E" />
                <Text style={styles.emptyText}>No trips recorded</Text>
                <Text style={styles.emptySub}>{isSelf ? "Start recording a drive to see it here" : "This driver has no trips yet"}</Text>
              </View>
            ) : (
              trips.map((trip, idx) => (
                <TouchableOpacity
                  key={trip.id}
                  style={styles.tripCard}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/trip/${trip.id}` as any)}
                >
                  <View style={styles.tripHeader}>
                    <View style={styles.tripTitleRow}>
                      <View style={styles.tripCodeBadge}><Text style={styles.tripCodeText}>{tripCode(idx)}</Text></View>
                      <Text style={styles.tripDest} numberOfLines={1}>{tripDisplayName(trip)}</Text>
                      {trip.was_faster_than_estimation && (
                        <View style={styles.tripFast}><Zap size={11} color="#FFD700" /><Text style={styles.tripFastText}>FAST</Text></View>
                      )}
                      {isSelf && !trip.is_public && <Lock size={12} color="#8A8A9A" />}
                    </View>
                    <View style={styles.tripHeaderRight}>
                      <View style={styles.tripDateBadge}>
                        <Calendar size={11} color="#B0B0BE" />
                        <Text style={styles.tripDateText}>{tripDateLabel(trip.completed_at)}</Text>
                      </View>
                      {isSelf && (
                        <TouchableOpacity
                          style={styles.tripMenuBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(e) => { e.stopPropagation(); setTripMenuTrip(trip); }}
                        >
                          <MoreVertical size={16} color="#8A8A9A" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <View style={styles.tripAddresses}>
                    <View style={styles.tripAddressRow}>
                      <View style={[styles.tripAddressDot, { backgroundColor: "#00D4AA" }]} />
                      <Text style={styles.tripAddressText} numberOfLines={1}>{trip.origin_name || "Unknown origin"}</Text>
                    </View>
                    <View style={styles.tripAddressRow}>
                      <View style={[styles.tripAddressDot, { backgroundColor: "#FF3B6F" }]} />
                      <Text style={styles.tripAddressText} numberOfLines={1}>{trip.destination_name || "Unknown destination"}</Text>
                    </View>
                  </View>
                  <TripMiniMap trip={trip} />
                  <View style={styles.tripStats}>
                    <View style={styles.tripStat}><RouteIcon size={13} color="#FF6B35" /><Text style={styles.tripStatText}>{trip.distance_km.toFixed(1)} km</Text></View>
                    <View style={styles.tripStat}><Timer size={13} color="#FF6B35" /><Text style={styles.tripStatText}>{formatDuration(trip.duration_seconds)}</Text></View>
                    <View style={styles.tripStat}><Gauge size={13} color="#FF6B35" /><Text style={styles.tripStatText}>{trip.avg_speed_kmh.toFixed(0)} km/h</Text></View>
                    <View style={styles.tripStat}><Trophy size={13} color="#FFD700" /><Text style={styles.tripStatText}>+{trip.xp_earned}</Text></View>
                  </View>
                </TouchableOpacity>
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
                    <Search size={16} color="#5A5A6E" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search drivers by name..."
                      placeholderTextColor="#5A5A6E"
                      value={friendQuery}
                      onChangeText={setFriendQuery}
                      onSubmitEditing={handleSearchFriends}
                      returnKeyType="search"
                    />
                    {friendQuery.length > 0 && (
                      <TouchableOpacity onPress={() => { setFriendQuery(""); setFriendResults([]); }}><X size={16} color="#5A5A6E" /></TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity style={styles.searchBtn} onPress={handleSearchFriends} activeOpacity={0.7}><Text style={styles.searchBtnText}>Find</Text></TouchableOpacity>
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
                    <TouchableOpacity style={styles.friendAddBtn} onPress={() => handleAddSearchFriend(r.id, r.name)} activeOpacity={0.7}><UserPlus size={16} color="#FFFFFF" /></TouchableOpacity>
                  </View>
                ))}
              </>
            )}

            {loading ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
            ) : acceptedFriends.length === 0 && friendResults.length === 0 ? (
              <View style={[styles.emptyState, { marginTop: 20 }]}>
                <Users size={40} color="#3A3A4E" />
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
                      <TouchableOpacity style={styles.friendMsgBtn} onPress={() => router.push(`/messages/${otherId}` as any)}><MessageCircle size={17} color="#FF6B35" /></TouchableOpacity>
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
              <View style={styles.settingLeft}><MessageCircle size={18} color={colors.textSecondary} strokeWidth={2} /><Text style={styles.settingText}>Messages</Text></View>
              <View style={styles.settingRight}>
                {unreadMessages > 0 && <View style={styles.settingBadge}><Text style={styles.settingBadgeText}>{unreadMessages}</Text></View>}
                <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/convoy" as any)}>
              <View style={styles.settingLeft}><Crown size={18} color={colors.textSecondary} strokeWidth={2} /><Text style={styles.settingText}>Convoy</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/ranks" as any)}>
              <View style={styles.settingLeft}><Trophy size={18} color={colors.textSecondary} strokeWidth={2} /><Text style={styles.settingText}>Levels & Ranks</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/terms-and-conditions" as any)}>
              <View style={styles.settingLeft}><Shield size={18} color={colors.textSecondary} strokeWidth={2} /><Text style={styles.settingText}>Privacy & Terms</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.settingRow, styles.settingRowLast]} activeOpacity={0.7}>
              <View style={styles.settingLeft}><HelpCircle size={18} color={colors.textSecondary} strokeWidth={2} /><Text style={styles.settingText}>Help & Support</Text></View>
              <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2} />
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
            <View style={styles.modalTitleRow}><Bell size={18} color="#FF6B35" /><Text style={styles.modalTitle}>Notifications</Text></View>
            <TouchableOpacity onPress={() => setNotifOpen(false)}><X size={20} color="#8A8A9A" /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalSection}>Friend Requests</Text>
            {pendingRequests.length === 0 ? (
              <View style={styles.notifEmpty}>
                <MailOpen size={32} color="#3A3A4E" />
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
                    <TouchableOpacity style={styles.notifAccept} onPress={() => handleAcceptRequest(req.id)}><Check size={18} color="#FFFFFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.notifDecline} onPress={() => handleDeclineRequest(req.id)}><X size={18} color="#EF4444" /></TouchableOpacity>
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
          <LinearGradient colors={["rgba(255,107,53,0.18)", "rgba(255,59,111,0.06)"]} style={styles.premiumHero}>
            <View style={styles.premiumBadge}><Sparkles size={14} color="#FFD700" /><Text style={styles.premiumBadgeText}>PREMIUM</Text></View>
            <Text style={styles.premiumTitle}>Generate Your Car</Text>
            <Text style={styles.premiumDesc}>
              Turn {premiumTargetCar?.name ?? "your car"} into a stunning, photorealistic render for your garage and profile — visible to every driver who views your page.
            </Text>
          </LinearGradient>
          <View style={styles.premiumPerks}>
            {["Photorealistic AI car render", "Featured on your public profile", "Premium showcase card"].map((perk) => (
              <View key={perk} style={styles.premiumPerkRow}><Check size={16} color="#22C55E" /><Text style={styles.premiumPerkText}>{perk}</Text></View>
            ))}
          </View>
          <View style={styles.premiumPriceRow}>
            <Text style={styles.premiumPriceLabel}>One-time</Text>
            <Text style={styles.premiumPrice}>Rp {PREMIUM_CAR_PRICE.toLocaleString("id-ID")}</Text>
          </View>
          <TouchableOpacity style={styles.premiumPayBtn} onPress={handlePayPremium} disabled={purchasing} activeOpacity={0.85}>
            <LinearGradient colors={["#FF6B35", "#FF3B6F"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.premiumPayGrad}>
              {purchasing ? <ActivityIndicator color="#FFFFFF" /> : (<><Lock size={16} color="#FFFFFF" /><Text style={styles.premiumPayText}>Pay & Generate</Text></>)}
            </LinearGradient>
          </TouchableOpacity>
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
            <TouchableOpacity onPress={() => setTripMenuTrip(null)}><X size={20} color="#8A8A9A" /></TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.tripMenuOption}
            activeOpacity={0.7}
            onPress={() => tripMenuTrip && handleToggleTripVisibility(tripMenuTrip)}
          >
            {tripMenuTrip?.is_public ? (
              <>
                <Lock size={18} color="#FF6B35" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripMenuOptionTitle}>Make Private</Text>
                  <Text style={styles.tripMenuOptionSub}>Only you will be able to see this trip</Text>
                </View>
              </>
            ) : (
              <>
                <Globe2 size={18} color="#FF6B35" />
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
        <RouteIcon size={13} color={colors.textSecondary} strokeWidth={1.75} />
        <Text style={styles.driveDataText}>{Math.round(stats.totalDistanceKm).toLocaleString("en-US")} km</Text>
      </View>
      <View style={styles.driveDataItem}>
        <Gauge size={13} color={colors.textSecondary} strokeWidth={1.75} />
        <Text style={styles.driveDataText}>{stats.avgSpeedKmh.toFixed(0)} km/h avg</Text>
      </View>
      <View style={styles.driveDataItem}>
        <Trophy size={13} color={colors.textSecondary} strokeWidth={1.75} />
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
    <CutCornerCard
      style={styles.featuredCard}
      contentStyle={styles.featuredBg}
      cutSize={spacing.spacingMd}
      corners="topRight"
    >
      <View style={styles.featuredAccent} />
      <View style={styles.featuredTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.featuredNameRow}>
            <Text style={styles.featuredName} numberOfLines={1}>{car.name}</Text>
            {hasRender && <Star size={15} color={colors.racingRed} fill={colors.racingRed} />}
          </View>
          <View style={styles.carMeta}>
            <Text style={styles.carMetaText}>{car.make} · {car.year} · {car.hp} HP</Text>
          </View>
        </View>
        {isSelf && (
          <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Trash2 size={16} color={colors.textSecondary} strokeWidth={1.75} />
          </TouchableOpacity>
        )}
      </View>

      {hasRender ? (
        <Image source={{ uri: car.photo_url as string }} style={styles.featuredImage} resizeMode="cover" />
      ) : (
        <View style={styles.featuredLocked}>
          <View style={styles.featuredCarSilhouette}>
            <Car size={64} color={colors.hairline} strokeWidth={1.5} />
          </View>
          <View style={styles.premiumLockPill}>
            <Sparkles size={12} color={colors.racingRed} />
            <Text style={styles.premiumLockText}>PREMIUM</Text>
          </View>
          {isSelf ? (
            <TouchableOpacity style={styles.generateBtn} onPress={onGenerate} activeOpacity={0.85}>
              <Sparkles size={15} color={onRacingRed} />
              <Text style={styles.generateText}>Generate My Car</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.featuredLockedNote}>Not generated yet</Text>
          )}
        </View>
      )}
      <CarDriveDataRow stats={driveStats} />
    </CutCornerCard>
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

  // Login prompt
  loginPrompt: { flex: 1, alignItems: "center", paddingHorizontal: 32 },
  loginIcon: { width: 80, height: 80, borderRadius: 24, justifyContent: "center", alignItems: "center", marginBottom: 24 },
  loginTitle: { fontSize: 26, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  loginDesc: { fontSize: 15, color: "#8A8A9A", textAlign: "center", lineHeight: 22, marginBottom: 32 },
  loginBtn: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  loginBtnGrad: { height: 52, justifyContent: "center", alignItems: "center" },
  loginBtnText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  loginBtnSecondary: { width: "100%", height: 52, borderRadius: 14, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  loginBtnSecondaryText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },

  // Top bar
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 8 },
  topBarActions: { flexDirection: "row", gap: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: radius.circle, backgroundColor: colors.carbonSurface, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  iconBadge: { position: "absolute", top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.voidBlack },
  iconBadgeText: { fontFamily: fontFamily.dataBold, fontSize: 10, color: onRacingRed },

  // Identity
  identityRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 16, gap: 12, marginBottom: 14 },
  avatarSection: { position: "relative" },
  avatarRing: { width: 70, height: 70, borderRadius: radius.circle, justifyContent: "center", alignItems: "center", padding: 3, backgroundColor: colors.racingRed },
  avatarInner: { width: 64, height: 64, borderRadius: radius.circle, backgroundColor: colors.carbonSurface, justifyContent: "center", alignItems: "center", overflow: "hidden" },
  avatarLetter: { fontFamily: fontFamily.displayBold, fontSize: 26, color: colors.racingRed },
  avatarImage: { width: 64, height: 64, borderRadius: radius.circle },
  levelBadge: { position: "absolute", bottom: -2, right: -2, minWidth: 24, height: 24, paddingHorizontal: 5, borderRadius: radius.circle, backgroundColor: colors.racingRed, justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: colors.voidBlack },
  levelBadgeText: { fontFamily: fontFamily.dataBold, fontSize: 12, color: onRacingRed },
  identityInfo: { flex: 1, paddingTop: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  userName: { fontFamily: fontFamily.displayBold, fontSize: 22, color: colors.textPrimary, flexShrink: 1 },
  nameInput: { fontFamily: fontFamily.displayBold, fontSize: 22, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.racingRed, flex: 1, paddingVertical: 0 },
  rankSubtitle: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: colors.racingRed, marginTop: 2 },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.carbonSurface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  countryChipText: { fontFamily: fontFamily.bodyMedium, fontSize: 12, color: colors.textSecondary },
  countryInput: { fontFamily: fontFamily.bodySemiBold, fontSize: 13, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.racingRed, flex: 1, paddingVertical: 0 },
  drivingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.carbonSurface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  drivingChipText: { fontFamily: fontFamily.bodyRegular, fontSize: 11, color: colors.textSecondary },
  drivingChipCar: { fontFamily: fontFamily.bodySemiBold, color: colors.textPrimary },

  // Current rank card (header — primary framing of the viewer's rank)
  rankCard: { width: 108 },
  rankCardTouchable: { alignItems: "center", width: "100%" },
  rankCardContent: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 6 },
  rankCardLabel: { fontFamily: fontFamily.displaySemiBold, fontSize: 10, color: colors.textSecondary, letterSpacing: 0.8, marginBottom: 4 },
  rankCardName: { fontFamily: fontFamily.displayBold, fontSize: 13, color: colors.textPrimary, marginTop: 4 },
  rankDivisionRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  rankDivision: { fontFamily: fontFamily.displaySemiBold, fontSize: 9, letterSpacing: 0.8 },

  // XP block
  xpBlock: { paddingHorizontal: 16, marginBottom: 16 },
  xpRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  xpLevelLabel: { fontFamily: fontFamily.dataBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 0.5 },
  xpValue: { fontFamily: fontFamily.dataMedium, fontSize: 12, color: colors.textSecondary },
  xpTrack: { height: 7, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, overflow: "hidden" },
  xpFill: { height: "100%", borderRadius: radius.sharp, backgroundColor: colors.racingRed },
  xpToNext: { fontFamily: fontFamily.bodyRegular, fontSize: 11, color: colors.textSecondary, marginTop: 6 },

  // Friend action row
  friendActionRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  friendActionSplit: { flex: 1, flexDirection: "row", gap: 8 },
  primaryAction: { flex: 1, borderRadius: 14, overflow: "hidden" },
  primaryActionGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48 },
  primaryActionText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  secondaryAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, paddingHorizontal: 18, borderRadius: 14, backgroundColor: "rgba(255,107,53,0.1)", borderWidth: 1, borderColor: "rgba(255,107,53,0.3)" },
  secondaryActionText: { fontSize: 15, fontWeight: "700", color: "#FF6B35" },
  statusPill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1 },
  statusPillText: { fontSize: 14, fontWeight: "700" },

  // Stat cards
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  statCard: { flex: 1 },
  statCardContent: { alignItems: "center", paddingVertical: 12, gap: 6 },
  statValue: { fontFamily: fontFamily.dataBold, fontSize: 19, color: colors.textPrimary },
  statLabel: { fontFamily: fontFamily.bodyRegular, fontSize: 10, color: colors.textSecondary },

  // Content tabs
  contentTabs: { flexDirection: "row", gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  contentTabTouchable: { flex: 1 },
  contentTabContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 10 },
  contentTabText: { fontFamily: fontFamily.displaySemiBold, fontSize: 12, color: colors.textSecondary },
  contentTabTextActive: { color: onRacingRed },
  tabBadge: { minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: radius.circle, backgroundColor: colors.voidBlack, alignItems: "center", justifyContent: "center" },
  tabBadgeText: { fontFamily: fontFamily.dataBold, fontSize: 9, color: colors.racingRed },

  section: { paddingHorizontal: 16 },

  // Empty states
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, color: colors.textSecondary, marginTop: 12 },
  emptySub: { fontFamily: fontFamily.bodyRegular, fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 6 },

  // Featured car
  featuredCard: { marginBottom: 12 },
  featuredBg: { padding: 16 },
  featuredAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.racingRed },
  featuredTop: { flexDirection: "row", alignItems: "flex-start", marginBottom: 12 },
  featuredNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featuredName: { fontFamily: fontFamily.displayBold, fontSize: 20, color: colors.textPrimary },
  featuredImage: { width: "100%", height: 170, borderRadius: radius.sharp, backgroundColor: colors.voidBlack },
  featuredLocked: { height: 170, borderRadius: radius.sharp, backgroundColor: colors.voidBlack, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  featuredCarSilhouette: { position: "absolute", opacity: 0.5 },
  premiumLockPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.carbonSurface, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.sharp, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 14 },
  premiumLockText: { fontFamily: fontFamily.displaySemiBold, fontSize: 10, color: colors.racingRed, letterSpacing: 1 },
  generateBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18, height: 44, borderRadius: radius.sharp, backgroundColor: colors.racingRed },
  generateGrad: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, height: 44 },
  generateText: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: onRacingRed },
  featuredLockedNote: { fontFamily: fontFamily.bodyMedium, fontSize: 13, color: colors.textSecondary },

  // Per-car drive data (distance / avg speed / XP earned in this car)
  driveDataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  driveDataItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  driveDataText: { fontFamily: fontFamily.dataMedium, fontSize: 12, color: colors.textSecondary },

  // Garage secondary cards
  garageCard: { marginBottom: 10 },
  garageCardContent: { padding: 14, overflow: "hidden" },
  garageCardTouchable: { flexDirection: "row", alignItems: "center" },
  carColorBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  carName: { fontFamily: fontFamily.displaySemiBold, fontSize: 15, color: colors.textPrimary },
  carMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  carMetaText: { fontFamily: fontFamily.dataRegular, fontSize: 12, color: colors.textSecondary },
  carMetaDot: { fontSize: 12, color: colors.textSecondary },

  // Add car
  addCarButton: { marginBottom: 16 },
  addCarButtonContent: { padding: 14 },
  addCarTouchable: { flexDirection: "row", alignItems: "center", gap: 12 },
  addCarText: { fontFamily: fontFamily.bodyMedium, fontSize: 14, color: colors.textSecondary },
  addCarForm: { backgroundColor: colors.carbonSurface, borderRadius: radius.sharp, borderWidth: 1, borderColor: colors.hairline, padding: 14, marginBottom: 16, gap: 10 },
  addCarFormRow: { flexDirection: "row" },
  addCarInput: { backgroundColor: colors.voidBlack, borderRadius: radius.sharp, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontFamily: fontFamily.bodyRegular, fontSize: 14, borderWidth: 1, borderColor: colors.hairline },
  addCarActions: { flexDirection: "row", gap: 10, marginTop: 2 },
  addCarCancel: { flex: 1, height: 44, borderRadius: radius.sharp, alignItems: "center", justifyContent: "center", backgroundColor: colors.voidBlack, borderWidth: 1, borderColor: colors.hairline },
  addCarCancelText: { fontFamily: fontFamily.bodySemiBold, color: colors.textSecondary },
  addCarSubmit: { flex: 1, height: 44, borderRadius: radius.sharp, alignItems: "center", justifyContent: "center", backgroundColor: colors.racingRed },
  addCarSubmitText: { fontFamily: fontFamily.bodySemiBold, color: onRacingRed },

  // Rank progress card (secondary — see comment at usage site)
  seasonCard: { marginBottom: 16 },
  seasonCardContent: { padding: 14 },
  seasonTouchable: { flexDirection: "row", alignItems: "center" },
  seasonBadgeWrap: { marginRight: 12 },
  seasonMiddle: { flex: 1 },
  seasonLabel: { fontFamily: fontFamily.displaySemiBold, fontSize: 10, color: colors.textSecondary, letterSpacing: 1 },
  seasonName: { fontFamily: fontFamily.displayBold, fontSize: 17, color: colors.textPrimary, marginTop: 2, marginBottom: 8 },
  seasonTrack: { height: 6, borderRadius: radius.sharp, backgroundColor: colors.carbonSurface, overflow: "hidden" },
  seasonFill: { height: "100%", borderRadius: radius.sharp, backgroundColor: colors.racingRed },
  seasonXp: { fontFamily: fontFamily.bodyRegular, fontSize: 11, color: colors.textSecondary, marginTop: 6 },
  seasonDivider: { width: 1, alignSelf: "stretch", backgroundColor: colors.hairline, marginHorizontal: 12 },
  seasonNext: { width: 88, alignItems: "center", justifyContent: "center" },
  seasonNextLabel: { fontFamily: fontFamily.displaySemiBold, fontSize: 8, color: colors.textSecondary, letterSpacing: 0.6, marginBottom: 4 },
  seasonNextName: { fontFamily: fontFamily.displayBold, fontSize: 12, color: colors.textPrimary, marginTop: 3 },
  seasonNextXp: { fontFamily: fontFamily.dataMedium, fontSize: 10, color: colors.textSecondary, marginTop: 1 },

  // Live feed + inbox
  feedRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  feedCol: { flex: 1 },
  feedColContent: { padding: 12 },
  feedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  feedTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: radius.circle, backgroundColor: "#22C55E" },
  feedTitle: { fontFamily: fontFamily.displaySemiBold, fontSize: 10, color: colors.textSecondary, letterSpacing: 0.5 },
  feedHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  feedHeaderBadge: { minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center" },
  feedHeaderBadgeText: { fontFamily: fontFamily.dataBold, fontSize: 9, color: onRacingRed },
  feedSeeAll: { fontFamily: fontFamily.bodySemiBold, fontSize: 10, color: colors.racingRed },
  feedItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  feedIcon: { width: 26, height: 26, borderRadius: radius.circle, backgroundColor: colors.carbonSurface, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  feedItemTitle: { fontFamily: fontFamily.bodySemiBold, fontSize: 11, color: colors.textPrimary },
  feedItemSub: { fontFamily: fontFamily.bodyRegular, fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  feedTime: { fontFamily: fontFamily.dataRegular, fontSize: 9, color: colors.textSecondary },
  feedEmpty: { fontFamily: fontFamily.bodyRegular, fontSize: 11, color: colors.textSecondary, textAlign: "center", paddingVertical: 12 },

  // Trips
  tripCard: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  tripHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  tripTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap" },
  tripCodeBadge: { borderWidth: 1, borderColor: "rgba(255,107,53,0.4)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tripCodeText: { fontSize: 11, fontWeight: "800", color: "#FF6B35" },
  tripHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  tripDateBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  tripDateText: { fontSize: 11, fontWeight: "700", color: "#B0B0BE" },
  tripMenuBtn: { padding: 4 },
  tripRoute: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  tripDest: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  tripFast: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,215,0,0.12)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tripFastText: { fontSize: 9, fontWeight: "800", color: "#FFD700" },
  tripAddresses: { marginBottom: 10, gap: 6 },
  tripAddressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  tripAddressDot: { width: 8, height: 8, borderRadius: 4 },
  tripAddressText: { fontSize: 12.5, fontWeight: "600", color: "#B0B0BE", flex: 1 },
  tripStats: { flexDirection: "row", justifyContent: "space-between" },
  tripStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  tripStatText: { fontSize: 12, fontWeight: "700", color: "#B0B0BE" },
  tripMapWrap: { height: 120, borderRadius: 12, overflow: "hidden", marginBottom: 10, backgroundColor: "#12121C" },
  tripMenuOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, marginBottom: 8 },
  tripMenuOptionTitle: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  tripMenuOptionSub: { fontSize: 12, color: "#8A8A9A", marginTop: 2 },
  tripMapDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: "#0A0A0F" },

  // Friend search + cards
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  searchInputWrap: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  searchInput: { flex: 1, color: "#FFFFFF", fontSize: 14, paddingVertical: 11 },
  searchBtn: { paddingHorizontal: 18, justifyContent: "center", borderRadius: 12, backgroundColor: "#FF6B35" },
  searchBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  friendCard: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  friendInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,107,53,0.12)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  friendAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  friendAvatarText: { fontSize: 17, fontWeight: "800", color: "#FF6B35" },
  friendName: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  friendStatus: { fontSize: 12, color: "#8A8A9A", marginTop: 1 },
  friendAddBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FF6B35", alignItems: "center", justifyContent: "center" },
  friendMsgBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,107,53,0.12)", alignItems: "center", justifyContent: "center" },

  // Conversation

  // Settings
  settingsSection: { paddingHorizontal: 16, marginTop: 20 },
  settingsTitle: { fontFamily: fontFamily.displaySemiBold, fontSize: 13, color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 4, textTransform: "uppercase" },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  settingRowLast: { borderBottomWidth: 0 },
  settingLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  settingText: { fontFamily: fontFamily.bodyRegular, fontSize: 15, color: colors.textPrimary },
  settingBadge: { minWidth: 20, height: 20, borderRadius: radius.circle, backgroundColor: colors.racingRed, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  settingBadgeText: { fontFamily: fontFamily.dataBold, fontSize: 11, color: onRacingRed },

  // Modals
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalSheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#12121A", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#FFFFFF" },
  modalSection: { fontSize: 11, fontWeight: "800", color: "#8A8A9A", letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" },
  notifEmpty: { alignItems: "center", paddingVertical: 30, gap: 10 },
  notifRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 14, padding: 12, marginBottom: 10 },
  notifActions: { flexDirection: "row", gap: 8 },
  notifAccept: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" },
  notifDecline: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center" },

  // Premium modal
  premiumHero: { borderRadius: 18, padding: 18, marginBottom: 16, alignItems: "center" },
  premiumBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,215,0,0.4)" },
  premiumBadgeText: { fontSize: 10, fontWeight: "800", color: "#FFD700", letterSpacing: 1 },
  premiumTitle: { fontSize: 22, fontWeight: "800", color: "#FFFFFF", marginBottom: 8 },
  premiumDesc: { fontSize: 13, color: "#B0B0BE", textAlign: "center", lineHeight: 19 },
  premiumPerks: { gap: 10, marginBottom: 18 },
  premiumPerkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  premiumPerkText: { fontSize: 14, color: "#FFFFFF", fontWeight: "600" },
  premiumPriceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", marginBottom: 16 },
  premiumPriceLabel: { fontSize: 14, color: "#8A8A9A", fontWeight: "600" },
  premiumPrice: { fontSize: 22, fontWeight: "800", color: "#FF6B35" },
  premiumPayBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  premiumPayGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 52 },
  premiumPayText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  premiumCancel: { fontSize: 14, color: "#8A8A9A", fontWeight: "600", textAlign: "center", paddingVertical: 6 },
});
