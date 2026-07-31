/**
 * Driveverse — naming the two ends of a drive.
 *
 * A share card is a claim about where someone went. "Current Location →
 * Dropped Pin" is not that claim: those two strings are the *internal names
 * of the fields*, hardcoded at the three call sites that build a trip, and
 * they say nothing about the drive. They also lie by omission — the driver
 * did drop a pin somewhere real, we simply never asked what that somewhere
 * was called.
 *
 * So there are two halves to fixing it, and this file is the second one:
 *
 *   1. Resolve the names. The map reverse-geocodes a dropped pin (see
 *      `reverseGeocodePlace` in `lib/mapboxApi.ts`) and the start of a
 *      recording, so `origin_name` / `destination_name` carry a real place.
 *   2. Render whatever came back. That is what lives here, and it has to
 *      survive every case the first half can miss: no GPS fix, geocoder
 *      offline, no destination at all (a free drive), a `place_name` that is
 *      a four-line postal address, and the rows already in `trips` that were
 *      written with the old placeholder strings.
 *
 * The display fallback is **"Point A" / "Point B"**, not "Starting location /
 * Destination". Both were on the table; A→B wins because it reads as a
 * deliberate label for an unnamed leg (the way a map sketch or a route brief
 * labels one), while "Starting location → Destination" reads as UI chrome
 * that forgot to fill itself in — the same failure as the strings it
 * replaces, in longer words. A→B is also short enough to never wrap on the
 * card at any font scale.
 *
 * Nothing here touches the database. Placeholder-looking values are only
 * *displayed* differently; `trips.origin_name` keeps whatever was stored, so
 * this is safe to apply to historical rows.
 *
 * Pure and React-free, tested in `lib/__tests__/tripEndpoints.test.ts`.
 */

/** Longest endpoint label the card will render before truncating. */
export const ENDPOINT_LABEL_MAX = 30;

/** Shown in place of an origin we could not name. */
export const ORIGIN_FALLBACK = "Point A";
/** Shown in place of a destination we could not name. */
export const DESTINATION_FALLBACK = "Point B";

/** Title for a drive that never had a destination set. */
export const FREE_DRIVE_TITLE = "Free Drive";

/**
 * Values that are stored as a name but are not one. The first three are the
 * literals this change removes — they are still in every row written before
 * it, so the display rule has to keep recognising them. The rest are the
 * generic stand-ins the older screens fall back to.
 */
const PLACEHOLDER_NAMES = new Set([
  "",
  "unknown",
  "current location",
  "dropped pin",
  "dropped location",
  "unknown origin",
  "unknown destination",
  "start",
  "finish",
  "null",
  "undefined",
]);

/**
 * True when a stored name carries no information about the place — either
 * empty, or one of the placeholders above.
 */
export function isPlaceholderName(value: string | null | undefined): boolean {
  if (typeof value !== "string") return true;
  return PLACEHOLDER_NAMES.has(value.trim().toLowerCase());
}

/**
 * Reduce a geocoder result to something that fits on one line of a card.
 *
 * Mapbox returns `place_name` as a full comma-separated address — "Kopi
 * Nako, Jalan Bintaro Utama 3A, Tangerang Selatan, Banten 15224, Indonesia".
 * The first segment is the part a driver would actually say out loud, so
 * that is the label; everything after it is context the card has no room
 * for. A short first segment (a house number, "Jl") is meaningless on its
 * own, so those absorb the next segment instead.
 *
 * Returns `null` — not a fallback string — when there is nothing usable, so
 * callers can tell "no name" apart from "named Point B".
 */
export function shortPlaceLabel(
  place: string | null | undefined,
  max: number = ENDPOINT_LABEL_MAX
): string | null {
  if (typeof place !== "string") return null;
  const segments = place
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 0);
  if (segments.length === 0) return null;

  let label = segments[0];
  // "12" / "Jl" alone is not a place — pull in the street or district that
  // follows it, which is what makes an address-typed result readable.
  if (label.length <= 3 && segments.length > 1) {
    label = `${label} ${segments[1]}`;
  }
  if (isPlaceholderName(label)) return null;
  return truncateLabel(label, max);
}

/** Truncate on a word boundary where possible, with an ellipsis. */
function truncateLabel(label: string, max: number): string {
  if (max <= 1) return label.slice(0, Math.max(0, max));
  if (label.length <= max) return label;
  const hard = label.slice(0, max - 1);
  const lastSpace = hard.lastIndexOf(" ");
  // Only break on a space if it leaves most of the label intact, otherwise a
  // long single word would collapse to almost nothing.
  const body = lastSpace >= Math.floor(max * 0.6) ? hard.slice(0, lastSpace) : hard;
  return `${body.trimEnd()}…`;
}

/**
 * A coordinate pair as a last-resort *stored* name, e.g. "-6.2601, 106.781".
 * This is what goes to the database when the geocoder gave us nothing: it is
 * worse than a place name but far better than "Unknown", because it can be
 * resolved later. The card never shows it — {@link endpointLabels} treats it
 * as unnamed and renders Point A / Point B instead.
 */
export function coordinateLabel(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): string | null {
  if (!Number.isFinite(latitude as number) || !Number.isFinite(longitude as number)) {
    return null;
  }
  return `${(latitude as number).toFixed(4)}, ${(longitude as number).toFixed(4)}`;
}

/** A stored name that is only a coordinate pair, not a place. */
function isCoordinateName(value: string): boolean {
  return /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(value.trim());
}

export interface EndpointLabels {
  origin: string;
  destination: string;
}

/**
 * The pair of labels the share card draws under the title. Always two
 * non-empty strings: a real place where we have one, Point A / Point B where
 * we do not.
 */
export function endpointLabels(trip: {
  origin_name?: string | null;
  destination_name?: string | null;
}): EndpointLabels {
  return {
    origin: displayName(trip.origin_name) ?? ORIGIN_FALLBACK,
    destination: displayName(trip.destination_name) ?? DESTINATION_FALLBACK,
  };
}

/**
 * A stored name as it should appear to a driver, or `null` if it should not
 * appear at all (placeholder, coordinates, empty).
 */
export function displayName(value: string | null | undefined): string | null {
  if (isPlaceholderName(value)) return null;
  const trimmed = (value as string).replace(/\s+/g, " ").trim();
  if (isCoordinateName(trimmed)) return null;
  return truncateLabel(trimmed, ENDPOINT_LABEL_MAX);
}

/**
 * The card's headline. The destination is the story of a drive, so it wins;
 * an explicitly saved trip name wins over that. A drive with neither is a
 * free drive, and says so rather than titling itself after a placeholder.
 *
 * Deliberately not `tripTitle` from `components/TripCard` — that one falls
 * back to the raw stored strings, which is exactly what put "Dropped Pin" at
 * 30pt across the top of the share card.
 */
export function shareTripTitle(trip: {
  name?: string | null;
  origin_name?: string | null;
  destination_name?: string | null;
}): string {
  const named = typeof trip.name === "string" ? trip.name.trim() : "";
  if (named) return truncateLabel(named.replace(/\s+/g, " "), ENDPOINT_LABEL_MAX);
  return displayName(trip.destination_name) ?? displayName(trip.origin_name) ?? FREE_DRIVE_TITLE;
}
