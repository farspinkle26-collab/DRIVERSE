/**
 * Driveverse — a position that eases toward each new fix instead of jumping.
 *
 * See `lib/glide.ts`'s header for why this exists at all: GPS fixes and
 * other-driver broadcasts both arrive as discrete, spaced-out samples, and
 * feeding each one straight into a marker's `coordinate` reads as stutter.
 * This returns a `{latitude, longitude}` that glides from wherever it
 * currently is to `target` over `durationMs`, using its own
 * `requestAnimationFrame` loop that runs only while actually interpolating.
 *
 * WHY A DISTANCE THRESHOLD, NOT ALWAYS-GLIDE
 *   Not every change in `target` is real movement. The very first fix a
 *   driver ever gets, a driver reappearing after being offline, a GPS
 *   reacquisition after a tunnel — all of these are legitimate teleports,
 *   and gliding across them would look like a fast, fake "flight" across
 *   the map instead of the snap they actually are. `snapThresholdMeters` is
 *   the line: farther than that in one update and this snaps instead of
 *   easing. The very first target this hook ever sees always snaps too,
 *   regardless of distance — there is nowhere real to glide from yet.
 */
import { useEffect, useRef, useState } from "react";
import { easeOutCubic, lerpLatLng } from "@/lib/glide";
import { haversineMeters, type LatLng } from "@/lib/tripGeoStats";

export function useGlideLatLng(
  target: LatLng,
  durationMs: number,
  snapThresholdMeters: number
): LatLng {
  const [display, setDisplay] = useState<LatLng>(target);
  const displayRef = useRef<LatLng>(target);
  const initializedRef = useRef(false);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  const { latitude, longitude } = target;

  useEffect(() => {
    const to: LatLng = { latitude, longitude };
    const from = displayRef.current;
    const shouldSnap =
      !initializedRef.current || haversineMeters(from, to) > snapThresholdMeters;
    initializedRef.current = true;

    if (shouldSnap) {
      setDisplay(to);
      return;
    }

    const start = Date.now();
    let raf: number | null = requestAnimationFrame(function tick() {
      const t = durationMs > 0 ? (Date.now() - start) / durationMs : 1;
      if (t >= 1) {
        setDisplay(to);
        raf = null;
        return;
      }
      setDisplay(lerpLatLng(from, to, easeOutCubic(t)));
      raf = requestAnimationFrame(tick);
    });

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
    // `from` is a snapshot of displayRef at the moment `target` changed —
    // deliberately not a dependency, and `latitude`/`longitude` (not
    // `target`) so a same-value re-render doesn't restart the glide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude, durationMs, snapThresholdMeters]);

  return display;
}
