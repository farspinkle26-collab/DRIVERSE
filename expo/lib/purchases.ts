/**
 * Driveverse — RevenueCat / In-App Purchase service.
 *
 * WHY REVENUECAT AND NOT A PAYMENT GATEWAY
 *   Apple requires digital subscriptions to be sold through In-App Purchase;
 *   routing Platinum through an external gateway on iOS is an App Store
 *   rejection, not a preference. RevenueCat wraps StoreKit and Google Play
 *   Billing behind one SDK, so both platforms behave identically, and Apple
 *   and Google remain the merchants of record — which also means Driveverse
 *   never touches Indonesian e-money licensing for this flow.
 *
 *   A local PSP (Midtrans/Xendit for GoPay/OVO/bank transfer) is a separate,
 *   larger piece of work and cannot replace IAP on iOS. Nothing here assumes
 *   it will never exist; `hasPlatinum()` is the only entitlement question the
 *   app asks, so a second provider would answer the same question later.
 *
 * DEFENSIVE LOADING
 *   `react-native-purchases` is a native module. It is absent in Expo Go and
 *   on web, and this app runs in both. Every export below degrades to "no
 *   subscription, no store" rather than throwing, following the same pattern
 *   `lib/shareCard.ts` uses for `react-native-share`. That is also what makes
 *   the app testable before the store products are live.
 *
 * SANDBOX
 *   RevenueCat reports sandbox purchases through the same `customerInfo`
 *   shape as production; there is no separate code path. To test:
 *     iOS      — a Sandbox Apple ID (App Store Connect → Users and Access →
 *                Sandbox), StoreKit purchases in a TestFlight/dev build.
 *     Android  — a licence-tester Google account on an internal-testing track.
 *   `isSandboxCustomer()` surfaces RevenueCat's own flag so the paywall can
 *   show a "SANDBOX" marker in dev builds instead of anyone guessing whether
 *   a purchase was real.
 */

import { Platform } from "react-native";
import {
  PLATINUM_ENTITLEMENT_ID,
  PLATINUM_OFFERING_ID,
} from "@/constants/platinum";

/* ------------------------------------------------------------------ *
 * Types — structurally compatible with the SDK, declared locally so
 * nothing in the app has to import a native module just for a type.
 * ------------------------------------------------------------------ */

export interface StoreProduct {
  identifier: string;
  priceString: string;
  price: number;
  currencyCode: string;
}

export type PlatinumPeriod = "monthly" | "yearly" | "lifetime";

export interface PlatinumPackage {
  /** RevenueCat package identifier, passed back to `purchase()`. */
  identifier: string;
  period: PlatinumPeriod;
  product: StoreProduct;
  /** The raw SDK package. Opaque to callers; handed back on purchase. */
  raw: unknown;
}

export interface EntitlementSnapshot {
  isPlatinum: boolean;
  /** ISO date the current period ends, when the store reports one. Always
   *  null for a lifetime purchase — that absence is how `isLifetime` below
   *  is derived, rather than tracking a separate purchased-period field. */
  expiresAt: string | null;
  /** False once the driver cancels but before the period ends. Also false
   *  for lifetime, which never renews. */
  willRenew: boolean;
  /** RevenueCat's own sandbox flag — dev builds surface it, prod ignores it. */
  isSandbox: boolean;
  /** "App Store" | "Play Store" | "PROMOTIONAL" | … Useful in support. */
  store: string | null;
  /** A one-time, non-renewing purchase — no "Manage Subscription" applies. */
  isLifetime: boolean;
}

export const NO_ENTITLEMENT: EntitlementSnapshot = {
  isPlatinum: false,
  expiresAt: null,
  willRenew: false,
  isSandbox: false,
  store: null,
  isLifetime: false,
};

export type PurchaseResult =
  | { status: "purchased"; entitlement: EntitlementSnapshot }
  /** User backed out of the store sheet. Never an error. */
  | { status: "cancelled" }
  /** Store or SDK unavailable (Expo Go, web, misconfiguration). */
  | { status: "unavailable" }
  | { status: "error"; message: string };

