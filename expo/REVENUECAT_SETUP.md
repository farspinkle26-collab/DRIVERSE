# RevenueCat setup — Driveverse Platinum

Everything needed to take Platinum from "code is written" to "a driver can pay
for it". The *why* behind the architecture is in `PLATINUM_REFERENCE.md`; this
file is the runbook.

| | |
|---|---|
| SDK | `react-native-purchases` 10.4.x + `react-native-purchases-ui` 10.4.x |
| Entitlement id | `platinum` |
| Offering id | `platinum` |
| Products | `monthly`, `yearly` |
| App code | `lib/purchases.ts`, `lib/purchasesUi.tsx`, `hooks/usePlatinumStore.ts`, `app/platinum.tsx`, `app/subscription.tsx` |

---

## 1. Install

```bash
cd expo
npm install --save react-native-purchases react-native-purchases-ui
```

Both are already in `package.json`. The two versions must match exactly —
`react-native-purchases-ui@10.4.4` declares `react-native-purchases: 10.4.4` as
a peer dependency, not a range. Upgrade them together, never one alone.

> This repo currently has an unrelated peer conflict between
> `@rork-ai/toolkit-sdk` and `@ai-sdk/react`, so a plain `npm install` fails on
> a clean tree. Use `npm install --legacy-peer-deps` (or `bun install`) until
> that is resolved; it is not caused by anything here.

**These are native modules.** They do not work in Expo Go. Platinum needs a
development build, a TestFlight build, or an internal-track build:

```bash
npx expo run:ios      # or: eas build --profile development --platform ios
npx expo run:android
```

Nothing else is required — no config plugin, no manifest edit. Expo autolinks
both packages, and the Google Play Billing library contributes the
`com.android.vending.BILLING` permission through manifest merging. Android
additionally pulls in Jetpack Compose for the paywall views, which Expo SDK 54's
compileSdk and Kotlin versions already satisfy.

**In Expo Go and on web the app still runs.** Every driver reads as Regular,
all caps apply, and the paywall opens with fallback prices and a disabled CTA.
That is deliberate — see §7 of `PLATINUM_REFERENCE.md`.

---

## 2. API keys

Copy `.env.example` to `.env` and fill in.

```bash
# Development, before any store products exist:
EXPO_PUBLIC_REVENUECAT_TEST_API_KEY=test_…

# Production, from RevenueCat → Project Settings → API keys → App specific keys:
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_…
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_…
```

`resolveKey()` in `lib/purchases.ts` picks between them:

1. The platform key, whenever it is set. Adding real keys switches a build off
   the Test Store with no code change.
2. Otherwise the Test Store key — **but only when `__DEV__` is true.** A
   release build with a `test_` key configured logs an error and disables
   purchases rather than shipping simulated billing to real customers.

All three are *publishable* keys and belong in the bundle. The **secret** key
(`sk_…`) is only ever used server-side by the webhook and must never appear in
`expo/`.

---

## 3. Products and the offering

### 3.1 Store products

Create these in App Store Connect and Google Play Console. Product ids live in
`PLATINUM_PRODUCTS` (`constants/platinum.ts`) — runtime code never hardcodes a
product, it reads whatever the offering returns, so these are a reference for
the dashboard rather than a contract with the app.

iOS product ids follow the app's real bundle id, `app.rork.driverse` (no "e"
before the "r" — see `app.json`), not the "driveverse" spelling used in copy
and code elsewhere. Android uses Google Play's `subscriptionId:basePlanId`
form — one subscription (`driverse_platinum`) with a monthly and an annual
base plan, so upgrading is a plan change, not a second subscription:

| Period | iOS product id | Android product id | iOS type | Android type |
|---|---|---|---|---|
| Monthly | `driverse_monthly_10` | `driverse_platinum:driverse-monthly-10` | Auto-renewable subscription | Subscription, monthly base plan |
| Yearly | `driverse_yearly_100` | `driverse_platinum:driverse-yearly-100` | Auto-renewable subscription | Subscription, annual base plan |

