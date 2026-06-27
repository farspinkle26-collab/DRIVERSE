import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import * as Location from "expo-location";

// ─── Types ─────────────────────────────────────────────────
export interface OnlineUser {
  user_id: string;
  name: string;
  level: number;
  latitude: number;
  longitude: number;
  heading: number;
  updated_at: string;
}

// ─── Context Hook ──────────────────────────────────────────
export const [OnlineUsersProvider, useOnlineUsers] = createContextHook(() => {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Listen for auth state ───────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // ─── Toggle online: subscribe/unsubscribe to realtime channel ──
  const goOnline = useCallback(async () => {
    if (!userId) return;

    // Get current location
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
      });

      // Upsert location
      await supabase.from("user_locations").upsert({
        user_id: userId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        heading: loc.coords.heading ?? 0,
        is_online: true,
      });

      setIsOnline(true);

      // Subscribe to all user_locations changes via Realtime
      const channel = supabase
        .channel("online-users")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "user_locations" },
          async () => {
            // Refetch all online users with their profiles
            await fetchOnlineUsers();
          }
        )
        .subscribe();

      channelRef.current = channel;

      // Initial fetch
      await fetchOnlineUsers();

      // Periodically update own location (every 5 seconds)
      locationIntervalRef.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
          });
          await supabase.from("user_locations").upsert({
            user_id: userId,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading: loc.coords.heading ?? 0,
            is_online: true,
          });
        } catch {
          // Silent
        }
      }, 5000);
    } catch {
      // Silent
    }
  }, [userId]);

  // ─── Fetch all online users with their profile info ────────
  const fetchOnlineUsers = useCallback(async () => {
    if (!userId) return;

    try {
      // Get all online locations
      const { data: locations } = await supabase
        .from("user_locations")
        .select("*")
        .eq("is_online", true)
        .neq("user_id", userId);

      if (!locations || locations.length === 0) {
        setOnlineUsers([]);
        return;
      }

      // Fetch profiles for these users
      const userIds = locations.map((l: { user_id: string }) => l.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", userIds);

      // Fetch XP for these users
      const { data: xpData } = await supabase
        .from("user_xp")
        .select("user_id, level")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; name: string }) => [p.id, p])
      );
      const xpMap = new Map(
        (xpData ?? []).map((x: { user_id: string; level: number }) => [x.user_id, x.level])
      );

      const users: OnlineUser[] = locations.map(
        (l: { user_id: string; latitude: number; longitude: number; heading: number; updated_at: string }) => ({
          user_id: l.user_id,
          name: profileMap.get(l.user_id)?.name ?? "Driver",
          level: xpMap.get(l.user_id) ?? 1,
          latitude: l.latitude,
          longitude: l.longitude,
          heading: l.heading ?? 0,
          updated_at: l.updated_at,
        })
      );

      setOnlineUsers(users);
    } catch {
      // Silent
    }
  }, [userId]);

  // ─── Go offline: cleanup ─────────────────────────────────
  const goOffline = useCallback(async () => {
    if (userId) {
      try {
        await supabase
          .from("user_locations")
          .update({ is_online: false })
          .eq("user_id", userId);
      } catch {
        // Silent
      }
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }

    setIsOnline(false);
    setOnlineUsers([]);
  }, [userId]);

  // ─── Cleanup on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, []);

  // ─── Auto-go-offline when auth is lost ───────────────────
  useEffect(() => {
    if (!userId && isOnline) {
      goOffline();
    }
  }, [userId, isOnline, goOffline]);

  return {
    onlineUsers,
    isOnline,
    goOnline,
    goOffline,
  };
});
