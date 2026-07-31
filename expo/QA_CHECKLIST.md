# Driveverse — Manual QA Checklist

This is the human pass. Automated tests cover logic; this covers **judgment
calls**: does an empty screen look intentional, does a denied permission
explain itself, does the app feel alive while it waits on the network, does
the shape language actually read as Driveverse on a real screen in your hand.

Run this before every release, on **one iOS device and one Android device**
at minimum (a store build, not Expo Go — see "Launch safety" below for why).
Check the box only when the behavior matches the expected result; if it
doesn't, file it with a screenshot/screen recording, the device+OS version,
and whether it repros on both platforms.

Legend: 🍎 iOS-only step · 🤖 Android-only step · 🔌 offline/network step ·
⏳ loading-state step · 👁 visual/design-system step

---

## 0. Launch safety (run this first, every time)

The app has shipped three separate "crashes/doesn't open" incidents (see
`LAUNCH_SAFETY_REFERENCE.md`). This section exists because a launch crash
leaves no test-suite artifact — only a human tapping the icon catches it.

- [ ] Fresh install (not an update) on a real device, airplane mode **off**.
      Tap the icon. Expect the Driveverse splash → loading screen → either
      the sign-in screen or (if a session restores) the Garage Gate, within
      ~3 seconds. It must never go black-screen-and-vanish.
- [ ] Fresh install with airplane mode **on** before first launch. The app
      must still open to a usable screen (sign-in) within a few seconds, not
      hang on the loading screen forever — `useAppFonts`/`getSession()` both
      have a timeout, confirm it fires.
- [ ] Install the **update** over an existing install that has a signed-in
      session (don't clear storage first). Confirm it opens normally. This
      is the one case that a fresh install can't catch (old AsyncStorage
      shape read by new code).
- [ ] Force-quit the app mid-splash (swipe away while the logo is showing),
      then reopen. Confirm it opens cleanly the second time rather than
      showing a stale crash report for a kill that wasn't a crash.
- [ ] If you ever see a black screen and the app disappearing: reopen it
      immediately. Confirm a **Crash Report screen** appears with copyable
      kind/message/stack/platform/version text (`CrashReportScreen.tsx`) —
      screenshot it and attach to the bug rather than just writing "it
      crashed."
- [ ] Trigger an actual render-time error if you can (e.g., open a
      deep-linked screen with a malformed id). Confirm you get the app's own
      **error screen with a "Try again"** button, never a blank white/black
      window.

---

## 1. Onboarding — Sign up / Sign in (`app/login.tsx`, `app/signup.tsx`)

- [ ] Sign in with a valid email/password. ⏳ Button label changes to
      "Signing in…" and disables while the request is in flight — confirm it
      cannot be double-tapped.
- [ ] Sign in with a wrong password. Confirm a red, readable error line
      appears above the form (not a native alert, not silence).
- [ ] Leave email or password blank — Sign In button should be disabled
      until both fields are non-empty.
- [ ] 🔌 Turn on airplane mode, then attempt sign in. Confirm a clear
      network-failure message appears rather than an infinite spinner.
- [ ] Tap **Continue with Google**. ⏳ Confirm only that button shows a
      spinner (not the whole screen), and both social buttons are disabled
      while it runs so a second tap can't fire a second flow.
- [ ] 🍎 Confirm **Continue with Apple** is visible on iOS.
- [ ] 🤖 Confirm **Continue with Apple** is **absent** on Android — it isn't
      Apple's flow to offer there.
- [ ] Sign up: step through all 4 steps (Account → Nation → Profile → Car).
      Confirm "Next" is disabled until each step's required fields are valid
      (password ≥ 6 chars and matching confirmation on step 1, a country
      chosen on step 2, a make + color on step 3).
- [ ] On the Nation step, tap **Detect with GPS**. Deny location when
      prompted. Confirm the screen shows *"Location permission denied. Pick
      your nation from the list."* — not a crash, not a silent no-op — and
      the country list/search remains fully usable.
- [ ] On the Nation step, grant location. Confirm your country pre-selects
      and you can still override it via search.
- [ ] Search the nation list for a nonsense string. Confirm a "No nations
      match "…"" message instead of a blank list.
- [ ] Complete sign-up successfully. Confirm you land on the **Garage Gate**
      (`select-car`), not the map directly.
- [ ] Try creating an account with an email that's already registered.
      Confirm a specific, readable error (not a generic failure).

---

## 2. Garage Gate — "Choose your ride" (`app/select-car.tsx`)

This is the first screen most sessions see after auth, so give it a careful
pass on both platforms.

