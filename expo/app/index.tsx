import { Redirect } from "expo-router";
import { useAuth } from "@/hooks/useAuthStore";
import LoadingScreen from "@/components/LoadingScreen";

// The sign-in gate: no garage, no app, until you're signed in.
export default function IndexScreen() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/select-car" />;
}
