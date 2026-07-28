/**
 * Driveverse — saved places.
 *
 * A driver's own bookmarks over the places layer (cafes, gas stations,
 * workshops, hangouts). The places layer itself already existed — see
 * `lib/placesApi.ts` and `components/PlacesLayer.tsx` — but there was no way
 * to keep one, so this store is the feature and its Regular cap ships
 * together rather than a limit being retrofitted onto existing behaviour.
 *
 * Regular drivers keep 10; Platinum is uncapped. `TIER_LIMITS` in
 * `constants/platinum.ts` owns the number.
 *
 * A bookmark denormalises name/lat/lng/category on purpose: an OSM result is
 * only an id into a cache that expires, so a bookmark that stored just the id
 * would go blank the first time Overpass dropped the node.
 */

import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaceCategory } from "@/constants/placesCategories";
import { supabase } from "@/lib/supabase";
import { parseLimitRejection } from "@/lib/platinumLimits";
import { usePlatinum } from "@/hooks/usePlatinumStore";

export interface SavedPlace {
  id: string;
  place_id: string;
  /**
   * Widened when the POI provider moved from Overpass to Mapbox. `osm` stays
   * in the union because rows saved before that swap are still in the table —
   * this is persisted data, so the old value has to remain readable.
   */
  source: "mapbox" | "osm" | "user";
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  note: string;
  created_at: string;
}

/** What a caller passes to bookmark something off the map. */
export interface SavePlaceInput {
  place_id: string;
  source?: "mapbox" | "osm" | "user";
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  note?: string;
}

export type SavePlaceResult =
  | { status: "saved"; place: SavedPlace }
  /** Already bookmarked — treated as success so the star can just stay lit. */
  | { status: "already_saved" }
  /** Cap reached. The caller has already been sent to the paywall. */
  | { status: "limit_reached"; cap: number }
  | { status: "error"; message: string };

export const [SavedPlacesProvider, useSavedPlaces] = createContextHook(() => {
  const { isPlatinum, limit, blockAtLimit, openPaywall } = usePlatinum();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);
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

  const refresh = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setPlaces([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("saved_places")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      setPlaces((data ?? []) as SavedPlace[]);
    } catch {
      // Silent, matching the other stores: a failed refresh leaves the last
      // good list on screen rather than blanking it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setPlaces([]);
      return;
    }
    void refresh();
  }, [userId, refresh]);

  /* ─── Membership ────────────────────────────────────────── */

  const savedIds = useMemo(
    () => new Set(places.map((p) => p.place_id)),
    [places]
  );

  const isSaved = useCallback(
    (placeId: string) => savedIds.has(placeId),
    [savedIds]
  );

  /* ─── Save / remove ─────────────────────────────────────── */

  /**
   * Bookmarks a place, raising the paywall instead of failing silently when a
   * Regular driver is at the cap. Returns `limit_reached` so the caller knows
   * not to also show its own error.
   */
  const savePlace = useCallback(
    async (input: SavePlaceInput): Promise<SavePlaceResult> => {
      const uid = userIdRef.current;
      if (!uid) return { status: "error", message: "Sign in to save places." };
      if (savedIds.has(input.place_id)) return { status: "already_saved" };

      // Point-of-friction check: raises the paywall on the Saved Places row.
      if (blockAtLimit("savedPlaces", places.length)) {
        return { status: "limit_reached", cap: places.length };
      }

      const { data, error } = await supabase
        .from("saved_places")
        .insert({
          user_id: uid,
          place_id: input.place_id,
          // Callers pass the place's own source; the default only covers a
          // caller that omits it, and anything not community-submitted now
          // comes from the provider.
          source: input.source ?? "mapbox",
          name: input.name,
          category: input.category,
          lat: input.lat,
          lng: input.lng,
          note: input.note ?? "",
        })
        .select("*")
        .single();

      if (error) {
        // The database cap fired even though the local count looked fine —
        // another device got there first. Still a paywall, not an error toast.
        const rejection = parseLimitRejection(error);
        if (rejection) {
          openPaywall(rejection.benefit);
          await refresh();
          return { status: "limit_reached", cap: rejection.cap };
        }
        if (error.code === "23505") return { status: "already_saved" };
        return { status: "error", message: error.message };
      }

      const place = data as SavedPlace;
      setPlaces((prev) => [place, ...prev]);
      return { status: "saved", place };
    },
    [places.length, savedIds, blockAtLimit, openPaywall, refresh]
  );

  const removePlace = useCallback(async (placeId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    setPlaces((prev) => prev.filter((p) => p.place_id !== placeId));
    await supabase
      .from("saved_places")
      .delete()
      .eq("user_id", uid)
      .eq("place_id", placeId);
  }, []);

  /** Star toggle for a map callout. */
  const togglePlace = useCallback(
    async (input: SavePlaceInput): Promise<SavePlaceResult | null> => {
      if (savedIds.has(input.place_id)) {
        await removePlace(input.place_id);
        return null;
      }
      return savePlace(input);
    },
    [savedIds, removePlace, savePlace]
  );

  const cap = limit("savedPlaces");

  return useMemo(
    () => ({
      places,
      loading,
      refresh,
      isSaved,
      savePlace,
      removePlace,
      togglePlace,
      /** `null` when unlimited. */
      cap,
      count: places.length,
      /** True when the next save would be blocked. */
      atCap: cap !== null && places.length >= cap,
      isPlatinum,
    }),
    [places, loading, refresh, isSaved, savePlace, removePlace, togglePlace, cap, isPlatinum]
  );
});

export default useSavedPlaces;