As of the current setup, all four store products exist. The iOS pair
(`driverse_yearly_100`, `driverse_monthly_10`) is **Waiting for Review** and
attached to the `platinum` entitlement; the Android pair
(`driverse_platinum:driverse-yearly-100`,
`driverse_platinum:driverse-monthly-10`) is **Published** and attached to the
`platinum` entitlement. Attaching to the entitlement is *not* the same as
attaching to the paywall — a product reaches the paywall only through the
offering's packages (step 3.2.3). Both stores' products go into the *same two
packages*, so add the Android products alongside the iOS ones there — a
product attached to the entitlement but not to a package purchases and grants
nothing, and never appears on the paywall.

Put monthly and yearly in the **same subscription group** (iOS) / the same
subscription (Android, two base plans). That is what makes upgrading from
monthly to yearly a plan change rather than a second concurrent subscription,
and it is what the Customer Center's "change plan" flow operates on.

### 3.2 RevenueCat dashboard

1. **Project → Apps** — add the iOS and Android apps. iOS also needs an
   In-App Purchase Key uploaded, or StoreKit 2 purchases fail.
2. **Entitlements** — create `platinum`. Attach all four store products —
   the two iOS (`driverse_yearly_100`, `driverse_monthly_10`) and the two
   Android (`driverse_platinum:driverse-yearly-100`,
   `driverse_platinum:driverse-monthly-10`) — from **Product catalog →
   Products**, click **Attach** on each row and select the `platinum`
   entitlement. Each store's products sit in that store's section of the
   Products page.
3. **Offerings** — create an offering with identifier `platinum` and mark it
   Current. Add two packages using RevenueCat's reserved identifiers, and put
   **both stores' products for a period into the one package** — that is what
   lands the Android products on the same paywall as the iOS ones; RevenueCat
   serves each device the product for its own store:

   | Package | Identifier | Attach (iOS) | Attach (Android) |
   |---|---|---|---|
   | Monthly | `$rc_monthly` | `driverse_monthly_10` | `driverse_platinum:driverse-monthly-10` |
   | Annual | `$rc_annual` | `driverse_yearly_100` | `driverse_platinum:driverse-yearly-100` |

   To add the second store's product to an existing package, open the package
   and use **Attach Product** again — a package holds one product per store,
   not one product total. If the Android rows aren't already in these two
   packages, that is the whole of "make the Android products attach to the
   paywall like the others": add them here.

   Use the reserved ids (`PLATINUM_PACKAGE_IDS` in `constants/platinum.ts`).
   They make `packageType` come back as `MONTHLY` / `ANNUAL`, so `periodOf()`
   maps packages by type instead of pattern-matching a product name. Custom
   identifiers still work — there is a fallback — but they are a string match
   waiting to break.

4. **Webhook** — deploy `supabase/functions/revenuecat-webhook`, set
   `REVENUECAT_WEBHOOK_SECRET`, and point RevenueCat's webhook at it with that
   value as the Authorization header. This writes the `platinum_subscribers`
   mirror, which backs the RLS tier-cap triggers and the AI-showcase cost gate.
5. Run `database_migration_platinum.sql`.

---

## 4. Paywall

`openPaywall()` routes to **`app/platinum.tsx`**, the paywall this app owns
and styles. RevenueCat's dashboard-configured paywall is **not** raised.

### 4.1 Why the hosted paywall is not used (6 Aug 2026)

It used to be preferred, with `app/platinum.tsx` as the fallback. That is
reversed, because the hosted paywall is a RevenueCat template: it carries none
of the design system — no cut corners, no palette tokens, no
Rajdhani/JetBrains Mono split — so the one screen asking a driver for money
was the one screen that did not look like Driveverse.

**What this costs, stated plainly:** pricing, copy, layout and package order
are now **app-release changes, not dashboard edits**, and RevenueCat's paywall
A/B testing is unavailable. That is the trade. If it stops being worth it, the
better answer is to rebuild the *dashboard* paywall in Driveverse's style
rather than reintroduce a second, differently-styled one —
`presentPaywall` in `lib/purchasesUi.tsx` is untouched and still works, and
`hasPurchasesUi` still reports whether it could render.

**What is unaffected:**

- **Purchasing.** `app/platinum.tsx` buys through `lib/purchases.ts` (the SDK,
  not the UI package). Entitlements still arrive via `onEntitlementChange`.
- **The Customer Center.** Still RevenueCat's, still used — Apple and Google
  effectively require it for managing and cancelling a subscription.