export type RestoreResult =
  | { status: "restored"; entitlement: EntitlementSnapshot }
  /** Restore succeeded but there was nothing to restore. */
  | { status: "nothing_to_restore" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

/* ------------------------------------------------------------------ *
 * Optional native backend
 * ------------------------------------------------------------------ */

type PurchasesModule = typeof import("react-native-purchases").default;

let resolved = false;
let mod: PurchasesModule | null = null;

/**
 * The SDK, loaded once and only if the native module is actually linked.
 * Returns `null` everywhere it isn't, so callers branch instead of crashing.
 */
function sdk(): PurchasesModule | null {
  if (resolved) return mod;
  resolved = true;
  if (Platform.OS === "web") {
    // RevenueCat's RN SDK has no web target; the paywall renders read-only.
    mod = null;
    return mod;
  }
  try {
    // Defensive require: a missing native module must degrade, not crash.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require("react-native-purchases");
    const candidate = (required?.default ?? required) as PurchasesModule;
    // A JS-only shim won't expose `configure`; treat that as absent.
    mod = typeof (candidate as { configure?: unknown })?.configure === "function"
      ? candidate
      : null;
  } catch {
    mod = null;
  }
  return mod;
}

/** Whether purchases can happen at all on this runtime. */
export function isPurchasesAvailable(): boolean {
  return sdk() != null;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * Public SDK keys. These are *publishable* keys — they identify the app to
 * RevenueCat and are safe in the bundle (the secret key lives only on the
 * server side of the webhook). Set them in `.env` alongside the Supabase
 * pair; a missing key disables purchases rather than crashing the app.
 */
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

let configured = false;

/**
 * Configures the SDK exactly once per process.
 *
 * `appUserID` is the Supabase user id, so a subscription follows the account
 * across devices instead of being pinned to an anonymous install. Pass
 * `null` before sign-in — RevenueCat then uses its own anonymous id and
 * `identify()` migrates it on login.
 *
 * Returns false when purchases are unavailable, which is the signal the
 * paywall uses to render its "not available on this build" state.
 */
export async function configurePurchases(
  appUserID: string | null,
  options?: { debugLogs?: boolean }
): Promise<boolean> {
  const Purchases = sdk();
  if (!Purchases || !API_KEY) return false;
  if (configured) return true;

  try {
    if (options?.debugLogs) {
      await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
    }
    Purchases.configure({ apiKey: API_KEY, appUserID: appUserID ?? undefined });
    configured = true;
    return true;
  } catch (err) {
    console.error("[purchases] configure failed:", err);
    return false;
  }
}

/**
 * Points the SDK at a Supabase user id after sign-in. Safe to call on every
 * auth change — RevenueCat no-ops when the id is already current.
 */
export async function identify(appUserID: string): Promise<EntitlementSnapshot> {
  const Purchases = sdk();
  if (!Purchases || !configured) return NO_ENTITLEMENT;
  try {
    const { customerInfo } = await Purchases.logIn(appUserID);
    return toSnapshot(customerInfo);
  } catch (err) {
    console.error("[purchases] logIn failed:", err);
    return NO_ENTITLEMENT;
  }
}

/** Detaches the subscription from the device on sign-out. */
export async function forgetUser(): Promise<void> {
  const Purchases = sdk();
  if (!Purchases || !configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Logging out an already-anonymous user throws; nothing to recover.
  }
}

/* ------------------------------------------------------------------ *
 * Entitlement
 * ------------------------------------------------------------------ */

/** Reads the `platinum` entitlement off a RevenueCat `CustomerInfo`. */
function toSnapshot(customerInfo: unknown): EntitlementSnapshot {
  const info = customerInfo as {
    entitlements?: {
      active?: Record<
        string,
        {
          isActive?: boolean;
          expirationDate?: string | null;
          willRenew?: boolean;
          isSandbox?: boolean;
          store?: string;
        }
      >;
    };
  } | null;

  const entitlement = info?.entitlements?.active?.[PLATINUM_ENTITLEMENT_ID];
  if (!entitlement?.isActive) return NO_ENTITLEMENT;

  const expiresAt = entitlement.expirationDate ?? null;
  return {
    isPlatinum: true,
    expiresAt,
    // A non-renewing (lifetime) purchase never reports willRenew or an
    // expirationDate, so pinning willRenew to false here is redundant with
    // isLifetime but keeps this field meaningful on its own.
    willRenew: expiresAt ? entitlement.willRenew ?? false : false,
    isSandbox: entitlement.isSandbox ?? false,
    store: entitlement.store ?? null,
    isLifetime: expiresAt === null,
  };
}

/**
 * The current entitlement. This is THE gate — every Platinum feature in the
 * app resolves back to this call (via `usePlatinum()`), not to a database
 * column, so status can never be stale in one place and fresh in another.
 */
export async function getEntitlement(): Promise<EntitlementSnapshot> {
  const Purchases = sdk();
  if (!Purchases || !configured) return NO_ENTITLEMENT;
  try {
    return toSnapshot(await Purchases.getCustomerInfo());
  } catch (err) {
    console.error("[purchases] getCustomerInfo failed:", err);
    return NO_ENTITLEMENT;
  }
}

/**
 * Subscribes to entitlement changes — renewals, expirations, refunds and
 * purchases made on another device all arrive here without a poll. Returns
 * an unsubscribe function; a no-op when the SDK is absent.
 */
export function onEntitlementChange(
  listener: (snapshot: EntitlementSnapshot) => void
): () => void {
  const Purchases = sdk();
  if (!Purchases || !configured) return () => {};
  const handler = (customerInfo: unknown) => listener(toSnapshot(customerInfo));
  Purchases.addCustomerInfoUpdateListener(handler as never);
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(handler as never);
    } catch {
      // Listener already gone.
    }
  };
}

