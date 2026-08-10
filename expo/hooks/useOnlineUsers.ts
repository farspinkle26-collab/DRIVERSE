import createContextHook from "@nkzw/create-context-hook";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import * as Location from "expo-location";
import { useXP } from "@/hooks/useXPStore";
import {
  mergeOnlineUsers,
  pruneRecentlyOffline,
  STALE_AFTER_MS,
  type OnlineUser,
  type ProblemSignal,
  type ProblemType,
} from "@/hooks/onlineUsersMerge";

// ─── Types ─────────────────────────────────────────────────
// The driver shape and the merge rule live in `onlineUsersMerge` so they can
// be tested on their own; re-exported here so every existing
// `from "@/hooks/useOnlineUsers"` import keeps working.
export type { ProblemType, ProblemSignal, OnlineUser } from "@/hooks/onlineUsersMerge";
export { mergeOnlineUsers } from "@/hooks/onlineUsersMerge";

/**
 * How the live map is doing, from this device's point of view.
 *
 * - `offline`    — visibility is off; we're neither publishing nor watching.
 * - `connecting` — the presence channel is joining.
 * - `live`       — presence is joined; other drivers arrive instantly.
 * - `degraded`   — the presence socket is down and being retried. We're still
 *                  publishing to `user_locations` over HTTP and still polling
 *                  it, so drivers do appear — just seconds late, not instantly.
 */
export type PresenceConnection = "offline" | "connecting" | "live" | "degraded";

const LOCATION_BROADCAST_MS = 4000; // how often we push our own position
// The HTTP fallback sweep. Slower than the broadcast on purpose: it exists to
// keep the map populated when the websocket is unusable, not to drive it.
const DIRECTORY_POLL_MS = 10000;
// How long a resolved name/level/avatar is reused before we re-read it.
const PROFILE_CACHE_MS = 5 * 60_000;
const REJOIN_BACKOFF_MS = [2000, 5000, 10_000, 20_000, 30_000];
const PRESENCE_CHANNEL = "online-players";

type ProfileMeta = { name: string; level: number; avatar?: string; at: number };

type LocationRow = {
  user_id: string;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  updated_at: string | null;
  problem_type?: string | null;
  problem_since?: string | null;
};

const PROBLEM_TYPES: ProblemType[] = ["breakdown", "accident", "fuel", "sos"];

const isProblemType = (v: unknown): v is ProblemType =>
  typeof v === "string" && (PROBLEM_TYPES as string[]).includes(v);

