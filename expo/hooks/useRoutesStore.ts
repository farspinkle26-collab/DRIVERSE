import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { parseLimitRejection } from "@/lib/platinumLimits";
import {
  describeSaveFailure,
  sanitizeCount,
  sanitizeMetric,
} from "@/lib/routeDraft";
import { usePlatinum } from "@/hooks/usePlatinumStore";

// ─── Types ─────────────────────────────────────────────────
export type RouteVisibility = "public" | "friends" | "private";
export type ActivityType = "drive" | "cruise" | "commute" | "race" | "roadtrip";

export interface SavedRoute {
  id: string;
  user_id: string;
  title: string;
  description: string;
  activity_type: ActivityType;
  route_polyline: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  origin_name: string;
  destination_name: string;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh: number;
  xp_earned: number;
  visibility: RouteVisibility;
  kudos_count: number;
  comments_count: number;
  car_id: string | null;
  recorded_at: string;
  created_at: string;
  // Derived
  author_name: string;
  is_mine: boolean;
  has_kudos: boolean;
}

export interface RouteComment {
  id: string;
  route_id: string;
  user_id: string;
  content: string;
  created_at: string;
  author_name: string;
}

export interface SaveRouteInput {
  title: string;
  description?: string;
  activity_type?: ActivityType;
  route_polyline: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  origin_name?: string;
  destination_name?: string;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh: number;
  xp_earned?: number;
  visibility?: RouteVisibility;
  car_id?: string | null;
  recorded_at?: Date;
}

interface RouteRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  activity_type: ActivityType;
  route_polyline: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  origin_name: string;
  destination_name: string;
  distance_km: number;
  duration_seconds: number;
  avg_speed_kmh: number;
  top_speed_kmh: number;
  xp_earned: number;
  visibility: RouteVisibility;
  kudos_count: number;
  comments_count: number;
  car_id: string | null;
  recorded_at: string;
  created_at: string;
}