/* ------------------------------------------------------------------ *
 * Offerings
 * ------------------------------------------------------------------ */

/** RevenueCat's own package-type constants, normalised to our three periods. */
function periodOf(packageType: string, identifier: string): PlatinumPeriod | null {
  const value = `${packageType} ${identifier}`.toUpperCase();
  if (value.includes("LIFETIME")) return "lifetime";
  if (value.includes("ANNUAL") || value.includes("YEAR")) return "yearly";
  if (value.includes("MONTH")) return "monthly";
  return null;
}

/**
 * The Platinum packages, cheapest period first. Prices come from the store
 * already localised — the paywall renders `priceString` verbatim rather than
 * formatting currency itself.
 *
 * Returns `[]` when the store is unreachable; the paywall then falls back to
 * `PLATINUM_FALLBACK_PRICE` for display and disables the CTA.
 */
export async function getPlatinumPackages(): Promise<PlatinumPackage[]> {
  const Purchases = sdk();
  if (!Purchases || !configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const offering =
      offerings.all?.[PLATINUM_OFFERING_ID] ?? offerings.current ?? null;
    if (!offering) return [];

    const packages: PlatinumPackage[] = [];
    for (const pkg of offering.availablePackages ?? []) {
      const period = periodOf(String(pkg.packageType), pkg.identifier);
      if (!period) continue;
      packages.push({
        identifier: pkg.identifier,
        period,
        product: {
          identifier: pkg.product.identifier,
          priceString: pkg.product.priceString,
          price: pkg.product.price,
          currencyCode: pkg.product.currencyCode,
        },
        raw: pkg,
      });
    }
    return packages.sort((a, b) => a.product.price - b.product.price);
  } catch (err) {
    console.error("[purchases] getOfferings failed:", err);
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Purchase + restore
 * ------------------------------------------------------------------ */

/** Whether a thrown SDK error is just the user dismissing the store sheet. */
function isUserCancelled(err: unknown): boolean {
  const e = err as { userCancelled?: boolean; code?: string | number } | null;
  return e?.userCancelled === true;
}

function errorMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string; underlyingErrorMessage?: string } | null;
  return e?.message ?? e?.underlyingErrorMessage ?? fallback;
}

/**
 * Runs the native purchase sheet for one package.
 *
 * A cancelled purchase resolves as `{ status: "cancelled" }` — the caller
 * closes quietly instead of showing an error for a deliberate back-out.
 */
export async function purchase(pkg: PlatinumPackage): Promise<PurchaseResult> {
  const Purchases = sdk();
  if (!Purchases || !configured) return { status: "unavailable" };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.raw as never);
    return { status: "purchased", entitlement: toSnapshot(customerInfo) };
  } catch (err) {
    if (isUserCancelled(err)) return { status: "cancelled" };
    console.error("[purchases] purchase failed:", err);
    return {
      status: "error",
      message: errorMessage(err, "The purchase didn't go through."),
    };
  }
}

/**
 * Re-applies a subscription bought on another device or before a reinstall.
 *
 * App Store Review guideline 3.1.1 requires this to be reachable from the
 * paywall, which is why the link is present even though most drivers never
 * need it.
 */
export async function restore(): Promise<RestoreResult> {
  const Purchases = sdk();
  if (!Purchases || !configured) return { status: "unavailable" };
  try {
    const customerInfo = await Purchases.restorePurchases();
    const entitlement = toSnapshot(customerInfo);
    return entitlement.isPlatinum
      ? { status: "restored", entitlement }
      : { status: "nothing_to_restore" };
  } catch (err) {
    console.error("[purchases] restore failed:", err);
    return {
      status: "error",
      message: errorMessage(err, "Couldn't reach the store."),
    };
  }
}

