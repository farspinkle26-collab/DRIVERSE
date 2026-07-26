/**
 * Driveverse Platinum — cosmetic catalogue.
 *
 * Two sets, both Platinum-exclusive:
 *   • vehicle icons — the compact car mark used in garage rows and trip cards
 *   • profile frames — the ring drawn around an avatar
 *
 * DESIGN RULE
 *   These are not recoloured defaults. A chrome version of the same glyph is
 *   the cheapest possible "premium" and reads as one, so each premium icon is
 *   a different silhouette (a different body type, drawn in the same stroke
 *   language) and each frame is a different piece of angular framing built
 *   from the app's 45° cut vocabulary. The chrome tone is what says
 *   "Platinum"; the shape is what makes it worth having.
 *
 * ENTITLEMENT
 *   A stored selection is not an entitlement. `profiles.vehicle_icon` and
 *   `profiles.profile_frame` keep whatever the driver picked even after a
 *   subscription lapses; the renderers fall back to the default set while
 *   `isPlatinum` is false, and the choice comes back intact on resubscribe.
 *
 * The drawing itself lives in `components/platinum/PremiumVehicleIcon.tsx`
 * and `components/platinum/ProfileFrame.tsx`; this file is the catalogue so
 * a picker can enumerate options without importing every SVG.
 */

/* ------------------------------------------------------------------ *
 * Vehicle icons
 * ------------------------------------------------------------------ */

export type VehicleIconId =
  /** The app's existing lucide `Car`. Available to everyone. */
  | "default"
  | "coupe"
  | "widebody"
  | "hatch"
  | "suv";

export interface VehicleIconOption {
  id: VehicleIconId;
  label: string;
  /** One line, shown under the swatch in the picker. */
  note: string;
  platinum: boolean;
}

export const VEHICLE_ICONS: VehicleIconOption[] = [
  {
    id: "default",
    label: "Standard",
    note: "The default mark.",
    platinum: false,
  },
  {
    id: "coupe",
    label: "Coupe",
    note: "Long nose, fast roofline.",
    platinum: true,
  },
  {
    id: "widebody",
    label: "Widebody",
    note: "Flared arches, low stance.",
    platinum: true,
  },
  {
    id: "hatch",
    label: "Hatch",
    note: "Short deck, upright tail.",
    platinum: true,
  },
  {
    id: "suv",
    label: "SUV",
    note: "High roof, long wheelbase.",
    platinum: true,
  },
];

export const DEFAULT_VEHICLE_ICON: VehicleIconId = "default";

/* ------------------------------------------------------------------ *
 * Profile frames
 * ------------------------------------------------------------------ */

export type ProfileFrameId =
  /** The existing plain avatar ring. Available to everyone. */
  | "default"
  | "apex"
  | "caliper"
  | "telemetry"
  | "grid";

export interface ProfileFrameOption {
  id: ProfileFrameId;
  label: string;
  note: string;
  platinum: boolean;
}

export const PROFILE_FRAMES: ProfileFrameOption[] = [
  {
    id: "default",
    label: "Standard",
    note: "The default ring.",
    platinum: false,
  },
  {
    id: "apex",
    label: "Apex",
    note: "Four corner cuts, machined.",
    platinum: true,
  },
  {
    id: "caliper",
    label: "Caliper",
    note: "Opposed brackets, top and bottom.",
    platinum: true,
  },
  {
    id: "telemetry",
    label: "Telemetry",
    note: "Ticked bezel, like a gauge face.",
    platinum: true,
  },
  {
    id: "grid",
    label: "Grid",
    note: "Segmented ring, start-line spacing.",
    platinum: true,
  },
];

export const DEFAULT_PROFILE_FRAME: ProfileFrameId = "default";

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

/**
 * The icon a driver should actually be drawn with. A Platinum-only selection
 * held by a lapsed subscriber resolves back to the default without the stored
 * value being destroyed.
 */
export function resolveVehicleIcon(
  selected: string | null | undefined,
  isPlatinum: boolean
): VehicleIconId {
  const option = VEHICLE_ICONS.find((i) => i.id === selected);
  if (!option) return DEFAULT_VEHICLE_ICON;
  if (option.platinum && !isPlatinum) return DEFAULT_VEHICLE_ICON;
  return option.id;
}

/** Same rule as {@link resolveVehicleIcon}, for frames. */
export function resolveProfileFrame(
  selected: string | null | undefined,
  isPlatinum: boolean
): ProfileFrameId {
  const option = PROFILE_FRAMES.find((f) => f.id === selected);
  if (!option) return DEFAULT_PROFILE_FRAME;
  if (option.platinum && !isPlatinum) return DEFAULT_PROFILE_FRAME;
  return option.id;
}
