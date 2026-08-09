/**
 * Driveverse — synthetic drivers for promo capture. TEMPORARY.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠️  THIS IS CURRENTLY **ON**. IT SHIPS FAKE DRIVERS TO WHOEVER RUNS THE
 *      BUILD. Turn DEMO_DRIVERS_ENABLED off before any store upload.
 *
 *  Scaffolding, meant to be deleted: remove this file, its test,
 *  `assets/images/demo/`, and the two blocks marked `TEMPORARY: promo
 *  capture` in `app/(tabs)/map.tsx`. Nothing else references it.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WHY THIS IS CLIENT-SIDE AND NOT ROWS IN THE DATABASE
 *
 * Inserting fake profiles and `user_locations` rows would put imaginary
 * people on every real driver's map — tappable, messageable, counted as
 * someone nearby — and leave a cleanup job on live data against the exact
 * tables presence reads. This layer is drawn on ONE device, in memory, at the
 * render site. Nothing is written anywhere and turning it off is a boolean.
 *
 * BECAUSE THESE DRIVERS DO NOT EXIST IN THE DATABASE, every action the driver
 * sheet offers would fail against them — the `demo-driver-N` ids satisfy no
 * foreign key. `isDemoDriver` is what the map uses to answer those locally
 * instead (see `handleAskMeetupFromMap`), so tapping "Ask a meetup" on the
 * footage behaves exactly like it does on a real driver.
 *
 * WHY THE CENTRE IS THE MAP'S `userLocation`
 *
 * The first version hung it off `publishPosition()` in `useOnlineUsers`, which
 * only runs while broadcasting. With VISIBILITY OFF — the state the app opens
 * in — nothing appeared. `app/(tabs)/map.tsx` holds `userLocation` from its
 * own watcher, filled whether or not you are sharing.
 */

export type { OnlineUser } from "@/hooks/onlineUsersMerge";
import type { OnlineUser } from "@/hooks/onlineUsersMerge";

/**
 * ON. Set to false before shipping. See the banner above.
 */
export const DEMO_DRIVERS_ENABLED = true;

/**
 * Ids are namespaced so a demo driver is never mistaken for a real one — by
 * the code, or by someone reading a log.
 */
const DEMO_ID_PREFIX = "demo-driver-";

/** True for a synthetic driver. Used to answer sheet actions locally. */
export function isDemoDriver(userId: string | null | undefined): boolean {
  return typeof userId === "string" && userId.startsWith(DEMO_ID_PREFIX);
}

/**
 * Metres from you. Spread deliberately: a couple close enough to read as
 * "on my street", the rest at the edge of a city-block view, because real
 * drivers are never all at the same distance.
 */
const MIN_RADIUS_M = 120;
const MAX_RADIUS_M = 900;

const METRES_PER_DEG_LAT = 111_320;

export interface DemoCentre {
  latitude: number;
  longitude: number;
}

/**
 * Photo avatars for the cast.
 *
 * DELIBERATELY NOT EVERYONE — a set where every driver has a portrait reads
 * as a stock-photo grid, not as an app. Three of the seven carry one; the
 * rest fall back to the letter tile the marker already draws, which is what a
 * large share of genuine accounts look like.
 *
 * The files in `assets/images/demo/` are neutral placeholder tiles. Replace
 * them with the real portraits before capturing — same filenames, any square
 * image. Left unreplaced they render as a plain dark tile, which looks like
 * an ordinary empty avatar rather than a broken one.
 *
 * `require` is used rather than a URL so the images are bundled and load with
 * no network, and so a missing file fails the build loudly instead of leaving
 * a hole in the footage.
 */
const DEMO_AVATARS = [
  require("@/assets/images/demo/driver-1.png"),
  require("@/assets/images/demo/driver-2.png"),
  require("@/assets/images/demo/driver-3.png"),
] as const;

/**
 * The cast.
 *
 * Every name is distinct and every avatar slot is used at most once — a map
 * with two "Marcus"es, or the same face twice, is the single most obvious
 * tell there is. `demoDrivers.test.ts` pins both.
 *
 * Levels are spread 3–33 and weighted low, which is what a young app's
 * population actually looks like.
 */
const CAST: { name: string; level: number; avatarIndex?: number }[] = [
  { name: "Marcus", level: 12, avatarIndex: 0 },
  { name: "Ellie", level: 4 },
  { name: "Priya", level: 27, avatarIndex: 1 },
  { name: "Jonah", level: 8 },
  { name: "Tom H.", level: 19, avatarIndex: 2 },
  { name: "Sofia", level: 3 },
  { name: "Dean", level: 33 },
];

/** How many wander around you. Enough to look alive, not like a crowd. */
const DEMO_COUNT = CAST.length;

/**
 * A cheap deterministic hash, so every driver's orbit is stable across
 * renders. Without this they would jump to new places on every tick instead
 * of moving, which is the one thing that would give the whole layer away.
 */
