/**
 * Driveverse — RevenueCat Paywalls and Customer Center.
 *
 * `react-native-purchases-ui` renders two things that are *configured in the
 * RevenueCat dashboard rather than built here*:
 *
 *   PAYWALL         The upgrade screen, with its own layout, copy, images and
 *                   A/B tests. Changing the offer, the trial length or the
 *                   headline becomes a dashboard edit rather than an app
 *                   release — which matters because a store release takes days
 *                   and a pricing experiment is worthless at that cadence.
 *
 *   CUSTOMER CENTER The post-purchase surface: subscription status, plan
 *                   changes, restore, refund requests (iOS), cancellation with
 *                   a retention offer, and the cancellation survey. Apple and
 *                   Google both forbid an in-app cancel *flow*, and the
 *                   Customer Center is the sanctioned shape — it hands off to
 *                   the store for the actual cancel while keeping the driver
 *                   inside Driveverse for everything else.
 *
 * WHY IT WRAPS RATHER THAN BEING CALLED DIRECTLY
 *   Same reason as `lib/purchases.ts`: this is a native module, absent in Expo
 *   Go and on web, and it is also optional relative to the SDK — a project can
 *   run purchases with no paywall configured. Every export degrades to
 *   "unavailable", and the caller falls back to `app/platinum.tsx`, the
 *   hand-built paywall, which is never removed. A dashboard misconfiguration
 *   must not be able to leave a driver with no way to subscribe.
 *
 * IMPORTANT: purchases made inside these views do NOT come back as a return
 * value the app's entitlement state can be built from. They arrive through
 * `onEntitlementChange` in `lib/purchases.ts`, the same listener that already
 * carries renewals and cross-device purchases. The outcome returned here is
 * for navigation and messaging only.
 */

import React from "react";
import { Platform } from "react-native";
import { PLATINUM_ENTITLEMENT_ID } from "@/constants/platinum";

/* ------------------------------------------------------------------ *
 * Optional native backend
 * ------------------------------------------------------------------ */

type RevenueCatUIModule = typeof import("react-native-purchases-ui").default;

let resolved = false;
let mod: RevenueCatUIModule | null = null;

function ui(): RevenueCatUIModule | null {
  if (resolved) return mod;
  resolved = true;
  if (Platform.OS === "web") {
    // The package ships no web build; the app's own paywall screen serves web.
    mod = null;
    return mod;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require("react-native-purchases-ui");
    const candidate = (required?.default ?? required) as RevenueCatUIModule;
    // A JS-only shim won't expose `presentPaywall`; treat that as absent.
    mod =
      typeof (candidate as { presentPaywall?: unknown })?.presentPaywall ===
      "function"
        ? candidate
        : null;
  } catch {
    mod = null;
  }
  return mod;
}

/** Whether RevenueCat's own paywall/Customer Center views can render here. */
export function isPurchasesUiAvailable(): boolean {
  return ui() != null;
}

/* ------------------------------------------------------------------ *
 * Paywall
 * ------------------------------------------------------------------ */

/**
 * `PAYWALL_RESULT`, mirrored. Importing the enum would load the native module
 * on web — the same reason `lib/purchases.ts` mirrors its error codes.
 */
const PAYWALL_RESULT = {
  NOT_PRESENTED: "NOT_PRESENTED",
  ERROR: "ERROR",
  CANCELLED: "CANCELLED",
  PURCHASED: "PURCHASED",
  RESTORED: "RESTORED",
} as const;

export type PaywallOutcome =
  | "purchased"
  | "restored"
  /** Dismissed without buying. The driver's decision, not a failure. */
  | "cancelled"
  /** `presentPaywallIfNeeded` only: the entitlement was already active. */
  | "not_presented"
  /**
   * The view could not do its job — most often no paywall is attached to the
   * offering in the dashboard. Callers fall back to `app/platinum.tsx`.
   */
  | "error"
  /** No native module on this runtime. */
  | "unavailable";

/**
 * Custom variables for a Paywall v2 template, referenced in dashboard copy as
 * `{{ custom.trigger_headline }}`. This is how the contextual trigger survives
 * the move to a hosted paywall: the friction point still says "your garage is
 * full at 2 cars", it is just the dashboard that decides where that line sits.
 *
 * Built as literals rather than through the SDK's `CustomVariableValue`
 * factory so this module stays importable without the native package.
 */
function customVariables(
  values: Record<string, string | undefined>
): Record<string, { type: "string"; value: string }> | undefined {
  const entries = Object.entries(values).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
  );
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([key, value]) => [key, { type: "string" as const, value }])
  );
}

export interface PresentPaywallOptions {
  /**
   * The offering to render, from `getPlatinumOffering()`. Passing it
   * explicitly means the hosted paywall shows the Platinum products even if
   * the dashboard's "current" offering is something else.
   */
  offering?: unknown | null;
  /** Copy for the benefit that raised the paywall, if any. */
  triggerHeadline?: string;
  /**
   * Only present the paywall if Platinum is not already active. Use this for
   * "unlock X" entry points; leave it off for a deliberate "see the plans" tap,
   * where an existing subscriber should still be able to look.
   */
  onlyIfNeeded?: boolean;
}