// ─── Context Hook ──────────────────────────────────────────
export const [RoutesProvider, useRoutes] = createContextHook(() => {
  const { limit, openPaywall } = usePlatinum();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
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

  // ─── Fetch all visible routes (own + public + friends) ───
  const fetchRoutes = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) {
      setRoutes([]);
      return;
    }

    try {
      const { data: rows } = await supabase
        .from("saved_routes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      const routeRows = (rows ?? []) as RouteRow[];
      if (routeRows.length === 0) {
        setRoutes([]);
        return;
      }

      const authorIds = [...new Set(routeRows.map((r) => r.user_id))];
      const routeIds = routeRows.map((r) => r.id);

      const [{ data: profiles }, { data: myKudos }] = await Promise.all([
        supabase.from("profiles").select("id, name").in("id", authorIds),
        supabase
          .from("route_kudos")
          .select("route_id")
          .eq("user_id", uid)
          .in("route_id", routeIds),
      ]);

      const nameMap = new Map(
        ((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
      );
      const kudosSet = new Set(
        ((myKudos ?? []) as { route_id: string }[]).map((k) => k.route_id)
      );

      setRoutes(
        routeRows.map((r) => ({
          ...r,
          author_name: nameMap.get(r.user_id) ?? "Driver",
          is_mine: r.user_id === uid,
          has_kudos: kudosSet.has(r.id),
        }))
      );
    } catch {
      // Silent
    }
  }, []);

  // ─── Realtime ────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setRoutes([]);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    setLoadingRoutes(true);
    fetchRoutes().finally(() => setLoadingRoutes(false));

    const channel = supabase
      .channel("routes-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "saved_routes" }, () => fetchRoutes())
      .on("postgres_changes", { event: "*", schema: "public", table: "route_kudos" }, () => fetchRoutes())
      .on("postgres_changes", { event: "*", schema: "public", table: "route_comments" }, () => fetchRoutes())
      .subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchRoutes]);

  // ─── Save a recorded route ───────────────────────────────
  //
  // "Unlimited Route Discovery" is enforced here, on the driver's own route
  // library, because that is the countable thing a driver owns — the
  // discovery FEED itself is other people's public routes and capping how
  // many of those you may look at would be a worse product, not a premium
  // one. See PLATINUM_REFERENCE.md §"Route Discovery" for the reasoning and
  // the open product question.
  const saveRoute = useCallback(
    async (input: SaveRouteInput): Promise<{ id?: string; error?: string; limitReached?: boolean }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to save a route" };

      const routeLimit = limit("savedRoutes");
      const mine = routes.filter((r) => r.is_mine).length;
      if (routeLimit !== null && mine >= routeLimit) {
        openPaywall("routes");
        return {
          error: `Regular drivers keep ${routeLimit} routes. Delete one, or go Platinum for an unlimited library.`,
          limitReached: true,
        };
      }

      // Every numeric goes through the sanitisers: PostgREST serialises the
      // insert as JSON, where NaN and Infinity are not representable, so a
      // single unmeasured speed turns a saveable drive into a rejected
      // request. See lib/routeDraft.ts.
      try {
        const { data, error } = await supabase
          .from("saved_routes")
          .insert({
            user_id: uid,
            title: input.title.trim(),
            description: (input.description ?? "").trim(),
            activity_type: input.activity_type ?? "drive",
            route_polyline: input.route_polyline,
            start_lat: input.start_lat,
            start_lng: input.start_lng,
            end_lat: input.end_lat,
            end_lng: input.end_lng,
            origin_name: input.origin_name ?? "",
            destination_name: input.destination_name ?? "",
            distance_km: sanitizeMetric(input.distance_km),
            duration_seconds: sanitizeCount(input.duration_seconds),
            avg_speed_kmh: sanitizeMetric(input.avg_speed_kmh),
            top_speed_kmh: sanitizeMetric(input.top_speed_kmh),
            xp_earned: sanitizeCount(input.xp_earned),
            visibility: input.visibility ?? "public",
            car_id: input.car_id ?? null,
            recorded_at: (input.recorded_at ?? new Date()).toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          const rejection = parseLimitRejection(error);
          if (rejection) {
            openPaywall(rejection.benefit);
            await fetchRoutes();
            return { error: rejection.message, limitReached: true };
          }
          return { error: describeSaveFailure(error) };
        }
        await fetchRoutes();
        return { id: (data as { id: string } | null)?.id };
      } catch (err) {
        // A thrown failure — no network, an expired session, a client
        // misconfiguration — never reached the caller before, so the sheet's
        // spinner ran forever and the driver read it as "Save does nothing".
        return { error: describeSaveFailure(err) };
      }
    },
    [fetchRoutes, routes, limit, openPaywall]
  );

  // ─── Update visibility / title / description ─────────────
  const updateRoute = useCallback(
    async (
      routeId: string,
      patch: Partial<Pick<SavedRoute, "title" | "description" | "visibility" | "activity_type">>
    ): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };
      const { error } = await supabase
        .from("saved_routes")
        .update(patch)
        .eq("id", routeId)
        .eq("user_id", uid);
      if (error) return { error: error.message };
      await fetchRoutes();
      return {};
    },
    [fetchRoutes]
  );

  // ─── Delete a route ──────────────────────────────────────
  const deleteRoute = useCallback(
    async (routeId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };
      const { error } = await supabase
        .from("saved_routes")
        .delete()
        .eq("id", routeId)
        .eq("user_id", uid);
      if (error) return { error: error.message };
      setRoutes((prev) => prev.filter((r) => r.id !== routeId));
      return {};
    },
    []
  );

  // ─── Kudos toggle (optimistic) ───────────────────────────
  const toggleKudos = useCallback(
    async (routeId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Sign in to give kudos" };

      const current = routes.find((r) => r.id === routeId);
      const alreadyKudos = current?.has_kudos ?? false;

      // Optimistic update
      setRoutes((prev) =>
        prev.map((r) =>
          r.id === routeId
            ? {
                ...r,
                has_kudos: !alreadyKudos,
                kudos_count: Math.max(0, r.kudos_count + (alreadyKudos ? -1 : 1)),
              }
            : r
        )
      );

      if (alreadyKudos) {
        const { error } = await supabase
          .from("route_kudos")
          .delete()
          .eq("route_id", routeId)
          .eq("user_id", uid);
        if (error) {
          await fetchRoutes();
          return { error: error.message };
        }
      } else {
        const { error } = await supabase
          .from("route_kudos")
          .insert({ route_id: routeId, user_id: uid });
        if (error && error.code !== "23505") {
          await fetchRoutes();
          return { error: error.message };
        }
      }
      return {};
    },
    [routes, fetchRoutes]
  );

  // ─── Comments ────────────────────────────────────────────
  const fetchComments = useCallback(async (routeId: string): Promise<RouteComment[]> => {
    const { data: rows } = await supabase
      .from("route_comments")
      .select("*")
      .eq("route_id", routeId)
      .order("created_at", { ascending: true });

    const commentRows = (rows ?? []) as Omit<RouteComment, "author_name">[];
    if (commentRows.length === 0) return [];

    const authorIds = [...new Set(commentRows.map((c) => c.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", authorIds);
    const nameMap = new Map(
      ((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
    );

    return commentRows.map((c) => ({
      ...c,
      author_name: nameMap.get(c.user_id) ?? "Driver",
    }));
  }, []);

  const addComment = useCallback(
    async (routeId: string, content: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Sign in to comment" };
      const trimmed = content.trim();
      if (!trimmed) return { error: "Comment cannot be empty" };
      const { error } = await supabase
        .from("route_comments")
        .insert({ route_id: routeId, user_id: uid, content: trimmed });
      if (error) return { error: error.message };
      await fetchRoutes();
      return {};
    },
    [fetchRoutes]
  );

  const deleteComment = useCallback(
    async (commentId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };
      const { error } = await supabase
        .from("route_comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", uid);
      if (error) return { error: error.message };
      await fetchRoutes();
      return {};
    },
    [fetchRoutes]
  );

  const getRoute = useCallback(
    (routeId: string): SavedRoute | undefined => routes.find((r) => r.id === routeId),
    [routes]
  );

  const feed = routes; // all visible (own + public + friends)
  const myRoutes = routes.filter((r) => r.is_mine);
  const savedRouteLimit = limit("savedRoutes");

  return {
    routes,
    feed,
    myRoutes,
    /** `null` when unlimited (Platinum). */
    savedRouteLimit,
    /** True when saving another route would raise the paywall. */
    atRouteLimit:
      savedRouteLimit !== null && myRoutes.length >= savedRouteLimit,
    loadingRoutes,
    fetchRoutes,
    saveRoute,
    updateRoute,
    deleteRoute,
    toggleKudos,
    fetchComments,
    addComment,
    deleteComment,
    getRoute,
  };
});
