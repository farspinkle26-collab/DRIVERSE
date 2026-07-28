/**
 * Driveverse Platinum — subscription management.
 *
 * The post-purchase counterpart to `app/platinum.tsx`. Where the paywall
 * exists to sell the tier, this screen exists to service it: what the driver
 * is on, when it renews, restoring a purchase, changing plan, asking for a
 * refund, and cancelling.
 *
 * TWO IMPLEMENTATIONS, SAME REASONING AS THE PAYWALL
 *   When `react-native-purchases-ui` is linked, the body is RevenueCat's
 *   Customer Center — a dashboard-configured surface that carries the
 *   cancellation survey, retention offers, plan-change paths and (on iOS) the
 *   StoreKit refund request. Editing any of that is a dashboard change rather
 *   than an app release, which is the whole point: a retention offer that
 *   needs a review cycle to adjust is a retention offer nobody adjusts.
 *
 *   Otherwise — Expo Go, web, or a build without the UI module — this renders
 *   the app's own summary and ends in the same place the Customer Center's
 *   cancel path ends: the store's own subscription screen. Apple and Google
 *   both forbid an in-app cancel flow, so no version of this screen cancels
 *   anything itself. It hands off.
 *
 * ENTRY POINTS
 *   `usePlatinum().openCustomerCenter()` presents the Customer Center modally
 *   and falls back to pushing this route. This route is also the deep-link
 *   target (`/subscription`) and the destination of the profile's Platinum row
 *   for an active subscriber.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import { onPlatinum, platinum } from "@/constants/platinum";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { usePlatinum } from "@/hooks/usePlatinumStore";
import { manageSubscriptionUrl, type CustomerSummary } from "@/lib/purchases";
import { CustomerCenterView, isPurchasesUiAvailable } from "@/lib/purchasesUi";

const ICON_STROKE = 1.75;

const STORE_NAME = Platform.select({
  ios: "the App Store",
  android: "Google Play",
  default: "your app store",
}) as string;

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { entitlement, isPlatinum, isTestStore, restore, refresh, loadCustomerSummary } =
    usePlatinum();

  const hasCustomerCenter = isPurchasesUiAvailable();

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.chrome, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          hitSlop={spacing.spacingSm}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <ArrowLeft
            size={spacing.spacingXl}
            color={colors.textPrimary}
            strokeWidth={ICON_STROKE}
          />
        </Pressable>
        <Text style={styles.headerTitle}>SUBSCRIPTION</Text>
        {isTestStore && (
          <View style={styles.testTag}>
            <Text style={styles.testTagText}>TEST STORE</Text>
          </View>
        )}
      </View>

      {hasCustomerCenter ? (
        // RevenueCat owns the whole body. `onDismiss` fires when the driver
        // finishes inside it; a refresh here means the app's gates reflect a
        // plan change or a refund without waiting on the webhook.
        <CustomerCenterView
          style={styles.customerCenter}
          handlers={{
            onRestoreCompleted: () => void refresh(),
            onManagementOptionSelected: () => void refresh(),
          }}
          onDismiss={() => {
            void refresh();
            router.back();
          }}
        />
      ) : (
        <ManageFallback
          entitlement={entitlement}
          isPlatinum={isPlatinum}
          restore={restore}
          loadCustomerSummary={loadCustomerSummary}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Fallback
 * ------------------------------------------------------------------ */

/**
 * What a driver gets without the Customer Center: the same facts, the same two
 * actions that matter (restore, manage at the store), and no pretence of the
 * plan-change or refund flows that genuinely need the native module.
 */
