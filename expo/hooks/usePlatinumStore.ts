/**
 * Driveverse Platinum — the entitlement hook.
 *
 * ONE source of truth for "is this driver Platinum": RevenueCat's
 * `customerInfo.entitlements.active["platinum"]`. Every gated feature in the
 * app reads `isPlatinum` from here. There is deliberately no parallel
 * `profiles.is_platinum` the client writes — see `constants/platinum.ts`.
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
 *   upgrade screen, passing the benefit that was blocked so the paywall can
 *   pin the relevant row. Keeping it on this hook means a screen needs one
 *   import to both check the gate and offer the way past it.
 */

import createContextHook from "@nkzw/create-context-hook";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FEATURE_BENEFIT,
  isAtLimit,
  limitFor,
  type LimitedFeature,
  type PlatinumBenefitId,
} from "@/constants/platinum";
import {
  configurePurchases,
  forgetUser,
  getEntitlement,
  getPlatinumPackages,
  identify,
  isPurchasesAvailable,
  NO_ENTITLEMENT,
  onEntitlementChange,
  presentCustomerCenter as presentCustomerCenterUI,
  presentPaywall as presentPaywallUI,
  purchase as purchasePackage,
  restore as restorePurchases,
  type EntitlementSnapshot,
  type PlatinumPackage,
  type PresentPaywallResult,
  type PurchaseResult,
  type RestoreResult,
} from "@/lib/purchases";
import { supabase } from "@/lib/supabase";

const CACHE_KEY = "driveverse_platinum";

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

export const [PlatinumProvider, usePlatinum] = createContextHook(() => {
  const [userId, setUserId] = useState<string | null>(null);
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
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  /* ─── Configure + identify ──────────────────────────────── */

  const applySnapshot = useCallback((snapshot: EntitlementSnapshot) => {
    setEntitlement(snapshot);
    const uid = userIdRef.current;
    if (uid) void writeCache(uid, snapshot);
  }, []);

  useEffect(() => {
    let active = true;

    if (!userId) {
      // Signed out: drop the entitlement immediately rather than letting the
      // previous account's Platinum styling bleed into a guest session.
      setEntitlement(NO_ENTITLEMENT);
      setPackages([]);
      setStatus(isPurchasesAvailable() ? "ready" : "unavailable");
      void forgetUser();
      return;
    }

    (async () => {
      // Paint from cache first so Platinum surfaces don't flash Regular.
      const cached = await readCache(userId);
      if (active && cached) setEntitlement(cached);

      const ok = await configurePurchases(userId, {
        debugLogs: __DEV__,
      });
      if (!active) return;
      if (!ok) {
        setStatus("unavailable");
        return;
      }

      const snapshot = await identify(userId);
      if (!active) return;
      applySnapshot(snapshot);
      setStatus("ready");
    })();

    return () => {
      active = false;
    };
  }, [userId, applySnapshot]);

  /* ─── Live entitlement updates ──────────────────────────── */

  // Renewals, expirations, refunds and purchases made on another device all
  // arrive through this listener, so nothing has to poll.
  useEffect(() => {
    if (status !== "ready" || !userId) return;
    return onEntitlementChange(applySnapshot);
  }, [status, userId, applySnapshot]);

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
      if (result.status === "purchased") applySnapshot(result.entitlement);
      return result;
    },
    [applySnapshot]
  );

  const restore = useCallback(async (): Promise<RestoreResult> => {
    const result = await restorePurchases();
    if (result.status === "restored") applySnapshot(result.entitlement);
    return result;
  }, [applySnapshot]);

  /* ─── Paywall ───────────────────────────────────────────── */

  /**
   * Raises the paywall, pinning `trigger`'s benefit row to the top so the
   * screen speaks to whatever the driver was just blocked on.
   */
  const openPaywall = useCallback((trigger?: PlatinumBenefitId) => {
    router.push(
      (trigger ? `/platinum?trigger=${trigger}` : "/platinum") as never
    );
  }, []);

  /**
   * RevenueCat's hosted, dashboard-configured paywall — an alternative to
   * `openPaywall` for a call site that wants a remotely-editable upsell
   * instead of the in-house screen. Applies the result immediately when the
   * sheet reports a purchase or restore, same as `purchase`/`restore` below.
   */
  const presentHostedPaywall = useCallback(
    async (offeringIdentifier?: string): Promise<PresentPaywallResult> => {
      const result = await presentPaywallUI(offeringIdentifier);
      if (result.purchased || result.restored) await refresh();
      return result;
    },
    [refresh]
  );

  /**
   * Customer Center first, store deep link only when it can't be shown
   * (Expo Go, web, or the UI module missing) — see `manageSubscriptionUrl`
   * for the fallback path.
   */
  const openCustomerCenter = useCallback(async (): Promise<boolean> => {
    const presented = await presentCustomerCenterUI();
    if (presented) await refresh();
    return presented;
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
      packages,
      loadingPackages,
      loadPackages,
      purchase,
      restore,
      refresh,
      openPaywall,
      presentHostedPaywall,
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
      openPaywall,
      presentHostedPaywall,
      openCustomerCenter,
      limit,
      atLimit,
      blockAtLimit,
    ]
  );
});

export default usePlatinum;
