import { Redirect } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";
import LoadingScreen from "@/components/LoadingScreen";

// The sign-in gate: no garage, no app, until you're signed in.
export default function IndexScreen() {
  const { isAuthenticated, loading, needsProfileCustomization } = useAuth();

  if (loading) {
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