/**
 * Deep-links to the platform's own subscription management screen — the only
 * place a driver can actually cancel. Both stores forbid an in-app cancel
 * flow, so "Manage subscription" hands off rather than pretending.
 */
export function manageSubscriptionUrl(): string {
  return Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";
}

/* ------------------------------------------------------------------ *
 * RevenueCat UI — hosted paywall + Customer Center
 *
 * `react-native-purchases-ui` is a second, separate native module. It is
 * loaded exactly as defensively as `react-native-purchases` above, so a
 * runtime without either module (Expo Go, web) degrades the same way: the
 * caller gets `{ presented: false }` back instead of a crash, and falls
 * back to the in-house UI (the custom paywall, or the store deep link).
 * ------------------------------------------------------------------ */

type PurchasesUIModule = typeof import("react-native-purchases-ui").default;

let uiResolved = false;
let uiMod: PurchasesUIModule | null = null;

function ui(): PurchasesUIModule | null {
  if (uiResolved) return uiMod;
  uiResolved = true;
  if (Platform.OS === "web") {
    uiMod = null;
    return uiMod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require("react-native-purchases-ui");
    const candidate = (required?.default ?? required) as PurchasesUIModule;
    uiMod =
      typeof (candidate as { presentPaywall?: unknown })?.presentPaywall === "function"
        ? candidate
        : null;
  } catch {
    uiMod = null;
  }
  return uiMod;
}

export interface PresentPaywallResult {
  /** False when the UI module or store isn't available on this runtime. */
  presented: boolean;
  /** True once the driver actually completed a purchase from the sheet. */
  purchased: boolean;
  /** True if the driver restored an existing purchase from the sheet. */
  restored: boolean;
}

const NOT_PRESENTED: PresentPaywallResult = {
  presented: false,
  purchased: false,
  restored: false,
};

/**
 * Presents RevenueCat's hosted, dashboard-configured Paywall for the
 * `platinum` offering — an alternative to the custom screen at
 * `app/platinum.tsx` for spots that want a remotely-editable, A/B-testable
 * upsell without a app update. Nothing in the app calls this by default;
 * it's here for whichever screen wants it.
 */
export async function presentPaywall(
  offeringIdentifier: string = PLATINUM_OFFERING_ID
): Promise<PresentPaywallResult> {
  const RevenueCatUI = ui();
  if (!RevenueCatUI || !configured) return NOT_PRESENTED;
  try {
    const offerings = await sdk()!.getOfferings();
    const offering = offerings.all?.[offeringIdentifier] ?? offerings.current ?? undefined;
    const result = await RevenueCatUI.presentPaywall({ offering });
    return {
      presented: true,
      purchased: result === "PURCHASED",
      restored: result === "RESTORED",
    };
  } catch (err) {
    console.error("[purchases] presentPaywall failed:", err);
    return NOT_PRESENTED;
  }
}

/**
 * Same as `presentPaywall`, but only actually shows the sheet when the
 * driver doesn't already hold the `platinum` entitlement — useful for a
 * "gate this screen" call site that shouldn't interrupt an existing
 * subscriber.
 */
export async function presentPaywallIfNeeded(
  offeringIdentifier: string = PLATINUM_OFFERING_ID
): Promise<PresentPaywallResult> {
  const RevenueCatUI = ui();
  if (!RevenueCatUI || !configured) return NOT_PRESENTED;
  try {
    const offerings = await sdk()!.getOfferings();
    const offering = offerings.all?.[offeringIdentifier] ?? offerings.current ?? undefined;
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PLATINUM_ENTITLEMENT_ID,
      offering,
    });
    return {
      presented: true,
      purchased: result === "PURCHASED",
      restored: result === "RESTORED",
    };
  } catch (err) {
    console.error("[purchases] presentPaywallIfNeeded failed:", err);
    return NOT_PRESENTED;
  }
}

/**
 * Presents RevenueCat's Customer Center — in-app subscription management,
 * FAQs and support links, satisfying the same App Store 3.1.1 "reachable
 * cancel path" requirement the store deep link (`manageSubscriptionUrl`)
 * exists for. Preferred over the deep link when available, since the driver
 * never leaves the app; falls back to the deep link when it isn't.
 */
export async function presentCustomerCenter(): Promise<boolean> {
  const RevenueCatUI = ui();
  if (!RevenueCatUI || !configured) return false;
  try {
    await RevenueCatUI.presentCustomerCenter();
    return true;
  } catch (err) {
    console.error("[purchases] presentCustomerCenter failed:", err);
    return false;
  }
}
