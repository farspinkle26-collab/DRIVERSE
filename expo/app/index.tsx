import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";
import { colors } from "@/constants/theme";

/**
 * The fork at the front door: sign-in gate for a signed-out driver, the
 * garage gate ("pick your car") for a signed-in one.
 *
 * Holds a spinner while the stored session is being restored — redirecting
 * on a not-yet-known auth state would flash the sign-in screen at everyone
 * on every cold start.
 */
export default function IndexScreen() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.racingRed} />
      </View>
    );
  }

  return <Redirect href={isAuthenticated ? "/select-car" : "/sign-in"} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.voidBlack,
  },
});
