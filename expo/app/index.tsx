import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuthStore";
import LoadingScreen from "@/components/LoadingScreen";

/**
 * How long this screen will wait on `useAuth().loading` before giving up on
 * it and treating the driver as signed out.
 *
 * LAUNCH SAFETY — this is the same shape as `FONT_TIMEOUT_MS`
 * (`useAppFonts.ts`): a gate held open by a promise that might never settle.
 * `hooks/useAuthStore.ts` and `lib/socialAuth.ts` now cap their own network
 * calls at `AUTH_NETWORK_TIMEOUT_MS` (15s) so `loading` should never actually
 * take this long — this is the backstop for whatever that pair does not
 * cover, so a stall here reads as "signed out, try again" rather than the
 * driver staring at the logo with no way forward.
 */
const AUTH_GATE_TIMEOUT_MS = 20000;

// The sign-in gate: no garage, no app, until you're signed in.
export default function IndexScreen() {
  const { isAuthenticated, loading, needsProfileCustomization } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOut(true), AUTH_GATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading && !timedOut) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  // Every signup path — email, Google, Apple — lands here once before the
  // garage gate, so customization can never be skipped by going straight
  // through a social provider.
  if (needsProfileCustomization) {
    return <Redirect href="/customize-profile" />;
  }

  return <Redirect href="/select-car" />;
}
