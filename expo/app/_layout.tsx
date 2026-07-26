import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthContext, useAuth } from "@/hooks/useAuthStore";
import { ThemeContext } from "@/hooks/useThemeStore";
import { ChatContext } from "@/hooks/useChatStore";
import { NotificationContext } from "@/hooks/useNotificationStore";
import { XPProvider } from "@/hooks/useXPStore";
import { QuestsProvider } from "@/hooks/useQuestStore";
import { OnlineUsersProvider } from "@/hooks/useOnlineUsers";
import { EventsProvider } from "@/hooks/useEventsStore";
import { PartyProvider } from "@/hooks/usePartyStore";
import { GroupChatProvider } from "@/hooks/useGroupChatStore";
import { ActiveCarProvider } from "@/hooks/useActiveCarStore";
import { RoutesProvider } from "@/hooks/useRoutesStore";
import LoadingScreen from "@/components/LoadingScreen";
import NotificationBanner from "@/components/NotificationBanner";
import { useAppFonts } from "@/hooks/useAppFonts";

const queryClient = new QueryClient();

const darkScreenOptions = {
  headerStyle: { backgroundColor: "#0A0A0F" },
  headerTintColor: "#FFFFFF",
  headerTitleStyle: { color: "#FFFFFF", fontWeight: "600" as const },
  contentStyle: { backgroundColor: "#0A0A0F" },
};

/**
 * Routes a signed-out user is allowed to be on. Everything else in the app
 * assumes a session (profile, garage, trips, chat all key off `user.id`),
 * so the gate bounces them back to sign-in rather than letting screens
 * render their own half-empty guest states.
 */
const PUBLIC_ROUTES = new Set(["sign-in", "signup", "auth-callback", "terms-and-conditions"]);

/** Routes that stop making sense once you *are* signed in. */
const SIGNED_OUT_ONLY_ROUTES = new Set(["sign-in", "signup", "auth-callback"]);

/**
 * The auth gate.
 *
 * Deliberately only redirects — it never blocks rendering on `loading`,
 * because that flag also goes true during sign-in and profile refreshes,
 * and unmounting the navigator mid-flow tears down the screen the user is
 * looking at. Screens that need it (`index`) show their own spinner.
 */
function AuthGate() {
  const { isAuthenticated, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const route = segments[0];

  useEffect(() => {
    // Navigating before the root navigator has mounted is a no-op that
    // silently drops the redirect.
    if (!navigationState?.key || loading) return;

    const onPublicRoute = route !== undefined && PUBLIC_ROUTES.has(route);

    if (!isAuthenticated && !onPublicRoute && route !== undefined) {
      router.replace("/sign-in" as any);
    } else if (isAuthenticated && route !== undefined && SIGNED_OUT_ONLY_ROUTES.has(route)) {
      router.replace("/select-car" as any);
    }
  }, [navigationState?.key, loading, isAuthenticated, route, router]);

  return null;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={darkScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="select-car" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="terms-and-conditions" />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="routes" options={{ headerShown: false }} />
      <Stack.Screen name="nearby-places" options={{ headerShown: false }} />
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
    </Stack>
  );
}

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const { ready: fontsReady } = useAppFonts();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const handleLoadingFinish = () => {
    setIsLoading(false);
  };

  // Hold on the loading screen until the brand faces are registered, so no
  // screen paints in system type and then reflows once Rajdhani/Inter/
  // JetBrains Mono land.
  if (isLoading || !fontsReady) {
    return <LoadingScreen onFinish={handleLoadingFinish} />;
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
                                  <RootLayoutNav />
                                  <AuthGate />
                                  <NotificationBanner />
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
            </AuthContext>
          </ThemeContext>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}