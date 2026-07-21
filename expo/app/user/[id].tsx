import React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import ProfileScreen from "@/components/ProfileScreen";

// Another driver's profile. Renders the exact same unified profile
// layout as the signed-in user's own page — see ProfileScreen.
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileScreen userId={id} />
    </>
  );
}
