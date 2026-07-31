# Driveverse E2E — Maestro suite

End-to-end UI tests for the Expo app, written as [Maestro](https://maestro.mobile.dev)
YAML flows. Maestro was chosen over Detox: flows are declarative YAML (no
native test runner to compile), selectors are text / accessibility-first, and
the same flow file runs unchanged on iOS and Android — which matters here
because the whole point of the suite is to surface the places those two
platforms diverge.

```
.maestro/
  config.yaml            workspace config (flow order, tags)
  subflows/              reusable building blocks
    sign-up.yaml         4-step signup wizard → garage gate
    sign-in.yaml         email/password → garage gate
    enter-app.yaml       garage gate → main Map screen
  flows/                 one file per scenario (happy + failure variants)
```

## Flow inventory

| # | Flow | Happy | Failure variant |
|---|------|-------|-----------------|
| 1 | Onboarding (guest → signup → map) | `01-onboarding-happy` | `01-onboarding-failure-location-denied` |
| 2 | Record a trip | `02-record-trip-happy` | `02-record-trip-failure-location-denied` |
| 3 | Platinum paywall (3rd car) | `03-paywall-third-car-happy` | `03-paywall-restore-offline-failure` |
| 4 | Create a convoy (Map → confirm) | `04-create-convoy-happy` | `04-create-convoy-offline-failure` |
| 5 | Chat (direct + group) | `05-chat-direct-happy`, `05-chat-group-happy` | `05-chat-offline-failure` |
| 6 | Places (search + persistence) | `06-places-search-and-persist-happy` | `06-places-offline-failure` |
| 7 | Share a trip | `07-share-trip-happy` | `07-share-trip-offline-failure` |

Tags (select with `--include-tags` / `--exclude-tags`): `critical`, `onboarding`,
`trips`, `platinum`, `community`, `chat`, `places`, `share`, `failure`,
`platform`, `android-offline`.

## Prerequisites

```bash
curl -Ls https://get.maestro.mobile.dev | bash    # installs the `maestro` CLI
```

You need a **built app** (Maestro drives a real binary, not Metro):

- **Android**: an emulator running + the app installed.
  ```bash
  cd expo
  bunx expo prebuild --platform android --no-install
  (cd android && ./gradlew :app:assembleRelease)
  adb install -r android/app/build/outputs/apk/release/app-release.apk
  ```
- **iOS**: a booted simulator + the app installed.
  ```bash
  cd expo
  bunx expo prebuild --platform ios --no-install
  (cd ios && pod install && xcodebuild -workspace *.xcworkspace -scheme Driveverse \
     -configuration Release -sdk iphonesimulator -derivedDataPath build \
     -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO)
  xcrun simctl install booted "$(find ios/build -name '*.app' -type d | head -1)"
  ```
  (The Xcode scheme name follows the app name — adjust `-scheme` if prebuild
  names it differently.)

The app must be built against the **staging** Supabase project, via
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Never point E2E at
production — it creates accounts, convoys, trips and messages.

## Running

```bash
cd expo
# Everything on the currently-booted device:
maestro test .maestro/

# One flow, with credentials injected:
maestro test .maestro/flows/02-record-trip-happy.yaml \
  -e EMAIL=maestro+seed@driverse.test -e PASSWORD="$MAESTRO_TEST_PASSWORD"

# Fast smoke subset:
maestro test --include-tags critical .maestro/

# iOS excludes the offline variants (see Platform notes):
maestro test --exclude-tags android-offline .maestro/
```

`maestro studio` (interactive inspector) is the fastest way to fix a selector
when a flow drifts after a UI change.

## Seeding

Flows that read existing state expect these seed accounts on the staging
backend (all sharing `MAESTRO_TEST_PASSWORD`). Onboarding creates its own fresh
account each run (timestamped email), so it needs no seed.

| Env / account | Used by | Must have |
|---------------|---------|-----------|
| `maestro+seed@driverse.test` | trips, chat, places, share, paywall-restore, convoy | ≥1 recorded trip; a direct convo with **Maestro Partner**; a group **Maestro Crew**; a saved place **Maestro Cafe** |
| `maestro+regular2car@driverse.test` | `03-paywall-third-car-happy` | **Regular** tier (not Platinum) with **exactly 2 cars** (garage at cap) |

Provision these with a small seeding script against the staging Supabase
service role before the suite runs (wire it into the CI job before the Maestro
step). Override any name via `-e`, e.g. `-e DIRECT_PARTNER="…"`.

## Platform notes (the signal this suite exists for)

- **RevenueCat / paywall** — purchases and restore behave differently by store,
  and a CI build without store entitlements reports `canPurchase = false`. The
  paywall is designed to render fully anyway (fallback prices, disabled CTA), so
  the happy flow asserts the paywall + contextual copy + a *wired* Restore
  (which legitimately returns "Nothing to restore" / "Not available" on such a
  build). Tagged `platform`.
- **Background location** — the trip flow mocks GPS with `setLocation` /
  `travel`. Permission-denied degradation differs subtly (iOS shows the system
  prompt differently), so it has its own failure variant on both platforms.
- **Share sheet** — "More options" hands off to the OS share sheet, a system UI
  that Maestro can only partially inspect and that looks different per platform.
  Happy-path assertions stop at the in-app preview + the hand-off not crashing.
- **Offline variants** (`android-offline` tag) — `setAirplaneMode` is reliable
  on **Android emulators only**. iOS simulators have no Maestro offline toggle,
  so CI **excludes** these on iOS. To cover offline on iOS, run on a physical
  device behind Network Link Conditioner, or add a proxy-based network profile.

## Known gaps this suite surfaced

Writing the flows against the real UI turned up features that are referenced but
not fully wired — exactly what E2E is meant to catch. Flagged inline in the
affected flow files:

1. **Places: no "save a place" UI.** `savePlace` / `togglePlace` (from
   `useSavedPlacesStore`) are never called from the map. The Saved Places empty
   state even says "tap a place on the map and hit Save", but that Save button
   does not exist. Flow 6 tests search + server-backed persistence instead; the
   save step is stubbed (commented) and ready to enable when the UI ships.
2. **Places: category filter unbuilt.** `mapLayers.ts` / `useMapFilters` /
   `isLayerVisible` / `toggleLayer` exist and are unit-tested, but no screen
   consumes them — the map's Filters popover only toggles light/dark tiles. So
   "filter by category" cannot be tapped end-to-end yet.
3. **Events: no in-app composer.** The map's "Create an event" button only
   navigates to the events list; events are created server-side. "Create through
   confirmation" is therefore exercised via convoys (which *do* have a composer).
4. **Chat: no explicit failed-send state.** On an offline send the typed text is
   silently restored to the input with no "failed / will retry" indicator. Flow
   5's failure variant asserts no data loss; consider adding a visible failed
   state.

## Status matrix

These flows are **authored against the current code but not yet executed** — a
built app + booted simulator is required, which the nightly CI
(`.github/workflows/maestro-e2e.yml`) provides. Fill this in from the first CI
run; flag any flow that passes on one platform but not the other, and any flow
that passes inconsistently (flaky).

| Flow | Android | iOS | Notes |
|------|:------:|:---:|-------|
| 01 onboarding happy | ⬜ | ⬜ | |
| 01 location-denied | ⬜ | ⬜ | |
| 02 record trip happy | ⬜ | ⬜ | GPS mock; may need `travel` speed tuning |
| 02 location-denied | ⬜ | ⬜ | |
| 03 paywall 3rd car | ⬜ | ⬜ | store availability differs |
| 03 restore offline | ⬜ | n/a | android-offline |
| 04 create convoy | ⬜ | ⬜ | |
| 04 create offline | ⬜ | n/a | android-offline |
| 05 chat direct | ⬜ | ⬜ | |
| 05 chat group | ⬜ | ⬜ | |
| 05 chat offline | ⬜ | n/a | android-offline |
| 06 places search+persist | ⬜ | ⬜ | save/filter stubbed (see gaps) |
| 06 places offline | ⬜ | n/a | android-offline |
| 07 share trip | ⬜ | ⬜ | OS share sheet is platform UI |
| 07 share offline | ⬜ | n/a | android-offline |

Legend: ✅ pass · ⚠️ flaky (flag explicitly) · ❌ fail · ⬜ not yet run · n/a excluded.
