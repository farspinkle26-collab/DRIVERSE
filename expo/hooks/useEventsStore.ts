import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { parseLimitRejection } from "@/lib/platinumLimits";
import { usePlatinum } from "@/hooks/usePlatinumStore";

// ─── Types ─────────────────────────────────────────────────
export type EventType = "meetup" | "convoy" | "cruise" | "race";
export type EventStatus = "upcoming" | "active" | "completed" | "cancelled";

export interface DriveEvent {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  event_type: EventType;
  latitude: number;
  longitude: number;
  location_name: string;
  starts_at: string;
  ends_at: string | null;
  max_participants: number; // 0 = unlimited
  status: EventStatus;
  country: string;
  created_at: string;
  // Derived
  host_name: string;
  participant_count: number;
  is_joined: boolean;
  is_host: boolean;
  is_live: boolean;
}

export interface CreateEventInput {
  title: string;
  description: string;
  event_type: EventType;
  latitude: number;
  longitude: number;
  location_name?: string;
  starts_at: Date;
  ends_at?: Date | null;
  max_participants?: number;
}

interface EventRow {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  event_type: EventType;
  latitude: number;
  longitude: number;
  location_name: string;
  starts_at: string;
  ends_at: string | null;
  max_participants: number;
  status: EventStatus;
  country: string;
  created_at: string;
}

interface ParticipantRow {
  event_id: string;
  user_id: string;
  role: "host" | "member";
}

function isLiveNow(e: EventRow): boolean {
  const now = Date.now();
  const start = new Date(e.starts_at).getTime();
  const end = e.ends_at ? new Date(e.ends_at).getTime() : start + 6 * 3600 * 1000;
  return e.status !== "cancelled" && start <= now && now < end;
}

