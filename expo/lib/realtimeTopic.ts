/**
 * Driveverse — collision-free Supabase Realtime topic names.
 *
 * WHY THIS EXISTS
 *   `supabase.channel(topic)` does not always give you a new channel. In
 *   `@supabase/realtime-js`, it looks for an already-registered channel with
 *   the same topic and returns *that one* if it finds it:
 *
 *     const exists = this.getChannels().find((c) => c.topic === realtimeTopic)
 *     if (!exists) { …create… } else { return exists }
 *
 *   So two components that build the same topic string share one channel
 *   object. The second one then calls `.on("postgres_changes", …)` on a
 *   channel that has already joined, which the Realtime server rejects with
 *
 *     cannot add `postgres_changes` callbacks for realtime:<topic>
 *     after `subscribe()`
 *
 *   and whichever of the two unmounts first calls `removeChannel` and takes
 *   the other one's live updates down with it.
 *
 *   This is easy to walk into, because a topic keyed on "who is watching"
 *   rather than "what is being watched" is the natural thing to write, and it
 *   is correct right up until the same screen is on the stack twice. See
 *   `components/ProfileScreen.tsx`, which is mounted by both
 *   `app/(tabs)/profile.tsx` and `app/user/[id].tsx` — pushing a driver's
 *   profile over your own tab put two of them on screen at once.
 *
 * WHEN TO USE IT
 *   Any subscription owned by a *component instance* rather than by the app.
 *   A store mounted once in `app/_layout.tsx` (`useFriendRequestsStore`) does
 *   not need it and should not use it: a stable topic there is what lets a
 *   re-subscribe reuse the same channel.
 */

/**
 * Characters a topic may contain. The suffix comes from React's `useId`,
 * which is not a plain identifier — React 18 produced `:r1:` and React 19
 * produces `«r1»` — and neither belongs in a websocket topic that is already
 * namespaced with a `realtime:` prefix and split on `:` by some tooling.
 */
const UNSAFE = /[^A-Za-z0-9_-]+/g;

/**
 * Reduces an arbitrary id to something safe to embed in a topic.
 *
 * Returns `""` for input that is entirely unsafe, so callers can tell "no
 * usable suffix" from "a suffix of punctuation" — `instanceTopic` treats the
 * empty case as "no suffix" rather than emitting a trailing separator.
 */
export function sanitizeTopicPart(part: string | null | undefined): string {
  return (part ?? "").replace(UNSAFE, "");
}

/**
 * A topic unique to one mounted component instance.
 *
 *   instanceTopic("friends", user.id, useId())  // "friends_<uid>_r1"
 *
 * `base` is what the subscription is about and stays readable in the Realtime
 * dashboard; `instanceId` is what stops two live instances colliding. Parts
 * that sanitise to nothing are dropped rather than leaving `__` runs behind.
 */
export function instanceTopic(
  base: string,
  ...parts: (string | null | undefined)[]
): string {
  return [base, ...parts]
    .map(sanitizeTopicPart)
    .filter((part) => part.length > 0)
    .join("_");
}

/**
 * A `subscribe()` status callback that writes to the console and stops there.
 *
 * Pass one to **every** `.subscribe()`. `subscribe()` reports failure by
 * invoking its callback with `CHANNEL_ERROR` and an `Error`; with no callback
 * there is nowhere for that error to go, and the ones worth knowing about —
 * a rejected join, a topic misuse, RLS refusing the table — become either
 * silence or something that surfaces far from its cause.
 *
 * It deliberately does not retry, re-subscribe or set state. Everything these
 * subscriptions drive is a live-refresh nicety on top of data that was already
 * fetched over HTTP, so the correct behaviour when realtime fails is a stale
 * screen and a log line — never a crash, and never a reconnect loop competing
 * with the one `@supabase/realtime-js` already runs.
 */
export function logChannelStatus(status: string, err?: Error): void {
  if (status === "SUBSCRIBED") return;
  console.warn(`[realtime] ${status}`, err?.message ?? "");
}
