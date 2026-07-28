/**
 * Driveverse Platinum — the entitlement hook.
 *
 * ONE source of truth for "is this driver Platinum": RevenueCat's
 * `customerInfo.entitlements.active["platinum"]`. Every gated feature in the
 * app reads `isPlatinum` from here. There is deliberately no parallel
 * `profiles.is_platinum` the client writes — see `constants/platinum.ts`.
 *
 * CONFIGURATION TIMING
 *   The SDK is configured as soon as auth has answered once, with the Supabase
 *   user id when there is one and `null` when there isn't. Configuring for
 *   signed-out drivers too is what lets the paywall show real store prices
 *   before anyone has an account; RevenueCat uses an anonymous id, and
 *   `identify()` migrates it — along with anything bought under it — onto the
 *   Supabase id at sign-in.
 *
 * CACHING
 *   The RevenueCat call is a network round trip, so a cold start would paint
 *   every Platinum surface as Regular for a beat and then pop. The last known
 *   snapshot is cached in AsyncStorage per user id and used for the first
 *   frame, then replaced by the live answer.
 *
 *   The cache is optimistic on purpose, and it is only ever a *display*
 *   optimisation: it stays keyed to the user, is dropped on sign-out, and
 *   carries a `checkedAt` so a stale cache can't outlive a lapsed
 *   subscription indefinitely. Anything with a real cost behind it (AI
 *   showcase generation) is re-checked server-side against the webhook mirror
 *   before it spends money — the cache can make a badge appear early, it
 *   cannot buy anything.
 *
 * PAYWALL
 *   `openPaywall(trigger)` is how every friction point in the app raises the
 *   upgrade screen, passing the benefit that was blocked. It prefers
 *   RevenueCat's dashboard-configured paywall and falls back to the
 *   hand-built `app/platinum.tsx` — see `openPaywall` below. Keeping it on
 *   this hook means a screen needs one import to both check the gate and offer
 *   the way past it, and the two paywall implementations stay an
 *   implementation detail of this file.
 */

import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  benefitById,
  FEATURE_BENEFIT,
  isAtLimit,
  limitFor,
  type LimitedFeature,
  type PlatinumBenefitId,
} from "@/constants/platinum";
import {
  configurePurchases,
  forgetUser,
  getCustomerSummary,
  getEntitlement,
  getPlatinumOffering,
  getPlatinumPackages,
  identify,
  isPurchasesAvailable,
  isTestStoreBuild,
  NO_ENTITLEMENT,
  onEntitlementChange,
  purchase as purchasePackage,
  restore as restorePurchases,
  type CustomerSummary,
  type EntitlementSnapshot,
  type PlatinumPackage,
  type PurchaseResult,
  type RestoreResult,
} from "@/lib/purchases";
import {
  isPurchasesUiAvailable,
  presentCustomerCenter,
  presentPaywall,
} from "@/lib/purchasesUi";
import { supabase } from "@/lib/supabase";

/**
 * Bumped from `driveverse_platinum` when the snapshot gained trial and
 * billing-issue fields. A cache entry written by the old shape would read
 * back with those undefined, which is falsy in the right direction for all
 * of them.
 */
const CACHE_KEY = "driveverse_platinum_v2";

/**
 * How long a cached snapshot may stand in for a live answer. A subscription
 * period is at minimum a month, so a day is short enough that a lapsed
 * subscriber loses the badge promptly and long enough to cover a driver who
 * opens the app in a tunnel.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedEntitlement extends EntitlementSnapshot {
  checkedAt: number;
}

async function readCache(userId: string): Promise<EntitlementSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY}:${userId}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedEntitlement;
    if (Date.now() - cached.checkedAt > CACHE_TTL_MS) return null;
    // An expiry the store already passed means the cache is describing a
    // subscription that has since lapsed — don't trust it.
    if (cached.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, snapshot: EntitlementSnapshot) {
  try {
    const payload: CachedEntitlement = { ...snapshot, checkedAt: Date.now() };
    await AsyncStorage.setItem(`${CACHE_KEY}:${userId}`, JSON.stringify(payload));
  } catch {
    // A cache write failing costs a flash of Regular styling, nothing more.
  }
}

/** How settled the entitlement answer is, for UI that cares. */
export type PlatinumStatus =
  /** No answer yet — cached value (if any) is showing. */
  | "loading"
  /** Live answer from the store. */
  | "ready"
  /** No store on this runtime (Expo Go, web, missing SDK key). */
  | "unavailable";

/**
 * Whether RevenueCat's hosted paywall has been shown to work this session.
 *
 * `null` until first tried. Once a presentation comes back as "no paywall
 * configured", every later `openPaywall` goes straight to the app's own screen
 * instead of paying for an offerings round trip and a failed present each
 * time. Module scope rather than state because it describes the RevenueCat
 * project, not this component tree.
 */
