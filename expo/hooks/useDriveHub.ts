import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuthStore";
import { useQuests } from "@/hooks/useQuestStore";
import { useActiveCar } from "@/hooks/useActiveCarStore";
import type { Trip } from "@/components/TripCard";

/**
 * Everything the Drive Hub header strip and trip list need, in one place.
 *
 * The five header counts come from four sources: cars from the garage
 * store, streak from the quest store, and drivers/alerts/trips from
 * Supabase. "Alerts" is the count of things waiting on the driver —
 * incoming friend requests plus unread direct messages — rather than the
 * local push-notification list, which resets with the app process.
 */

const TRIP_PAGE_SIZE = 20;

export interface DriveHubData {
  trips: Trip[];
  cars: number;
  drivers: number;
  alerts: number;
  streak: number;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

export function useDriveHub(): DriveHubData {
  const { user, isAuthenticated } = useAuth();
  const { streak } = useQuests();
  const { cars } = useActiveCar();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState(0);
  const [alerts, setAlerts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = user?.id;

  const load = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setTrips([]);
      setDrivers(0);
      setAlerts(0);
      setLoading(false);
      return;
    }

    const [tripRes, sentRes, receivedRes, messageRes] = await Promise.all([
      supabase
        .from("trips")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(TRIP_PAGE_SIZE),
      supabase.from("friends").select("status").eq("user_id", userId),
      supabase.from("friends").select("status").eq("friend_id", userId),
      supabase
        .from("direct_messages")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("is_read", false),
    ]);

    setTrips((tripRes.data as Trip[]) ?? []);

    const sent = sentRes.data ?? [];
    const received = receivedRes.data ?? [];
    const accepted = [...sent, ...received].filter(
      (row: { status?: string }) => row.status === "accepted"
    ).length;
    setDrivers(accepted);

    // Incoming requests are the only pending rows the driver can act on;
    // requests they sent themselves are not an alert.
    const pendingIncoming = received.filter(
      (row: { status?: string }) => row.status === "pending"
    ).length;
    setAlerts(pendingIncoming + (messageRes.count ?? 0));

    setLoading(false);
  }, [isAuthenticated, userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return {
    trips,
    cars: cars.length,
    drivers,
    alerts,
    streak,
    loading,
    refreshing,
    refresh,
  };
}

export default useDriveHub;
