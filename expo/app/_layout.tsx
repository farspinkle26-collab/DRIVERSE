import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthContext } from "@/hooks/useAuthStore";
import { ThemeContext } from "@/hooks/useThemeStore";
import { ChatContext } from "@/hooks/useChatStore";
import { NotificationContext } from "@/hooks/useNotificationStore";
import { FriendRequestsListener } from "@/hooks/useFriendRequestsStore";
import { XPProvider } from "@/hooks/useXPStore";
import { QuestsProvider } from "@/hooks/useQuestStore";
import { OnlineUsersProvider } from "@/hooks/useOnlineUsers";
import { EventsProvider } from "@/hooks/useEventsStore";
import { PartyProvider } from "@/hooks/usePartyStore";
import { GroupChatProvider } from "@/hooks/useGroupChatStore";
import { ActiveCarProvider } from "@/hooks/useActiveCarStore";
import { RoutesProvider } from "@/hooks/useRoutesStore";
import { PlatinumProvider } from "@/hooks/usePlatinumStore";
import { SavedPlacesProvider } from "@/hooks/useSavedPlacesStore";
import { CosmeticsProvider } from "@/hooks/useCosmeticsStore";
import LoadingScreen from "@/components/LoadingScreen";
import NotificationBanner from "@/components/NotificationBanner";
import AppAlertHost from "@/components/AppAlertHost";
import AppErrorBoundary, { ErrorScreen } from "@/components/AppErrorBoundary";
import CrashReportScreen from "@/components/CrashReportScreen";
import { useAppFonts } from "@/hooks/useAppFonts";
import { useLastActivePing } from "@/hooks/useLastActivePing";
import { shouldSurfaceOnLaunch, type CrashReport } from "@/lib/crashReport";
import { logEnv } from "@/lib/envCheck";
import {
  beginLaunch,
  clearCrashReport,
  installCrashReporter,
  markLaunchComplete,
} from "@/lib/crashReporter";
import type { ErrorBoundaryProps } from "expo-router";

const queryClient = new QueryClient();

/**
 * Expo Router picks up an `ErrorBoundary` exported from a route file and uses
 * it for that segment. Exporting it from the root layout means a throw while
 * rendering a screen lands on our own fallback instead of an empty window.
 *
 * This is not the same guard as the `AppErrorBoundary` around `RootLayout`
 * below, and neither replaces the other. Router's boundary needs the router
 * to have initialised before it can catch anything; ours is plain React and
 * is already in place by the time the first line of `RootLayoutContent` runs,
 * which is the window the app has twice died in.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} onRetry={retry} />;
}

const darkScreenOptions = {
  headerStyle: { backgroundColor: "#0A0A0F" },
  headerTintColor: "#FFFFFF",
  headerTitleStyle: { color: "#FFFFFF", fontWeight: "600" as const },
  contentStyle: { backgroundColor: "#0A0A0F" },
};

function RootLayoutNav() {
  return (
    <Stack screenOptions={darkScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="customize-profile" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="select-car" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="terms-and-conditions" />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="signup" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="routes" options={{ headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="ranks" options={{ headerShown: false }} />
      <Stack.Screen name="community" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="messages/index" options={{ headerShown: false }} />
      <Stack.Screen name="messages/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="messages/group/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="convoy" options={{ headerShown: false }} />
      <Stack.Screen name="convoy/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="event/[id]/manage" options={{ headerShown: false }} />
      {/* Presented as a modal: the paywall is always raised on top of
          something the driver was in the middle of doing. */}
      <Stack.Screen
        name="platinum"
        options={{ headerShown: false, presentation: "modal" }}
      />
      {/* Subscription management. A pushed screen, not a modal: it is a
          destination the driver navigates to from Settings, and the Customer
          Center brings its own scrolling body. */}
      <Stack.Screen name="subscription" options={{ headerShown: false }} />
      <Stack.Screen name="saved-places" options={{ headerShown: false }} />
    </Stack>
  );
}

/**
 * Clears the launch marker once the app is genuinely up.
 *
 * Mounted at the bottom of the provider stack, so it renders only if every
 * provider above it mounted without throwing — and then waits, because a
 * store that fails in its *own* mount effect (a bad restore out of
 * AsyncStorage, a rejected first fetch) fails a beat after the tree commits,
 * and that is still a launch failure as far as the driver is concerned. Until
 * this fires, anything the reporter catches is filed as "during launch" and
 * is shown on the next start.
 *
 * The cost of the delay is only ever a mislabelled report; the cost of
 * clearing too early is the launch failure being filed as an ordinary
 * mid-session error and never surfacing at all.
 */
const LAUNCH_SETTLE_MS = 2500;

