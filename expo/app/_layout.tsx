import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthContext } from "@/hooks/useAuthStore";
import { TowingContext } from "@/hooks/useTowingStore";
import { ThemeContext } from "@/hooks/useThemeStore";
import { TransactionContext } from "@/hooks/useTransactionStore";
import { PaymentContext } from "@/hooks/usePaymentStore";
import { ChatContext } from "@/hooks/useChatStore";
import { NotificationContext } from "@/hooks/useNotificationStore";
import { RealtimeContext } from "@/hooks/useRealtimeStore";
import { XPProvider } from "@/hooks/useXPStore";
import { QuestsProvider } from "@/hooks/useQuestStore";
import { OnlineUsersProvider } from "@/hooks/useOnlineUsers";
import { EventsProvider } from "@/hooks/useEventsStore";
import { PartyProvider } from "@/hooks/usePartyStore";
import { ActiveCarProvider } from "@/hooks/useActiveCarStore";
import { RoutesProvider } from "@/hooks/useRoutesStore";
import LoadingScreen from "@/components/LoadingScreen";
import NotificationBanner from "@/components/NotificationBanner";

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
      <Stack.Screen name="request-tow" />
      <Stack.Screen name="request-details" />
      <Stack.Screen name="map-selection" />
      <Stack.Screen name="location-confirmation" />
      <Stack.Screen name="towing-recommendation" />
      <Stack.Screen name="track-order" />
      <Stack.Screen name="terms-and-conditions" />
      <Stack.Screen name="top-up" options={{ headerShown: false }} />
      <Stack.Screen name="transaction-history" options={{ headerShown: false }} />
      <Stack.Screen name="payment-history" options={{ headerShown: false }} />
      <Stack.Screen name="top-up-history" options={{ headerShown: false }} />
      <Stack.Screen name="payment-checkout" options={{ headerShown: false }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="signup" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="routes" options={{ headerShown: false }} />
      <Stack.Screen name="route/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="ranks" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const handleLoadingFinish = () => {
    setIsLoading(false);
  };

  if (isLoading) {
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
              <PaymentContext>
                <TransactionContext>
                  <TowingContext>
                    <RealtimeContext>
                      <NotificationContext>
                        <ChatContext>
                        <XPProvider>
                          <QuestsProvider>
                            <OnlineUsersProvider>
                              <PartyProvider>
                                <EventsProvider>
                                  <RoutesProvider>
                                    <ActiveCarProvider>
                                      <RootLayoutNav />
                                      <NotificationBanner />
                                    </ActiveCarProvider>
                                  </RoutesProvider>
                                </EventsProvider>
                              </PartyProvider>
                            </OnlineUsersProvider>
                          </QuestsProvider>
                        </XPProvider>
                      </ChatContext>
                      </NotificationContext>
                    </RealtimeContext>
                  </TowingContext>
                </TransactionContext>
              </PaymentContext>
            </AuthContext>
          </ThemeContext>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}