- **Offerings and products.** Still configured in the dashboard exactly as
  §2 and §3 describe; the app reads packages from the `platinum` offering.

The contextual trigger still works, but it is now an app-side lookup rather
than a `{{ custom.trigger_headline }}` template variable: `openPaywall("garage")`
passes `?trigger=garage`, and `app/platinum.tsx` resolves the headline through
`benefitById`. Nothing to configure in the dashboard for it.

### 4.1b Plan names

The plan rows read **Platinum Monthly**, **Platinum Yearly** and (when the
package exists) **Platinum Lifetime**. These are the app's own labels in
`app/platinum.tsx`, not the store's product names.

**The store's product display name is separate and is not set from this
repo.** It is what the OS purchase sheet shows when the driver confirms, and
it comes from App Store Connect (the subscription's *Display Name*) and Google
Play Console (the base plan / product *Name*). If those still read something
like the raw product id, change them there — no app release is needed for it.

### 4.2 How the app calls it

Every friction point in the app already does this — there is nothing to add
when you gate a new feature:

```ts
const { isPlatinum, openPaywall, blockAtLimit } = usePlatinum();

// Straight ask:
openPaywall("garage");

// Cap check + paywall in one. Returns true if the action should stop.
if (blockAtLimit("garageCars", cars.length)) return;
```

`openPaywall` is synchronous for its ~15 call sites and now does one thing:
pushes `/platinum?trigger=<benefit>`. The branch that presented RevenueCat's
paywall — and the session flag that remembered whether it worked — are gone
(§4.1).

A purchase still does **not** return through `openPaywall`. It arrives on the
customer-info listener in `hooks/usePlatinumStore.ts`, the same path that
carries renewals, refunds and purchases made on another device.

### 4.3 Presenting one directly

For a screen that wants RevenueCat's own paywall inline rather than through
the hook. **Nothing in the app does this today** (§4.1) — the API is kept
working so the decision stays reversible:

```tsx
import { presentPaywall } from "@/lib/purchasesUi";
import { getPlatinumOffering } from "@/lib/purchases";

const outcome = await presentPaywall({
  offering: await getPlatinumOffering(),
  triggerHeadline: "AI Showcase is a Platinum feature",
  onlyIfNeeded: true, // skip entirely if Platinum is already active
});
// "purchased" | "restored" | "cancelled" | "not_presented" | "error" | "unavailable"
if (outcome === "error" || outcome === "unavailable") {
  // Always keep a fallback. "No paywall configured yet" is a normal state.
}
```

---

## 5. Customer Center

The post-purchase surface: status, plan changes, restore, refund requests
(iOS), and cancellation with whatever retention offer the dashboard defines.

**Dashboard → Customer Center** to configure the sections, the cancellation
survey and the retention offer. Nothing in the app needs to change when you
edit any of it.

```ts
const { openCustomerCenter } = usePlatinum();
await openCustomerCenter();
```

That presents it modally, and falls back to `app/subscription.tsx` — the app's
own manage screen — when the native module is absent. `/subscription` renders
the embedded `CustomerCenterView` when it can, and its own summary plus a
restore button and a store handoff when it can't.

Entry points wired up:

| Where | Behaviour |
|---|---|
| Profile → Settings → DRIVEVERSE PLATINUM | Paywall for Regular, Customer Center for a subscriber |
| Paywall → "Manage Subscription" | Customer Center |
| `/subscription` | Direct/deep-link route |

**Neither store permits an in-app cancel flow.** Every path here ends in a
handoff to the App Store or Google Play. That is the Customer Center's design
too — it keeps the driver inside Driveverse for everything except the one
action Apple and Google reserve for themselves.

---

## 6. Reading entitlement and customer info

**One gate, everywhere:**

```ts
const { isPlatinum } = usePlatinum();
```

That resolves to `customerInfo.entitlements.active["platinum"]`. There is no
`profiles.is_platinum` column the client writes — a second flag drifts the
moment a renewal fails, a refund lands, or a purchase is restored on another
device. See `PLATINUM_REFERENCE.md` §2 for the three readers and why they are
not interchangeable.

The full snapshot, when the UI needs more than a boolean:

```ts
const { entitlement } = usePlatinum();

entitlement.isTrial                 // inside a free trial, not yet charged
entitlement.willRenew               // false once cancelled
entitlement.expiresAt               // ISO
entitlement.billingIssueDetectedAt  // failed charge; usually still in grace
entitlement.productIdentifier
entitlement.isSandbox
entitlement.store                   // APP_STORE | PLAY_STORE | TEST_STORE | …
entitlement.managementURL
```

For a support or debug surface — never a gate:

```ts
const { loadCustomerSummary } = usePlatinum();
const summary = await loadCustomerSummary();
// summary.originalAppUserId  ← quote this in support tickets
// summary.activeSubscriptions, .nonSubscriptionProductIdentifiers, …
```

### Identity

The SDK is configured as soon as auth answers, with the Supabase user id when
there is one and `null` when there isn't — so a signed-out driver still sees
real store prices. `identify()` then migrates RevenueCat's anonymous id, and
anything bought under it, onto the Supabase id at sign-in. That is what makes a
subscription follow the account rather than the install.

---

## 7. Purchasing and restoring by hand

Only needed if you build a purchase surface outside the paywall.

```ts
const { packages, loadPackages, purchase, restore } = usePlatinum();

await loadPackages();                          // cheapest first
const yearly = packages.find(p => p.period === "yearly");
const result = await purchase(yearly!);

switch (result.status) {
  case "purchased":     break; // entitlement already applied
  case "cancelled":     break; // the driver's decision — never an error
  case "pending":       break; // Play prepaid / Ask to Buy: lands on the listener
  case "already_owned": break; // owned on this store account; restored, not charged
  case "unavailable":   break; // Expo Go, web, or no API key
  case "error":         Alert.alert("Purchase failed", result.message);
}
```

Three of those are deliberately not failures. Treating `pending` as an error
tells a driver their payment failed when it is merely still clearing, and
`already_owned` most often means a reinstall, where charging again would be the
actual bug.

`result.message` is already written for a driver — `lib/purchases.ts` maps the
codes this app can hit (network, store outage, purchases disallowed, invalid
payment, product unavailable, receipt in use elsewhere) to plain language, and
anything unmapped falls through to the SDK's own text.

**Restore** must stay reachable from the paywall: App Store Review guideline
3.1.1. It is, and the Customer Center's "I don't see my purchase" runs the same
operation.

---

## 8. Testing

### Test Store — no store setup required

Set `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` and run a dev build. Purchases complete
against RevenueCat's own sandbox: offerings load, the paywall renders, the
entitlement is granted, and the Customer Center works — before a single App
Store Connect or Play Console product exists.

The app shows a **TEST STORE** tag on the paywall and the subscription screen
so a simulated purchase is never mistaken for a real one, and refuses the key
outright in a release build.

### Store sandboxes

- **iOS** — a Sandbox Apple ID (App Store Connect → Users and Access →
  Sandbox), purchasing in a dev or TestFlight build.
- **Android** — a licence-tester Google account on an internal-testing track.

RevenueCat reports sandbox purchases through the same `customerInfo` shape as
production; there is no separate code path. `entitlement.isSandbox` drives the
**SANDBOX** tag.

### Worth exercising explicitly

- Buy monthly, then yearly — confirm it reads as a plan change, not two subs.
- Cancel in the store — `willRenew` goes false while `isPlatinum` stays true
  until `expiresAt`. Access must not be revoked early.
- Restore on a second device signed into the same Supabase account.
- Airplane mode — the paywall shows fallback prices and a disabled CTA; the
  24h AsyncStorage cache keeps a subscriber's badge from flashing Regular.

---

## 9. Before shipping

- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `_ANDROID_KEY` set in the release
      build's environment. A `test_` key is refused at runtime, but do not rely
      on that as the only check.
- [ ] Both products **Approved** in both stores, and attached to the
      `platinum` entitlement and the `platinum` offering.
- [ ] The `platinum` offering is marked **Current**.
- [ ] A paywall is attached to the offering, or the app's own screen is the
      intended experience. Either is fine; know which one you shipped.
- [ ] Webhook deployed, secret set, and a test event lands in
      `platinum_subscribers`.
- [ ] `database_migration_platinum.sql` run against production.
- [ ] Restore Purchases reachable from the paywall (guideline 3.1.1).
- [ ] Billing terms on the paywall name the store as merchant of record —
      already in `app/platinum.tsx`, keep it if the copy changes.
