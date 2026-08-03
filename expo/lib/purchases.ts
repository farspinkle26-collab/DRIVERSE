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
 *   The same rule applies to the SDK's *enums*: importing them at module scope
 *   would pull the native module in on web. Error codes and package types are
 *   therefore mirrored as plain string constants below, matching the SDK's own
 *   wire values.
 *
 * SANDBOX AND THE TEST STORE
 *   Three environments answer through the same `customerInfo` shape, with no
 *   separate code path:
 *     Test Store — a `test_` API key. RevenueCat's own sandbox; purchases
 *                  complete without App Store Connect or Play Console products
 *                  existing at all. Development builds only — see `resolveKey`.
 *     iOS        — a Sandbox Apple ID (App Store Connect → Users and Access →
 *                  Sandbox), StoreKit purchases in a TestFlight/dev build.
 *     Android    — a licence-tester Google account on an internal-testing track.
 *   `EntitlementSnapshot.isSandbox` surfaces RevenueCat's own flag so the
 *   paywall can show a "SANDBOX" marker instead of anyone guessing whether a
 *   purchase was real.
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
  /** Introductory offer / free trial attached to the product, when there is one. */
  introPrice: {
    priceString: string;
    /** ISO 8601 duration from the store, e.g. "P1W", "P1M". */
    period: string | null;
    /** 0 for a free trial. */
    price: number;
  } | null;
}

/** Billing options Platinum can expose from the RevenueCat offering. */
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
  /** ISO date the current period ends. */
  expiresAt: string | null;
  /** False once the driver cancels but before the period ends. */
  willRenew: boolean;
  /** RevenueCat's period type: NORMAL | INTRO | TRIAL | PREPAID. */
  periodType: string | null;
  /** Inside a free trial — worth saying out loud before the first charge. */
  isTrial: boolean;
  /** The store product that granted the entitlement. Support and analytics. */
  productIdentifier: string | null;
  /**
   * Set when the store reported a failed renewal charge. The entitlement is
   * usually still active (grace period), so this is a prompt to fix billing,
   * not a reason to revoke anything.
   */
  billingIssueDetectedAt: string | null;
  /** Set once the driver cancels; access continues until `expiresAt`. */
  unsubscribeDetectedAt: string | null;
  /** RevenueCat's own sandbox flag — dev builds surface it, prod ignores it. */
  isSandbox: boolean;
  /** "APP_STORE" | "PLAY_STORE" | "TEST_STORE" | "PROMOTIONAL" | … */
  store: string | null;
  /** Store-issued subscription management URL, when the store provides one. */
  managementURL: string | null;
}

export const NO_ENTITLEMENT: EntitlementSnapshot = {
  isPlatinum: false,
  expiresAt: null,
  willRenew: false,
  periodType: null,
  isTrial: false,
  productIdentifier: null,
  billingIssueDetectedAt: null,
  unsubscribeDetectedAt: null,
  isSandbox: false,
  store: null,
  managementURL: null,
};

/**
 * Everything a support conversation or a debug screen needs about the signed-in
 * customer, without handing the raw SDK object around the app.
 */
export interface CustomerSummary {
  /** The id RevenueCat knows this customer by — quote it in support tickets. */
  originalAppUserId: string;
  /** True while the SDK is using its own generated id (not signed in). */
  isAnonymous: boolean;
  firstSeen: string | null;
  activeSubscriptions: string[];
  allPurchasedProductIdentifiers: string[];
  /** Non-subscription purchases. */
  nonSubscriptionProductIdentifiers: string[];
  latestExpirationDate: string | null;
  managementURL: string | null;
  entitlement: EntitlementSnapshot;
}

export type PurchaseResult =
  | { status: "purchased"; entitlement: EntitlementSnapshot }
  /** User backed out of the store sheet. Never an error. */
  | { status: "cancelled" }
  /**
   * Google Play deferred/prepaid payment, or Apple's Ask to Buy. The purchase
   * is real but not complete — the entitlement arrives later, through the
   * customer-info listener. Telling the driver "it failed" here would be wrong.
   */
  | { status: "pending" }
  /** Already owned on this store account; a restore is the fix, not a re-buy. */
  | { status: "already_owned"; entitlement: EntitlementSnapshot }
  /** Store or SDK unavailable (Expo Go, web, misconfiguration). */
  | { status: "unavailable" }
  | { status: "error"; message: string; code: string };

