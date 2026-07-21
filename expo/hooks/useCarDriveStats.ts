import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface CarDriveStats {
  totalDistanceKm: number;
  totalXp: number;
  avgSpeedKmh: number;
  topSpeedKmh: number;
  tripCount: number;
}

interface TripStatsRow {
  car_id: string | null;
  distance_km: number | null;
  avg_speed_kmh: number | null;
  top_speed_kmh: number | null;
  xp_earned: number | null;
}

/**
 * Aggregates the `trips` table (every recorded drive, car_id set at
 * recording time) into per-car totals: distance driven, XP earned, and
 * average speed — shown on the profile garage and the "choose car" picker.
 */
export function useCarDriveStats(userId?: string | null) {
  const [statsByCarId, setStatsByCarId] = useState<Record<string, CarDriveStats>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatsByCarId({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("trips")
        .select("car_id, distance_km, avg_speed_kmh, top_speed_kmh, xp_earned")
        .eq("user_id", userId)
        .not("car_id", "is", null);

      const rows = (data ?? []) as TripStatsRow[];
      const map: Record<string, CarDriveStats> = {};
      rows.forEach((t) => {
        if (!t.car_id) return;
        const cur = map[t.car_id] ?? {
          totalDistanceKm: 0,
          totalXp: 0,
          avgSpeedKmh: 0,
          topSpeedKmh: 0,
          tripCount: 0,
        };
        cur.totalDistanceKm += t.distance_km ?? 0;
        cur.totalXp += t.xp_earned ?? 0;
        cur.avgSpeedKmh += t.avg_speed_kmh ?? 0;
        cur.topSpeedKmh = Math.max(cur.topSpeedKmh, t.top_speed_kmh ?? 0);
        cur.tripCount += 1;
        map[t.car_id] = cur;
      });
      Object.values(map).forEach((s) => {
        s.avgSpeedKmh = s.tripCount > 0 ? s.avgSpeedKmh / s.tripCount : 0;
      });
      setStatsByCarId(map);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { statsByCarId, loadingStats: loading, refreshStats: refresh };
}
