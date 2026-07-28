# Driveverse Platinum — subscription tier

Companion to `constants/platinum.ts`, `hooks/usePlatinumStore.ts` and
`database_migration_platinum.sql`. Read `DESIGN_SYSTEM_AUDIT.md` and
`PROFILE_SCREEN_REFERENCE.md` first; this file only records what is specific
to Platinum.

---

## 1. Payment infrastructure

**RevenueCat, wrapping native StoreKit and Google Play Billing.**
`react-native-purchases` ^10.4 plus `react-native-purchases-ui` ^10.4, which
adds the dashboard-configured Paywall and the Customer Center.

> **Setup is now a runbook of its own: `REVENUECAT_SETUP.md`.** Products,
> offering, dashboard steps, keys, testing and the pre-ship checklist all live
> there. This section keeps only the reasoning.

Apple requires digital subscriptions to be sold through In-App Purchase, so an
external gateway on iOS is a rejection rather than a preference. RevenueCat
gives both platforms one SDK, one entitlement model, and renewal/cancellation
webhooks with no billing pipeline of our own — which is also what the admin
dashboard's future Monetization section will read.

It also keeps Driveverse out of Bank Indonesia e-money licensing for this
flow: Apple and Google are the merchants of record, not us.

A local PSP (Midtrans/Xendit → GoPay/OVO/bank transfer) remains a separate,
larger effort. It cannot replace IAP on iOS, so it is an addition, not a
substitute. Nothing here blocks it: `isPlatinum` is the only entitlement
question the app asks, and a second provider would answer the same question.

### Two products

Monthly and yearly are auto-renewing subscriptions in one subscription group.

### Test Store

`EXPO_PUBLIC_REVENUECAT_TEST_KEY` (a `test_` key) routes purchases to
RevenueCat's own sandbox, so the whole flow — offerings, paywall, purchase,
entitlement, Customer Center — is exercisable before any store product exists.

`resolveKey()` in `lib/purchases.ts` refuses it when `__DEV__` is false.
RevenueCat's rule is that a submitted app must never carry a `test_` key, and a
config file is far too easy to forget; enforcing it in code means a release
build cannot be wrong. A real platform key always wins over it, so adding the
`appl_`/`goog_` pair switches a build to real billing with no code change.

The paywall and subscription screens show a **TEST STORE** tag, next to the
existing **SANDBOX** tag driven by RevenueCat's own `isSandbox` flag, so no
simulated purchase is ever mistaken for a real one.

---

## 2. The entitlement model

**One source of truth: `customerInfo.entitlements.active['platinum']`.**

```ts
const { isPlatinum } = usePlatinum();
```

There is deliberately no `profiles.is_platinum` the client writes. A second
flag drifts the moment a renewal fails, a refund lands, or a purchase is
restored on another device.

Three things read subscription state, and they are not interchangeable:

| Reader | Source | Used for |
|---|---|---|
| `usePlatinum().isPlatinum` | RevenueCat SDK | **The gate.** Every feature check in the app. |
| `platinum_subscribers` (mirror) | RevenueCat webhook → Postgres | RLS cap triggers, and the AI-showcase cost gate. |
| `are_platinum()` RPC | the same mirror, projected to a boolean | Rendering *other drivers'* badges, which a client cannot read from the SDK. |

The mirror is never consulted to decide what the signed-in driver may see, and
the SDK is never consulted to authorise a write. If the mirror lags behind a
webhook retry, the worst case is a paying driver briefly hitting a Regular cap
on a *write*; their badge, aura and UI stay correct throughout.

`usePlatinumStore` caches the last known snapshot in AsyncStorage per user id
(24h TTL, dropped on sign-out, invalidated by a passed expiry) so Platinum
surfaces don't flash Regular on a cold start. The cache can make a badge
appear early. It cannot buy anything: `generate-showcase` re-checks entitlement
server-side before spending money.

---

## 3. Caps, and where each is enforced

Numbers live in `TIER_LIMITS` (`constants/platinum.ts`) and are mirrored in
`platinum_limit()` (SQL). **Change both.**

| Feature | Regular | Platinum | Client check | DB trigger |
|---|---:|---:|---|---|
| Garage cars | 2 | ∞ | `useActiveCarStore.addCar`, `ProfileScreen.handleAddCar` | `enforce_garage_limit` |
| Active events created | 1 | ∞ | `useEventsStore.createEvent` | `enforce_event_limit` |
| Saved places | 10 | ∞ | `useSavedPlacesStore.savePlace` | `enforce_saved_place_limit` |
| Convoy members | 2 | 8 | `usePartyStore.inviteFriend` / `createParty` | `enforce_convoy_limit` |
| Saved routes | 10 | ∞ | `useRoutesStore.saveRoute` | `enforce_saved_route_limit` |
| AI showcases / month | — | 5 | `ShowcaseModal` | `generate-showcase` edge function |

