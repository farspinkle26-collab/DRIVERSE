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
import { MapFiltersContext } from "@/hooks/useMapFilters";
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

function RootLayoutNav() {
  return (
    <Stack screenOptions={darkScreenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="select-car" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="terms-and-conditions" />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
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
                                        {/* Map layer filters. No dependency
                                            on any store above — it reads
                                            AsyncStorage and nothing else —
                                            so it sits at the bottom where
                                            it is cheapest to mount. */}
                                        <MapFiltersContext>
                                          <RootLayoutNav />
                                          <NotificationBanner />
                                        </MapFiltersContext>
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