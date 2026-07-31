/**
 * Driveverse — what the driver sees after the app died on them.
 *
 * Shown on the launch *after* a launch failure, not during one: by the time
 * this renders the app has already started successfully, so it is safe to be
 * an ordinary screen. Its only job is to turn a black screen nobody could
 * report into a block of text somebody can paste into a message.
 *
 * DEPENDENCIES ARE DELIBERATELY MINIMAL, for the same reason as
 * `AppErrorBoundary`: no theme, no fonts, no provider. This has to render in
 * an app that has just proven it cannot be trusted to start.
 * `expo-clipboard` is required lazily and the copy silently degrades, because
 * a failed copy must not take down the screen that explains the last crash.
 */

import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { formatReport, type CrashReport } from "@/lib/crashReport";

export default function CrashReportScreen({
  report,
  onDismiss,
}: {
  report: CrashReport;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = formatReport(report);

  const handleCopy = useCallback(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require("expo-clipboard");
      void Clipboard.setStringAsync(text)
        .then(() => setCopied(true))
        .catch(() => {});
    } catch {
      // No clipboard module on this build; the text is selectable anyway.
    }
  }, [text]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Driveverse didn&apos;t start last time</Text>
        <Text style={styles.body}>
          It&apos;s running now. This is what went wrong — sending it to us is
          the fastest way to get it fixed for good.
        </Text>

        <ScrollView
          style={styles.reportBox}
          contentContainerStyle={styles.reportContent}
          horizontal={false}
        >
          <Text style={styles.report} selectable>
            {text}
          </Text>
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Copy the crash report"
          >
            <Text style={styles.buttonLabel}>
              {copied ? "Copied" : "Copy report"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.button,
              styles.secondary,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Continue to the app"
          >
            <Text style={[styles.buttonLabel, styles.secondaryLabel]}>
              Continue
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", marginBottom: 12 },
  body: { color: "#B4B4C0", fontSize: 15, lineHeight: 22, marginBottom: 20 },
  reportBox: {
    maxHeight: 260,
    backgroundColor: "#14141C",
    borderWidth: 1,
    borderColor: "#26272E",
    marginBottom: 24,
  },
  reportContent: { padding: 14 },
  report: { color: "#9A9CA8", fontSize: 11, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 12 },
  button: {
    backgroundColor: "#FF1E3C",
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#26272E" },
  pressed: { opacity: 0.75 },
  buttonLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  secondaryLabel: { color: "#B4B4C0" },
});
