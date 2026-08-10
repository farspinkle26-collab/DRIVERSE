/**
 * Driveverse — the share card's car spec line.
 *
 * Split out of `components/ShareableCard.tsx` on the same principle as
 * `lib/tripEndpoints.ts`: what reaches a card a driver posts publicly is worth
 * testing on its own, away from React. `tripEndpoints` keeps field names
 * ("Current Location", "Dropped Pin") off the card; this keeps the garage's
 * *placeholder* values off it.
 */

/**
 * Values the garage stores that mean "not answered", not a real spec.
 *
 * `Other` is the one that matters: it is a literal entry in `CAR_MAKES` in
 * `app/customize-profile.tsx`, so a driver whose make is not on the list picks
 * it and types the real car into `model`. Joining the two then produced
 * "Other VINFAST VF 6" on a card meant to show off the car — the placeholder
 * printed as though it were the marque.
 *
 * Matched case-insensitively against each field on its own. The old check
 * compared the *joined* make+model string to "custom", which only ever caught
 * a car whose entire make-and-model was the single word "Custom".
 */
const PLACEHOLDER_VALUES = new Set([
  "other",
  "custom",
  "unknown",
  "n/a",
  "na",
  "none",
  "-",
  "—",
]);

/** True for a field that is empty or one of the garage's placeholder values. */
export function isPlaceholderSpec(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_VALUES.has(trimmed.toLowerCase());
}

export interface CarSpecInput {
  make?: string | null;
  model?: string | null;
  year?: string | null;
  hp?: number | null;
}

/**
 * The card's spec line, as parts to join with " · ".
 *
 * Returns `[]` when the garage knows nothing real — the caller renders no line
 * at all rather than an empty separator run. A car entered as just a name
 * stays just a name, which is the point: boilerplate on a share card is what
 * makes it look templated.
 */
export function carSpecParts(car: CarSpecInput): string[] {
  const makeModel = [car.make, car.model]
    .filter((part) => !isPlaceholderSpec(part))
    .map((part) => (part as string).trim())
    .join(" ")
    .trim();

  const year = isPlaceholderSpec(car.year) ? "" : String(car.year).trim();
  const hp = car.hp && car.hp > 0 ? `${Math.round(car.hp)} HP` : "";

  return [makeModel, year, hp].filter((part) => part.length > 0);
}