// ─── Context Hook ──────────────────────────────────────────
// Other drivers reach this device on two paths, and both are always running:
//
//   1. Supabase Realtime Presence on a shared channel — the live path. Every
//      move lands on every other client instantly, with no DB round-trip.
//   2. A poll of `user_locations`, the table our own position is already
//      upserted into — the fallback path, over plain HTTP.
//
// Path 2 is not redundancy for its own sake. Presence is a websocket, and a
// websocket is the first thing to die on a phone: captive portals, carrier
// NAT, backgrounding, a project with Realtime paused. When that happens the
// presence list silently stays empty — which on the map is indistinguishable
// from "nobody is out there". Two devices parked next to each other would
// each show the other nothing, forever, with no error anywhere. The poll
// makes that case degrade to "a few seconds late" instead of "broken", and
// `connection` tells the UI which of the two it's looking at.
export const [OnlineUsersProvider, useOnlineUsers] = createContextHook(() => {
  const [presenceUsers, setPresenceUsers] = useState<OnlineUser[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<OnlineUser[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [connection, setConnection] = useState<PresenceConnection>("offline");
  const [userId, setUserId] = useState<string | null>(null);
  const [myProblem, setMyProblem] = useState<ProblemSignal | null>(null);

  // The level this driver broadcasts to everyone else. Read from the XP store
  // rather than kept locally so it is the same number the profile screen and
  // the map's own "You · Lv." label show — one source, no third copy to drift.
  // `XPProvider` wraps `OnlineUsersProvider` in `app/_layout.tsx`, which is
  // what makes this consumable here.
  const { level: myLevel, loading: xpLoading } = useXP();

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const directoryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rejoinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejoinAttemptRef = useRef(0);
  const profileRef = useRef<{ name: string; level: number; avatar?: string }>({ name: "Driver", level: 1 });
  const profileCacheRef = useRef<Map<string, ProfileMeta>>(new Map());
  // Held in a ref so the periodic broadcaster and goOnline's first publish
  // both pick up the current signal without re-creating those callbacks.
  const problemRef = useRef<ProblemSignal | null>(null);
  // The user's *intent*. `isOnline` is state for rendering; this is what the
  // rejoin timer and the AppState listener consult, so a retry that fires
  // after the user hid themselves doesn't drag them back onto the map.
  const wantOnlineRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  // Set once the `problem_*` columns turn out to be missing, so a DB without
  // database_migration_problem_signal.sql stops re-requesting them.
  const problemColumnsRef = useRef(true);
  // Break the publishPosition → scheduleRejoin → joinChannel → publishPosition
  // cycle without re-creating any of them on every render.
  const joinRef = useRef<(uid: string) => void>(() => {});
  const rejoinRef = useRef<(uid: string) => void>(() => {});

  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // Keep the broadcast level current for the whole session.
  //
  // It used to be read once, inside `goOnline`, and never again — so a driver
  // who levelled up while the app was open kept broadcasting the level they
  // joined at. Their own profile and their own "You · Lv." label updated
  // immediately (both read the XP store, which the quest engine's server-side
  // grants reach over realtime); every *other* driver's map disagreed until
  // they toggled visibility off and on.
  //
  // Guarded on `loading` because the store reports level 1 until its first
  // read resolves, and writing that over the value `goOnline` just fetched
  // would trade a stale level for a wrong one.
  useEffect(() => {
    if (xpLoading) return;
    profileRef.current = { ...profileRef.current, level: myLevel };
  }, [myLevel, xpLoading]);

  // ─── The map's view of everyone else ─────────────────────
  const onlineUsers = useMemo(
    () => mergeOnlineUsers(presenceUsers, directoryUsers),
    [presenceUsers, directoryUsers]
  );

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

  // ─── Rebuild the players list from channel presence state ──
  const syncFromPresence = useCallback((selfId: string) => {
    const channel = channelRef.current;
    if (!channel) return;

    const state = channel.presenceState<OnlineUser>();
    const users: OnlineUser[] = [];
    for (const key of Object.keys(state)) {
      if (key === selfId) continue; // own car is rendered separately
      const metas = state[key];
      const latest = metas[metas.length - 1];
      if (!latest || typeof latest.latitude !== "number") continue;
      users.push({
        user_id: key,
        name: latest.name ?? "Driver",
        level: latest.level ?? 1,
        avatar: latest.avatar,
        latitude: latest.latitude,
        longitude: latest.longitude,
        heading: latest.heading ?? 0,
        updated_at: latest.updated_at ?? new Date().toISOString(),
        problem: latest.problem ?? null,
        source: "presence",
      });
    }
    setPresenceUsers(users);
  }, []);

  // ─── Resolve names / levels / avatars for polled drivers ──
  // Presence carries a driver's identity in the payload they broadcast; the
  // `user_locations` row carries only coordinates, so the fallback path has
  // to look the profile up itself — otherwise every driver found that way
  // would land on the map as an anonymous "Driver" at level 1.
  const resolveProfiles = useCallback(async (ids: string[]) => {
    const now = Date.now();
    const missing = ids.filter((id) => {
      const hit = profileCacheRef.current.get(id);
      return !hit || now - hit.at > PROFILE_CACHE_MS;
    });
    if (missing.length === 0) return;

    try {
      const [{ data: profiles, error }, { data: xp }] = await Promise.all([
        supabase.from("profiles").select("id, name, avatar").in("id", missing),
        supabase.from("user_xp").select("user_id, level").in("user_id", missing),
      ]);

      if (error) {
        // Leave the cache untouched so the next sweep retries. Stamping a
        // failure would pin these drivers to "Driver · Lv.1" for five minutes.
        console.warn("[onlineUsers] profile lookup failed:", error.message);
        return;
      }

      const levels = new Map(
        ((xp ?? []) as { user_id: string; level: number | null }[]).map((r) => [r.user_id, r.level ?? 1])
      );
      for (const p of (profiles ?? []) as { id: string; name: string | null; avatar: string | null }[]) {
        profileCacheRef.current.set(p.id, {
          name: p.name ?? "Driver",
          level: levels.get(p.id) ?? 1,
          avatar: p.avatar ?? undefined,
          at: now,
        });
      }
      // A driver with a location row but no profile row still gets their
      // timestamp refreshed, so we don't re-query them every single sweep.
      for (const id of missing) {
        const hit = profileCacheRef.current.get(id);
        if (hit?.at === now) continue;
        profileCacheRef.current.set(id, {
          name: hit?.name ?? "Driver",
          level: hit?.level ?? 1,
          avatar: hit?.avatar,
          at: now,
        });
      }
    } catch (e) {
      console.warn("[onlineUsers] profile lookup failed:", (e as Error)?.message ?? e);
    }
  }, []);

  // ─── The HTTP fallback sweep ─────────────────────────────
  //
  // This is also the *only* thing that can undo a lost presence "leave".
  // `goOffline` untracks and flips `user_locations.is_online` to false, but if
  // the untrack push times out or errors — the same failure mode
  // `publishPosition` already has to guard `track()` against — every other
  // device's presence state still carries that driver's last-tracked payload,
  // which is fresh by timestamp for up to `STALE_AFTER_MS` and would keep
  // rendering them as online with no error anywhere: exactly "I turned
  // visibility off but other people can still see me." The directory poll
  // fixing *appearing* online without fixing *disappearing* the same way was
  // the asymmetry — so this sweep now also asks who explicitly went offline
  // recently, and prunes them out of `presenceUsers` directly rather than
  // trusting presence to notice on its own.
  const fetchDirectory = useCallback(
    async (selfId: string) => {
      const since = new Date(Date.now() - STALE_AFTER_MS).toISOString();
      const base = "user_id, latitude, longitude, heading, updated_at";
      const withProblem = `${base}, problem_type, problem_since`;

      const run = (columns: string) =>
        supabase
          .from("user_locations")
          .select(columns)
          .eq("is_online", true)
          .gte("updated_at", since)
          .neq("user_id", selfId)
          .limit(200);

      // Recently flipped to `is_online: false` — the trigger that stamps
      // `updated_at` on every update means a driver who just went offline is
      // the *newest* row here, not a stale one, so this always catches a
      // go-offline within one poll interval.
      const runRecentlyOffline = () =>
        supabase
          .from("user_locations")
          .select("user_id, updated_at")
          .eq("is_online", false)
          .gte("updated_at", since)
          .neq("user_id", selfId)
          .limit(200);

      try {
        const [{ data, error }, { data: offlineData, error: offlineError }] = await Promise.all([
          run(problemColumnsRef.current ? withProblem : base),
          runRecentlyOffline(),
        ]);
        let rowsData = data;
        let rowsError = error;

        // 42703 = undefined_column: this project hasn't run
        // database_migration_problem_signal.sql yet. Positions still work.
        if (rowsError && (rowsError as { code?: string }).code === "42703" && problemColumnsRef.current) {
          problemColumnsRef.current = false;
          ({ data: rowsData, error: rowsError } = await run(base));
        }

        if (offlineError) {
          console.warn("[onlineUsers] recently-offline sweep failed:", offlineError.message);
        } else if (offlineData && offlineData.length > 0) {
          const recentlyOfflineIds = (offlineData as { user_id: string }[]).map((r) => r.user_id);
          setPresenceUsers((prev) => pruneRecentlyOffline(prev, recentlyOfflineIds));
        }

        if (rowsError) {
          console.warn("[onlineUsers] user_locations sweep failed:", rowsError.message);
          return;
        }

        const rows = ((rowsData ?? []) as unknown as LocationRow[]).filter(
          (r) => typeof r.latitude === "number" && typeof r.longitude === "number"
        );

        if (rows.length === 0) {
          setDirectoryUsers([]);
          return;
        }

        await resolveProfiles(rows.map((r) => r.user_id));

        setDirectoryUsers(
          rows.map((r) => {
            const meta = profileCacheRef.current.get(r.user_id);
            return {
              user_id: r.user_id,
              name: meta?.name ?? "Driver",
              level: meta?.level ?? 1,
              avatar: meta?.avatar,
              latitude: r.latitude as number,
              longitude: r.longitude as number,
              heading: r.heading ?? 0,
              updated_at: r.updated_at ?? new Date().toISOString(),
              problem:
                isProblemType(r.problem_type) && r.problem_since
                  ? { type: r.problem_type, since: r.problem_since }
                  : null,
              source: "directory",
            };
          })
        );
      } catch (e) {
        console.warn("[onlineUsers] user_locations sweep threw:", (e as Error)?.message ?? e);
      }
    },
    [resolveProfiles]
  );

  // ─── Read current GPS position ───────────────────────────
  const getPosition = useCallback(async () => {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      heading: loc.coords.heading ?? 0,
    };
  }, []);

  // ─── Broadcast own position: presence track + DB persist ──
  const publishPosition = useCallback(
    async (uid: string, pos: { latitude: number; longitude: number; heading: number }) => {
      const payload: OnlineUser = {
        user_id: uid,
        name: profileRef.current.name,
        level: profileRef.current.level,
        avatar: profileRef.current.avatar,
        latitude: pos.latitude,
        longitude: pos.longitude,
        heading: pos.heading,
        updated_at: new Date().toISOString(),
        problem: problemRef.current,
      };

      // Realtime: everyone on the channel sees this move instantly.
      // `track` resolves with a status rather than throwing, and a channel
      // that is joined but wedged answers "timed out" here — the one symptom
      // that says "you are on the map to yourself and nobody else". Surface
      // it and rejoin instead of swallowing it. Only while actually joined:
      // tracking against a channel that is still joining would time out on
      // its own and trigger a pointless rejoin, and the subscribe callback
      // publishes as soon as the join lands anyway.
      const channel = channelRef.current;
      if (channel && String(channel.state) === "joined") {
        try {
          const status = await channel.track(payload);
          if (status !== "ok") {
            console.warn(`[onlineUsers] presence track returned "${status}" — rejoining`);
            if (wantOnlineRef.current) {
              setConnection("degraded");
              rejoinRef.current(uid);
            }
          }
        } catch (e) {
          console.warn("[onlineUsers] presence track threw:", (e as Error)?.message ?? e);
        }
      }

      // Persistence: survives reconnects, feeds stale-cleanup, and is what
      // the fallback sweep on every other device reads. The problem columns
      // are new (database_migration_problem_signal.sql); an older DB without
      // them just ignores the extra keys on the presence path.
      try {
        const row: Record<string, unknown> = {
          user_id: uid,
          latitude: pos.latitude,
          longitude: pos.longitude,
          heading: pos.heading,
          is_online: true,
        };
        if (problemColumnsRef.current) {
          row.problem_type = problemRef.current?.type ?? null;
          row.problem_since = problemRef.current?.since ?? null;
        }
        const { error } = await supabase.from("user_locations").upsert(row);
        if (error) {
          // This is the other half of "nobody can see me", and it used to be
          // silent: an RLS or schema failure here means no other device can
          // ever find this driver on the fallback path.
          if ((error as { code?: string }).code === "42703" && problemColumnsRef.current) {
            problemColumnsRef.current = false;
          } else {
            console.warn("[onlineUsers] user_locations upsert failed:", error.message);
          }
        }
      } catch (e) {
        console.warn("[onlineUsers] user_locations upsert threw:", (e as Error)?.message ?? e);
      }
    },
    []
  );

  // ─── Rejoin the presence channel with backoff ────────────
  const scheduleRejoin = useCallback((uid: string) => {
    if (rejoinTimerRef.current || !wantOnlineRef.current) return;
    const attempt = rejoinAttemptRef.current;
    const delay = REJOIN_BACKOFF_MS[Math.min(attempt, REJOIN_BACKOFF_MS.length - 1)];
    rejoinAttemptRef.current = attempt + 1;
    rejoinTimerRef.current = setTimeout(() => {
      rejoinTimerRef.current = null;
      if (wantOnlineRef.current) joinRef.current(uid);
    }, delay);
  }, []);

  // ─── (Re)join the presence channel ───────────────────────
  const joinChannel = useCallback(
    (uid: string) => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: uid } },
      });
      // Assigned before `subscribe` so the status callback and the presence
      // handlers can never fire against a null ref.
      channelRef.current = channel;
      setConnection("connecting");

      channel
        .on("presence", { event: "sync" }, () => syncFromPresence(uid))
        .on("presence", { event: "join" }, () => syncFromPresence(uid))
        .on("presence", { event: "leave" }, () => syncFromPresence(uid))
        .subscribe(async (subscribeStatus, err) => {
          // A channel we've already replaced still reports CLOSED as it tears
          // down. Without this guard that reply would look like a live channel
          // dropping and schedule yet another rejoin — a loop that rejoins
          // itself out of ever staying joined.
          if (channelRef.current !== channel) return;

          if (subscribeStatus === "SUBSCRIBED") {
            rejoinAttemptRef.current = 0;
            setConnection("live");
            try {
              await publishPosition(uid, await getPosition());
            } catch (e) {
              console.warn("[onlineUsers] first publish failed:", (e as Error)?.message ?? e);
            }
            syncFromPresence(uid);
            return;
          }

          // Anything else means we are not on the channel. Leaving this
          // unhandled was the whole failure mode: the banner said "visibility
          // on" while the socket was dead, so an empty map read as "nobody
          // around" rather than "not connected".
          if (subscribeStatus === "CLOSED" && !wantOnlineRef.current) return;
          console.warn(
            `[onlineUsers] presence channel ${subscribeStatus}`,
            err?.message ?? ""
          );
          setPresenceUsers([]);
          if (wantOnlineRef.current) {
            setConnection("degraded");
            scheduleRejoin(uid);
          }
        });
    },
    [syncFromPresence, publishPosition, getPosition, scheduleRejoin]
  );

  useEffect(() => { joinRef.current = joinChannel; }, [joinChannel]);
  useEffect(() => { rejoinRef.current = scheduleRejoin; }, [scheduleRejoin]);

  // ─── Go online ───────────────────────────────────────────
  const goOnline = useCallback(async () => {
    if (!userId || channelRef.current) return;

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("[onlineUsers] location permission not granted — staying hidden");
        return;
      }

      const pos = await getPosition();

      // Load own profile name + level for the presence payload
      try {
        const [{ data: profile }, { data: xp }] = await Promise.all([
          supabase.from("profiles").select("name, avatar").eq("id", userId).single(),
          supabase.from("user_xp").select("level").eq("user_id", userId).single(),
        ]);
        profileRef.current = {
          name: profile?.name ?? "Driver",
          level: xp?.level ?? 1,
          avatar: profile?.avatar ?? undefined,
        };
      } catch {
        // Defaults stay
      }

      wantOnlineRef.current = true;
      rejoinAttemptRef.current = 0;
      setIsOnline(true);

      joinChannel(userId);

      // Publish once immediately over HTTP too, so this driver is findable by
      // the fallback path before the socket has finished joining (and even if
      // it never does).
      publishPosition(userId, pos);
      fetchDirectory(userId);

      // Periodically re-broadcast own location
      locationIntervalRef.current = setInterval(async () => {
        try {
          const next = await getPosition();
          await publishPosition(userId, next);
        } catch (e) {
          console.warn("[onlineUsers] position broadcast failed:", (e as Error)?.message ?? e);
        }
      }, LOCATION_BROADCAST_MS);

      // ...and periodically sweep for drivers the socket didn't tell us about.
      directoryIntervalRef.current = setInterval(() => {
        fetchDirectory(userId);
      }, DIRECTORY_POLL_MS);
    } catch (e) {
      console.warn("[onlineUsers] goOnline failed:", (e as Error)?.message ?? e);
    }
  }, [userId, getPosition, publishPosition, joinChannel, fetchDirectory]);

  // ─── Go offline: cleanup ─────────────────────────────────
  const goOffline = useCallback(async () => {
    // Set first: the rejoin timer and the AppState listener both read it, and
    // neither should drag us back onto the map after this point.
    wantOnlineRef.current = false;
    rejoinAttemptRef.current = 0;

    if (rejoinTimerRef.current) {
      clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    if (directoryIntervalRef.current) {
      clearInterval(directoryIntervalRef.current);
      directoryIntervalRef.current = null;
    }

    if (channelRef.current) {
      try {
        // `untrack` resolves with a status rather than throwing — same as
        // `track()` in `publishPosition`, and the same failure this file
        // already treats seriously there: a channel that answers "timed
        // out" here means the leave never reached the server, and other
        // devices' presence state keeps this driver until their own
        // `fetchDirectory` sweep prunes them via the recently-offline check
        // above. Logged so a stuck "visible after going offline" report has
        // something to point at instead of silence.
        const status = await channelRef.current.untrack();
        if (status !== "ok") {
          console.warn(`[onlineUsers] untrack returned "${status}" on going offline`);
        }
      } catch (e) {
        console.warn("[onlineUsers] untrack threw on going offline:", (e as Error)?.message ?? e);
      }
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (userId) {
      try {
        const { error } = await supabase
          .from("user_locations")
          .update({ is_online: false })
          .eq("user_id", userId);
        if (error) {
          // The other half of "still visible after going offline": if this
          // write fails, every other device's fallback sweep still finds
          // `is_online: true` and keeps showing this driver.
          console.warn("[onlineUsers] is_online=false update failed:", error.message);
        }
      } catch (e) {
        console.warn("[onlineUsers] is_online=false update threw:", (e as Error)?.message ?? e);
      }
    }

    // Going invisible clears your signal — you can't ask for help from a
    // map you've stepped off, and a stale "SOS" left hanging would mislead.
    problemRef.current = null;
    setMyProblem(null);
    setIsOnline(false);
    setConnection("offline");
    setPresenceUsers([]);
    setDirectoryUsers([]);
  }, [userId]);

  // ─── Raise / clear my own problem signal ─────────────────
  //
  // A signal rides the same presence payload as position, so every driver
  // on the map — convoy-mate or stranger — sees it the instant it's raised,
  // with no extra channel or DB round-trip. Raising one also brings you onto
  // the map if you were hidden: a problem nobody can see helps nobody.
  const raiseProblem = useCallback(
    async (type: ProblemType) => {
      const signal: ProblemSignal = { type, since: new Date().toISOString() };
      problemRef.current = signal;
      setMyProblem(signal);

      if (!channelRef.current) {
        // goOnline's first publish reads problemRef, so the signal goes out
        // with the very first position it broadcasts.
        await goOnline();
        return;
      }
      if (!userId) return;
      try {
        const pos = await getPosition();
        await publishPosition(userId, pos);
      } catch {
        // The next interval tick will carry the flag regardless.
      }
    },
    [userId, getPosition, publishPosition, goOnline]
  );

  const clearProblem = useCallback(async () => {
    problemRef.current = null;
    setMyProblem(null);
    if (!channelRef.current || !userId) return;
    try {
      const pos = await getPosition();
      await publishPosition(userId, pos);
    } catch {
      // Silent — the next tick broadcasts the cleared state.
    }
  }, [userId, getPosition, publishPosition]);

  /** Re-read both paths now — for a manual retry from the map. */
  const refresh = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || !wantOnlineRef.current) return;
    await fetchDirectory(uid);
    const channel = channelRef.current;
    if (!channel || String(channel.state) !== "joined") {
      rejoinAttemptRef.current = 0;
      joinRef.current(uid);
      return;
    }
    syncFromPresence(uid);
    try {
      await publishPosition(uid, await getPosition());
    } catch {
      // The interval tick will carry it.
    }
  }, [fetchDirectory, syncFromPresence, publishPosition, getPosition]);

  // ─── Recover on foreground ───────────────────────────────
  // A backgrounded phone loses the websocket and stops the intervals, and
  // nothing woke either back up: coming back to the app showed a map that
  // had quietly stopped updating in both directions.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (!wantOnlineRef.current) return;
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // ─── Cleanup on unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      wantOnlineRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
      if (directoryIntervalRef.current) clearInterval(directoryIntervalRef.current);
      if (rejoinTimerRef.current) clearTimeout(rejoinTimerRef.current);
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
    /** Live-map health — see `PresenceConnection`. */
    connection,
    goOnline,
    goOffline,
    refresh,
    /** My own active problem signal, or null. */
    myProblem,
    raiseProblem,
    clearProblem,
  };
});
