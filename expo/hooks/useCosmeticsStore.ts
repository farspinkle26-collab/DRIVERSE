/**
 * Driveverse Platinum — cosmetic selection.
 *
 * Holds which premium vehicle icon and profile frame the signed-in driver has
 * chosen, and resolves other drivers' choices for display.
 *
 * The stored value is never destroyed when a subscription lapses — see
 * `constants/platinumCosmetics.ts`. `vehicleIcon` / `profileFrame` below are
 * the RESOLVED values (already fallen back to the default set when the driver
 * isn't entitled); `selectedVehicleIcon` / `selectedProfileFrame` are the raw
 * stored ones, which is what the picker needs so a lapsed subscriber still
 * sees their old choice highlighted.
 */

import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PROFILE_FRAME,
  DEFAULT_VEHICLE_ICON,
  PROFILE_FRAMES,
  VEHICLE_ICONS,
  resolveProfileFrame,
  resolveVehicleIcon,
  type ProfileFrameId,
  type VehicleIconId,
} from "@/constants/platinumCosmetics";
import { supabase } from "@/lib/supabase";
import { usePlatinum } from "@/hooks/usePlatinumStore";

const CACHE_KEY = "driveverse_cosmetics";

interface CachedCosmetics {
  vehicleIcon: string | null;
  profileFrame: string | null;
}

export const [CosmeticsProvider, useCosmetics] = createContextHook(() => {
  const { isPlatinum, openPaywall } = usePlatinum();
  const [selectedVehicleIcon, setSelectedVehicleIcon] = useState<string | null>(null);
  const [selectedProfileFrame, setSelectedProfileFrame] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  /* ─── Auth ──────────────────────────────────────────────── */

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  /* ─── Load ──────────────────────────────────────────────── */

  useEffect(() => {
    if (!userId) {
      setSelectedVehicleIcon(null);
      setSelectedProfileFrame(null);
      return;
    }
    let active = true;

    (async () => {
      // Cache first: a cosmetic that pops from default to chosen a beat after
      // the profile paints is more noticeable than the cosmetic itself.
      try {
        const raw = await AsyncStorage.getItem(`${CACHE_KEY}:${userId}`);
        if (raw && active) {
          const cached = JSON.parse(raw) as CachedCosmetics;
          setSelectedVehicleIcon(cached.vehicleIcon);
          setSelectedProfileFrame(cached.profileFrame);
        }
      } catch {
        // Cache miss is harmless.
      }

      const { data } = await supabase
        .from("profiles")
        .select("vehicle_icon, profile_frame")
        .eq("id", userId)
        .single();
      if (!active || !data) return;

      const row = data as { vehicle_icon: string | null; profile_frame: string | null };
      setSelectedVehicleIcon(row.vehicle_icon);
      setSelectedProfileFrame(row.profile_frame);
      void AsyncStorage.setItem(
        `${CACHE_KEY}:${userId}`,
        JSON.stringify({
          vehicleIcon: row.vehicle_icon,
          profileFrame: row.profile_frame,
        } satisfies CachedCosmetics)
      );
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  /* ─── Select ────────────────────────────────────────────── */

  const persist = useCallback(
    async (column: "vehicle_icon" | "profile_frame", value: string | null) => {
      const uid = userIdRef.current;
      if (!uid) return;
      await supabase.from("profiles").update({ [column]: value }).eq("id", uid);
      const next: CachedCosmetics = {
        vehicleIcon: column === "vehicle_icon" ? value : selectedVehicleIcon,
        profileFrame: column === "profile_frame" ? value : selectedProfileFrame,
      };
      void AsyncStorage.setItem(`${CACHE_KEY}:${uid}`, JSON.stringify(next));
    },
    [selectedVehicleIcon, selectedProfileFrame]
  );

  /**
   * Picking a locked option raises the paywall rather than silently doing
   * nothing — the same point-of-friction rule the caps follow.
   */
  const selectVehicleIcon = useCallback(
    async (id: VehicleIconId) => {
      const option = VEHICLE_ICONS.find((i) => i.id === id);
      if (!option) return;
      if (option.platinum && !isPlatinum) {
        openPaywall("cosmetics");
        return;
      }
      setSelectedVehicleIcon(id);
      await persist("vehicle_icon", id);
    },
    [isPlatinum, openPaywall, persist]
  );

  const selectProfileFrame = useCallback(
    async (id: ProfileFrameId) => {
      const option = PROFILE_FRAMES.find((f) => f.id === id);
      if (!option) return;
      if (option.platinum && !isPlatinum) {
        openPaywall("cosmetics");
        return;
      }
      setSelectedProfileFrame(id);
      await persist("profile_frame", id);
    },
    [isPlatinum, openPaywall, persist]
  );

  /* ─── Resolved values ───────────────────────────────────── */

  const vehicleIcon = useMemo<VehicleIconId>(
    () => resolveVehicleIcon(selectedVehicleIcon, isPlatinum),
    [selectedVehicleIcon, isPlatinum]
  );

  const profileFrame = useMemo<ProfileFrameId>(
    () => resolveProfileFrame(selectedProfileFrame, isPlatinum),
    [selectedProfileFrame, isPlatinum]
  );

  return useMemo(
    () => ({
      /** Resolved — safe to render directly. */
      vehicleIcon,
      profileFrame,
      /** Raw stored values, for the picker's selected state. */
      selectedVehicleIcon: selectedVehicleIcon ?? DEFAULT_VEHICLE_ICON,
      selectedProfileFrame: selectedProfileFrame ?? DEFAULT_PROFILE_FRAME,
      selectVehicleIcon,
      selectProfileFrame,
      isPlatinum,
    }),
    [
      vehicleIcon,
      profileFrame,
      selectedVehicleIcon,
      selectedProfileFrame,
      selectVehicleIcon,
      selectProfileFrame,
      isPlatinum,
    ]
  );
});

export default useCosmetics;