function LaunchComplete() {
  useEffect(() => {
    const timer = setTimeout(markLaunchComplete, LAUNCH_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

/**
 * Records that this driver has the app open (`profiles.last_active_at`).
 *
 * A component rather than a call inside one of the stores, because it needs a
 * session and nothing else: mounting it here keeps the ping out of every
 * store's dependency list, and a metric that fails should not be able to take
 * a store down with it. It must sit inside `AuthContext` and renders nothing.
 */
function LastActivePing() {
  useLastActivePing();
  return null;
}

function RootLayoutContent() {
  const [isLoading, setIsLoading] = useState(true);
  const { ready: fontsReady } = useAppFonts();
  const [lastCrash, setLastCrash] = useState<CrashReport | null>(null);
  const [crashAcknowledged, setCrashAcknowledged] = useState(false);

  // The first effect in the tree, deliberately. From here on an uncaught
  // throw or an unhandled rejection is written down instead of vanishing —
  // see `lib/crashReporter.ts` for what this can and cannot see.
  useEffect(() => {
    installCrashReporter();
    // Immediately after the reporter, so a build missing its keys says so in
    // the same console the crash report screen hands over. Cannot throw.
    logEnv();
    let cancelled = false;
    beginLaunch()
      .then(({ previousLaunchFailed, report }) => {
        if (cancelled) return;
        if (previousLaunchFailed && !report) {
          // The previous run armed the marker and never cleared it, but left
          // no JavaScript error behind. That is the shape of the app being
          // killed rather than crashing — the driver swiping it away during
          // the splash, or Android reclaiming memory — so it is logged and
          // not shown. A real launch crash carries a report.
          console.warn("[launch] previous run did not finish starting up");
        }
        setLastCrash(report);
      })
      .catch(() => {
        // Diagnostics must never be the reason the app fails to start.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // `hideAsync` rejects if the splash is already gone. An unhandled
    // rejection this early is a crash in a release build, so swallow it —
    // there is nothing to recover, the splash being hidden is the goal.
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Stable identity: `LoadingScreen` keys its 2.5 s timer off this callback,
  // so a fresh function on every render restarts the timer each time the
  // fonts hook re-renders us and holds the splash longer than intended.
  const handleLoadingFinish = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleCrashDismiss = useCallback(() => {
    setCrashAcknowledged(true);
    void clearCrashReport();
  }, []);

  // Hold on the loading screen until the brand faces are registered, so no
  // screen paints in system type and then reflows once Rajdhani/Inter/
  // JetBrains Mono land. `useAppFonts` caps its own wait, so this gate always
  // opens — holding it on a promise that never settles is a launch that never
  // finishes, which is reported as a crash.
  if (isLoading || !fontsReady) {
    return <LoadingScreen onFinish={handleLoadingFinish} />;
  }

  // The app started; the *previous* attempt did not. Hand over what it left
  // behind before carrying on, while the driver still remembers it happening.
  if (!crashAcknowledged && shouldSurfaceOnLaunch(lastCrash)) {
    return (
      <CrashReportScreen report={lastCrash!} onDismiss={handleCrashDismiss} />
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar 
            style="light" 
            translucent={true}
            backgroundColor="transparent"
          />
          <ThemeContext>
            <AuthContext>
              {/* Platinum wraps every store that enforces a tier cap
                  (events, party, routes, garage, saved places), so it has
                  to sit above all of them. */}
              <PlatinumProvider>
                <NotificationContext>
                  <ChatContext>
                    <XPProvider>
                      <QuestsProvider>
                        <OnlineUsersProvider>
                          <PartyProvider>
                            <EventsProvider>
                              <GroupChatProvider>
                                <RoutesProvider>
                                  <ActiveCarProvider>
                                    <SavedPlacesProvider>
                                      <CosmeticsProvider>
                                        <RootLayoutNav />
                                        <NotificationBanner />
                                        <FriendRequestsListener />
                                        <AppAlertHost />
                                        <LastActivePing />
                                        <LaunchComplete />
                                      </CosmeticsProvider>
                                    </SavedPlacesProvider>
                                  </ActiveCarProvider>
                                </RoutesProvider>
                              </GroupChatProvider>
                            </EventsProvider>
                          </PartyProvider>
                        </OnlineUsersProvider>
                      </QuestsProvider>
                    </XPProvider>
                  </ChatContext>
                </NotificationContext>
              </PlatinumProvider>
            </AuthContext>
          </ThemeContext>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * The boundary wraps the whole root component, not part of its output.
 *
 * It used to sit *inside* `RootLayout`, below an early return — so the loading
 * screen, the font hook and the root component's own render, which is every
 * line of code that runs during the window the app has twice died in, were
 * outside the only thing meant to catch them. A boundary that starts guarding
 * after the app has successfully started is guarding the wrong minutes.
 *
 * `AppErrorBoundary` is a class component with no hooks, and everything it
 * imports is either a react-native primitive or pure JavaScript, which is what
 * makes it safe to have at the very top: there is nothing above it left to
 * fail.
 */
export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <RootLayoutContent />
    </AppErrorBoundary>
  );
}