// ─── Context Hook ──────────────────────────────────────────
export const [EventsProvider, useEvents] = createContextHook(() => {
  const { limit, openPaywall } = usePlatinum();
  const [events, setEvents] = useState<DriveEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // ─── Listen for auth state ───────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  // ─── Fetch upcoming + active events with hosts and counts ──
  const fetchEvents = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;

    try {
      // Opportunistically roll upcoming→active→completed server-side
      await supabase.rpc("refresh_event_statuses");
    } catch {
      // Non-fatal: statuses are also derived client-side via is_live
    }

    try {
      const { data: rows } = await supabase
        .from("events")
        .select("*")
        .in("status", ["upcoming", "active"])
        .order("starts_at", { ascending: true });

      const eventRows = (rows ?? []) as EventRow[];
      if (eventRows.length === 0) {
        setEvents([]);
        return;
      }

      const eventIds = eventRows.map((e) => e.id);
      const creatorIds = [...new Set(eventRows.map((e) => e.creator_id))];

      const [{ data: participants }, { data: profiles }] = await Promise.all([
        supabase
          .from("event_participants")
          .select("event_id, user_id, role")
          .in("event_id", eventIds),
        supabase.from("profiles").select("id, name").in("id", creatorIds),
      ]);

      const participantRows = (participants ?? []) as ParticipantRow[];
      const profileMap = new Map(
        ((profiles ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name])
      );

      const countMap = new Map<string, number>();
      const joinedSet = new Set<string>();
      for (const p of participantRows) {
        countMap.set(p.event_id, (countMap.get(p.event_id) ?? 0) + 1);
        if (p.user_id === uid) joinedSet.add(p.event_id);
      }

      setEvents(
        eventRows.map((e) => ({
          ...e,
          host_name: profileMap.get(e.creator_id) ?? "Driver",
          participant_count: countMap.get(e.id) ?? 0,
          is_joined: joinedSet.has(e.id),
          is_host: e.creator_id === uid,
          is_live: isLiveNow(e),
        }))
      );
    } catch {
      // Silent
    }
  }, []);

  // ─── Realtime: refresh on any events/participants change ──
  useEffect(() => {
    if (!userId) {
      setEvents([]);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    setLoadingEvents(true);
    fetchEvents().finally(() => setLoadingEvents(false));

    const channel = supabase
      .channel("events-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => { fetchEvents(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_participants" },
        () => { fetchEvents(); }
      )
      .subscribe();
    channelRef.current = channel;

    // Periodic refresh keeps live/expired states accurate even without DB traffic
    const interval = setInterval(fetchEvents, 60_000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, fetchEvents]);

  // ─── Tier cap ────────────────────────────────────────────
  // Regular drivers may have ONE event of their own upcoming or active at a
  // time; Platinum is uncapped. Completed and cancelled events don't count —
  // a driver who ran a meetup last month shouldn't still be holding their
  // own slot. `constants/platinum.ts` owns the number.
  const activeEventLimit = limit("activeEvents");

  /** Events *this driver created* that are still upcoming or active. */
  const myActiveEventCount = useMemo(
    () => events.filter((e) => e.is_host).length,
    [events]
  );

  /**
   * Authoritative count, straight from the database. The local list is
   * realtime but can be a beat behind on a cold start, and the cap decides
   * whether a driver sees a paywall — worth one cheap count query.
   */
  const countMyActiveEvents = useCallback(async (uid: string): Promise<number> => {
    const { count, error } = await supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", uid)
      .in("status", ["upcoming", "active"]);
    // On a failed count, fall back to the local list rather than blocking a
    // legitimate create or waving through an over-cap one.
    if (error || count === null) return myActiveEventCount;
    return count;
  }, [myActiveEventCount]);

  // ─── Create event ────────────────────────────────────────
  const createEvent = useCallback(
    async (input: CreateEventInput): Promise<{ error?: string; limitReached?: boolean }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to create an event" };

      // Point of friction: a Regular driver at the cap gets the paywall,
      // pinned to the Events benefit — never a silent failure.
      if (activeEventLimit !== null) {
        const current = await countMyActiveEvents(uid);
        if (current >= activeEventLimit) {
          openPaywall("events");
          return {
            error: `Regular drivers can host ${activeEventLimit} event at a time. Finish or cancel it, or go Platinum for unlimited events.`,
            limitReached: true,
          };
        }
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("country")
        .eq("id", uid)
        .single();
      if (!profile?.country) {
        return { error: "Set your country in your profile before creating an event" };
      }

      const { error } = await supabase.from("events").insert({
        creator_id: uid,
        title: input.title.trim(),
        description: input.description.trim(),
        event_type: input.event_type,
        latitude: input.latitude,
        longitude: input.longitude,
        location_name: input.location_name ?? "",
        starts_at: input.starts_at.toISOString(),
        ends_at: input.ends_at ? input.ends_at.toISOString() : null,
        max_participants: input.max_participants ?? 0,
        status: input.starts_at.getTime() <= Date.now() ? "active" : "upcoming",
      });

      if (error) {
        // The database trigger caught what the local count missed (another
        // device created an event in between). Still a paywall, not a raw
        // Postgres message.
        const rejection = parseLimitRejection(error);
        if (rejection) {
          openPaywall(rejection.benefit);
          await fetchEvents();
          return { error: rejection.message, limitReached: true };
        }
        return { error: error.message };
      }
      await fetchEvents();
      return {};
    },
    [fetchEvents, activeEventLimit, countMyActiveEvents, openPaywall]
  );

  // ─── Join / leave ────────────────────────────────────────
  const joinEvent = useCallback(
    async (eventId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "You must be signed in to join an event" };

      const { error } = await supabase.from("event_participants").insert({
        event_id: eventId,
        user_id: uid,
        role: "member",
      });

      if (error) {
        if (error.code === "23505") return { error: "You already joined this event" };
        if (error.message.includes("full")) return { error: "This event is full" };
        return { error: error.message };
      }
      await fetchEvents();
      return {};
    },
    [fetchEvents]
  );

  const leaveEvent = useCallback(
    async (eventId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };

      const { error } = await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", eventId)
        .eq("user_id", uid);

      if (error) return { error: error.message };
      await fetchEvents();
      return {};
    },
    [fetchEvents]
  );

  // ─── Cancel (host only) ──────────────────────────────────
  const cancelEvent = useCallback(
    async (eventId: string): Promise<{ error?: string }> => {
      const uid = userIdRef.current;
      if (!uid) return { error: "Not signed in" };

      const { error } = await supabase
        .from("events")
        .update({ status: "cancelled" })
        .eq("id", eventId)
        .eq("creator_id", uid);

      if (error) return { error: error.message };
      await fetchEvents();
      return {};
    },
    [fetchEvents]
  );

  return {
    events,
    loadingEvents,
    fetchEvents,
    createEvent,
    joinEvent,
    leaveEvent,
    cancelEvent,
    /** `null` when unlimited (Platinum). */
    activeEventLimit,
    myActiveEventCount,
    /** True when creating another event would raise the paywall. */
    atEventLimit:
      activeEventLimit !== null && myActiveEventCount >= activeEventLimit,
  };
});