let hostedPaywallWorks: boolean | null = null;

export const [PlatinumProvider, usePlatinum] = createContextHook(() => {
  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [entitlement, setEntitlement] =
    useState<EntitlementSnapshot>(NO_ENTITLEMENT);
  const [status, setStatus] = useState<PlatinumStatus>("loading");
  const [packages, setPackages] = useState<PlatinumPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);

  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  /* ─── Auth ──────────────────────────────────────────────── */

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      setAuthResolved(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setAuthResolved(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  /* ─── Configure ─────────────────────────────────────────── */

  const applySnapshot = useCallback((snapshot: EntitlementSnapshot) => {
    setEntitlement(snapshot);
    const uid = userIdRef.current;
    if (uid) void writeCache(uid, snapshot);
  }, []);

  // Runs once, as soon as auth has an answer. Deliberately not keyed on
  // `userId`: the SDK is configured for the whole process, and later sign-ins
  // are handled by `identify()` in the effect below.
  useEffect(() => {
    if (!authResolved) return;
    let active = true;

    (async () => {
      const uid = userIdRef.current;
      // Paint from cache first so Platinum surfaces don't flash Regular.
      if (uid) {
        const cached = await readCache(uid);
        if (active && cached) setEntitlement(cached);
      }

      const ok = await configurePurchases(uid, { debugLogs: __DEV__ });
      if (!active) return;
      if (!ok) {
        setStatus("unavailable");
        return;
      }

      applySnapshot(await getEntitlement());
      if (!active) return;
      setStatus("ready");
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, applySnapshot]);

  /* ─── Identity ──────────────────────────────────────────── */

  // Keeps RevenueCat's app user id pointed at the Supabase user, so a
  // subscription follows the account across devices rather than the install.
  const identifiedAs = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status !== "ready") return;
    if (identifiedAs.current === userId) return;
    identifiedAs.current = userId;

    let active = true;
    (async () => {
      if (!userId) {
        // Signed out: drop the entitlement immediately rather than letting the
        // previous account's Platinum styling bleed into a guest session.
        await forgetUser();
        if (!active) return;
        setEntitlement(NO_ENTITLEMENT);
        setPackages([]);
        return;
      }
      const snapshot = await identify(userId);
      if (!active) return;
      applySnapshot(snapshot);
    })();

    return () => {
      active = false;
    };
  }, [userId, status, applySnapshot]);

  /* ─── Live entitlement updates ──────────────────────────── */

  // Renewals, expirations, refunds, a deferred payment clearing, purchases
  // made on another device, and purchases made inside RevenueCat's own paywall
  // all arrive through this listener, so nothing has to poll.
  useEffect(() => {
    if (status !== "ready") return;
    return onEntitlementChange(applySnapshot);
  }, [status, applySnapshot]);

  const refresh = useCallback(async () => {
    if (!isPurchasesAvailable()) return;
    applySnapshot(await getEntitlement());
  }, [applySnapshot]);

  /* ─── Offerings ─────────────────────────────────────────── */

  /**
   * Loaded lazily — the paywall calls this on mount. Fetching offerings at
   * app start would be a store round trip every launch for a screen most
   * drivers never open.
   */
  const loadPackages = useCallback(async () => {
    if (!isPurchasesAvailable()) return;
    setLoadingPackages(true);
    try {
      setPackages(await getPlatinumPackages());
    } finally {
      setLoadingPackages(false);
    }
  }, []);

  /* ─── Purchase / restore ────────────────────────────────── */

  const purchase = useCallback(
    async (pkg: PlatinumPackage): Promise<PurchaseResult> => {
      const result = await purchasePackage(pkg);
      if (result.status === "purchased" || result.status === "already_owned") {
        applySnapshot(result.entitlement);
      }
      return result;
    },
    [applySnapshot]
  );

  const restore = useCallback(async (): Promise<RestoreResult> => {
    const result = await restorePurchases();
    if (result.status === "restored") applySnapshot(result.entitlement);
    return result;
  }, [applySnapshot]);

  /** The full customer record, for a support or debug surface. Never a gate. */
  const loadCustomerSummary = useCallback(
    (): Promise<CustomerSummary | null> => getCustomerSummary(),
    []
  );

  /* ─── Paywall ───────────────────────────────────────────── */

  /**
   * Raises the paywall on whichever implementation is actually available.
   *
   * 1. RevenueCat's dashboard-configured paywall, when the UI module is linked
   *    and the offering has one attached. Pricing, copy and layout are then
   *    editable without an app release, and the blocked benefit's headline is
   *    handed over as a custom variable so the contextual trigger survives.
   * 2. `app/platinum.tsx` otherwise — Expo Go, web, or a RevenueCat project
   *    with no paywall configured yet. It is never removed: a dashboard that
   *    isn't finished must not leave a driver with no way to subscribe.
   *
   * Stays synchronous for its ~15 call sites; the presentation happens in the
   * background and either resolves in RevenueCat's own modal or navigates.
   */
  const openPaywall = useCallback(
    (trigger?: PlatinumBenefitId) => {
      const openFallbackScreen = () =>
        router.push(
          (trigger ? `/platinum?trigger=${trigger}` : "/platinum") as never
        );

      if (
        hostedPaywallWorks === false ||
        !isPurchasesUiAvailable() ||
        !isPurchasesAvailable()
      ) {
        openFallbackScreen();
        return;
      }

      void (async () => {
        const outcome = await presentPaywall({
          offering: await getPlatinumOffering(),
          triggerHeadline: trigger
            ? benefitById(trigger)?.triggerHeadline
            : undefined,
        });

        if (outcome === "purchased" || outcome === "restored") {
          hostedPaywallWorks = true;
          // The listener will deliver this too; refreshing makes the caller's
          // next render correct without waiting on the round trip.
          await refresh();
          return;
        }
        if (outcome === "cancelled" || outcome === "not_presented") {
          hostedPaywallWorks = true;
          return;
        }
        // "error" or "unavailable": no paywall attached to the offering, or the
        // view failed. Remember it, and show the screen the app owns.
        hostedPaywallWorks = false;
        openFallbackScreen();
      })();
    },
    [refresh]
  );

  /* ─── Customer Center ───────────────────────────────────── */

  /**
   * The post-purchase surface: status, plan changes, restore, refund requests
   * (iOS) and cancellation with whatever retention offer the dashboard
   * defines.
   *
   * Presents RevenueCat's Customer Center modally when the native module is
   * there, and falls back to `app/subscription.tsx` — the app's own manage
   * screen, which ends in a handoff to the store — when it isn't. Both stores
   * forbid an in-app cancel flow, so every path here hands off rather than
   * pretending it can cancel anything itself.
   */
  const openCustomerCenter = useCallback(async () => {
    const shown = await presentCustomerCenter({
      // A restore or a plan change inside the Customer Center changes the
      // entitlement, and the app's gates must not lag behind the sheet.
      onRestoreCompleted: () => void refresh(),
      onManagementOptionSelected: () => void refresh(),
    });
    if (!shown) router.push("/subscription" as never);
  }, [refresh]);

  const isPlatinum = entitlement.isPlatinum;

  /* ─── Limits ────────────────────────────────────────────── */

  /** The cap that applies to this driver, or `null` for unlimited. */
  const limit = useCallback(
    (feature: LimitedFeature) => limitFor(feature, isPlatinum),
    [isPlatinum]
  );

  /** Whether one more of `feature` would exceed the driver's cap. */
  const atLimit = useCallback(
    (feature: LimitedFeature, current: number) =>
      isAtLimit(feature, current, isPlatinum),
    [isPlatinum]
  );

  /**
   * The whole friction-point pattern in one call: if the driver is at the
   * cap, raise the paywall on the matching benefit and report back that the
   * action should stop. Never a silent block — the caller returning `true`
   * has already shown the driver why.
   */
  const blockAtLimit = useCallback(
    (feature: LimitedFeature, current: number): boolean => {
      if (!isAtLimit(feature, current, isPlatinum)) return false;
      openPaywall(FEATURE_BENEFIT[feature]);
      return true;
    },
    [isPlatinum, openPaywall]
  );

  return useMemo(
    () => ({
      /** THE gate. Every Platinum feature reads this. */
      isPlatinum,
      entitlement,
      status,
      /** True when purchases can actually happen on this runtime. */
      canPurchase: isPurchasesAvailable() && status === "ready",
      /** True when RevenueCat's own paywall / Customer Center can render. */
      hasPurchasesUi: isPurchasesUiAvailable(),
      /** True when this build talks to RevenueCat's Test Store. Dev banner only. */
      isTestStore: isTestStoreBuild(),
      packages,
      loadingPackages,
      loadPackages,
      purchase,
      restore,
      refresh,
      loadCustomerSummary,
      openPaywall,
      openCustomerCenter,
      limit,
      atLimit,
      blockAtLimit,
    }),
    [
      isPlatinum,
      entitlement,
      status,
      packages,
      loadingPackages,
      loadPackages,
      purchase,
      restore,
      refresh,
      loadCustomerSummary,
      openPaywall,
      openCustomerCenter,
      limit,
      atLimit,
      blockAtLimit,
    ]
  );
});

export default usePlatinum;