- [ ] **New account, zero cars**: confirm the empty-garage state renders —
      heading + a sentence naming the control to press (per
      `GARAGE_GATE_REFERENCE.md` §5.3, e.g. "No cars in this category yet…
      Pick All Cars to see the whole garage" or the guest/empty-garage
      copy) — never a blank screen with just a header.
- [ ] Add one car, confirm the carousel appears with **pagination hidden**
      (a single card shouldn't show page dots).
- [ ] Add a second car, confirm pagination now appears as short/long bars
      (not circular dots — 👁 see Design System section).
- [ ] 👁 Give a car a very long name/make combination (e.g. "Lamborghini
      Aventador SVJ Roadster Ultimate Edition 2024"). Confirm the CTA label
      truncates/shrinks gracefully (`numberOfLines={1}`) rather than
      wrapping or overflowing the button.
- [ ] Swipe through all cars in a 3+ car garage. Confirm each card fully
      renders its name, spec line, and drive stats — none should be clipped
      by the card's bottom edge.
- [ ] 🔌 Turn off network, then reopen this screen (kill+reopen app while
      offline). Confirm garage data either loads from cache or shows a clear
      "couldn't load" state — not an infinite spinner.
- [ ] Tap **Manage garage**. Confirm it navigates correctly and back
      navigation returns here with your prior selection intact.

---

## 3. Map screen (`app/(tabs)/map.tsx`) — the largest, riskiest screen

### 3a. Permissions

- [ ] **First launch, deny location permission** when prompted. Confirm the
      map shows a default view with the copy *"Location is off for
      Driveverse, so the map can't follow you. Turn it on in your device
      Settings, then tap Retry."* — not a frozen grey map, not a crash.
- [ ] With location denied, tap **DRIVE**. Confirm you get *"A route starts
      from where you are… "* / a no-GPS message rather than the app
      attempting to record with null coordinates.
- [ ] Grant location, but **stay indoors/in a Faraday-ish spot** so there's
      no GPS fix for 30+ seconds. Confirm the *"No GPS fix yet"* copy shows,
      with a Retry, instead of the app looking stuck.
- [ ] 🍎 On iOS, confirm the system permission dialog shows Driveverse's
      custom pre-permission copy (if present) before the OS dialog, and that
      choosing **"Allow Once"** is handled the same as a granted permission
      for the current session.
- [ ] 🤖 On Android, deny location the **first** time, then re-grant it from
      Settings and reopen the app. Confirm the map recovers without a
      restart being required, or that the Retry button actually re-requests.
- [ ] Deny **background location** if separately prompted (relevant to trip
      recording while backgrounded) — confirm recording a drive with the
      app backgrounded doesn't silently stop without telling you (see §4).

### 3b. Visibility / online presence

- [ ] Turn "Visibility" ON with two devices/accounts near each other (or one
      device + a second test account). Confirm each sees the other's marker
      with correct **name, level avatar and rank color** within a few
      seconds, and tapping it opens that driver's profile.
- [ ] 🔌 With visibility on, put the device in airplane mode for 15–20
      seconds, then restore connectivity. Confirm the banner reads
      **"Reconnecting to the live map…"** while offline (not a false "No
      other drivers near you yet" — those must never look identical, per
      `ONLINE_PRESENCE_REFERENCE.md` §1) and that markers resume updating
      once the connection recovers.
- [ ] Background the app for 2+ minutes with visibility on, then foreground
      it. Confirm your marker and others' markers refresh promptly (the
      `AppState` foreground-recovery path) rather than showing stale
      positions indefinitely.
- [ ] Turn visibility OFF. Confirm your own marker disappears for other
      viewers and the banner reads "VISIBILITY OFF".

### 3c. Problem signal

- [ ] While idle (not recording a drive), tap the **Signal** button. Confirm
      a "What's wrong?" chooser opens with the four options (Broke down /
      Accident / Out of fuel / Need help).
- [ ] Raise a signal while **visibility was off**. Confirm it automatically
      turns visibility on (a problem nobody can see helps nobody — expected
      per spec) and a nearby second device sees your marker turn to the red
      distress ring + banner within a few seconds.
- [ ] Confirm the **Signal** button itself changes to a red-outlined
      "Clear" state once your own signal is active, and tapping Clear
      removes the distress state on other devices' screens too.
- [ ] Confirm the Signal / chooser is **not reachable from the driving HUD**
      while actively recording a trip (by design — check it doesn't appear
      in the recording toolbar).
- [ ] Go offline (kill the app or lose signal) while a signal is raised.
      From a second device, confirm the distress marker eventually clears
      (stale sweep) rather than persisting forever.

### 3d. Places / POI layers

- [ ] Open the Filters popover and toggle a single category (e.g. Cafes)
      off. Confirm **only** cafe markers disappear — everything else stays.
      Re-enable and confirm they reappear.
- [ ] 🔌 Turn off network, pan the map to a new area. Confirm a places
      fetch failure shows readable copy ("Nearby places didn't load… Pan the
      map to retry this area") rather than a silent empty layer or a crash.
      Restore network and pan again — confirm places load.
- [ ] Look for markers that are **present and tappable but visually
      blank** (a historical Android bug from `tracksViewChanges`) — tap a
      handful of markers across categories on Android specifically and
      confirm every one shows its glyph, not an empty box.
- [ ] Zoom out over a dense city area. Confirm markers cluster into
      per-category numbered groups (e.g. "5 Cafes") rather than a jumbled
      overlapping pile, and that clustering turns off once you zoom in past
      roughly a 2 km view.
- [ ] 👁 At a normal zoom level, spot-check whether the ten POI category
      colors are actually distinguishable on the real map tiles (this was
      flagged as unverified/likely-fails in `MAP_MARKER_REFERENCE.md` §7) —
      specifically check cafe vs restaurant vs gas station, the "warm"
      cluster of hues.
- [ ] Long-press an empty area of the map to submit a new place (if that
      entry point is present in this build — it was pulled once as a
      "known gap," confirm current status matches what's expected).

### 3e. Routing & navigation

- [ ] Drop a pin on a named place (a real café/mall) and confirm the route
      sheet reads "Heading to <that place>" using its real name, not
      "Dropped Pin".
- [ ] Drop a pin in the middle of nowhere / open water. Confirm the label
      falls back to **"Point A → Point B"**, never blank, never raw
      coordinates, never "Dropped Pin".
- [ ] 🔌 Drop a pin with network off. Confirm the same graceful "Point A →
      Point B" fallback (reverse geocoding fails silently, per design).
- [ ] Request a route to a destination with no reachable road (offshore, an
      enclosed compound). Confirm *"No road route to that point… Drag the
      pin onto a road and tap Route again"* rather than a generic failure.
- [ ] 🔌 Request a route with network off entirely. Confirm *"Couldn't
      reach the routing service… Check your connection and tap Route
      again"* rather than a hang.
- [ ] Confirm the destination marker is a **crosshair reticle**, not a
      teardrop pin, and your own marker is a red chevron in a ring — not a
      blue arrow.

### 3f. Recording a drive / trip end-to-end

- [ ] Tap **DRIVE** while signed out (log out first). Confirm *"A drive is
      recorded to your trip log and awards XP, so it can't start while
      signed out. Sign in from the banner above the tab bar…"* rather than
      a silent failure.
- [ ] Start recording. Confirm the HUD shows **END DRIVE** as the loudest
      (red) element and PAUSE/PHOTO are visually secondary, per design.
- [ ] Drive (or simulate movement via a GPX/mock-location tool) a few
      hundred meters, then tap **END DRIVE**. Confirm the trip summary
      appears with a **route trace that matches the path actually driven**
      — not a blank card.
- [ ] 🔌 Turn on airplane mode **mid-recording**, keep "driving" for a
      minute, then restore connectivity and end the drive. Confirm the trip
      still saves — GPS recording is local and shouldn't depend on live
      connectivity — and check the Drive Hub afterward for the resulting
      trip row.
- [ ] 🍎🤖 Background the app mid-recording (press home / switch apps) for a
      minute, then return. Confirm recording continued (background location
      permission must be granted) and the trace has no obvious multi-minute
      gap.
- [ ] Immediately after ending a drive, tap **SHARE without tapping SAVE
      first**. Confirm the native share sheet opens — SHARE must never be
      gated on a successful save (a known past regression).
- [ ] Tap **SAVE**, name the route, confirm the save sheet. Then 🔌 turn on
      airplane mode and press **SAVE ROUTE**. Confirm *"Couldn't reach
      Driveverse…"* appears within about a second — not an endless spinner
      on the button.
- [ ] With network restored, save the route successfully. Confirm: the
      sheet closes, the summary's Save control now reads "Saved", and the
      route appears in `app/routes.tsx` ("My Routes").
- [ ] Record a **second** drive back-to-back and reopen the save sheet.
      Confirm the name field shows the **new** drive's destination, not a
      stale name left over from the first drive (a known past bug).
- [ ] With a Regular (non-Platinum) account already holding 10 saved
      routes, open the save sheet. Confirm the cap is shown **before** you
      press anything, and pressing SAVE ROUTE raises the paywall instead of
      failing with a database error.
- [ ] End a drive with a genuinely zero-length/instant stop (tap DRIVE then
      immediately END DRIVE). Confirm the summary doesn't show `NaN`,
      `Infinity`, or a broken avg-speed readout.

---

## 4. Drive Hub — trip log & quests (`app/(tabs)/drive.tsx`)

- [ ] **Brand-new account, zero trips**: confirm the trip log shows the
      empty-state copy ("Nothing has been logged yet. Tap DRIVE on the map
      to record your first one.") and exactly **one** call-to-action, not a
      duplicated New Trip button (a fixed past bug).
- [ ] Record one trip and confirm it appears at the top of the log with a
      route trace, distance/duration/avg-speed in **JetBrains Mono**, and an
      XP value.
- [ ] A trip recorded with no polyline (e.g., GPS failed entirely). Confirm
      the card falls back to origin/destination text, and if neither exists,
      shows the caption **"No route trace recorded"** rather than a blank
      map area.
- [ ] Open the **Quests** view. Confirm exactly 3 quests are shown (1 Easy /
      1 Medium / 1 Hard) and each shows **"Auto-tracks"** rather than a
      manual "Claim" button — quests must never be self-markable.
- [ ] Drive enough distance to complete a distance-based quest while the
      Quests tab is **closed**. Reopen the app/tab afterward and confirm it
      shows completed with reward already granted (progress is
      server-side/real-time, should reflect even if you weren't watching).
- [ ] 🔌 Complete a quest-qualifying action (e.g. driving distance) while
      offline, then reconnect. Confirm progress catches up once connectivity
      returns rather than being lost.
- [ ] Wait past UTC midnight (or check across a day boundary) and confirm a
      fresh set of 3 quests generates automatically on next open.
- [ ] Check the **Alerts** count in the header stat strip is genuinely
      non-zero only when there's something needing attention, and that it's
      the one red numeral in that row.

---

## 5. Profile (`app/(tabs)/profile.tsx`, `app/user/[id].tsx`)

- [ ] **Garage tab, zero cars**: "Your garage is empty. Tap Add a car below
      to put your first ride in it." — confirm this copy and control, no
      blank card.
- [ ] **Trips tab, zero trips**: "Nothing has been logged yet. Tap DRIVE on
      the map to record your first one."
- [ ] **Friends tab, zero friends**: "Nobody is on your list yet. Search a
      driver's name above and tap Find to send a request."
- [ ] **Pending requests, none waiting**: "No driver has asked to connect
      yet. Find people from the Friends tab on your profile."
- [ ] Visit another driver's profile (`/user/[id]`) who has **zero cars /
      zero trips / zero friends**. Confirm the same empty-state copy renders
      correctly in third-person context (not first-person "your" language
      referring to you when it's someone else's profile) and doesn't crash
      on a driver who genuinely has nothing filled in.
- [ ] Visit a profile while **signed out**. Confirm "Join the drive" gating
      copy appears rather than a broken/partial profile render.
- [ ] Delete a non-primary car from the garage. Confirm a working delete
      control (trash icon) exists — not just a hidden long-press.
- [ ] 🔌 Load your own profile with network off (from cache/prior session).
      Confirm cached data displays rather than a blank screen, if a session
      was recently active.
- [ ] 👁 Confirm the **live-activity dot** (online status) is the one green
      element on an otherwise red/neutral screen — it should not have
      drifted to another color.
- [ ] Tap **Help & Support** in Settings. This row is documented as
      intentionally inert (no destination) — confirm it does nothing rather
      than 404ing or crashing; flag to product if this is meant to be wired
      up by release time.
- [ ] Navigate to `app/ranks.tsx`, `app/convoy.tsx`, `app/messages`, and
      `app/terms-and-conditions.tsx` from Settings. 👁 These are documented
      as **still on legacy styling** — confirm they at least function
      correctly even though they'll visually look older/inconsistent than
      the rest of the app (flag any that look broken, not just "old").

---

## 6. Messages — DMs & group/convoy chat

- [ ] **Signed in, zero conversations**: `app/messages/index.tsx` shows "NO
      MESSAGES YET — Tap New Message to start a conversation with a
      friend."
- [ ] **Signed out**, navigate to Messages: shows "SIGN IN TO SEE YOUR
      MESSAGES" rather than an empty/broken inbox.
- [ ] **Zero friends** on the "new message" friend picker: "Add friends
      first — then they'll show up here to message."
- [ ] Open a DM thread with **no messages yet**: "NO MESSAGES YET — Send the
      first message to <partner name>."
- [ ] Open a group/convoy chat with **no messages**: "NO MESSAGES YET — Send
      the first message to the group."
- [ ] Send a message, confirm it appears instantly for the sender and (on a
      second device/account) arrives in real time for the recipient.
- [ ] 🔌 Turn on airplane mode, send a message. Confirm the app shows the
      message as failed/pending rather than silently dropping it or
      pretending it sent. Reconnect and confirm it retries/sends, or that
      you get a clear way to resend.
- [ ] 🔌 Receive a message while offline, then reconnect. Confirm it arrives
      once connectivity is restored (no permanent loss).
- [ ] Send a **location** message type from a request/tow chat context (if
      reachable) and confirm it renders as a formatted location, not raw
      coordinates.
- [ ] Confirm unread-count badges update correctly and clear once a thread
      is opened.

---

## 7. Community — convoys & events (`app/community.tsx`, `app/convoy.tsx`, `app/event/[id].tsx`)

- [ ] **Zero public convoys nearby**: confirm "NO PUBLIC CONVOYS YET" empty
      state (not a blank list).
- [ ] **Zero events nearby**: confirm "NO EVENTS NEAR YOU YET" empty state.
- [ ] Create a convoy as a **Regular** (non-Platinum) organiser. Confirm the
      member cap is **2**, and inviting past that raises the paywall for the
      **organiser only**.
- [ ] As a Regular driver, attempt to **join** someone else's already-full
      Platinum-organiser convoy (i.e. blocked by size, not your own tier).
      Confirm you see **"this convoy is full"**, and critically that you are
      **not** shown a misleading upgrade-to-join paywall (upgrading wouldn't
      help — a documented rule).
- [ ] Open a convoy roster with a Platinum member in it. Confirm their
      chrome badge renders correctly next to Regular members' rows.
- [ ] View an event with **zero attendees**. Confirm a sensible "nobody
      joined yet" state rather than a blank list under the header.
- [ ] Cancel an event you organized. Confirm the confirmation dialog reads
      "Cancel this event? … will be removed from the map and everyone who
      joined will be told it's off. This can't be undone." and that
      cancelling actually removes it from other devices' maps.
- [ ] 🔌 Try creating/joining a convoy or event while offline. Confirm a
      clear failure message, not a silent no-op or a crash.

---

## 8. Saved places & saved routes (`app/saved-places.tsx`, `app/routes.tsx`)

- [ ] **Zero saved places**: confirm an empty state with guidance, not a
      blank list.
- [ ] **Zero saved routes** ("My Routes" tab): confirm an empty state.
- [ ] As Regular, save a 10th place, then attempt an 11th. Confirm the
      paywall raises at the point of friction with the specific blocked
      benefit named (e.g. "Your garage is full at 2 cars"-style contextual
      copy, adapted to saved places).
- [ ] Delete a saved place/route and confirm the list updates immediately
      without a manual refresh.
- [ ] 🔌 Open Saved Places / Routes while offline (data previously loaded in
      this session). Confirm cached content shows rather than a blank
      screen.

---

## 9. Platinum / paywall / RevenueCat (`app/platinum.tsx`, `app/subscription.tsx`)

This flow needs the most cross-platform attention since App Store and Play
Store purchase UI differ meaningfully.

- [ ] Trigger the paywall via a **contextual friction point** (e.g., add a
      3rd car as Regular). Confirm the paywall opens with that specific
      blocked benefit pinned at the top under its own headline (e.g. "Your
      garage is full at 2 cars"), with the rest of the benefits listed under
      "ALSO INCLUDED" — no benefit should be dropped from the list.
- [ ] Confirm the pricing rows show **monthly and yearly**, both in
      JetBrains Mono, and the yearly-savings percentage **only appears**
      when both prices came from the real store (never a fabricated
      discount off fallback/placeholder prices).
- [ ] If the product has an intro/trial offer configured at price 0, confirm
      the CTA reads **"Start Free Trial"**; otherwise confirm it does not
      claim a trial that isn't real.
- [ ] Complete a **sandbox/test purchase** (using the TEST STORE / SANDBOX
      key — confirm the **TEST STORE** and/or **SANDBOX** tag is visible on
      screen so nobody mistakes it for a real charge).
- [ ] ⏳ During the purchase flow, confirm a loading indicator shows while
      the store sheet is dismissing and entitlement is being confirmed —
      the UI should not look frozen or double-purchasable.
- [ ] After a successful purchase, confirm every Platinum surface updates:
      profile badge, chrome aura, convoy cap (2→8), unlimited saved
      places/routes, AI showcase access — without requiring an app restart.
- [ ] 🍎 On iOS, open **Restore Purchases**. Confirm it's present but
      deliberately unobtrusive (per App Store guideline 3.1.1) and that it
      actually restores a prior purchase made on the same Apple ID.
- [ ] 🍎 On iOS, trigger a **refund request** via the Customer Center (if
      reachable in sandbox) — confirm it hands off to Apple's flow rather
      than trying to process the refund in-app.
- [ ] As an existing subscriber, tap the profile's **Platinum row**. Confirm
      it opens the **Customer Center** (manage/cancel/plan-change), **not**
      the paywall selling you what you already own — this is called out as
      the most common way this row regresses.
- [ ] From the Customer Center (or its `app/subscription.tsx` fallback),
      initiate a **cancellation**. Confirm it hands off to the App
      Store/Play Store subscription management — Driveverse cannot and
      should not process a cancel in-app.
- [ ] Simulate/observe a **failed renewal** (grace period) if testable in
      sandbox. Confirm the subscription screen shows a distinct grace-period
      notice rather than treating you as fully lapsed or fully active.
- [ ] With RevenueCat's native module unavailable (Expo Go or web build, if
      you test one), confirm the app still runs: every driver treated as
      Regular, caps apply, the paywall still opens with fallback prices and
      a disabled purchase CTA plus an explanatory line — no crash from a
      missing native module.
- [ ] 👁 Confirm **Platinum is rendered in chrome (grey/white), never in
      racingRed** anywhere — badge, aura, frame stroke, paywall accents. The
      one exception is the CTA button itself, which is correctly still red
      (it's "the button you press," not a tier color).

---

## 10. AI Car Showcase (Platinum feature)

- [ ] As Platinum, generate a showcase image in each of the three looks
      (studio / night / track). ⏳ Confirm a loading state while generation
      is in progress (this hits an external image model and can take
      several seconds) — no frozen-looking button.
- [ ] Generate 5 showcases in a month, then attempt a 6th. Confirm the
      monthly cap message appears rather than a generic error or a silent
      failure.
- [ ] 🔌 Attempt generation with network off. Confirm a clear failure
      message, and confirm no ledger/quota was consumed for a request that
      never reached the server (check the counter didn't decrement).
- [ ] Share a generated showcase. Confirm it reuses the same share-card flow
      as trip sharing (same visual quality, same native share sheet).

---

## 11. Company registration / tow request / chat-for-service flows

(If reachable in this build — confirm current entry points before skipping.)

- [ ] Submit a company registration with a required document missing.
      Confirm a specific validation message, not a generic submit failure.
- [ ] 🔌 Submit with network off. Confirm the form preserves your entered
      data and shows a retry path rather than losing the draft.
- [ ] Create a tow request and open its chat. Confirm real-time delivery
      and that a status change (accepted/in-progress/completed) produces an
      automatic system message in the thread.

---

## 12. Cross-cutting: permission denial matrix

Run each of these as a **deliberate deny**, not just "grant everything and
move on" — permission handling is one of the most commonly under-tested
paths.

| Permission | Where first requested | Expected on denial |
|---|---|---|
| Location (foreground) | Map screen mount / Signup nation-detect | Map shows default view + explanatory copy + Retry; nation-detect shows inline error and falls back to manual list |
| Location (background) | Trip recording start | Recording should either warn that background tracking is limited, or the app should be tested to confirm the trip doesn't silently truncate when backgrounded |
| Notifications | First app use / after sign-in | App must **not** crash (this was the exact cause of a past App Store rejection — `setNotificationHandler` at module scope). Confirm push notifications simply don't arrive, with no other visible degradation |
| Camera / Photo library | Adding a car photo, garage image, AI showcase upload | A clear "camera access needed" message with a path to Settings — not a silent no-op button press |

- [ ] For each row above: deny the permission, then perform the action that
      needs it, and confirm the app **explains itself** in-context rather
      than doing nothing when tapped.
- [ ] For each row above: deny, then **grant it later from OS Settings**,
      return to the app, and confirm the feature recovers without requiring
      a full app reinstall.

---

## 13. Cross-cutting: offline behavior matrix

| Flow | Expected when connectivity drops mid-action |
|---|---|
| Trip recording | Continues locally (GPS doesn't need network); END DRIVE still saves once reconnected; if the `trips` write itself fails, the summary card must show the error, not silently claim success |
| Save Route | Spinner fails fast (~1s) with "Couldn't reach Driveverse…" — never spins forever |
| Share | Unaffected — renders from in-memory data, no network dependency |
| Chat send | Message shown as unsent/pending, retried or clearly failed — never silently dropped |
| Places / POI fetch | Falls back to a cached (possibly stale) result if available; otherwise a specific "didn't load, pan to retry" message |
| Directions/routing | "Couldn't reach the routing service…" within a few seconds |
| Online presence | Banner distinguishes "Reconnecting to the live map…" (degraded) from "No other drivers near you yet" (genuinely empty) — these must never look the same |
| Paywall/purchase | Purchase button shows failure, no charge attempted twice |
| Profile / Garage / Messages load | Serves last-known cached data rather than a blank screen, if data was loaded earlier this session |

- [ ] Walk each row above at least once per release: toggle airplane mode
      mid-action, confirm the row's expected behavior, then restore
      connectivity and confirm recovery (not just the failure path).

---

## 14. Cross-cutting: loading-state spot check

For every async action below, confirm there is a **visible** loading
indicator (spinner, disabled button + label change, skeleton, etc.) and that
the control cannot be double-tapped while in flight:

- [ ] Sign in / sign up submit
- [ ] Social sign-in (Google/Apple) — only the tapped button shows its own
      spinner, others disable
- [ ] Save Route
- [ ] Trip end / trip save
- [ ] Quest generation (first open of the day)
- [ ] Chat message send
- [ ] Image upload (car photo, AI showcase)
- [ ] Paywall purchase / restore
- [ ] Places / POI fetch on map pan
- [ ] Routing/directions fetch
- [ ] Country auto-detect on signup
- [ ] Profile load for a driver you've never viewed before

---

## 15. Visual QA against the design system

Reference: `constants/theme.ts`, `DESIGN_SYSTEM_AUDIT.md`, and the per-screen
`*_REFERENCE.md` files. Do this pass **on-device**, at real size — the web
export used during development cannot verify native fonts, safe areas, or
native sheet animations.

### 15a. Shape — CutCorner
- [ ] Every **brand surface** (trip cards, quest cards, buttons, badges,
      sheets, the tab bar, filter chips) shows a single **45° cut in the
      top-right corner** — never a different corner, never a fully rounded
      corner.
- [ ] Every **utility surface** (text inputs, chrome buttons, list rows,
      progress tracks, dividers) is a **plain rectangle** — sharp or 4px
      radius, no cut.
- [ ] The only genuinely **circular** things on screen are avatars, the
      tab bar's active-tab disc, the visibility switch knob, and photo
      masks. Nothing else should be a pill or a full circle.
- [ ] On the Drive Hub, Map, and Garage Gate, confirm the cut lands in the
      **same corner and size** across every card in a scrolling list — a
      cut that moves reads as a layout bug, not a motif.

### 15b. Typography — JetBrains Mono for numbers
- [ ] Spot-check the Drive Hub, Profile, and Garage Gate: every numeric
      readout (distance, duration, speed, XP, level, car spec line, HP,
      year) renders in the **monospace** face, visually distinct from the
      Rajdhani headers and Inter body copy around it.
- [ ] Confirm units (km, km/h, XP) render in the **regular body font**
      beside the mono value, not baked into the same mono string — a
      column of stacked numbers should stay vertically aligned.
- [ ] Confirm duration on trip cards reads as a clock format (`2:04:22`),
      not "2h 4m" — letters inside the mono readout would break alignment.

### 15c. Color — racingRed used sparingly
- [ ] On the **Map (idle)**: confirm at most the DRIVE button and the Live
      Feed dot are red — nothing else in that viewport should be.
- [ ] On the **Map (Filters popover)**: confirm the tick boxes and map-style
      toggle are **not** red (a past bug had 9 red tickboxes at once).
- [ ] On the **driving HUD**: confirm END DRIVE is unmistakably the loudest
      red element, with PAUSE/PHOTO visually secondary (ghost style).
- [ ] On the **Profile header**: red is allowed to be more generous here by
      design (level badge, rank label, XP fill, active tab, car edge accent,
      featured CTA) — confirm it reads as "progression state," not as
      random red scattered around.
- [ ] Confirm **no screen anywhere** uses red for a status meaning other
      than "press this" or "progression/live state" — e.g., no red used for
      a generic warning icon unrelated to those two meanings, no red
      "success" checkmarks.
- [ ] Confirm Platinum surfaces (badge, aura, frame) are chrome/grey, never
      red, anywhere they appear (profile, convoy roster, DM inbox, group
      chat).

### 15d. Motion
- [ ] Confirm each screen has **at most one** motion moment (route trace
      draw-in, carousel scroll-linked transform, progress-bar fill) and
      nothing loops, bounces, or pulses continuously except the Platinum
      aura's slow breathing ring.
- [ ] Enable **Reduce Motion** in OS accessibility settings, then revisit
      the Drive Hub, Garage Gate carousel, and a Platinum-badged profile.
      Confirm animations are replaced by their static end-state (not just
      sped up) — e.g., the route trace should appear already-drawn, and the
      Platinum aura should show as a static ring at its mid-point.

### 15e. Icons
- [ ] Spot-check icon stroke weight across the Map, Drive Hub, and Profile:
      chrome/UI icons should read at a lighter weight than map-surface
      glyphs — inconsistent weights on the same screen should stand out to
      the eye if present.
- [ ] Confirm `Pressable` controls that replaced old `TouchableOpacity`
      buttons still show a visible pressed state (dimmed/opacity change) —
      `Pressable` has no built-in feedback and a few conversions have
      historically missed adding it back.

### 15f. The floating tab bar
- [ ] Confirm the tab bar is a flat carbon surface with a hairline border —
      **no** `expo-blur` panel, **no** drop shadow/glow, **no** gradient
      icon fills (this was flagged repeatedly as the last off-brief surface
      in the app; confirm it has actually been fixed in this build).
- [ ] 🍎 vs 🤖: confirm the tab bar backdrop looks **identical** on both
      platforms (solid `voidBlack` band) — it used to be `expo-blur` on iOS
      and a translucent tint on Android, two different looks for the same
      control.

---

## 16. Platform-specific pass (do this section twice: once per OS)

- [ ] 🍎 Confirm native **Share Sheet** (share a trip/route/showcase) shows
      the expected iOS share targets and the rendered card image looks
      sharp (not blurry — check at actual 3x export resolution).
- [ ] 🤖 Confirm the same share flow on Android's native share sheet.
- [ ] 🍎 Background location permission prompt on iOS shows the two-step
      "Allow Once / Allow While Using / Don't Allow" then a possible later
      "Change to Always Allow?" system nudge — confirm the app doesn't
      re-prompt aggressively or break if the driver stays on "While Using."
- [ ] 🤖 Android 12+ shows a separate **approximate vs precise** location
      choice — confirm the app still functions (with a known accuracy
      trade-off) if the driver grants only approximate location, or clearly
      explains that precise location is needed for trip recording.
- [ ] 🍎 Confirm Apple Sign-In is available and Google Sign-In dialog
      renders in the native Apple-hosted web sheet style.
- [ ] 🤖 Confirm Google Sign-In uses the Android account chooser as
      expected.
- [ ] 🍎🤖 RevenueCat: confirm the correct store name appears anywhere the
      subscription is described (App Store vs Play Store) and that the
      Customer Center's "Manage Subscription" link opens the correct
      platform's subscription settings page.
- [ ] 🤖 Check the Android back button (hardware/gesture) behaves sensibly
      on every modal/sheet (save-route sheet, paywall, driver card) — it
      should dismiss the sheet, not exit the app or navigate somewhere
      unexpected.
- [ ] 🍎🤖 Compare safe-area handling on a notch/Dynamic-Island iPhone and a
      punch-hole/gesture-nav Android phone: confirm the tab bar, HUD panels,
      and sheet footers all clear the safe area on both.

---

## 17. Regression watchlist (known-fragile areas)

These are called out in the reference docs as places that have broken
before, or are explicitly flagged as unverified on real hardware — give them
extra attention every release:

- [ ] POI category colors at 24px over real map tiles (unverified, flagged
      as "likely to come back no" in `MAP_MARKER_REFERENCE.md`).
- [ ] SHARE must work without SAVE ever having succeeded.
- [ ] The save-route sheet must reset between two back-to-back drives (no
      stale name/spinner state).
- [ ] Presence "degraded" vs "empty" banner text must never be
      indistinguishable.
- [ ] The Platinum row on your own profile must route to Customer Center
      (not paywall) once you're subscribed.
- [ ] A driver blocked from **joining** someone else's full convoy must
      never see an upgrade paywall (only the organiser should, on invite).
- [ ] No custom map marker should render blank-but-tappable on Android.
- [ ] The tab bar must not regress back to blur/shadow/gradient styling.