Both layers matter and they do different jobs. The client check is what makes
the cap a *good experience* — the paywall opens at the point of friction, with
the blocked benefit pinned. The trigger is what makes the cap *real*: the app
writes to `car_collections`, `events` and `party_members` directly, so without
it a modified client simply inserts a third car.

When the trigger wins a race the client lost (two devices, same moment), the
store parses the `PLATINUM_LIMIT:<feature>:<cap>` marker via
`lib/platinumLimits.ts` and still raises the right paywall, rather than
surfacing a Postgres error.

### Convoy capacity follows the ORGANISER

A convoy's size is capped by its leader's tier, not each joiner's. That is what
makes the perk coherent: a Platinum organiser can gather 8 Regular drivers, and
a Regular organiser's convoy doesn't grow because a Platinum driver joined it.

One consequence, deliberately handled: **a driver blocked from joining someone
else's full convoy is never shown the paywall.** Upgrading would not let them
in, so offering it would be a misleading upsell. They get "this convoy is
full." The paywall appears only for the organiser, on invite.

`CreateConvoyModal`'s capacity menu is now derived from the cap instead of the
old fixed `Unlimited / 5 / 10 / 25` — a menu offering a number the store then
clamps is a menu that lies.

---

## 4. Product decisions made here

The brief left four numbers open and asked for them to be flagged. These are
the values shipped; all four are one-line changes in `TIER_LIMITS` +
`platinum_limit()`.

| Decision | Value | Reasoning |
|---|---|---|
| Saved places cap | **10** | Suggested in the brief. Enough for a driver's real regular spots; low enough that an enthusiast hits it. |
| Convoy capacity | **2 → 8** | Top of the suggested 6–8. 8 is a plausible weekend convoy and makes the 4× jump legible. |
| AI showcase allowance | **5 / month** | Real per-image cost. Uncapped is an uncapped bill; 5 covers a typical garage and bounds the worst case. |
| Pricing | **Rp 49.000 / month, Rp 449.000 / year** (~24% off) | Display fallbacks only. Real prices always come from `product.priceString`, already localised by the store. **Wants your confirmation.** |

### "Route Discovery" — needs your confirmation

The brief flagged this as unclear, and it was: **no Regular-tier limit existed
anywhere on routes or discovery**, so there was nothing to remove a cap from.

Interpreted as **the driver's own saved-route library** (`saved_routes`), capped
at 10 for Regular and uncapped for Platinum, enforced in `useRoutesStore.saveRoute`
and shown on the "My Routes" tab.

The **community feed is not capped for anyone**. Capping how many of other
people's public routes you may look at would make the app worse rather than
making Platinum better — the feed is the social surface the whole route feature
exists for, and a paywalled scroll depth is a dark pattern, not a perk.

If "Route Discovery" was meant to be something else — a map-based road-discovery
mode, or a limit on the feed itself — say so and I'll move it. The
implementation is one constant and one trigger.

---

## 5. Visual identity

**Platinum is chrome. It is never racingRed.**

`racingRed` already means "this is the thing to press" — primary action, active
tab, live route. A subscription tier painted in it would put two meanings on
one hue and dilute the accent everywhere else in the app.

The ramp is four values in `constants/platinum.ts`, deliberately as small as
the six-value core palette:

| Token | Value | Use |
|---|---|---|
| `platinum.chrome` | `#E8EAED` | Identity colour: badge face, aura, frame stroke, paywall accents. |
| `platinum.chromeLight` | `#FFFFFF` | Specular highlight on the badge's lit edge. |
| `platinum.chromeDim` | `#A8ADB8` | Secondary strokes, inactive swatches. |
| `platinum.chromeDeep` | `#5C6270` | Shadowed facets, hairlines on chrome surfaces. |

### The badge is not a rank badge

`RankBadge` renders progression — rounded shields, per-tier hue, an emblem you
earn by driving. Platinum is orthogonal to progression (any rank can hold it),
so it is built from different parts:

- **Two** opposed corner cuts, where every other brand surface takes one. Same
  45° language, deliberately doubled, so the silhouette is recognisable at 12px
  in a chat row.
- A speed chevron rather than an emblem, echoing the logo's diagonal.
- A specular highlight along the lit edge — the one thing that makes flat grey
  read as metal instead of as a disabled state.

