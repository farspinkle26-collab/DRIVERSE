/**
 * Driveverse — a number that eases toward each new reading instead of
 * jumping. See `hooks/useGlideLatLng.ts` for the position equivalent and
 * `lib/glide.ts`'s header for why this exists at all.
 *
 * Used for the live speedometer (raw km/h arrives once per GPS tick, ~1s
 * apart, and a car's speedometer doesn't visibly step once a second) and
 * for this driver's own marker heading (`lerpHeadingDeg`, so the rotation
 * takes the shorter arc rather than spinning the long way round).
 *
 * `interpolate` defaults to plain `lerp`; pass `lerpHeadingDeg` for an
 * angle. It is not a hook dependency — pass a stable, module-level function
 * reference (not one defined inline in a render), the same constraint
 * `useCallback`/`useEffect` deps already put on any function passed this
 * way elsewhere in the app.
 */
import { useEffect, useRef, useState } from "react";
import { easeOutCubic, lerp } from "@/lib/glide";

export function useGlideNumber(
  target: number,
  durationMs: number,
  interpolate: (from: number, to: number, t: number) => number = lerp
): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const initializedRef = useRef(false);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    const to = target;
    const from = displayRef.current;

    if (!initializedRef.current) {
      initializedRef.current = true;
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
      setDisplay(interpolate(from, to, easeOutCubic(t)));
      raf = requestAnimationFrame(tick);
    });

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}
