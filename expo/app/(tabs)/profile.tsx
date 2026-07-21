import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as ImagePickerExpo from "expo-image-picker";
import {
  Car,
  Trophy,
  Clock,
  Gauge,
  MapPin,
  Settings,
  Shield,
  LogOut,
  ChevronRight,
  Star,
  Award,
  Flame,
  Wallet,
  Moon,
  Sun,
  HelpCircle,
  Headphones,
  MessageCircle,
  UserPlus,
  Users,
  Search,
  X,
  Send,
  ArrowLeft,
  TrendingUp,
  Zap,
  Route,
  Timer,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Camera,
  Crown,
  LogOut as LeaveIcon,
} from "lucide-react-native";
import { useAuth } from "@/hooks/useAuthStore";
import { useXP } from "@/hooks/useXPStore";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import { useParty } from "@/hooks/usePartyStore";
import { rankForLevel } from "@/constants/ranks";
import RankBadge from "@/components/RankBadge";
import { supabase } from "@/lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
}

interface TripItem {
  id: string;
  destination_name: string;
  origin_name: string;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  xp_earned: number;
  was_faster_than_estimation: boolean;
  completed_at: string;
}

interface FriendItem {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  friend_profile?: {
    name: string;
    level: number;
    avatar?: string;
  };
}

interface MessageItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_name?: string;
}

type ProfileTab = "garage" | "trips" | "friends" | "party" | "messages";