`PlatinumNameBadge` is the only component name-rendering surfaces should use,
so the badge can't drift in size or spacing between the profile, a chat row and
a convoy roster.

### The aura is restrained on purpose

One ring, chrome, `0.10–0.34` opacity, 12% travel, a 2.4s breath. The instinct
with a paid cosmetic is to make it loud enough to obviously be worth paying
for; that is wrong for an app whose thesis is precision over decoration. A neon
halo would be the gaudiest element in Driveverse and would cheapen the tier it
signals. It should read like a machined bezel, not a sticker.

With reduce-motion on, the pulse is **replaced** by the static ring at the
animation's mid-point — not sped up — per the rule in `hooks/useReducedMotion.ts`.

### Cosmetics are distinct shapes, not recolours

Four vehicle icons (coupe / widebody / hatch / SUV) are four different
silhouettes at the same stroke weight and 24×24 box as the lucide icons they
sit beside, so a mixed garage list still looks like one icon family. Four
frames (apex / caliper / telemetry / grid) are four different pieces of angular
framing. A chrome copy of the same glyph would be a colour swap dressed up as a
cosmetic set.

**A stored selection is not an entitlement.** `profiles.vehicle_icon` and
`profiles.profile_frame` keep their value after a subscription lapses; the
renderers fall back to the default set while `isPlatinum` is false, and the
choice returns intact on resubscribe.

---

## 6. Paywall

**Two implementations, and both are real.**

`openPaywall(benefit)` prefers the paywall configured in the RevenueCat
dashboard (`lib/purchasesUi.tsx` → `RevenueCatUI.presentPaywall`), because
pricing and copy experiments there ship in minutes instead of an app-review
cycle — and a pricing test that needs a release to adjust is a pricing test
nobody runs. It falls back to `app/platinum.tsx` when the UI module is absent
(Expo Go, web) or when the offering has no paywall attached, and it remembers
that answer for the session rather than paying for a failed present each time.

The fallback is never removed and is never degraded. A RevenueCat project
mid-setup is a normal state, and it must not leave a driver with no way to
subscribe.

The contextual trigger survives the handover: the blocked benefit's headline is
passed to the hosted paywall as the custom variable `{{ custom.trigger_headline }}`,
so a dashboard paywall can still open on "Your garage is full at 2 cars".

### Post-purchase: the Customer Center

`usePlatinum().openCustomerCenter()` presents RevenueCat's Customer Center —
status, plan changes, restore, iOS refund requests, and cancellation with the
dashboard's retention offer and survey. It falls back to `app/subscription.tsx`,
which renders the embedded `CustomerCenterView` when it can and the app's own
summary when it can't.

Every path ends in a handoff to the App Store or Google Play, because neither
store permits an in-app cancel flow. The profile's Platinum row routes by tier:
paywall for Regular, Customer Center for a subscriber — sending an existing
subscriber to a screen selling them what they already own is the most common
way that row goes wrong.

### `app/platinum.tsx`

Presented as a modal — it is always raised on top of something the driver was
in the middle of doing.

- Header: hero badge, "DRIVEVERSE / PLATINUM" in Rajdhani.
- Benefits: hairline-divided rows with a small icon. Not nine CutCorner cards —
  the cut on everything stops being a signature (`components/CutCorner.tsx`).
- Pricing: monthly/yearly two-up, prices in JetBrains Mono like every other
  number in the app. The yearly saving is computed against 12× the monthly price
  and is shown **only** when both prices came from the store; deriving a discount
  from the fallback strings would advertise a number nobody is charging.
- CTA: racingRed solid CutCorner. Platinum owns chrome, but "the button you
  press" is red everywhere in Driveverse and this is not the screen to break it.
  It says "Start Free Trial" **only** when the store reported an intro offer at
  price 0 on the selected product; the app never invents a trial.
- "Restore Purchases": present as required by App Store guideline 3.1.1,
  deliberately not prominent.
- Already subscribed: renewal state — which distinguishes free trial, renewing
  and cancelled, three states a `willRenew` boolean collapses into two wrong
  ones — a grace-period notice when the store reports a failed charge, and
  "Manage Subscription", which opens the Customer Center.

**Contextual trigger.** Friction points call `openPaywall(benefit)`, which
routes to `?trigger=<benefitId>`; that benefit is pinned at the top under a
contextual headline ("Your garage is full at 2 cars") and the rest follow under
"ALSO INCLUDED". No benefit is dropped — a driver blocked on the garage should
still see they're also buying the badge.

---

## 7. Behaviour without the native module

