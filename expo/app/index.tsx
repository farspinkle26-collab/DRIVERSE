import { Redirect } from "expo-router";

// The garage gate: pick your car before entering the app.
export default function IndexScreen() {
  return <Redirect href="/select-car" />;
}
