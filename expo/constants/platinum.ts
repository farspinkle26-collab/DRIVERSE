/**
 * Driveverse Platinum — tier configuration.
 *
 * The single place that answers "what does Platinum change?". Nothing in
 * here knows about RevenueCat, React, or navigation — it is data, so the
 * caps can be read from a hook, a store, an edge function test, or a
 * paywall row without any of them importing each other.
 *
 * ENTITLEMENT SOURCE OF TRUTH
 *   `customerInfo.entitlements.active["platinum"]` from the RevenueCat SDK.
 *   There is deliberately no `profiles.is_platinum` column that the client
 *   writes — a second flag drifts the moment a renewal fails, a refund
 *   lands, or a purchase is restored on another device. The database DOES
 *   carry a mirror (`platinum_subscribers`), but it is written only by
 *   RevenueCat's webhook and is used only for server-side enforcement in
 *   RLS/edge functions. See `database_migration_platinum.sql`.
 *
 * VISUAL IDENTITY
 *   Platinum is chrome, not red. `racingRed` is the brand's primary-action
 *   accent and it already carries "this is the thing to press"; painting a
 *   subscription tier in it would put two different meanings on one hue.
 *   The metallic ramp below is Platinum's own identity and is the ONLY
 *   place it is defined — badge, aura, frames and paywall all read from it.
 */

/* ------------------------------------------------------------------ *
 * Entitlement + product identifiers
 * ------------------------------------------------------------------ */

/** RevenueCat entitlement id. Must match the dashboard exactly. */
export const PLATINUM_ENTITLEMENT_ID = "platinum";

/**
 * RevenueCat offering id carrying the monthly and yearly packages. It is
 * also the offering the RevenueCat-hosted paywall is attached to.
 */
export const PLATINUM_OFFERING_ID = "platinum";

/**
 * Store product identifiers, registered in App Store Connect and Google
 * Play Console and attached to the offering above. Listed here for the
 * setup checklist in REVENUECAT_SETUP.md — runtime code never hardcodes
 * a product, it reads whatever the offering returns, so both stores' ids
 * flow onto the same paywall through the offering's packages, not through
 * anything here.
 *
 * iOS ids match the app's actual bundle id (`app.rork.driverse` — no "e"
 * before the "r", see `app.json`), not the "driveverse" spelling used
 * elsewhere in copy and code. Get this wrong in App Store Connect and the
 * product silently never matches what RevenueCat expects.
 *
 * Android ids are Google Play's `subscriptionId:basePlanId` form: one
 * subscription (`driverse_platinum`) carrying a monthly and an annual base
 * plan, which is what makes monthly→yearly a plan change rather than a
 * second concurrent subscription. RevenueCat surfaces each base plan as a
 * distinct product under that compound id.
 */
export const PLATINUM_PRODUCTS = {
  monthly: {
    ios: "driverse_monthly_10",
    android: "driverse_platinum:driverse-monthly-10",
  },
  yearly: {
    ios: "driverse_yearly_100",
    android: "driverse_platinum:driverse-yearly-100",
  },
} as const;

/**
 * The RevenueCat package identifiers the offering uses. These are RevenueCat's
 * own reserved ids for the Monthly / Annual slots — using them means
 * `packageType` comes back as MONTHLY / ANNUAL and the app never has to
 * pattern-match a product name. See `periodOf` in `lib/purchases.ts`.
 */
export const PLATINUM_PACKAGE_IDS = {
  monthly: "$rc_monthly",
  yearly: "$rc_annual",
} as const;

/**
 * Display-only fallback prices, used when the store hasn't answered yet
 * (offline, sandbox misconfiguration, or the native module is absent in
 * Expo Go). Real prices always come from `product.priceString`, which is
 * already localised and store-authoritative — never charge off these.
 */
export const PLATINUM_FALLBACK_PRICE = {
  monthly: "Rp 49.000",
  yearly: "Rp 449.000",
  /** Only used when the Test Store lifetime product is configured. */
  lifetime: "—",
} as const;

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

/**
 * The Platinum metallic ramp. Four steps, mirroring how `colors` in
 * `constants/theme.ts` stays deliberately small.
 *
 * `chrome` is the identity colour — the one the brief specified (#E8EAED-ish).
 * The other three exist so a badge can have a highlight, a shadow and a
 * low-opacity fill without anyone inventing a fifth grey inline.
 */
export const platinum = {
  /** Identity colour: badge face, aura ring, frame stroke, paywall accents. */
  chrome: "#E8EAED",
  /** Specular highlight on the badge's lit edge. */
  chromeLight: "#FFFFFF",
  /** Mid tone — secondary strokes, inactive cosmetic swatches. */
  chromeDim: "#A8ADB8",
  /** Shadowed facet of the badge, and hairlines on chrome surfaces. */
  chromeDeep: "#5C6270",
} as const;

/**
 * Foreground for content sitting on top of a solid `chrome` fill.
 * voidBlack-on-chrome is ~15:1 — the same black-on-light rule the theme
 * already uses for `onRacingRed`.
 */
export const onPlatinum = "#0B0C10";

/* ------------------------------------------------------------------ *
 * Tier limits
 * ------------------------------------------------------------------ */

/**
 * Every numeric cap Platinum lifts. `null` means unlimited.
 *
 * Adding a cap? Add it here first — `limitFor()` and the paywall rows both
 * derive from this object, so a new entry lands in the UI for free.
 */
export type LimitedFeature =
  | "garageCars"
  | "activeEvents"
  | "savedPlaces"
  | "convoyMembers"
  | "savedRoutes"
  | "aiShowcasesPerMonth";