export type RestoreResult =
  | { status: "restored"; entitlement: EntitlementSnapshot }
  /** Restore succeeded but there was nothing to restore. */
  | { status: "nothing_to_restore" }
  | { status: "unavailable" }
  | { status: "error"; message: string; code: string };

/* ------------------------------------------------------------------ *
 * SDK constants, mirrored
 *
 * Values copied from `@revenuecat/purchases-typescript-internal`. Importing
 * the enums directly would load the native module on web, which is exactly
 * what the defensive loader below exists to avoid.
 * ------------------------------------------------------------------ */

/** `PURCHASES_ERROR_CODE`, the subset this app reacts to by name. */
const ERROR_CODE = {
  PURCHASE_CANCELLED: "1",
  STORE_PROBLEM: "2",
  PURCHASE_NOT_ALLOWED: "3",
  PURCHASE_INVALID: "4",
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE: "5",
  PRODUCT_ALREADY_PURCHASED: "6",
  RECEIPT_ALREADY_IN_USE: "7",
  NETWORK_ERROR: "10",
  INELIGIBLE: "18",
  PAYMENT_PENDING: "20",
  CONFIGURATION: "23",
  OFFLINE_CONNECTION: "35",
} as const;

/** `PACKAGE_TYPE`, for mapping an offering's packages onto our two periods. */
const PACKAGE_TYPE = {
  ANNUAL: "ANNUAL",
  MONTHLY: "MONTHLY",
} as const;

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
  return sdk() != null && resolveKey() != null;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * Public SDK keys. These are *publishable* keys — they identify the app to
 * RevenueCat and are safe in the bundle (the secret key lives only on the
 * server side of the webhook). Set them in `.env`; see `.env.example`.
 */
const PLATFORM_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  default: undefined,
});

/**
 * RevenueCat Test Store key. Routes purchases to RevenueCat's own sandbox, so
 * offerings, paywalls, purchase flows, entitlements and the Customer Center
 * can all be exercised before a single App Store Connect / Play Console
 * product exists.
 */
const TEST_STORE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;

/**
 * Which key this build uses.
 *
 * A real platform key always wins, so shipping one switches a build off the
 * Test Store with no code change. The Test Store key is accepted ONLY in a
 * development build: RevenueCat's rule is that an app submitted to either
 * store must never carry a `test_` key, and a config file is far too easy to
 * forget. Enforcing it here means a release build cannot be wrong.
 */
function resolveKey(): string | null {
  if (PLATFORM_KEY) return PLATFORM_KEY;
  if (!TEST_STORE_KEY) return null;
  if (!TEST_STORE_KEY.startsWith("test_")) {
    // Someone put a real key in the test slot. Use it — it is valid — but say so.
    console.warn(
      "[purchases] EXPO_PUBLIC_REVENUECAT_TEST_API_KEY is not a Test Store key. " +
        "Move it to the platform-specific variable."
    );
    return TEST_STORE_KEY;
  }
  if (!__DEV__) {
    console.error(
      "[purchases] Refusing to configure with a Test Store key in a release " +
        "build. Set EXPO_PUBLIC_REVENUECAT_IOS_API_KEY / _ANDROID_API_KEY before " +
        "shipping. Purchases are disabled for this build."
    );
    return null;
  }
  return TEST_STORE_KEY;
}

/** True when this build is talking to RevenueCat's Test Store, not a real one. */
export function isTestStoreBuild(): boolean {
  return resolveKey()?.startsWith("test_") === true;
}

let configured = false;
let configuring: Promise<boolean> | null = null;

/**
 * Configures the SDK exactly once per process.
 *
 * Called as early as possible — before sign-in, with `appUserID: null` — so
 * offerings and the paywall work for a signed-out driver. RevenueCat then uses
 * its own anonymous id, and `identify()` migrates that id (and anything bought
 * under it) onto the Supabase user id at sign-in, which is what makes a
 * subscription follow the account across devices.
 *
 * Concurrent callers share one in-flight attempt rather than racing to
 * configure twice, which the SDK treats as a hard error.
 *
 * Returns false when purchases are unavailable, which is the signal the
 * paywall uses to render its "not available on this build" state.
 */
