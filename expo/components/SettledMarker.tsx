import React, { useEffect, useState } from "react";
import { Marker } from "react-native-maps";

/**
 * A `react-native-maps` Marker whose Android bitmap is frozen only once its
 * contents have finished drawing.
 *
 * WHY THIS EXISTS
 *   Android does not render a custom marker's React view live on the map. It
 *   rasterises the view into a bitmap and draws that. `tracksViewChanges`
 *   controls whether it keeps re-rasterising; leaving it on permanently is a
 *   real cost, because every marker re-snapshots on every frame.
 *
 *   The trap is the other end: `tracksViewChanges={false}` set as a *constant*
 *   freezes the bitmap on the very first frame — before `react-native-svg` has
 *   drawn the glyph inside the badge and before the name/distance text has
 *   laid out. The snapshot then contains an empty badge, a half-height icon,
 *   or nothing at all, and because tracking never turns back on it stays that
 *   way for the life of the marker. That is the "icons cropped to half size"
 *   bug in MAP_SCREEN_REFERENCE D-5, and a static `false` reintroduces it in
 *   its worst form: markers that are present, tappable and invisible.
 *
 *   So: track until `ready` is true AND `settleKey` has held still for a
 *   grace period, then freeze. Any change to either re-arms tracking, which
 *   is what covers select/deselect and a distance label ticking over.
 *
 * `settleKey` should be every visible property of the marker, joined. If it
 * does not change when the marker's appearance changes, the frozen bitmap
 * will show the old appearance.
 */
const MARKER_SETTLE_MS = 600;

export type SettledMarkerProps = React.ComponentProps<typeof Marker> & {
  /** Changes whenever the marker's appearance changes; re-arms tracking. */
  settleKey: string;
  /** False while async content (a network image) is still loading. */
  ready?: boolean;
};

export function SettledMarker({ settleKey, ready = true, children, ...markerProps }: SettledMarkerProps) {
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    if (!ready) return;
    const t = setTimeout(() => setTracking(false), MARKER_SETTLE_MS);
    return () => clearTimeout(t);
  }, [settleKey, ready]);

  return (
    <Marker {...markerProps} tracksViewChanges={tracking}>
      {children}
    </Marker>
  );
}

export default SettledMarker;
