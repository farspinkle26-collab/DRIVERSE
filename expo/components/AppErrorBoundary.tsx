/**
 * Driveverse — the last thing standing between a JavaScript error and a black
 * screen.
 *
 * WHAT IT IS FOR
 *   Without a boundary, a throw anywhere in the provider tree or the first
 *   screen unmounts the whole React tree. React Native does not put anything
 *   in its place in a release build: the driver is left looking at an empty
 *   window, which reads as "the app crashed on open" whether or not the
 *   process actually died. With a boundary, the same throw becomes a screen
 *   that says what happened and offers a way out.
 *
 * WHAT IT CANNOT DO
 *   A React error boundary only catches errors thrown while *rendering* the
 *   tree below it. It cannot catch:
 *     - errors thrown at module scope, during bundle evaluation, because no
 *       tree exists yet (which is why `lib/socialAuth.ts` and
 *       `hooks/useNotificationStore.ts` keep their native calls out of import
 *       time — this component is not a substitute for that);
 *     - errors inside event handlers, timers or promises;
 *     - native crashes.
 *   It is the second line of defence, not the first.
 *
 * DEPENDENCIES ARE DELIBERATELY MINIMAL
 *   Only `react` and `react-native` primitives, and literal colours rather
 *   than `@/constants/theme`. The fallback has to be able to render in a tree
 *   where something has already gone wrong, so it must not depend on fonts
 *   having loaded, on a context provider having mounted, or on any other
 *   module that could itself be the thing that threw.
 */

import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * The fallback itself. Exported on its own so Expo Router's `ErrorBoundary`
 * hook — which hands over an error it has already caught — can render the
 * same screen without a boundary having to catch anything a second time.
 */
export function ErrorScreen({
  error,
  onRetry,
}: {
  error: Error;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          Driveverse hit an error it couldn&apos;t recover from on its own. Try
          again — if it keeps happening, reopening the app usually clears it.
        </Text>
        {/* The message is shown rather than hidden: a driver reporting
            "it says X" is worth more than a polished dead end. */}
        <Text style={styles.detail} selectable>
          {error?.message || String(error)}
        </Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonLabel}>Try again</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

interface Props {
  children: React.ReactNode;
  /**
   * Run in addition to clearing the caught error when the driver taps
   * "Try again" — Expo Router's own `retry`, where there is one.
   */
  onRetry?: () => void;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Goes to logcat / Console, which is the only place to read it from a
    // store build on a real phone.
    console.error("[AppErrorBoundary] caught:", error, info?.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen error={error} onRetry={this.handleRetry} />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0F",
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
  },
  body: {
    color: "#B4B4C0",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  detail: {
    color: "#7A7A8C",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 28,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: "#FF1E3C",
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

export default AppErrorBoundary;