export const TIER_LIMITS: Record<
  "regular" | "platinum",
  Record<LimitedFeature, number | null>
> = {
  regular: {
    /** Cars in the garage. */
    garageCars: 2,
    /** Events the driver has created that are still upcoming or active. */
    activeEvents: 1,
    /** Bookmarked cafes / gas stations / workshops / hangouts. */
    savedPlaces: 10,
    /** Convoy party size, including the organiser. */
    convoyMembers: 2,
    /**
     * Routes kept in the driver's library — the enforceable half of
     * "Route Discovery". See PLATINUM_REFERENCE.md §"Route Discovery".
     */
    savedRoutes: 10,
    /** Regular drivers have no access at all; the cap is moot. */
    aiShowcasesPerMonth: 0,
  },
  platinum: {
    garageCars: null,
    activeEvents: null,
    savedPlaces: null,
    convoyMembers: 8,
    savedRoutes: null,
    /**
     * Deliberately NOT unlimited. Each generation is a real per-image API
     * spend, so an uncapped perk is an uncapped bill. 5/month is generous
     * against observed garage sizes and keeps the worst case bounded.
     */
    aiShowcasesPerMonth: 5,
  },
};

/** The cap that applies to a driver, or `null` for unlimited. */
export function limitFor(
  feature: LimitedFeature,
  isPlatinum: boolean
): number | null {
  return TIER_LIMITS[isPlatinum ? "platinum" : "regular"][feature];
}

/** Whether one more of `feature` would exceed the driver's cap. */
export function isAtLimit(
  feature: LimitedFeature,
  current: number,
  isPlatinum: boolean
): boolean {
  const limit = limitFor(feature, isPlatinum);
  return limit !== null && current >= limit;
}

/* ------------------------------------------------------------------ *
 * Benefits catalogue
 * ------------------------------------------------------------------ */

/**
 * The nine benefits, in the order they appear on the paywall.
 *
 * `id` doubles as the paywall's contextual trigger: a friction point calls
 * `openPaywall("garage")` and that row is pinned to the top of the list, so
 * the screen answers the thing the driver was just blocked on instead of
 * opening on a generic pitch.
 *
 * `icon` names a lucide-react-native export; the paywall resolves it. Keeping
 * the name here rather than the component keeps this file free of React.
 */
export type PlatinumBenefitId =
  | "badge"
  | "events"
  | "garage"
  | "showcase"
  | "routes"
  | "places"
  | "cosmetics"
  | "earlyAccess"
  | "convoy"
  | "aura";

export interface PlatinumBenefit {
  id: PlatinumBenefitId;
  title: string;
  /** One line. Says what changes, with the number where there is one. */
  description: string;
  /** lucide-react-native icon name. */
  icon: string;
  /** Copy shown pinned at the top when this benefit triggered the paywall. */
  triggerHeadline?: string;
}

export const PLATINUM_BENEFITS: PlatinumBenefit[] = [
  {
    id: "badge",
    title: "Platinum Badge",
    description: "A chrome status mark next to your name everywhere you appear.",
    icon: "BadgeCheck",
  },
  {
    id: "events",
    title: "Unlimited Events",
    description: "Host as many events as you like — Regular drivers get 1 at a time.",
    icon: "CalendarPlus",
    triggerHeadline: "You already have an event running",
  },
  {
    id: "garage",
    title: "Unlimited Garage Slots",
    description: "Keep every car you own. Regular garages hold 2.",
    icon: "Car",
    triggerHeadline: "Your garage is full at 2 cars",
  },
  {
    id: "showcase",
    title: "AI Car Showcase",
    description: "Turn a phone photo of your car into a studio render, 5× a month.",
    icon: "Sparkles",
    triggerHeadline: "AI Showcase is a Platinum feature",
  },
  {
    id: "routes",
    title: "Unlimited Route Discovery",
    description: "Save every route you find. Regular libraries hold 10.",
    icon: "Route",
    triggerHeadline: "Your route library is full at 10",
  },
  {
    id: "places",
    title: "Unlimited Saved Places",
    description: "Bookmark every cafe, workshop and hangout. Regular saves 10.",
    icon: "MapPin",
    triggerHeadline: "You've saved 10 places",
  },
  {
    id: "cosmetics",
    title: "Premium Icons & Frames",
    description: "An exclusive vehicle icon set and profile frames.",
    icon: "Frame",
    triggerHeadline: "These are Platinum cosmetics",
  },
  {
    id: "earlyAccess",
    title: "Early Access",
    description: "New features land on your app before anyone else's.",
    icon: "Rocket",
    triggerHeadline: "This feature is in Platinum early access",
  },
  {
    id: "convoy",
    title: "Bigger Convoys",
    description: "Roll 8 deep. Regular convoys cap at 2.",
    icon: "Users",
    triggerHeadline: "Regular convoys cap at 2 drivers",
  },
];

/**
 * The aura is a benefit of the badge, not a tenth list row — the brief asks
 * for nine rows and calling out "your avatar glows" separately reads as
 * padding. It still needs an id so a cosmetics screen can trigger the
 * paywall on it.
 */
export function benefitById(id: PlatinumBenefitId): PlatinumBenefit | undefined {
  if (id === "aura") return PLATINUM_BENEFITS.find((b) => b.id === "badge");
  return PLATINUM_BENEFITS.find((b) => b.id === id);
}

/** Maps a capped feature onto the benefit that unblocks it. */
export const FEATURE_BENEFIT: Record<LimitedFeature, PlatinumBenefitId> = {
  garageCars: "garage",
  activeEvents: "events",
  savedPlaces: "places",
  convoyMembers: "convoy",
  savedRoutes: "routes",
  aiShowcasesPerMonth: "showcase",
};