// ─── Main Component ─────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();
  const { openChatWith } = useLocalSearchParams<{ openChatWith?: string }>();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, logout, loading: authLoading, updateProfilePicture } = useAuth();
  const { level, xp, xpProgress, xpCurrentLevel, xpRequired, totalXp, addXP } = useXP();
  const { activeCar } = useActiveCar();
  const {
    party,
    members: partyMembers,
    invites: partyInvites,
    isLeader: isPartyLeader,
    loading: partyLoading,
    createParty,
    inviteFriend: invitePartyFriend,
    acceptInvite: acceptPartyInvite,
    declineInvite: declinePartyInvite,
    leaveParty,
    kickMember,
  } = useParty();

  const [activeTab, setActiveTab] = useState<ProfileTab>("garage");
  const [newPartyName, setNewPartyName] = useState("");
  const [creatingParty, setCreatingParty] = useState(false);

  // ─── Car Collections state ─────────────────────────────
  const [cars, setCars] = useState<CarItem[]>([]);
  const [carsLoading, setCarsLoading] = useState(false);
  const [showAddCar, setShowAddCar] = useState(false);
  const [newCarName, setNewCarName] = useState("");
  const [newCarMake, setNewCarMake] = useState("");
  const [newCarYear, setNewCarYear] = useState("2024");
  const [newCarColor, setNewCarColor] = useState("#FF6B35");
  const [newCarHP, setNewCarHP] = useState("300");

  // ─── Trips state ───────────────────────────────────────
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  // ─── Friends state ─────────────────────────────────────
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSearchResults, setFriendSearchResults] = useState<Array<{ id: string; name: string; level: number; avatar?: string }>>([]);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);

  // ─── Avatar upload state ───────────────────────────────
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // ─── Messages state ────────────────────────────────────
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<MessageItem[]>([]);

  // ─── Refresh state ─────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);

  // ─── Load cars from Supabase ───────────────────────────────
  const loadCars = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setCarsLoading(true);
    try {
      const { data, error } = await supabase
        .from("car_collections")
        .select("*")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false });

      if (!error && data) {
        setCars(data as CarItem[]);
      }
    } catch (err) {
      console.error("Failed to load cars:", err);
    } finally {
      setCarsLoading(false);
    }
  }, [isAuthenticated, user]);

  // ─── Load trips from Supabase ──────────────────────────────
  const loadTrips = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setTripsLoading(true);
    try {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .eq("user_id", user.id)
        .order("completed_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setTrips(data as TripItem[]);
      }
    } catch (err) {
      console.error("Failed to load trips:", err);
    } finally {
      setTripsLoading(false);
    }
  }, [isAuthenticated, user]);

  // ─── Load friends from Supabase ────────────────────────────
  const loadFriends = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setFriendsLoading(true);
    try {
      // Get friendships where user is user_id or friend_id. The aliased FK
      // join pulls the *other* person's profile so we can show their name +
      // avatar in the list.
      const { data: sentData } = await supabase
        .from("friends")
        .select("*, profiles!friends_friend_id_fkey(name, avatar)")
        .eq("user_id", user.id);

      const { data: receivedData } = await supabase
        .from("friends")
        .select("*, profiles!friends_user_id_fkey(name, avatar)")
        .eq("friend_id", user.id);

      const normalize = (rows: any[]): FriendItem[] =>
        (rows ?? []).map((row) => {
          const p = row.profiles ?? {};
          return {
            ...row,
            friend_profile: { name: p.name, avatar: p.avatar, level: 1 },
          } as FriendItem;
        });

      const all = [...normalize(sentData ?? []), ...normalize(receivedData ?? [])].filter(
        (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i
      );

      setFriends(all as FriendItem[]);
    } catch (err) {
      console.error("Failed to load friends:", err);
    } finally {
      setFriendsLoading(false);
    }
  }, [isAuthenticated, user]);

  // ─── Load messages from Supabase ───────────────────────────
  const loadMessages = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        setMessages(data as MessageItem[]);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, [isAuthenticated, user]);

  // ─── Initial load ──────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      loadCars();
      loadTrips();
      loadFriends();
      loadMessages();
    }
  }, [isAuthenticated, loadCars, loadTrips, loadFriends, loadMessages]);

  // ─── Realtime: live-update messages as they arrive ──────────
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const channel = supabase
      .channel(`direct_messages_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const msg = payload.new as MessageItem;
          if (msg.sender_id !== user.id && msg.receiver_id !== user.id) return;

          setMessages((prev) => [msg, ...prev]);
          setConversationMessages((prev) => {
            const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
            if (selectedConversation !== partnerId) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user, selectedConversation]);

  // ─── Pull to refresh ───────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCars(), loadTrips(), loadFriends(), loadMessages()]);
    setRefreshing(false);
  }, [loadCars, loadTrips, loadFriends, loadMessages]);

  // ─── Add car ───────────────────────────────────────────────
  const handleAddCar = async () => {
    if (!user || !newCarName.trim()) return;
    try {
      const { error } = await supabase.from("car_collections").insert({
        user_id: user.id,
        name: newCarName.trim(),
        make: newCarMake.trim() || "Custom",
        model: "",
        year: newCarYear || "2024",
        color: newCarColor,
        color_name: "Custom",
        hp: parseInt(newCarHP) || 300,
        mileage_km: 0,
      });
      if (!error) {
        setNewCarName("");
        setNewCarMake("");
        setShowAddCar(false);
        loadCars();
      }
    } catch (err) {
      console.error("Failed to add car:", err);
    }
  };

  // ─── Delete car ────────────────────────────────────────────
  const handleDeleteCar = (carId: string) => {
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
  };

  // ─── Set primary car ───────────────────────────────────────
  const handleSetPrimary = async (carId: string) => {
    if (!user) return;
    // Unset all primary
    await supabase.from("car_collections").update({ is_primary: false }).eq("user_id", user.id);
    // Set this one
    await supabase.from("car_collections").update({ is_primary: true }).eq("id", carId);
    loadCars();
  };

  // ─── Search friends ────────────────────────────────────────
  const handleSearchFriends = async () => {
    if (!friendSearchQuery.trim() || !user) return;
    setFriendSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar")
        .ilike("name", `%${friendSearchQuery.trim()}%`)
        .neq("id", user.id)
        .limit(10);

      if (!error && data) {
        // Fetch levels for the matched users in one query.
        const ids = data.map((p: { id: string }) => p.id);
        const levelMap: Record<string, number> = {};
        if (ids.length > 0) {
          const { data: xpData } = await supabase
            .from("user_xp")
            .select("user_id, level")
            .in("user_id", ids);
          (xpData ?? []).forEach((x: { user_id: string; level: number }) => {
            levelMap[x.user_id] = x.level;
          });
        }

        setFriendSearchResults(
          data.map((p: { id: string; name: string; avatar?: string }) => ({
            id: p.id,
            name: p.name,
            level: levelMap[p.id] ?? 1,
            avatar: p.avatar,
          }))
        );
      }
    } catch (err) {
      console.error("Friend search error:", err);
    } finally {
      setFriendSearchLoading(false);
    }
  };

  // ─── Send friend request ───────────────────────────────────
  const handleAddFriend = async (friendId: string, friendName: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("friends").insert({
        user_id: user.id,
        friend_id: friendId,
        status: "pending",
      });
      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Sent!", `Friend request sent to ${friendName}`);
        loadFriends();
      }
    } catch (err) {
      console.error("Add friend error:", err);
    }
  };

  // ─── Accept/reject friend request ──────────────────────────
  const handleAcceptFriend = async (friendshipId: string) => {
    await supabase.from("friends").update({ status: "accepted" }).eq("id", friendshipId);
    loadFriends();
  };

  const handleRejectFriend = async (friendshipId: string) => {
    await supabase.from("friends").delete().eq("id", friendshipId);
    loadFriends();
  };

  // ─── Party actions ──────────────────────────────────────────
  const handleCreateParty = async () => {
    setCreatingParty(true);
    const ok = await createParty(newPartyName.trim() || `${user?.name ?? "Driver"}'s Party`);
    setCreatingParty(false);
    if (ok) {
      setNewPartyName("");
    } else {
      Alert.alert("Error", "Could not create party. Please try again.");
    }
  };

  const handleInvitePartyFriend = async (friendId: string, friendName: string) => {
    const result = await invitePartyFriend(friendId);
    if (result.ok) {
      Alert.alert("Invite Sent!", `${friendName} was invited to your party.`);
    } else {
      Alert.alert("Couldn't Invite", result.message ?? "Something went wrong.");
    }
  };

  const handleAcceptPartyInvite = async (partyId: string) => {
    const result = await acceptPartyInvite(partyId);
    if (!result.ok) {
      Alert.alert("Couldn't Join", result.message ?? "Something went wrong.");
    }
  };

  const handleLeaveParty = () => {
    Alert.alert(
      isPartyLeader ? "Disband Party" : "Leave Party",
      isPartyLeader
        ? "This will remove everyone from the party. Continue?"
        : "Are you sure you want to leave this party?",
      [
        { text: "Cancel", style: "cancel" },
        { text: isPartyLeader ? "Disband" : "Leave", style: "destructive", onPress: leaveParty },
      ]
    );
  };

  const handleKickMember = (memberId: string, memberName: string) => {
    Alert.alert("Remove Member", `Remove ${memberName} from the party?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => kickMember(memberId) },
    ]);
  };

  // ─── Open conversation ─────────────────────────────────────
  const handleOpenConversation = async (friendId: string) => {
    if (!user) return;
    setSelectedConversation(friendId);
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });

      if (!error && data) {
        setConversationMessages(data as MessageItem[]);
      }
    } catch (err) {
      console.error("Load conversation error:", err);
    }
  };

  // ─── Deep link: /profile?openChatWith=<userId> jumps straight into a thread ──
  const openedChatWithRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated || !openChatWith || openedChatWithRef.current === openChatWith) return;
    openedChatWithRef.current = openChatWith;
    setActiveTab("messages");
    handleOpenConversation(openChatWith);
  }, [isAuthenticated, openChatWith]);

  // ─── Send message ──────────────────────────────────────────
  const handleSendMessage = async () => {
    if (!user || !selectedConversation || !messageInput.trim()) return;
    try {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user.id,
        receiver_id: selectedConversation,
        content: messageInput.trim(),
      });
      if (!error) {
        setMessageInput("");
        handleOpenConversation(selectedConversation);
        loadMessages();
      }
    } catch (err) {
      console.error("Send message error:", err);
    }
  };

  // ─── Logout ────────────────────────────────────────────────
  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          const success = await logout();
          if (success) router.push("/(tabs)/map" as any);
        },
      },
    ]);
  };

  // ─── Change profile picture ────────────────────────────────
  const pickAndSetAvatar = async (useCamera: boolean) => {
    try {
      if (Platform.OS !== "web") {
        const perm = useCamera
          ? await ImagePickerExpo.requestCameraPermissionsAsync()
          : await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert(
            "Permission needed",
            `We need ${useCamera ? "camera" : "photo library"} access to update your profile picture.`
          );
          return;
        }
      }

      const result = useCamera
        ? await ImagePickerExpo.launchCameraAsync({
            mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
        : await ImagePickerExpo.launchImageLibraryAsync({
            mediaTypes: ImagePickerExpo.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });

      if (result.canceled || !result.assets?.[0]) return;

      setUploadingAvatar(true);
      const ok = await updateProfilePicture(result.assets[0].uri);
      if (!ok) Alert.alert("Error", "Could not update your profile picture. Please try again.");
    } catch (err) {
      console.error("Avatar pick error:", err);
      Alert.alert("Error", "Something went wrong updating your photo.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangeAvatar = () => {
    Alert.alert("Profile Picture", "Choose a new profile picture", [
      { text: "Take Photo", onPress: () => pickAndSetAvatar(true) },
      { text: "Choose from Library", onPress: () => pickAndSetAvatar(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // ─── Helpers ───────────────────────────────────────────────
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Resolve a conversation partner's name/avatar from the already-loaded
  // friends list, so message threads show real people instead of "Friend".
  const getFriendInfo = useCallback((partnerId: string): { name: string; avatar?: string } => {
    const f = friends.find((fr) => fr.user_id === partnerId || fr.friend_id === partnerId);
    if (f?.friend_profile?.name) return { name: f.friend_profile.name, avatar: f.friend_profile.avatar };
    return { name: "Driver" };
  }, [friends]);


  // ─── Not logged in view ────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />
        <View style={[styles.loginPrompt, { paddingTop: insets.top + 100 }]}>
          <LinearGradient colors={["#FF6B35", "#FF3B6F"]} style={styles.loginPromptIcon}>
            <Car size={40} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.loginPromptTitle}>Join the Drive</Text>
          <Text style={styles.loginPromptDesc}>
            Sign up to track your rides, collect cars, earn XP, and connect with fellow drivers.
          </Text>
          <TouchableOpacity
            style={styles.loginPromptBtn}
            onPress={() => router.push("/login" as any)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#FF6B35", "#FF3B6F"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loginPromptBtnGradient}
            >
              <Text style={styles.loginPromptBtnText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.loginPromptBtnSecondary}
            onPress={() => router.push("/signup" as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.loginPromptBtnSecondaryText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Authenticated UI ──────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={["#0A0A0F", "#060609", "#0A0A0F"]} style={styles.bg} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: insets.top + 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
      >
        {/* ═══ PROFILE HEADER ═══ */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={styles.avatarSection}
            onPress={handleChangeAvatar}
            activeOpacity={0.85}
            disabled={uploadingAvatar}
          >
            <LinearGradient colors={["#FF6B35", "#FF8A50"]} style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                {uploadingAvatar ? (
                  <ActivityIndicator color="#FF6B35" />
                ) : user?.profilePicture ? (
                  <Image source={{ uri: user.profilePicture }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarLetter}>
                    {(user?.name ?? "D")[0].toUpperCase()}
                  </Text>
                )}
              </View>
            </LinearGradient>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>{level}</Text>
            </View>
            <View style={styles.avatarEditBadge}>
              <Camera size={13} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.userName}>{user?.name ?? "Driver"}</Text>
          <TouchableOpacity
            style={styles.rankPill}
            onPress={() => router.push("/ranks" as any)}
            activeOpacity={0.7}
          >
            <RankBadge rank={rankForLevel(level)} size={20} />
            <Text style={styles.userTitle}>{rankForLevel(level).name}</Text>
            <ChevronRight size={13} color="#FF6B35" />
          </TouchableOpacity>

          {/* Now driving — tap to switch car in the garage picker */}
          {activeCar && (
            <TouchableOpacity
              style={styles.nowDrivingChip}
              onPress={() => router.push("/select-car" as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.nowDrivingDot, { backgroundColor: activeCar.color }]} />
              <Text style={styles.nowDrivingText} numberOfLines={1}>
                Driving <Text style={styles.nowDrivingName}>{activeCar.name}</Text>
              </Text>
              <ChevronRight size={14} color="#8A8A9A" />
            </TouchableOpacity>
          )}

          {/* XP Progress bar */}
          <View style={styles.xpSection}>
            <View style={styles.xpBarRow}>
              <Text style={styles.xpLabel}>Level {level}</Text>
              <Text style={styles.xpValue}>{xpCurrentLevel} / {xpRequired} XP</Text>
            </View>
            <View style={styles.xpTrack}>
              <LinearGradient
                colors={["#FF6B35", "#FFD700"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.xpFill, { width: `${Math.min(xpProgress * 100, 100)}%` }]}
              />
            </View>
          </View>

          {/* Quick stats */}
          <View style={styles.quickStats}>
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{cars.length}</Text>
              <Text style={styles.quickStatLabel}>Cars</Text>
            </View>
            <View style={styles.quickStatDiv} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{friends.filter((f) => f.status === "accepted").length}</Text>
              <Text style={styles.quickStatLabel}>Friends</Text>
            </View>
            <View style={styles.quickStatDiv} />
            <View style={styles.quickStat}>
              <Text style={styles.quickStatValue}>{trips.length}</Text>
              <Text style={styles.quickStatLabel}>Trips</Text>
            </View>
          </View>
        </View>

        {/* ═══ CONTENT TABS ═══ */}
        <View style={styles.contentTabs}>
          {(
            [
              { key: "garage" as ProfileTab, label: "Garage", icon: Car },
              { key: "trips" as ProfileTab, label: "Trips", icon: Route },
              { key: "friends" as ProfileTab, label: "Friends", icon: Users },
              { key: "party" as ProfileTab, label: "Party", icon: Crown },
              { key: "messages" as ProfileTab, label: "Messages", icon: MessageCircle },
            ] as const
          ).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.contentTab, activeTab === tab.key && styles.contentTabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <tab.icon size={16} color={activeTab === tab.key ? "#FF6B35" : "#5A5A6E"} />
              <Text style={[styles.contentTabText, activeTab === tab.key && styles.contentTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ═══ GARAGE ═══ */}
        {activeTab === "garage" && (
          <View style={styles.section}>
            {carsLoading ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
            ) : cars.length === 0 ? (
              <View style={styles.emptyState}>
                <Car size={40} color="#3A3A4E" />
                <Text style={styles.emptyText}>No cars yet</Text>
                <Text style={styles.emptySubtext}>Add your first ride to the garage</Text>
              </View>
            ) : (
              cars.map((car) => (
                <TouchableOpacity
                  key={car.id}
                  style={[styles.garageCard, car.is_primary && styles.garageCardPrimary]}
                  activeOpacity={0.7}
                  onLongPress={() => handleDeleteCar(car.id)}
                >
                  <View style={styles.garageCardContent}>
                    <View style={[styles.carColorBar, { backgroundColor: car.color }]} />
                    <View style={styles.carInfo}>
                      <View style={styles.carNameRow}>
                        <Text style={styles.carName}>{car.name}</Text>
                        {car.is_primary && (
                          <View style={styles.primaryBadge}>
                            <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.carMeta}>
                        <Text style={styles.carMetaText}>{car.make}</Text>
                        <Text style={styles.carMetaDot}>•</Text>
                        <Text style={styles.carMetaText}>{car.year}</Text>
                        <Text style={styles.carMetaDot}>•</Text>
                        <Text style={[styles.carMetaText, { color: car.color }]}>{car.hp} HP</Text>
                      </View>
                      {car.license_plate ? (
                        <Text style={styles.carPlate}>{car.license_plate}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      style={styles.carSetPrimaryBtn}
                      onPress={() => handleSetPrimary(car.id)}
                      activeOpacity={0.7}
                    >
                      {car.is_primary ? (
                        <CheckCircle2 size={18} color="#FF6B35" />
                      ) : (
                        <Circle size={18} color="#5A5A6E" />
                      )}
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* Add car */}
            {showAddCar ? (
              <View style={styles.addCarForm}>
                <View style={styles.addCarFormRow}>
                  <TextInput
                    style={styles.addCarInput}
                    placeholder="Car name (e.g. Night Fury)"
                    placeholderTextColor="#5A5A6E"
                    value={newCarName}
                    onChangeText={setNewCarName}
                  />
                </View>
                <View style={styles.addCarFormRow}>
                  <TextInput
                    style={[styles.addCarInput, { flex: 1 }]}
                    placeholder="Make (e.g. BMW)"
                    placeholderTextColor="#5A5A6E"
                    value={newCarMake}
                    onChangeText={setNewCarMake}
                  />
                  <TextInput
                    style={[styles.addCarInput, { flex: 1, marginLeft: 8 }]}
                    placeholder="Year"
                    placeholderTextColor="#5A5A6E"
                    value={newCarYear}
                    onChangeText={setNewCarYear}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.addCarFormRow}>
                  <TextInput
                    style={[styles.addCarInput, { flex: 1 }]}
                    placeholder="HP"
                    placeholderTextColor="#5A5A6E"
                    value={newCarHP}
                    onChangeText={setNewCarHP}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.addCarFormActions}>
                  <TouchableOpacity style={styles.addCarCancel} onPress={() => setShowAddCar(false)}>
                    <Text style={styles.addCarCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addCarSubmit} onPress={handleAddCar}>
                    <Text style={styles.addCarSubmitText}>Add Car</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addCarButton} onPress={() => setShowAddCar(true)} activeOpacity={0.7}>
                <View style={styles.addCarIcon}>
                  <Plus size={20} color="#FF6B35" />
                </View>
                <Text style={styles.addCarText}>Add a car to your garage</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ═══ TRIPS ═══ */}
        {activeTab === "trips" && (
          <View style={styles.section}>
            {/* Saved & shared routes banner */}
            <TouchableOpacity
              style={styles.routesBanner}
              onPress={() => router.push("/routes" as any)}
              activeOpacity={0.85}
            >
              <View style={styles.routesBannerIcon}>
                <Route size={20} color="#00D4AA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.routesBannerTitle}>Saved Routes & Share</Text>
                <Text style={styles.routesBannerSub}>Save drives, give kudos, and share with the community</Text>
              </View>
              <ChevronRight size={18} color="#5A5A6E" />
            </TouchableOpacity>

            {tripsLoading ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
            ) : trips.length === 0 ? (
              <View style={styles.emptyState}>
                <Route size={40} color="#3A3A4E" />
                <Text style={styles.emptyText}>No trips recorded</Text>
                <Text style={styles.emptySubtext}>Start recording a drive to see it here</Text>
              </View>
            ) : (
              trips.map((trip) => (
                <View key={trip.id} style={styles.tripCard}>
                  <View style={styles.tripCardHeader}>
                    <View style={styles.tripRoute}>
                      <MapPin size={14} color="#8A8A9A" />
                      <Text style={styles.tripDestination} numberOfLines={1}>
                        {trip.destination_name || trip.origin_name || "Unknown"}
                      </Text>
                    </View>
                    {trip.was_faster_than_estimation && (
                      <View style={styles.tripFastBadge}>
                        <Zap size={12} color="#FFD700" />
                        <Text style={styles.tripFastBadgeText}>FAST</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.tripStats}>
                    <View style={styles.tripStat}>
                      <Route size={14} color="#FF6B35" />
                      <Text style={styles.tripStatValue}>{trip.distance_km.toFixed(1)} km</Text>
                    </View>
                    <View style={styles.tripStat}>
                      <Timer size={14} color="#FF6B35" />
                      <Text style={styles.tripStatValue}>{formatDuration(trip.duration_seconds)}</Text>
                    </View>
                    <View style={styles.tripStat}>
                      <Gauge size={14} color="#FF6B35" />
                      <Text style={styles.tripStatValue}>{trip.avg_speed_kmh.toFixed(0)} km/h</Text>
                    </View>
                    <View style={styles.tripStat}>
                      <Trophy size={14} color="#FFD700" />
                      <Text style={styles.tripStatValue}>+{trip.xp_earned} XP</Text>
                    </View>
                  </View>
                  <Text style={styles.tripDate}>{formatDate(trip.completed_at)}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* ═══ FRIENDS ═══ */}
        {activeTab === "friends" && (
          <View style={styles.section}>
            {/* Search */}
            <View style={styles.friendSearchRow}>
              <View style={styles.friendSearchInputWrapper}>
                <Search size={16} color="#5A5A6E" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.friendSearchInput}
                  placeholder="Search users by name..."
                  placeholderTextColor="#5A5A6E"
                  value={friendSearchQuery}
                  onChangeText={setFriendSearchQuery}
                  onSubmitEditing={handleSearchFriends}
                  returnKeyType="search"
                />
                {friendSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setFriendSearchQuery(""); setFriendSearchResults([]); }}>
                    <X size={16} color="#5A5A6E" />
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.friendSearchBtn} onPress={handleSearchFriends} activeOpacity={0.7}>
                <Text style={styles.friendSearchBtnText}>Find</Text>
              </TouchableOpacity>
            </View>

            {/* Search results */}
            {friendSearchResults.length > 0 && (
              <View style={styles.friendResults}>
                {friendSearchResults.map((r) => (
                  <View key={r.id} style={styles.friendResultRow}>
                    <TouchableOpacity
                      style={styles.friendResultInfo}
                      onPress={() => router.push(`/user/${r.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.friendResultAvatar}>
                        {r.avatar ? (
                          <Image source={{ uri: r.avatar }} style={styles.friendResultAvatarImg} />
                        ) : (
                          <Text style={styles.friendResultAvatarText}>{r.name[0].toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendResultName}>{r.name}</Text>
                        <Text style={styles.friendResultLevel}>
                          {rankForLevel(r.level).name} · Level {r.level}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.friendAddBtn}
                      onPress={() => handleAddFriend(r.id, r.name)}
                      activeOpacity={0.7}
                    >
                      <UserPlus size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Friends list */}
            {friendsLoading ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
            ) : friends.length === 0 ? (
              <View style={[styles.emptyState, { marginTop: 20 }]}>
                <Users size={40} color="#3A3A4E" />
                <Text style={styles.emptyText}>No friends yet</Text>
                <Text style={styles.emptySubtext}>Search for drivers and add them</Text>
              </View>
            ) : (
              friends.map((f) => (
                <View key={f.id} style={styles.friendCard}>
                  <TouchableOpacity
                    style={styles.friendInfo}
                    onPress={() => router.push(`/user/${f.user_id === user?.id ? f.friend_id : f.user_id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.friendAvatar}>
                      {f.friend_profile?.avatar ? (
                        <Image source={{ uri: f.friend_profile.avatar }} style={styles.friendAvatarImg} />
                      ) : (
                        <Text style={styles.friendAvatarText}>
                          {(f.friend_profile?.name ?? "?")[0]?.toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendName}>
                        {f.friend_profile?.name ?? "Unknown"}
                      </Text>
                      <Text style={styles.friendStatus}>
                        {f.status === "pending"
                          ? f.user_id === user?.id
                            ? "Request sent"
                            : "Wants to be friends"
                          : f.status === "accepted"
                          ? "Friend"
                          : "Blocked"}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {f.status === "pending" && f.friend_id === user?.id && (
                    <View style={styles.friendActions}>
                      <TouchableOpacity
                        style={styles.friendAcceptBtn}
                        onPress={() => handleAcceptFriend(f.id)}
                      >
                        <CheckCircle2 size={20} color="#22C55E" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.friendRejectBtn}
                        onPress={() => handleRejectFriend(f.id)}
                      >
                        <X size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {f.status === "accepted" && (
                    <TouchableOpacity
                      style={styles.friendMsgBtn}
                      onPress={() => handleOpenConversation(f.user_id === user?.id ? f.friend_id : f.user_id)}
                    >
                      <MessageCircle size={18} color="#FF6B35" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ═══ PARTY ═══ */}
        {activeTab === "party" && (
          <View style={styles.section}>
            {/* Pending invites addressed to me */}
            {partyInvites.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.partySectionLabel}>Invites</Text>
                {partyInvites.map((inv) => (
                  <View key={inv.id} style={styles.friendCard}>
                    <View style={styles.friendInfo}>
                      <View style={[styles.friendAvatar, { borderWidth: 2, borderColor: inv.party_color }]}>
                        {inv.leader_avatar ? (
                          <Image source={{ uri: inv.leader_avatar }} style={styles.friendAvatarImg} />
                        ) : (
                          <Text style={styles.friendAvatarText}>{inv.leader_name[0]?.toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>{inv.party_name}</Text>
                        <Text style={styles.friendStatus}>{inv.leader_name} invited you</Text>
                      </View>
                    </View>
                    <View style={styles.friendActions}>
                      <TouchableOpacity style={styles.friendAcceptBtn} onPress={() => handleAcceptPartyInvite(inv.party_id)}>
                        <CheckCircle2 size={20} color="#22C55E" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.friendRejectBtn} onPress={() => declinePartyInvite(inv.party_id)}>
                        <X size={20} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {partyLoading ? (
              <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
            ) : !party ? (
              <>
                <View style={styles.emptyState}>
                  <Crown size={40} color="#3A3A4E" />
                  <Text style={styles.emptyText}>No party yet</Text>
                  <Text style={styles.emptySubtext}>
                    Start a party to give your friends a special glowing border on the map
                  </Text>
                </View>
                <View style={styles.friendSearchRow}>
                  <View style={styles.friendSearchInputWrapper}>
                    <TextInput
                      style={styles.friendSearchInput}
                      placeholder="Party name (optional)"
                      placeholderTextColor="#5A5A6E"
                      value={newPartyName}
                      onChangeText={setNewPartyName}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.friendSearchBtn, creatingParty && { opacity: 0.5 }]}
                    onPress={handleCreateParty}
                    disabled={creatingParty}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.friendSearchBtnText}>{creatingParty ? "..." : "Create"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.partyHeaderCard}>
                  <View style={[styles.partyColorDot, { backgroundColor: party.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.partyHeaderName}>{party.name}</Text>
                    <Text style={styles.friendStatus}>
                      {partyMembers.filter((m) => m.status === "accepted").length} member
                      {partyMembers.filter((m) => m.status === "accepted").length === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.partyLeaveBtn} onPress={handleLeaveParty} activeOpacity={0.7}>
                    <LeaveIcon size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                {partyMembers.filter((m) => m.status === "accepted").map((m) => (
                  <View key={m.id} style={styles.friendCard}>
                    <View style={styles.friendInfo}>
                      <View style={[styles.friendAvatar, { borderWidth: 2, borderColor: party.color }]}>
                        {m.avatar ? (
                          <Image source={{ uri: m.avatar }} style={styles.friendAvatarImg} />
                        ) : (
                          <Text style={styles.friendAvatarText}>{m.name[0]?.toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.friendName}>
                          {m.user_id === user?.id ? "You" : m.name}
                          {m.role === "leader" ? "  👑" : ""}
                        </Text>
                        <Text style={styles.friendStatus}>Level {m.level}</Text>
                      </View>
                    </View>
                    {isPartyLeader && m.user_id !== user?.id && (
                      <TouchableOpacity style={styles.friendRejectBtn} onPress={() => handleKickMember(m.user_id, m.name)}>
                        <X size={20} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {/* Invite friends who aren't already partied up */}
                {friends.filter(
                  (f) =>
                    f.status === "accepted" &&
                    !partyMembers.some((m) => m.user_id === (f.user_id === user?.id ? f.friend_id : f.user_id))
                ).length > 0 && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={styles.partySectionLabel}>Invite friends</Text>
                    {friends
                      .filter(
                        (f) =>
                          f.status === "accepted" &&
                          !partyMembers.some((m) => m.user_id === (f.user_id === user?.id ? f.friend_id : f.user_id))
                      )
                      .map((f) => {
                        const fid = f.user_id === user?.id ? f.friend_id : f.user_id;
                        const fname = f.friend_profile?.name ?? "Friend";
                        return (
                          <View key={f.id} style={styles.friendCard}>
                            <View style={styles.friendInfo}>
                              <View style={styles.friendAvatar}>
                                {f.friend_profile?.avatar ? (
                                  <Image source={{ uri: f.friend_profile.avatar }} style={styles.friendAvatarImg} />
                                ) : (
                                  <Text style={styles.friendAvatarText}>{fname[0]?.toUpperCase()}</Text>
                                )}
                              </View>
                              <Text style={styles.friendName}>{fname}</Text>
                            </View>
                            <TouchableOpacity style={styles.friendAddBtn} onPress={() => handleInvitePartyFriend(fid, fname)}>
                              <UserPlus size={16} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* ═══ MESSAGES ═══ */}
        {activeTab === "messages" && (
          <View style={styles.section}>
            {selectedConversation ? (
              <View style={styles.conversationWrap}>
                {/* Back button */}
                <TouchableOpacity
                  style={styles.conversationBack}
                  onPress={() => { setSelectedConversation(null); setConversationMessages([]); }}
                >
                  <ArrowLeft size={20} color="#FFFFFF" />
                  <Text style={styles.conversationBackText}>{getFriendInfo(selectedConversation).name}</Text>
                </TouchableOpacity>

                {/* Messages */}
                <View style={styles.conversationMessages}>
                  {conversationMessages.map((msg) => (
                    <View
                      key={msg.id}
                      style={[
                        styles.msgBubble,
                        msg.sender_id === user?.id ? styles.msgSent : styles.msgReceived,
                      ]}
                    >
                      <Text style={styles.msgText}>{msg.content}</Text>
                      <Text style={styles.msgTime}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  ))}
                  {conversationMessages.length === 0 && (
                    <Text style={styles.msgEmpty}>No messages yet. Say hello!</Text>
                  )}
                </View>

                {/* Input */}
                <View style={styles.msgInputRow}>
                  <TextInput
                    style={styles.msgInput}
                    placeholder="Type a message..."
                    placeholderTextColor="#5A5A6E"
                    value={messageInput}
                    onChangeText={setMessageInput}
                    multiline
                  />
                  <TouchableOpacity
                    style={[styles.msgSendBtn, !messageInput.trim() && { opacity: 0.4 }]}
                    onPress={handleSendMessage}
                    disabled={!messageInput.trim()}
                  >
                    <Send size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {messagesLoading ? (
                  <ActivityIndicator color="#FF6B35" style={{ marginTop: 20 }} />
                ) : messages.length === 0 ? (
                  <View style={styles.emptyState}>
                    <MessageCircle size={40} color="#3A3A4E" />
                    <Text style={styles.emptyText}>No messages</Text>
                    <Text style={styles.emptySubtext}>Chat with your friends here</Text>
                  </View>
                ) : (
                  // Group messages by conversation partner
                  (() => {
                    const convos = new Map<string, MessageItem>();
                    messages.forEach((m) => {
                      const partnerId = m.sender_id === user?.id ? m.receiver_id : m.sender_id;
                      if (!convos.has(partnerId) || new Date(m.created_at) > new Date(convos.get(partnerId)!.created_at)) {
                        convos.set(partnerId, m);
                      }
                    });
                    return Array.from(convos.entries()).map(([partnerId, lastMsg]) => {
                      const partner = getFriendInfo(partnerId);
                      return (
                      <TouchableOpacity
                        key={partnerId}
                        style={styles.msgConvoRow}
                        onPress={() => handleOpenConversation(partnerId)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.msgConvoAvatar}>
                          {partner.avatar ? (
                            <Image source={{ uri: partner.avatar }} style={styles.friendAvatarImg} />
                          ) : (
                            <Text style={styles.msgConvoAvatarText}>
                              {partner.name[0]?.toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.msgConvoName}>
                            {partner.name}
                          </Text>
                          <Text style={styles.msgConvoPreview} numberOfLines={1}>
                            {lastMsg.sender_id === user?.id ? "You: " : ""}{lastMsg.content}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.msgConvoTime}>
                            {new Date(lastMsg.created_at).toLocaleDateString()}
                          </Text>
                          {!lastMsg.is_read && lastMsg.receiver_id === user?.id && (
                            <View style={styles.msgUnreadDot} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );});
                  })()
                )}
              </>
            )}
          </View>
        )}

        {/* ═══ SETTINGS ═══ */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>Settings</Text>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/ranks" as any)}>
            <View style={styles.settingLeft}>
              <Trophy size={18} color="#FFD700" />
              <Text style={styles.settingText}>Levels & Ranks</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7} onPress={() => router.push("/terms-and-conditions" as any)}>
            <View style={styles.settingLeft}>
              <Shield size={18} color="#8A8A9A" />
              <Text style={styles.settingText}>Privacy & Terms</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <HelpCircle size={18} color="#8A8A9A" />
              <Text style={styles.settingText}>Help & Support</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow} activeOpacity={0.7}>
            <View style={styles.settingLeft}>
              <Headphones size={18} color="#8A8A9A" />
              <Text style={styles.settingText}>Contact Us</Text>
            </View>
            <ChevronRight size={16} color="#5A5A6E" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingRow, styles.logoutRow]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <LogOut size={18} color="#EF4444" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#060609",
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
  },
  // ─── Not logged in ──────────────────────────────────────
  loginPrompt: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  loginPromptIcon: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  loginPromptTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  loginPromptDesc: {
    fontSize: 15,
    color: "#8A8A9A",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  loginPromptBtn: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  loginPromptBtnGradient: {
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  loginPromptBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  loginPromptBtnSecondary: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  loginPromptBtnSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // ─── Profile header ─────────────────────────────────────
  profileHeader: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  avatarSection: {
    marginBottom: 12,
    position: "relative",
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  avatarInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#0A0A0F",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FF6B35",
  },
  avatarImage: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    left: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },
  levelBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#000",
  },
  userName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  rankPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,107,53,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,107,53,0.25)",
    borderRadius: 20,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 5,
    marginBottom: 16,
  },
  userTitle: {
    fontSize: 14,
    color: "#FF6B35",
    fontWeight: "700",
  },
  nowDrivingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    maxWidth: "80%",
  },
  nowDrivingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  nowDrivingText: {
    fontSize: 13,
    color: "#8A8A9A",
    fontWeight: "600",
    flexShrink: 1,
  },
  nowDrivingName: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  xpSection: {
    width: "100%",
    marginBottom: 18,
  },
  xpBarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  xpLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5A5A6E",
    letterSpacing: 1,
    textTransform: "uppercase" as const,
  },
  xpValue: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8A8A9A",
  },
  xpTrack: {
    height: 6,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  xpFill: {
    height: "100%",
    borderRadius: 3,
  },
  quickStats: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  quickStat: {
    alignItems: "center",
    flex: 1,
  },
  quickStatDiv: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  quickStatLabel: {
    fontSize: 11,
    color: "#8A8A9A",
    marginTop: 2,
  },
  // ─── Content tabs ───────────────────────────────────────
  contentTabs: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 4,
  },
  contentTab: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  contentTabActive: {
    backgroundColor: "rgba(255, 107, 53, 0.12)",
  },
  contentTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5A5A6E",
  },
  contentTabTextActive: {
    color: "#FF6B35",
  },
  // ─── Section ────────────────────────────────────────────
  section: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  // ─── Garage ─────────────────────────────────────────────
  garageCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    marginBottom: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  garageCardPrimary: {
    borderColor: "#FF6B3540",
    backgroundColor: "rgba(255, 107, 53, 0.04)",
  },
  garageCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  carColorBar: {
    width: 4,
    height: 80,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  carInfo: {
    flex: 1,
    padding: 14,
  },
  carNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  carName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  primaryBadge: {
    backgroundColor: "rgba(255, 107, 53, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FF6B35",
    letterSpacing: 0.5,
  },
  carMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  carMetaText: {
    fontSize: 12,
    color: "#8A8A9A",
  },
  carMetaDot: {
    color: "#3A3A4E",
    fontSize: 10,
  },
  carPlate: {
    fontSize: 11,
    color: "#5A5A6E",
    marginTop: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  carSetPrimaryBtn: {
    padding: 12,
  },
  addCarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    borderStyle: "dashed",
  },
  addCarIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  addCarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  addCarForm: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.15)",
    gap: 8,
  },
  addCarFormRow: {
    flexDirection: "row",
  },
  addCarInput: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    color: "#FFFFFF",
  },
  addCarFormActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  addCarCancel: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    justifyContent: "center",
    alignItems: "center",
  },
  addCarCancelText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  addCarSubmit: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  addCarSubmitText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // ─── Trips ──────────────────────────────────────────────
  routesBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(0, 212, 170, 0.06)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(0, 212, 170, 0.2)",
  },
  routesBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(0, 212, 170, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  routesBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  routesBannerSub: {
    fontSize: 12,
    color: "#8A8A9A",
    marginTop: 2,
  },
  tripCard: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  tripCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  tripRoute: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  tripDestination: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  tripFastBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tripFastBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFD700",
    letterSpacing: 0.5,
  },
  tripStats: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 8,
  },
  tripStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tripStatValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8A8A9A",
  },
  tripDate: {
    fontSize: 11,
    color: "#5A5A6E",
  },
  // ─── Friends ────────────────────────────────────────────
  friendSearchRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  friendSearchInputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  friendSearchInput: {
    flex: 1,
    fontSize: 14,
    color: "#FFFFFF",
  },
  friendSearchBtn: {
    backgroundColor: "#FF6B35",
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  friendSearchBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  friendResults: {
    marginBottom: 16,
  },
  friendResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  friendResultInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  friendResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 107, 53, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  friendResultAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  friendResultAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF6B35",
  },
  friendResultName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  friendResultLevel: {
    fontSize: 12,
    color: "#8A8A9A",
  },
  friendAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  friendInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  friendAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  friendAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF6B35",
  },
  friendName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  friendStatus: {
    fontSize: 12,
    color: "#8A8A9A",
  },
  friendActions: {
    flexDirection: "row",
    gap: 8,
  },
  friendAcceptBtn: {
    padding: 4,
  },
  friendRejectBtn: {
    padding: 4,
  },
  friendMsgBtn: {
    padding: 4,
  },
  // ─── Party ──────────────────────────────────────────────
  partySectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8A8A9A",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  partyHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 215, 0, 0.08)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.25)",
  },
  partyColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  partyHeaderName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  partyLeaveBtn: {
    padding: 6,
  },
  // ─── Messages ───────────────────────────────────────────
  msgConvoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  msgConvoAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 107, 53, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  msgConvoAvatarText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FF6B35",
  },
  msgConvoName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  msgConvoPreview: {
    fontSize: 13,
    color: "#5A5A6E",
  },
  msgConvoTime: {
    fontSize: 11,
    color: "#5A5A6E",
    marginBottom: 4,
  },
  msgUnreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B35",
  },
  conversationWrap: {
    flex: 1,
  },
  conversationBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  conversationBackText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  conversationMessages: {
    minHeight: 200,
  },
  msgBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  msgSent: {
    alignSelf: "flex-end",
    backgroundColor: "#FF6B35",
    borderBottomRightRadius: 4,
  },
  msgReceived: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderBottomLeftRadius: 4,
  },
  msgText: {
    fontSize: 14,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  msgTime: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.5)",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  msgEmpty: {
    fontSize: 14,
    color: "#5A5A6E",
    textAlign: "center",
    marginTop: 40,
  },
  msgInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
  },
  msgInput: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#FFFFFF",
    maxHeight: 100,
  },
  msgSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  // ─── Empty state ─────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#5A5A6E",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#3A3A4E",
    marginTop: 4,
  },
  // ─── Settings ───────────────────────────────────────────
  settingsSection: {
    marginTop: 24,
    marginHorizontal: 20,
    marginBottom: 4,
  },
  settingsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5A5A6E",
    letterSpacing: 1,
    marginBottom: 14,
    textTransform: "uppercase" as const,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  logoutRow: {
    paddingTop: 20,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#EF4444",
  },
});