`react-native-purchases` and `react-native-purchases-ui` are absent in Expo Go
and on web, and this app runs in both. `lib/purchases.ts` and
`lib/purchasesUi.tsx` load them defensively (the same pattern
`lib/shareCard.ts` uses for `react-native-share`) and every export degrades to
"no subscription, no store" rather than throwing.

The rule extends to the SDKs' **enums**: importing `PURCHASES_ERROR_CODE`,
`PACKAGE_TYPE` or `PAYWALL_RESULT` at module scope would pull the native module
in on web, which is the exact thing the defensive loader exists to avoid. They
are mirrored as plain string constants instead, matching the SDK's wire values.

So on those runtimes: the app works, every driver is Regular, all caps apply,
the paywall still opens and explains the tier with fallback prices and a
disabled CTA plus a line saying purchases need the store build, and
`/subscription` shows the app's own manage screen in place of the Customer
Center. That is also what makes the rest of the app testable before the store
products go live.

---

## 8. Early access

`constants/earlyAccess.ts` + `hooks/useEarlyAccess.ts`.

A flag has three stages: `platinum` (the perk), `everyone` (graduated), `off`
(merged but dark). A feature opts in with one entry and one hook call:

```ts
const gate = useEarlyAccess("some-feature");
if (!gate.enabled) return <PlatinumLockedRow … />;
```

When the flag graduates, flipping `stage` to `"everyone"` opens it for all
drivers and the feature's own code never changes. `gate.showUpsell` is true
only for `platinum` + not-subscribed, so an `off` flag can never advertise
itself as a perk that doesn't exist.

The list is a build-time constant rather than a remote config. This app already
ships a release to change a cap, so a remote config today would be
infrastructure with no customer — `resolveStage()` is the single seam where one
would be swapped in.

---

## 9. AI Car Showcase

Platinum-only. Distinct from the existing `generate-car-image`, which restyles
the garage photo *in place*; a showcase is a standalone artwork with its own
bucket, its own ledger row, and a path out to the share sheet.

- **Provider:** Gemini 3.1 Flash Lite Image via OpenRouter — the same provider,
  key and model the garage render already uses. A second vendor would double
  the billing surface and the failure modes for no product gain.
- **Cost control lives on the server.** `generate-showcase` checks the
  entitlement mirror and the `ai_showcases` ledger before calling the provider,
  and writes the ledger row *before* returning, so a burst of parallel requests
  cannot each see the same remaining count.
- Three looks (studio / night / track). Unique storage path per generation, so
  a second render never destroys a first the driver may already have shared.
- **Sharing reuses the Share Trip export path**: a `showcase` variant was added
  to `ShareableCard`, and `ShareCardModal` drives the same 1080×1920
  capture-and-hand-to-the-OS flow. Nothing about the export is reimplemented.

---

## 10. Where the badge renders

| Surface | File |
|---|---|
| Profile (self and other drivers) | `components/ProfileScreen.tsx` |
| Convoy roster | `app/convoy.tsx`, `app/convoy/[id].tsx` |
| Direct-message inbox | `app/messages/index.tsx` |
| Group/convoy chat | `app/messages/group/[id].tsx` |

The aura renders on the profile header and on convoy member avatars.

**There is no leaderboard screen in the app yet.** The brief lists it as a badge
surface; `app/community.tsx` is convoys and events, not a ranked driver list.
When a leaderboard is built, `usePlatinumDirectory` + `PlatinumNameBadge` is the
whole integration.

---

## 11. Known gaps

- **No event-creation UI exists yet.** `useEventsStore.createEvent` had no
  caller anywhere in the app before this change, so the 1-event cap is enforced
  in the store and by the trigger, and `activeEventLimit` / `atEventLimit` are
  exported ready for the composer — but there is no screen on which to show the
  friction-point prompt. It will work the moment one is built.
- The product numbers in §4 and the "Route Discovery" interpretation want
  your confirmation.
- **The RevenueCat dashboard is still empty.** Products, the `platinum`
  offering, the hosted paywall and the Customer Center all need creating before
  any of this transacts — `REVENUECAT_SETUP.md` is the runbook. Until then the
  app falls back to `app/platinum.tsx` with display-only prices, which is a
  designed state rather than a broken one.
- A purchase made inside the hosted paywall or the Customer Center does not
  return through `openPaywall`/`openCustomerCenter`. It arrives on the
  customer-info listener. Anything that must run "after the driver subscribes"
  belongs on that listener, not after the await.
- `platinum_limit()` in SQL duplicates `TIER_LIMITS` in TypeScript. Two files
  to change, with no compiler holding them together — the alternative was a
  round trip to the database for every cap check on every render.
