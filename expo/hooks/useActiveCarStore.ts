import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { parseLimitRejection } from "@/lib/platinumLimits";
import { usePlatinum } from "@/hooks/usePlatinumStore";

const ACTIVE_CAR_KEY = "driveverse_active_car";

// ─── Types ─────────────────────────────────────────────────
export type CarCategory = "sport" | "jdm" | "daily" | "ev";

export interface GarageCar {
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
  category: CarCategory;
  drivetrain: string;
  accel_0_100: string;
}

/**
 * Tracks the driver's garage and which car is "active" — the one they
 * picked on the pre-app garage gate. The active car id is persisted per
 * user so it can pre-select on the picker, while selecting a car also
 * promotes it to the primary car in the database.
 */
export const [ActiveCarProvider, useActiveCar] = createContextHook(() => {
  const { limit, openPaywall } = usePlatinum();
  const [cars, setCars] = useState<GarageCar[]>([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [activeCarId, setActiveCarId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ─── Auth ───────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // ─── Load persisted active car id ────────────────────────
  const loadPersisted = useCallback(async (uid: string) => {
    try {
      const raw = await AsyncStorage.getItem(`${ACTIVE_CAR_KEY}:${uid}`);
      if (raw) setActiveCarId(raw);
    } catch {
      // ignore
    }
  }, []);

  // ─── Fetch garage cars ───────────────────────────────────
  const refreshCars = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setCars([]);
      setLoadingCars(false);
      return;
    }
    setLoadingCars(true);
    try {
      const { data } = await supabase
        .from("car_collections")
        .select("*")
        .eq("user_id", uid)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });

      const list = (data ?? []) as GarageCar[];
      setCars(list);

      // If no active car remembered yet, fall back to the primary car
      setActiveCarId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        const primary = list.find((c) => c.is_primary) ?? list[0];
        return primary?.id ?? null;
      });
    } catch {
      // Silent
    } finally {
      setLoadingCars(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setCars([]);
      setActiveCarId(null);
      setLoadingCars(false);
      return;
    }
    loadPersisted(userId).finally(refreshCars);
  }, [userId, loadPersisted, refreshCars]);

  // ─── Select a car as active (and primary) ────────────────
  const selectCar = useCallback(async (carId: string): Promise<{ error?: string }> => {
    const uid = userIdRef.current;
    setActiveCarId(carId);
    // Optimistic local primary flip
    setCars((prev) => prev.map((c) => ({ ...c, is_primary: c.id === carId })));

    if (uid) {
      try {
        await AsyncStorage.setItem(`${ACTIVE_CAR_KEY}:${uid}`, carId);
        await supabase.from("car_collections").update({ is_primary: false }).eq("user_id", uid);
        const { error } = await supabase
          .from("car_collections")
          .update({ is_primary: true })
          .eq("id", carId)
          .eq("user_id", uid);
        if (error) return { error: error.message };
      } catch (err) {
        return { error: "Could not save your selection" };
      }
    }
    return {};
  }, []);

  // ─── Add a car (used by the empty-garage flow) ───────────
  const addCar = useCallback(
    async (input: {
      name: string;
      make?: string;
      year?: string;
      color?: string;
      hp?: number;
      category?: CarCategory;
      drivetrain?: string;
      accel_0_100?: string;
    }): Promise<{ id?: string; error?: string; limitReached?: boolean }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in" };

      // Regular garages hold 2 cars; Platinum is uncapped. The paywall opens
      // on the Garage benefit at the moment the third car is attempted,
      // rather than the add button silently doing nothing.
      const garageLimit = limit("garageCars");
      if (garageLimit !== null && cars.length >= garageLimit) {
        openPaywall("garage");
        return {
          error: `Regular garages hold ${garageLimit} cars. Go Platinum for unlimited slots.`,
          limitReached: true,
        };
      }

      const { data, error } = await supabase
        .from("car_collections")
        .insert({
          user_id: uid,
          name: input.name.trim(),
          make: (input.make ?? "Custom").trim() || "Custom",
          model: "",
          year: input.year || "2024",
          color: input.color ?? "#FF6B35",
          color_name: "Custom",
          hp: input.hp ?? 300,
          mileage_km: 0,
          category: input.category ?? "daily",
          drivetrain: input.drivetrain ?? "RWD",
          accel_0_100: input.accel_0_100 ?? "",
        })
        .select("id")
        .single();
      if (error) {
        // Database trigger caught what the local count missed.
        const rejection = parseLimitRejection(error);
        if (rejection) {
          openPaywall(rejection.benefit);
          await refreshCars();
          return { error: rejection.message, limitReached: true };
        }
        return { error: error.message };
      }
      await refreshCars();
      return { id: (data as { id: string } | null)?.id };
    },
    [refreshCars, cars.length, limit, openPaywall]
  );

  const activeCar = cars.find((c) => c.id === activeCarId) ?? null;
  const garageLimit = limit("garageCars");

  return {
    cars,
    loadingCars,
    activeCar,
    activeCarId,
    refreshCars,
    selectCar,
    addCar,
    /** `null` when unlimited (Platinum). */
    garageLimit,
    /** True when adding another car would raise the paywall. */
    atGarageLimit: garageLimit !== null && cars.length >= garageLimit,
  };
});
