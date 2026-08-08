/**
 * Driveverse — synthetic drivers for promo capture. TEMPORARY.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  THIS IS SCAFFOLDING. IT IS MEANT TO BE DELETED.
 *  Delete this file, its test, and the one block in `hooks/useOnlineUsers.ts`
 *  that calls `withDemoDrivers`. Nothing else references it.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WHY THIS IS CLIENT-SIDE AND NOT ROWS IN THE DATABASE
 *
 * The obvious way to populate the map for a screenshot is to insert fake
 * profiles and `user_locations` rows. Don't. Those rows are visible to every
 * real driver who opens the app, which turns a marketing prop into fake
 * people on strangers' maps — a driver could tap one, try to message it, or
 * count on it being someone nearby. It is also a cleanup job on live data,
 * against the exact tables presence reads, with no undo.
 *
 * This layer is drawn on ONE device, in memory, after the real merge. Nothing
 * is written anywhere, no other user can see it, and turning it off is a
 * boolean. The recording looks identical either way.
 *
 * HOW TO USE IT
 *   1. Set DEMO_DRIVERS_ENABLED to true.
 *   2. Run the app, record your video / take your screenshots.
 *   3. Set it back to false.
 *
 * `lib/__tests__/demoDrivers.test.ts` asserts the flag is false, so a build
 * with it left on fails CI rather than reaching a store listing. That test
 * failing is the guard working — flip the flag back, don't edit the test.
 */

import type { OnlineUser } from "@/hooks/onlineUsersMerge";

/**
 * OFF. See the header. Flip to true only while capturing, and put it back.
 * Leaving this on ships imaginary people to real users.
 */
export const DEMO_DRIVERS_ENABLED = false;

/** How many wander around you. Enough to look alive, not like a crowd. */
const DEMO_COUNT = 7;

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
 * The cast. Names are ordinary given names in the app's launch market rather
 * than "Test User 1" — the whole point is that a viewer cannot pick these out
 * of a real list.
 *
 * No avatar URLs, on purpose: a real photo would be someone's actual face
 * used without their say-so, and a generated one is a face that does not
 * exist being passed off as a driver. The letter-tile fallback is what a
 * large share of genuine accounts render as anyway, so it is both the honest
 * option and the realistic one.
 */
const CAST: { name: string; level: number }[] = [
  { name: "Rizky", level: 12 },
  { name: "Bagas P.", level: 4 },
  { name: "Nadia", level: 27 },
  { name: "Fajar", level: 8 },
  { name: "Dimas A.", level: 19 },
  { name: "Yoga", level: 3 },
  { name: "Putri", level: 33 },
  { name: "Arif", level: 15 },
  { name: "Sena", level: 6 },
];

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
 * a wandering, non-repeating-looking path that still never leaves the area —
 * close enough to "driving around the neighbourhood" at a glance, which is
 * all a marker on a map has to sell.
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
   * wherever they are, which is the property the test pins.
   *
   * 5–13 m/s is 18–47 km/h: city driving.
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
 */
export function demoDrivers(
  centre: DemoCentre,
  nowMs: number = Date.now()
): OnlineUser[] {
  const t = nowMs / 1000;
  const updated_at = new Date(nowMs).toISOString();

  return Array.from({ length: DEMO_COUNT }, (_, i) => {
    const person = CAST[i % CAST.length];
    const here = offsetAt(i, t);
    // Heading from where they were a second ago, so the car marker points the
    // way it is travelling instead of sitting at a fixed angle.
    const before = offsetAt(i, t - 1);
    const heading =
      (Math.atan2(here.east - before.east, here.north - before.north) * 180) /
        Math.PI;

    return {
      // Namespaced so nothing can mistake one of these for a real user id,
      // and so a stray one is obvious in a log.
      user_id: `demo-driver-${i}`,
      name: person.name,
      level: person.level,
      ...offsetToLatLng(centre, here.east, here.north),
      heading: (heading + 360) % 360,
      updated_at,
      problem: null,
      source: "presence" as const,
    };
  });
}

/**
 * Fold the demo cast into the real list. A no-op — the same array, untouched —
 * whenever the flag is off or there is nowhere to centre them, which is what
 * keeps this from costing anything in a normal build.
 */
export function withDemoDrivers(
  real: OnlineUser[],
  centre: DemoCentre | null | undefined,
  nowMs: number = Date.now()
): OnlineUser[] {
  if (!DEMO_DRIVERS_ENABLED || !centre) return real;
  return [...real, ...demoDrivers(centre, nowMs)];
}
