/**
 * Driveverse Platinum — the paywall.
 *
 * ONE screen serves every entry point: the Settings "Driveverse Platinum"
 * row, and each of the friction points where a Regular driver hits a cap.
 * Friction points pass `?trigger=<benefitId>`, which pins that benefit to the
 * top of the list under a contextual headline — so a driver who just tried to
 * add a third car lands on a screen about garages, not a generic pitch.
 *
 * It is also the reference implementation of the Platinum visual identity:
 * the chrome ramp from `constants/platinum.ts`, the badge from
 * `components/platinum/PlatinumBadge.tsx`, and the app's existing Rajdhani /
 * Inter / JetBrains Mono split. Prices are numbers, so they are set in
 * JetBrains Mono like every other measurement in the app.
 *
 * The primary CTA stays racingRed. Platinum owns chrome, but "the button you
 * press" is a red CutCorner slab everywhere in Driveverse and this screen is
 * not the place to break that.
 *
 * STORE-UNAVAILABLE STATE
 *   Expo Go, web, and any build without RevenueCat keys can still open this
 *   screen. It renders in full with fallback prices and a disabled CTA rather
 *   than 404ing, because half the value of the paywall is explaining the tier.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarPlus,
  Car,
  Frame,
  MapPin,
  Rocket,
  Route as RouteIcon,
  Sparkles,
  Users,
} from "lucide-react-native";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import { PlatinumBadge } from "@/components/platinum/PlatinumBadge";
import {
  PLATINUM_BENEFITS,
  PLATINUM_FALLBACK_PRICE,
  onPlatinum,
  platinum,
  type PlatinumBenefit,
  type PlatinumBenefitId,
} from "@/constants/platinum";
import {
  alpha,
  borderWidth,
  colors,
  cut,
  fontFamily,
  radius,
  spacing,
  textStyle,
} from "@/constants/theme";
import { usePlatinum } from "@/hooks/usePlatinumStore";
import { manageSubscriptionUrl, type PlatinumPeriod } from "@/lib/purchases";

const ICON_MD = spacing.spacingLg; // 16
const ICON_STROKE = 1.75;

/**
 * Who the driver is actually paying. Apple and Google are the merchants of
 * record, not Driveverse, and both stores require the billing terms to say
 * so on the purchase screen.
 */
const STORE_NAME = Platform.select({
  ios: "the App Store",
  android: "Google Play",
  default: "your app store",
}) as string;

/** Benefit icon names resolved to components. Kept here so the catalogue
 *  in `constants/platinum.ts` stays free of React imports. */
const BENEFIT_ICONS: Record<string, React.FC<{ size: number; color: string; strokeWidth?: number }>> = {
  BadgeCheck,
  CalendarPlus,
  Car,
  Sparkles,
  Route: RouteIcon,
  MapPin,
  Frame,
  Rocket,
  Users,
};