export async function configurePurchases(
  appUserID: string | null,
  options?: { debugLogs?: boolean }
): Promise<boolean> {
  if (configured) return true;
  if (configuring) return configuring;

  configuring = (async () => {
    const Purchases = sdk();
    const apiKey = resolveKey();
    if (!Purchases || !apiKey) return false;

    try {
      // Log level must be set before configure() to catch setup problems.
      if (options?.debugLogs) {
        await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
      }

      Purchases.configure({
        apiKey,
        appUserID: appUserID ?? undefined,
        /**
         * Both stores raise their own billing-problem and price-increase
         * sheets. Letting the SDK show them keeps a lapsed card recoverable
         * without Driveverse building a dunning flow.
         */
        shouldShowInAppMessagesAutomatically: true,
        /**
         * Google Play prepaid plans: without this the purchase resolves before
         * payment lands and the driver sees a success they didn't get. With it,
         * the purchase reports PAYMENT_PENDING and the entitlement arrives
         * through the customer-info listener once the payment clears.
         */
        pendingTransactionsForPrepaidPlansEnabled: true,
        /**
         * Performance and error telemetry from the SDK, in dev only. It carries
         * no personally identifiable information, but there is no reason to
         * send it from drivers' phones.
         */
        diagnosticsEnabled: __DEV__,
      });
      configured = true;

      if (isTestStoreBuild()) {
        console.warn(
          "[purchases] Using the RevenueCat TEST STORE. Purchases are simulated " +
            "and no money moves. This key must never reach a release build."
        );
      }
      return true;
    } catch (err) {
      console.error("[purchases] configure failed:", err);
      return false;
    }
  })();

  const ok = await configuring;
  configuring = null;
  return ok;
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

interface RawEntitlement {
  isActive?: boolean;
  expirationDate?: string | null;
  willRenew?: boolean;
  periodType?: string;
  productIdentifier?: string;
  billingIssueDetectedAt?: string | null;
  unsubscribeDetectedAt?: string | null;
  isSandbox?: boolean;
  store?: string;
}

interface RawCustomerInfo {
  entitlements?: { active?: Record<string, RawEntitlement> };
  managementURL?: string | null;
  originalAppUserId?: string;
  firstSeen?: string;
  activeSubscriptions?: string[];
  allPurchasedProductIdentifiers?: string[];
  latestExpirationDate?: string | null;
  nonSubscriptionTransactions?: { productIdentifier?: string }[];
}

/** Reads the `platinum` entitlement off a RevenueCat `CustomerInfo`. */
function toSnapshot(customerInfo: unknown): EntitlementSnapshot {
  const info = customerInfo as RawCustomerInfo | null;
  const entitlement = info?.entitlements?.active?.[PLATINUM_ENTITLEMENT_ID];
  if (!entitlement?.isActive) return NO_ENTITLEMENT;

  const expiresAt = entitlement.expirationDate ?? null;
  const periodType = entitlement.periodType ?? null;

  return {
    isPlatinum: true,
    expiresAt,
    willRenew: entitlement.willRenew ?? false,
    periodType,
    isTrial: periodType?.toUpperCase() === "TRIAL",
    productIdentifier: entitlement.productIdentifier ?? null,
    billingIssueDetectedAt: entitlement.billingIssueDetectedAt ?? null,
    unsubscribeDetectedAt: entitlement.unsubscribeDetectedAt ?? null,
    isSandbox: entitlement.isSandbox ?? false,
    store: entitlement.store ?? null,
    managementURL: info?.managementURL ?? null,
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
 * The full customer record, for a support or debug surface. The app's feature
 * gates must keep reading `getEntitlement()` — this is deliberately a
 * read-only view for humans, not a second gate.
 */
export async function getCustomerSummary(): Promise<CustomerSummary | null> {
  const Purchases = sdk();
  if (!Purchases || !configured) return null;
  try {
    const raw = await Purchases.getCustomerInfo();
    const info = raw as unknown as RawCustomerInfo;
    const originalAppUserId = info.originalAppUserId ?? "";
    return {
      originalAppUserId,
      // RevenueCat prefixes its own generated ids; a Supabase uuid never matches.
      isAnonymous: originalAppUserId.startsWith("$RCAnonymousID:"),
      firstSeen: info.firstSeen ?? null,
      activeSubscriptions: info.activeSubscriptions ?? [],
      allPurchasedProductIdentifiers: info.allPurchasedProductIdentifiers ?? [],
      nonSubscriptionProductIdentifiers: (info.nonSubscriptionTransactions ?? [])
        .map((t) => t.productIdentifier)
        .filter((id): id is string => typeof id === "string"),
      latestExpirationDate: info.latestExpirationDate ?? null,
      managementURL: info.managementURL ?? null,
      entitlement: toSnapshot(raw),
    };
  } catch (err) {
    console.error("[purchases] getCustomerSummary failed:", err);
    return null;
  }
}

/**
 * Subscribes to entitlement changes — renewals, expirations, refunds, a
 * deferred payment finally clearing, and purchases made on another device or
 * inside a RevenueCat-hosted paywall all arrive here without a poll. Returns
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

/**
 * RevenueCat's package types, normalised to the billing options the app can show.
 *
 * `packageType` is authoritative — it is what the dashboard's Monthly /
 * Annual slots set. The identifier is only consulted for packages
 * configured with a custom id, which is the documented escape hatch.
 */
function periodOf(packageType: string, identifier: string): PlatinumPeriod | null {
  const type = packageType.toUpperCase();
  if (type === PACKAGE_TYPE.ANNUAL) return "yearly";
  if (type === PACKAGE_TYPE.MONTHLY) return "monthly";
  if (type === "LIFETIME") return "lifetime";

  const value = `${type} ${identifier}`.toUpperCase();
  if (value.includes("LIFETIME")) return "lifetime";
  if (value.includes("ANNUAL") || value.includes("YEAR")) return "yearly";
  if (value.includes("MONTH")) return "monthly";
  return null;
}

interface RawProduct {
  identifier: string;
  priceString: string;
  price: number;
  currencyCode: string;
  introPrice?: {
    priceString: string;
    price: number;
    periodUnit?: string;
    periodNumberOfUnits?: number;
  } | null;
}

function toProduct(product: RawProduct): StoreProduct {
  const intro = product.introPrice ?? null;
  return {
    identifier: product.identifier,
    priceString: product.priceString,
    price: product.price,
    currencyCode: product.currencyCode,
    introPrice: intro
      ? {
          priceString: intro.priceString,
          price: intro.price,
          period:
            intro.periodUnit && intro.periodNumberOfUnits
              ? `${intro.periodNumberOfUnits} ${intro.periodUnit.toLowerCase()}`
              : null,
        }
      : null,
  };
}

/**
 * The Platinum packages, cheapest first. Prices come from the store already
 * localised — the paywall renders `priceString` verbatim rather than
 * formatting currency itself.
 *
 * Returns `[]` when the store is unreachable; the paywall then falls back to
 * `PLATINUM_FALLBACK_PRICE` for display and disables the CTA.
 */
export async function getPlatinumPackages(): Promise<PlatinumPackage[]> {
  const offering = await getPlatinumOffering();
  if (!offering) return [];

  const raw = offering as {
    availablePackages?: {
      identifier: string;
      packageType: string;
      product: RawProduct;
    }[];
  };

  const packages: PlatinumPackage[] = [];
  for (const pkg of raw.availablePackages ?? []) {
    const period = periodOf(String(pkg.packageType), pkg.identifier);
    if (!period) continue;
    packages.push({
      identifier: pkg.identifier,
      period,
      product: toProduct(pkg.product),
      raw: pkg,
    });
  }
  return packages.sort((a, b) => a.product.price - b.product.price);
}

/**
 * The raw `platinum` offering, needed by RevenueCat's own paywall UI — it
 * takes the offering object, not an id, so the hosted paywall renders the same
 * products the app's fallback screen would have shown.
 *
 * Falls back to `offerings.current` so a project that only ever configured a
 * default offering still works.
 */
export async function getPlatinumOffering(): Promise<unknown | null> {
  const Purchases = sdk();
  if (!Purchases || !configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all?.[PLATINUM_OFFERING_ID] ?? offerings.current ?? null;
  } catch (err) {
    console.error("[purchases] getOfferings failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Purchase + restore
 * ------------------------------------------------------------------ */

interface RawError {
  code?: string | number;
  message?: string;
  underlyingErrorMessage?: string;
  userCancelled?: boolean | null;
  userInfo?: { readableErrorCode?: string };
}

function codeOf(err: unknown): string {
  const code = (err as RawError | null)?.code;
  return code === undefined || code === null ? "" : String(code);
}

/** Whether a thrown SDK error is just the user dismissing the store sheet. */
function isUserCancelled(err: unknown): boolean {
  // `userCancelled` is deprecated in favour of the error code, but both stores
  // and older SDK paths still populate it, so check the code first and keep the
  // flag as a fallback rather than trusting either alone.
  return (
    codeOf(err) === ERROR_CODE.PURCHASE_CANCELLED ||
    (err as RawError | null)?.userCancelled === true
  );
}

/**
 * Store errors, in the driver's language.
 *
 * The SDK's own message is written for a developer ("There was a problem with
 * the App Store."). Mapping the codes this app can actually hit means the
 * driver is told what to do about it, and everything unmapped still falls
 * through to the SDK text rather than a generic shrug.
 */
function errorMessage(err: unknown, fallback: string): string {
  switch (codeOf(err)) {
    case ERROR_CODE.NETWORK_ERROR:
    case ERROR_CODE.OFFLINE_CONNECTION:
      return "Couldn't reach the store. Check your connection and try again.";
    case ERROR_CODE.STORE_PROBLEM:
      return "The store is having trouble right now. Try again in a moment.";
    case ERROR_CODE.PURCHASE_NOT_ALLOWED:
      return "This device isn't allowed to make purchases. Check Screen Time or your store account restrictions.";
    case ERROR_CODE.PURCHASE_INVALID:
      return "The store rejected the payment. Check your payment method and try again.";
    case ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE:
      return "Platinum isn't available on this store account yet.";
    case ERROR_CODE.RECEIPT_ALREADY_IN_USE:
      return "This purchase is already attached to another Driveverse account.";
    case ERROR_CODE.INELIGIBLE:
      return "This offer isn't available on your store account.";
    case ERROR_CODE.CONFIGURATION:
      return "Platinum isn't set up on this build yet.";
    default: {
      const e = err as RawError | null;
      return e?.message ?? e?.underlyingErrorMessage ?? fallback;
    }
  }
}

/**
 * Runs the native purchase sheet for one package.
 *
 * Three outcomes are deliberately not errors: a cancelled sheet (the driver's
 * decision), a pending payment (Play prepaid / Ask to Buy — the entitlement
 * lands later through the listener), and an already-owned product (a restore
 * is the fix, and the SDK hands back the current customer info anyway).
 */
export async function purchase(pkg: PlatinumPackage): Promise<PurchaseResult> {
  const Purchases = sdk();
  if (!Purchases || !configured) return { status: "unavailable" };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.raw as never);
    return { status: "purchased", entitlement: toSnapshot(customerInfo) };
  } catch (err) {
    if (isUserCancelled(err)) return { status: "cancelled" };
    if (codeOf(err) === ERROR_CODE.PAYMENT_PENDING) return { status: "pending" };
    if (codeOf(err) === ERROR_CODE.PRODUCT_ALREADY_PURCHASED) {
      return { status: "already_owned", entitlement: await getEntitlement() };
    }
    console.error("[purchases] purchase failed:", err);
    return {
      status: "error",
      code: codeOf(err),
      message: errorMessage(err, "The purchase didn't go through."),
    };
  }
}

/**
 * Re-applies a subscription bought on another device or before a reinstall.
 *
 * App Store Review guideline 3.1.1 requires this to be reachable from the
 * paywall, which is why the link is present even though most drivers never
 * need it. The Customer Center exposes the same operation as "I don't see my
 * purchase", so both routes end up here.
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
      code: codeOf(err),
      message: errorMessage(err, "Couldn't reach the store."),
    };
  }
}

/**
 * Where "Manage Subscription" goes when the Customer Center isn't available.
 *
 * Prefers the store's own management URL from `customerInfo`, which deep-links
 * to *this* subscription rather than the account's whole subscription list.
 * Both stores forbid an in-app cancel flow, so this hands off rather than
 * pretending.
 */
export function manageSubscriptionUrl(
  snapshot?: EntitlementSnapshot | null
): string {
  if (snapshot?.managementURL) return snapshot.managementURL;
  return Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";
}