function toOutcome(result: string): PaywallOutcome {
  switch (result) {
    case PAYWALL_RESULT.PURCHASED:
      return "purchased";
    case PAYWALL_RESULT.RESTORED:
      return "restored";
    case PAYWALL_RESULT.CANCELLED:
      return "cancelled";
    case PAYWALL_RESULT.NOT_PRESENTED:
      return "not_presented";
    default:
      return "error";
  }
}

/**
 * Presents the RevenueCat-hosted paywall.
 *
 * Returns `"unavailable"` or `"error"` when it cannot render, which is the
 * signal to fall back to `app/platinum.tsx` — the caller must always have that
 * fallback, because "no paywall configured in the dashboard yet" is a normal
 * state for a project mid-setup and must not read as "Platinum is broken".
 */
export async function presentPaywall(
  options: PresentPaywallOptions = {}
): Promise<PaywallOutcome> {
  const RevenueCatUI = ui();
  if (!RevenueCatUI) return "unavailable";

  const params = {
    offering: (options.offering ?? undefined) as never,
    customVariables: customVariables({
      trigger_headline: options.triggerHeadline,
    }) as never,
  };

  try {
    const result = options.onlyIfNeeded
      ? await RevenueCatUI.presentPaywallIfNeeded({
          ...params,
          requiredEntitlementIdentifier: PLATINUM_ENTITLEMENT_ID,
        })
      : await RevenueCatUI.presentPaywall(params);
    return toOutcome(String(result));
  } catch (err) {
    console.error("[purchasesUi] presentPaywall failed:", err);
    return "error";
  }
}

/* ------------------------------------------------------------------ *
 * Customer Center
 * ------------------------------------------------------------------ */

export interface CustomerCenterHandlers {
  /** A restore run from "I don't see my purchase" succeeded. */
  onRestoreCompleted?: () => void;
  /** The driver was handed off to the store's own subscription screen. */
  onShowingManageSubscriptions?: () => void;
  /** Cancellation survey answered — the reason id, for retention analysis. */
  onFeedbackSurveyCompleted?: (optionId: string) => void;
  /**
   * A management option was chosen: 'cancel' | 'refund_request' |
   * 'change_plans' | 'missing_purchase' | 'custom_url' | …
   */
  onManagementOptionSelected?: (option: string) => void;
}

/**
 * Maps our handlers onto the SDK's callback shape. Kept separate so both the
 * modal presentation and the embedded view feed the same four hooks.
 */
function toCallbacks(handlers: CustomerCenterHandlers = {}) {
  return {
    onRestoreCompleted: () => handlers.onRestoreCompleted?.(),
    onShowingManageSubscriptions: () => handlers.onShowingManageSubscriptions?.(),
    onFeedbackSurveyCompleted: ({
      feedbackSurveyOptionId,
    }: {
      feedbackSurveyOptionId: string;
    }) => handlers.onFeedbackSurveyCompleted?.(feedbackSurveyOptionId),
    onManagementOptionSelected: ({ option }: { option: string }) =>
      handlers.onManagementOptionSelected?.(option),
  };
}

/**
 * Presents the Customer Center modally, over whatever is on screen.
 *
 * Resolves when the sheet has been *presented*, not when it is dismissed — the
 * SDK gives no dismissal promise, so anything that needs to run afterwards
 * belongs in a handler or on the entitlement listener.
 *
 * Returns false when unavailable, so the caller can fall back to
 * `manageSubscriptionUrl()` and open the store's own screen instead.
 */
export async function presentCustomerCenter(
  handlers?: CustomerCenterHandlers
): Promise<boolean> {
  const RevenueCatUI = ui();
  if (!RevenueCatUI) return false;
  try {
    await RevenueCatUI.presentCustomerCenter({
      callbacks: toCallbacks(handlers) as never,
    });
    return true;
  } catch (err) {
    console.error("[purchasesUi] presentCustomerCenter failed:", err);
    return false;
  }
}

/**
 * The Customer Center as an embedded view, for hosting on a route of our own
 * (`app/subscription.tsx`) instead of as a modal over the app.
 *
 * Renders `null` when the native module is absent, which is why every caller
 * must check `isPurchasesUiAvailable()` and render its own fallback rather than
 * relying on this to explain itself.
 */
export function CustomerCenterView({
  onDismiss,
  handlers,
  style,
}: {
  onDismiss?: () => void;
  handlers?: CustomerCenterHandlers;
  style?: object;
}) {
  const RevenueCatUI = ui();
  if (!RevenueCatUI) return null;
  const View = RevenueCatUI.CustomerCenterView;
  return (
    <View
      style={style}
      onDismiss={onDismiss}
      // The route supplies its own header and back affordance, so the view's
      // internal close button would be a second way out of the same screen.
      shouldShowCloseButton={false}
      {...toCallbacks(handlers)}
    />
  );
}