function seeded(i: number, salt: number): number {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Where driver `i` is at time `t`.
 *
 * Two sine components at different periods rather than one, because a single
 * sine is a circle and nothing on a road moves in a circle. Summing two gives
 * a wandering, non-repeating-looking path that still never leaves the area.
 */
function offsetAt(i: number, tSeconds: number): { east: number; north: number } {
  const radius = MIN_RADIUS_M + seeded(i, 1) * (MAX_RADIUS_M - MIN_RADIUS_M);
  const phase = seeded(i, 2) * Math.PI * 2;
  const wobble = 0.25 + seeded(i, 4) * 0.35;

  /**
   * Angular speed is DERIVED FROM THE RADIUS, not picked independently.
   *
   * A fixed angular speed means the drivers on the wide orbits move fastest —
   * at 900 m and 0.15 rad/s that is 135 m/s, roughly 480 km/h. Fixing a target
   * *linear* speed and dividing by the radius keeps everyone at traffic pace
   * wherever they are. 5–13 m/s is 18–47 km/h: city driving.
   */
  const metresPerSecond = 5 + seeded(i, 3) * 8;
  const omega = metresPerSecond / radius;

  const a = phase + tSeconds * omega;
  const b = phase * 1.7 + tSeconds * omega * 0.43;

  return {
    east: radius * (Math.cos(a) + wobble * Math.cos(b)),
    north: radius * (Math.sin(a) + wobble * Math.sin(b * 1.3)),
  };
}

/** Metre offsets to a lat/lng, correcting longitude for latitude. */
function offsetToLatLng(
  centre: DemoCentre,
  east: number,
  north: number
): { latitude: number; longitude: number } {
  const latitude = centre.latitude + north / METRES_PER_DEG_LAT;
  const lngScale =
    METRES_PER_DEG_LAT * Math.cos((centre.latitude * Math.PI) / 180);
  const longitude =
    centre.longitude + east / (Math.abs(lngScale) < 1 ? 1 : lngScale);
  return { latitude, longitude };
}

/**
 * The synthetic drivers at a moment in time. Pure — same inputs, same output,
 * which is what makes the movement testable and the paths stable.
 *
 * `avatar` is typed `string` on `OnlineUser` because a real one is a URL from
 * storage; a bundled asset is a module id, which `<Image source={{ uri }}>`
 * does not take. The map resolves it — see `demoAvatarSource`.
 */
export function demoDrivers(
  centre: DemoCentre,
  nowMs: number = Date.now()
): OnlineUser[] {
  const t = nowMs / 1000;
  const updated_at = new Date(nowMs).toISOString();

  return Array.from({ length: DEMO_COUNT }, (_, i) => {
    const person = CAST[i];
    const here = offsetAt(i, t);
    // Heading from where they were a second ago, so the car marker points the
    // way it is travelling instead of sitting at a fixed angle.
    const before = offsetAt(i, t - 1);
    const heading =
      (Math.atan2(here.east - before.east, here.north - before.north) * 180) /
      Math.PI;

    return {
      user_id: `${DEMO_ID_PREFIX}${i}`,
      name: person.name,
      level: person.level,
      // A marker sentinel rather than a URL, resolved by `demoAvatarSource`.
      // Absent entirely for the cast members who carry no portrait, so the
      // existing `onlineUser.avatar ? … : letterTile` branch is what decides.
      avatar:
        person.avatarIndex === undefined
          ? undefined
          : `${DEMO_ID_PREFIX}avatar-${person.avatarIndex}`,
      ...offsetToLatLng(centre, here.east, here.north),
      heading: (heading + 360) % 360,
      updated_at,
      problem: null,
      source: "presence" as const,
    };
  });
}

/**
 * Turn an avatar value into something `<Image source>` accepts.
 *
 * Real drivers carry a URL and get `{ uri }`; the demo cast carries a
 * sentinel and gets the bundled module. Returns null when there is no avatar
 * at all, which is the caller's cue to draw the letter tile.
 */
export function demoAvatarSource(
  avatar: string | null | undefined
): { uri: string } | number | null {
  if (!avatar) return null;
  const prefix = `${DEMO_ID_PREFIX}avatar-`;
  if (!avatar.startsWith(prefix)) return { uri: avatar };
  const index = Number(avatar.slice(prefix.length));
  return DEMO_AVATARS[index] ?? null;
}

/**
 * Fold the demo cast into whatever the map is already showing. A no-op — the
 * same array, untouched — whenever the flag is off or there is nowhere to
 * centre them, which is what keeps this from costing anything once disabled.
 */
export function withDemoDrivers(
  real: OnlineUser[],
  centre: DemoCentre | null | undefined,
  nowMs: number = Date.now()
): OnlineUser[] {
  if (!DEMO_DRIVERS_ENABLED || !centre) return real;
  return [...real, ...demoDrivers(centre, nowMs)];
}
