/**
 * Two devices parked next to each other used to show each other nothing: the
 * map's only source of other drivers was a websocket, and a websocket that
 * never joins looks exactly like an empty road. The fix gives the map a
 * second, HTTP source — and the moment there are two sources, the interesting
 * bug moves into how they are folded together. These assertions pin that fold:
 * no driver twice, no ghosts, and never a step backwards in time.
 */

import { describe, expect, it } from "bun:test";
import {
  STALE_AFTER_MS,
  isFresh,
  mergeOnlineUsers,
  pruneRecentlyOffline,
  type OnlineUser,
} from "@/hooks/onlineUsersMerge";

const NOW = Date.parse("2026-07-27T05:55:00.000Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const driver = (over: Partial<OnlineUser> & { user_id: string }): OnlineUser => ({
  name: "Rayhan",
  level: 2,
  latitude: -6.2,
  longitude: 106.8,
  heading: 0,
  updated_at: at(0),
  ...over,
});

describe("isFresh", () => {
  it("accepts a position from a moment ago", () => {
    expect(isFresh(at(2000), NOW)).toBe(true);
  });

  it("rejects a position past the stale window", () => {
    expect(isFresh(at(STALE_AFTER_MS + 1), NOW)).toBe(false);
  });

  it("rejects a missing or unparseable timestamp rather than trusting it", () => {
    expect(isFresh(undefined, NOW)).toBe(false);
    expect(isFresh(null, NOW)).toBe(false);
    expect(isFresh("not a date", NOW)).toBe(false);
  });
});

describe("mergeOnlineUsers", () => {
  it("shows a driver who only came in over the fallback path", () => {
    // The whole point of the second path: presence is dead, the other device
    // is still writing to user_locations, and it still lands on the map.
    const merged = mergeOnlineUsers(
      [],
      [driver({ user_id: "farel", name: "Farel", level: 7, source: "directory" })],
      NOW
    );
    expect(merged.map((u) => u.user_id)).toEqual(["farel"]);
    expect(merged[0].name).toBe("Farel");
  });

  it("lists a driver once when both paths carry them", () => {
    const merged = mergeOnlineUsers(
      [driver({ user_id: "farel", updated_at: at(1000), source: "presence" })],
      [driver({ user_id: "farel", updated_at: at(9000), source: "directory" })],
      NOW
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("presence");
  });

  it("keeps the newer position when the polled row is ahead of presence", () => {
    // Right after a rejoin the presence payload can be the older of the two;
    // preferring presence blindly would snap the marker backwards.
    const merged = mergeOnlineUsers(
      [driver({ user_id: "farel", updated_at: at(30_000), latitude: 1, source: "presence" })],
      [driver({ user_id: "farel", updated_at: at(1000), latitude: 2, source: "directory" })],
      NOW
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].latitude).toBe(2);
  });

  it("drops ghosts from both paths", () => {
    const merged = mergeOnlineUsers(
      [driver({ user_id: "killed-app", updated_at: at(STALE_AFTER_MS + 5000) })],
      [driver({ user_id: "stale-row", updated_at: at(STALE_AFTER_MS + 5000) })],
      NOW
    );
    expect(merged).toEqual([]);
  });

  it("keeps a live problem signal attached through the merge", () => {
    const merged = mergeOnlineUsers(
      [],
      [
        driver({
          user_id: "farel",
          problem: { type: "sos", since: at(60_000) },
          source: "directory",
        }),
      ],
      NOW
    );
    expect(merged[0].problem?.type).toBe("sos");
  });

  it("returns every distinct driver across the two paths", () => {
    const merged = mergeOnlineUsers(
      [driver({ user_id: "a" })],
      [driver({ user_id: "b" }), driver({ user_id: "c" })],
      NOW
    );
    expect(merged.map((u) => u.user_id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("pruneRecentlyOffline", () => {
  // This is the bug report the function exists for: user A turns visibility
  // off, `untrack()` on their device times out (the same failure category
  // `publishPosition`'s `track()` already guards), and A's last-tracked
  // presence entry is still "fresh" by timestamp — so `mergeOnlineUsers`
  // alone would keep showing A on every other driver's map with no error
  // anywhere. `user_locations.is_online: false` is the one signal that
  // survives that failure, and this is what makes it override presence.
  it("drops a driver whose user_locations row just said is_online: false", () => {
    const presence = [driver({ user_id: "a" }), driver({ user_id: "b" })];
    const pruned = pruneRecentlyOffline(presence, ["a"]);
    expect(pruned.map((u) => u.user_id)).toEqual(["b"]);
  });

  it("is a no-op when nobody recently went offline", () => {
    const presence = [driver({ user_id: "a" }), driver({ user_id: "b" })];
    expect(pruneRecentlyOffline(presence, [])).toEqual(presence);
  });

  it("accepts a Set as well as an array of ids", () => {
    const presence = [driver({ user_id: "a" }), driver({ user_id: "b" })];
    const pruned = pruneRecentlyOffline(presence, new Set(["b"]));
    expect(pruned.map((u) => u.user_id)).toEqual(["a"]);
  });

  it("does not touch presence when the offline id isn't in it", () => {
    const presence = [driver({ user_id: "a" })];
    expect(pruneRecentlyOffline(presence, ["someone-else"])).toEqual(presence);
  });
});