export default function PlatinumPaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ trigger?: string }>();
  const {
    isPlatinum,
    entitlement,
    canPurchase,
    packages,
    loadingPackages,
    loadPackages,
    purchase,
    restore,
    openCustomerCenter,
  } = usePlatinum();

  const [period, setPeriod] = useState<PlatinumPeriod>("yearly");
  const [busy, setBusy] = useState<"purchase" | "restore" | "manage" | null>(null);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  /* ─── Contextual trigger ────────────────────────────────── */

  const trigger = params.trigger as PlatinumBenefitId | undefined;

  /**
   * The benefit that raised this screen, first in the list, everything else
   * behind it in catalogue order. No benefit is dropped — a driver blocked
   * on the garage should still see they're also buying the badge.
   */
  const { pinned, rest } = useMemo(() => {
    const match = trigger
      ? PLATINUM_BENEFITS.find((b) => b.id === trigger)
      : undefined;
    return {
      pinned: match ?? null,
      rest: match
        ? PLATINUM_BENEFITS.filter((b) => b.id !== match.id)
        : PLATINUM_BENEFITS,
    };
  }, [trigger]);

  /* ─── Pricing ───────────────────────────────────────────── */

  const monthly = packages.find((p) => p.period === "monthly") ?? null;
  const yearly = packages.find((p) => p.period === "yearly") ?? null;
  const lifetime = packages.find((p) => p.period === "lifetime") ?? null;
  const selected =
    period === "lifetime" ? lifetime : period === "yearly" ? yearly : monthly;

  /**
   * Yearly saving against twelve months at the monthly rate. Only shown when
   * both prices came from the store — computing a discount off the fallback
   * strings would be advertising a number nobody is charging.
   */
  const yearlySavingPercent = useMemo(() => {
    if (!monthly || !yearly) return null;
    const twelveMonths = monthly.product.price * 12;
    if (twelveMonths <= 0) return null;
    const saving = 1 - yearly.product.price / twelveMonths;
    return saving > 0.01 ? Math.round(saving * 100) : null;
  }, [monthly, yearly]);

  const priceFor = (p: PlatinumPeriod): string => {
    const pkg = p === "lifetime" ? lifetime : p === "yearly" ? yearly : monthly;
    return pkg?.product.priceString ?? PLATINUM_FALLBACK_PRICE[p];
  };

  /* ─── Actions ───────────────────────────────────────────── */

  const handlePurchase = useCallback(async () => {
    if (!selected) return;
    setBusy("purchase");
    const result = await purchase(selected);
    setBusy(null);

    if (result.status === "purchased") {
      // Straight back to whatever they were doing — the cap that sent them
      // here is lifted by the time the previous screen re-renders.
      router.back();
      return;
    }
    // A cancelled purchase is the driver's decision, not an error.
    if (result.status === "cancelled") return;
    if (result.status === "unavailable") {
      Alert.alert(
        "Not available",
        "Purchases aren't available on this build. Try the App Store or Play Store build of Driveverse."
      );
      return;
    }
    Alert.alert("Purchase failed", result.message);
  }, [selected, purchase, router]);

  const handleRestore = useCallback(async () => {
    setBusy("restore");
    const result = await restore();
    setBusy(null);

    if (result.status === "restored") {
      Alert.alert("Platinum restored", "Your subscription is active again.");
      return;
    }
    if (result.status === "nothing_to_restore") {
      Alert.alert(
        "Nothing to restore",
        "No previous Platinum purchase was found on this store account."
      );
      return;
    }
    if (result.status === "unavailable") {
      Alert.alert("Not available", "The store isn't reachable on this build.");
      return;
    }
    Alert.alert("Restore failed", result.message);
  }, [restore]);

  /**
   * Customer Center first — RevenueCat's in-app management sheet, so the
   * driver never leaves Driveverse. Falls back to the store's own
   * subscriptions page when the UI module can't be shown on this runtime.
   */
  const handleManage = useCallback(async () => {
    setBusy("manage");
    const presented = await openCustomerCenter();
    setBusy(null);
    if (!presented) {
      Linking.openURL(manageSubscriptionUrl());
    }
  }, [openCustomerCenter]);

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.chrome, { paddingTop: insets.top + spacing.spacingSm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={spacing.spacingSm}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <ArrowLeft size={spacing.spacingXl} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.spacingXxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ HEADER ═══ */}
        <View style={styles.header}>
          <PlatinumBadge variant="hero" size={104} />
          <Text style={styles.title}>DRIVEVERSE</Text>
          <Text style={styles.titlePlatinum}>PLATINUM</Text>
          <Text style={styles.subtitle}>
            {isPlatinum
              ? "Your subscription is active."
              : "Everything in Driveverse, uncapped — plus the things only Platinum drivers get."}
          </Text>

          {entitlement.isSandbox && (
            // Dev/QA only: a sandbox purchase looks identical to a real one,
            // so surface RevenueCat's own flag rather than have anyone guess.
            <View style={styles.sandboxTag}>
              <Text style={styles.sandboxText}>SANDBOX</Text>
            </View>
          )}
        </View>

        {/* ═══ CONTEXTUAL TRIGGER ═══ */}
        {pinned && !isPlatinum && (
          <CutCornerSurface
            fill={alpha(platinum.chrome, 0.06)}
            borderColor={platinum.chromeDeep}
            borderWidth={borderWidth.hairline}
            cutSize={cut.md}
            corners="topRight"
            style={styles.triggerCard}
            contentStyle={styles.triggerContent}
          >
            <Text style={styles.triggerHeadline}>
              {pinned.triggerHeadline ?? pinned.title}
            </Text>
            <BenefitRow benefit={pinned} highlighted last />
          </CutCornerSurface>
        )}

        {/* ═══ BENEFITS ═══ */}
        <Text style={styles.overline}>
          {pinned && !isPlatinum ? "ALSO INCLUDED" : "WHAT YOU GET"}
        </Text>
        <View style={styles.benefits}>
          {rest.map((benefit, index) => (
            <BenefitRow
              key={benefit.id}
              benefit={benefit}
              last={index === rest.length - 1}
            />
          ))}
        </View>

        {/* ═══ PRICING / CTA ═══ */}
        {isPlatinum ? (
          <View style={styles.block}>
            <CutCornerSurface
              fill={colors.carbonSurface}
              borderColor={colors.hairline}
              borderWidth={borderWidth.hairline}
              cutSize={cut.md}
              corners="topRight"
              contentStyle={styles.activeCard}
            >
              <Text style={styles.overline}>
                {entitlement.isLifetime ? "LIFETIME" : "SUBSCRIPTION"}
              </Text>
              <Text style={styles.activeState}>
                {entitlement.isLifetime
                  ? "Never expires"
                  : entitlement.willRenew
                  ? "Renews automatically"
                  : "Ends at period close"}
              </Text>
              {entitlement.expiresAt && (
                <Text style={styles.activeDate}>
                  {new Date(entitlement.expiresAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              )}
            </CutCornerSurface>

            {/* A lifetime purchase has nothing to manage or cancel — there is
                no renewal, so this row would be a dead end for that driver. */}
            {!entitlement.isLifetime && (
              <CutCornerButton
                title={busy === "manage" ? "Opening…" : "Manage Subscription"}
                variant="ghost"
                size="md"
                corners="topRight"
                disabled={busy !== null}
                onPress={handleManage}
                style={styles.cta}
              />
            )}
          </View>
        ) : (
          <View style={styles.block}>
            <View style={styles.periodRow}>
              <PeriodOption
                label="Monthly"
                price={priceFor("monthly")}
                note="per month"
                active={period === "monthly"}
                onPress={() => setPeriod("monthly")}
              />
              <PeriodOption
                label="Yearly"
                price={priceFor("yearly")}
                note="per year"
                badge={yearlySavingPercent ? `SAVE ${yearlySavingPercent}%` : undefined}
                active={period === "yearly"}
                onPress={() => setPeriod("yearly")}
              />
              <PeriodOption
                label="Lifetime"
                price={priceFor("lifetime")}
                note="one-time"
                badge="NEVER EXPIRES"
                active={period === "lifetime"}
                onPress={() => setPeriod("lifetime")}
              />
            </View>

            {loadingPackages && (
              <View style={styles.pricesLoading}>
                <ActivityIndicator color={platinum.chrome} />
                <Text style={styles.pricesLoadingText}>Checking store prices…</Text>
              </View>
            )}

            <CutCornerButton
              title={busy === "purchase" ? "Opening store…" : "Upgrade to Platinum"}
              variant="primary"
              size="lg"
              corners="topRight"
              disabled={!canPurchase || !selected || busy !== null}
              onPress={handlePurchase}
              style={styles.cta}
            />

            {!canPurchase && (
              <Text style={styles.unavailableNote}>
                Purchases need the App Store or Play Store build of Driveverse.
              </Text>
            )}

            <Text style={styles.terms}>
              {period === "lifetime"
                ? `Billed once through ${STORE_NAME}. One-time purchase — never renews, nothing to cancel.`
                : `Billed through ${STORE_NAME}. Renews automatically until cancelled; manage or cancel any time in your ${STORE_NAME} account.`}
            </Text>

            {/* App Store guideline 3.1.1 requires restore to be reachable
                from the paywall. Present, deliberately not prominent. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              onPress={handleRestore}
              disabled={busy !== null}
              hitSlop={spacing.spacingSm}
              style={({ pressed }) => [styles.restore, pressed && styles.pressed]}
            >
              <Text style={styles.restoreText}>
                {busy === "restore" ? "Restoring…" : "Restore Purchases"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Benefit row
 * ------------------------------------------------------------------ */

/**
 * Hairline-divided row with a small icon, matching how the profile's
 * settings list and the Drive Hub's stat rows are built. Not a CutCorner
 * card each — nine cut cards stacked would turn the signature shape into
 * wallpaper (`components/CutCorner.tsx`: "if the cut is on everything it
 * stops being a signature").
 */
function BenefitRow({
  benefit,
  highlighted = false,
  last = false,
}: {
  benefit: PlatinumBenefit;
  highlighted?: boolean;
  last?: boolean;
}) {
  const Icon = BENEFIT_ICONS[benefit.icon] ?? BadgeCheck;
  return (
    <View style={[styles.benefitRow, last && styles.benefitRowLast]}>
      <View style={styles.benefitIcon}>
        <Icon
          size={ICON_MD}
          color={highlighted ? platinum.chrome : colors.textSecondary}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <View style={styles.benefitText}>
        <Text style={[styles.benefitTitle, highlighted && styles.benefitTitleHighlighted]}>
          {benefit.title}
        </Text>
        <Text style={styles.benefitDescription}>{benefit.description}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Period option
 * ------------------------------------------------------------------ */

/** Monthly / yearly selector. The price is a number, so JetBrains Mono. */
function PeriodOption({
  label,
  price,
  note,
  badge,
  active,
  onPress,
}: {
  label: string;
  price: string;
  note: string;
  badge?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${price}`}
      onPress={onPress}
      style={({ pressed }) => [styles.periodPressable, pressed && styles.pressed]}
    >
      <CutCornerSurface
        fill={active ? alpha(platinum.chrome, 0.1) : colors.carbonSurface}
        borderColor={active ? platinum.chrome : colors.hairline}
        borderWidth={active ? borderWidth.emphasis : borderWidth.hairline}
        cutSize={cut.md}
        corners="topRight"
        contentStyle={styles.periodContent}
      >
        <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>
          {label.toUpperCase()}
        </Text>
        <Text style={styles.periodPrice} numberOfLines={1} adjustsFontSizeToFit>
          {price}
        </Text>
        <Text style={styles.periodNote}>{note}</Text>
        {badge && (
          <View style={styles.periodBadge}>
            <Text style={styles.periodBadgeText}>{badge}</Text>
          </View>
        )}
      </CutCornerSurface>
    </Pressable>
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
    paddingHorizontal: spacing.spacingLg,
    paddingBottom: spacing.spacingSm,
  },
  content: {
    paddingHorizontal: spacing.spacingLg,
  },

  // Header
  header: {
    alignItems: "center",
    paddingTop: spacing.spacingLg,
    paddingBottom: spacing.spacingXl,
    gap: spacing.spacingSm,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textSecondary,
    marginTop: spacing.spacingMd,
  },
  titlePlatinum: {
    ...textStyle("displayXl"),
    color: platinum.chrome,
    marginTop: -spacing.spacingXs,
  },
  subtitle: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.spacingMd,
  },
  sandboxTag: {
    marginTop: spacing.spacingSm,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs,
    borderRadius: radius.sharp,
    borderWidth: borderWidth.hairline,
    borderColor: platinum.chromeDeep,
  },
  sandboxText: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
    color: platinum.chromeDim,
  },

  // Contextual trigger
  triggerCard: {
    marginBottom: spacing.spacingXl,
  },
  triggerContent: {
    padding: spacing.spacingLg,
    paddingBottom: spacing.spacingSm,
  },
  triggerHeadline: {
    ...textStyle("displayMd"),
    color: platinum.chrome,
    marginBottom: spacing.spacingSm,
  },

  // Benefits
  overline: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginBottom: spacing.spacingSm,
  },
  benefits: {
    marginBottom: spacing.spacingXl,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.hairline,
  },
  benefitRowLast: {
    borderBottomWidth: 0,
  },
  benefitIcon: {
    width: spacing.spacingXl,
    alignItems: "center",
    paddingTop: spacing.spacingXs / 2,
  },
  benefitText: {
    flex: 1,
    gap: spacing.spacingXs / 2,
  },
  benefitTitle: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  benefitTitleHighlighted: {
    color: platinum.chrome,
  },
  benefitDescription: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },

  // Pricing
  block: {
    gap: spacing.spacingMd,
  },
  periodRow: {
    flexDirection: "row",
    gap: spacing.spacingMd,
  },
  periodPressable: {
    flex: 1,
  },
  periodContent: {
    padding: spacing.spacingLg,
    alignItems: "flex-start",
    gap: spacing.spacingXs,
  },
  periodLabel: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
  periodLabelActive: {
    color: platinum.chrome,
  },
  periodPrice: {
    ...textStyle("dataLg"),
    fontSize: 22,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  periodNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  periodBadge: {
    marginTop: spacing.spacingXs,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingXs / 2,
    backgroundColor: platinum.chrome,
    borderRadius: radius.sharp,
  },
  periodBadgeText: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.8,
    color: onPlatinum,
  },
  pricesLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  pricesLoadingText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  cta: {
    marginTop: spacing.spacingSm,
  },
  unavailableNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
  },
  terms: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.spacingSm,
  },
  restore: {
    alignSelf: "center",
    paddingVertical: spacing.spacingSm,
  },
  restoreText: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textDecorationLine: "underline",
  },

  // Active subscription
  activeCard: {
    padding: spacing.spacingLg,
    gap: spacing.spacingXs,
  },
  activeState: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  activeDate: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
});