function ManageFallback({
  entitlement,
  isPlatinum,
  restore,
  loadCustomerSummary,
  bottomInset,
}: {
  entitlement: ReturnType<typeof usePlatinum>["entitlement"];
  isPlatinum: boolean;
  restore: ReturnType<typeof usePlatinum>["restore"];
  loadCustomerSummary: ReturnType<typeof usePlatinum>["loadCustomerSummary"];
  bottomInset: number;
}) {
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCustomerSummary().then((s) => {
      if (active) setSummary(s);
    });
    return () => {
      active = false;
    };
  }, [loadCustomerSummary]);

  const handleRestore = useCallback(async () => {
    setBusy(true);
    const result = await restore();
    setBusy(false);
    if (result.status === "restored") {
      Alert.alert("Platinum restored", "Your subscription is active again.");
      return;
    }
    if (result.status === "nothing_to_restore") {
      Alert.alert(
        "Nothing to restore",
        `No previous Platinum purchase was found on this ${STORE_NAME} account.`
      );
      return;
    }
    if (result.status === "unavailable") {
      Alert.alert("Not available", "The store isn't reachable on this build.");
      return;
    }
    Alert.alert("Restore failed", result.message);
  }, [restore]);

  const renewsOn = formatDate(entitlement.expiresAt);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: bottomInset + spacing.spacingXxxl },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <CutCornerSurface
        fill={colors.carbonSurface}
        borderColor={colors.hairline}
        borderWidth={borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.card}
      >
        <Text style={styles.overline}>STATUS</Text>
        <Text style={styles.status}>
          {!isPlatinum
            ? "Regular"
            : entitlement.isTrial
              ? "Platinum — free trial"
              : "Platinum"}
        </Text>

        {isPlatinum && renewsOn && (
          <Text style={styles.detail}>
            {entitlement.willRenew ? `Renews ${renewsOn}` : `Ends ${renewsOn}`}
          </Text>
        )}
        {isPlatinum && entitlement.productIdentifier && (
          <Text style={styles.detailMono}>{entitlement.productIdentifier}</Text>
        )}
        {entitlement.billingIssueDetectedAt && (
          <Text style={styles.billingIssue}>
            {STORE_NAME} couldn&apos;t take the last payment. Update your payment
            method to keep Platinum.
          </Text>
        )}
      </CutCornerSurface>

      {/* The RevenueCat customer id, quoted verbatim in support conversations.
          Without it, "I paid and it's not showing" is unanswerable. */}
      {summary && (
        <CutCornerSurface
          fill={colors.carbonSurface}
          borderColor={colors.hairline}
          borderWidth={borderWidth.hairline}
          cutSize={cut.md}
          corners="topRight"
          contentStyle={styles.card}
        >
          <Text style={styles.overline}>SUPPORT ID</Text>
          <Text style={styles.detailMono} selectable>
            {summary.originalAppUserId}
          </Text>
          {summary.activeSubscriptions.length > 0 && (
            <>
              <Text style={styles.overline}>ACTIVE</Text>
              {summary.activeSubscriptions.map((id) => (
                <Text key={id} style={styles.detailMono}>
                  {id}
                </Text>
              ))}
            </>
          )}
          {summary.nonSubscriptionProductIdentifiers.length > 0 && (
            <>
              <Text style={styles.overline}>ONE-TIME</Text>
              {summary.nonSubscriptionProductIdentifiers.map((id) => (
                <Text key={id} style={styles.detailMono}>
                  {id}
                </Text>
              ))}
            </>
          )}
        </CutCornerSurface>
      )}

      {isPlatinum && (
        <CutCornerButton
          title="Manage at the store"
          variant="ghost"
          size="md"
          corners="topRight"
          onPress={() => void Linking.openURL(manageSubscriptionUrl(entitlement))}
        />
      )}

      <CutCornerButton
        title={busy ? "Restoring…" : "Restore Purchases"}
        variant="ghost"
        size="md"
        corners="topRight"
        disabled={busy}
        onPress={handleRestore}
      />

      <Text style={styles.note}>
        Plan changes, refund requests and cancellation live in {STORE_NAME}.
        Driveverse can&apos;t make those changes on your behalf.
      </Text>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.voidBlack,
  },
  pressed: {
    opacity: 0.7,
  },
  chrome: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingMd,
  },
  headerTitle: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.2,
    color: colors.textPrimary,
  },
  testTag: {
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs / 2,
    backgroundColor: platinum.chrome,
    borderRadius: radius.sharp,
  },
  testTagText: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
    color: onPlatinum,
  },
  customerCenter: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  card: {
    padding: spacing.spacingLg,
    gap: spacing.spacingXs,
  },
  overline: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginTop: spacing.spacingXs,
  },
  status: {
    ...textStyle("displayMd"),
    color: platinum.chrome,
  },
  detail: {
    ...textStyle("body"),
    color: colors.textPrimary,
  },
  detailMono: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
  billingIssue: {
    ...textStyle("caption"),
    color: colors.racingRed,
    marginTop: spacing.spacingXs,
  },
  note: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.spacingSm,
    marginTop: spacing.spacingSm,
  },
});
