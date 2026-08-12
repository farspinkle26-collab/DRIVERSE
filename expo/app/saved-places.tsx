/**
 * Driveverse — Saved Places.
 *
 * The driver's own bookmarks over the places layer. Saving happens on the map
 * callout (`components/PlacesLayer.tsx`); this screen is where they live
 * afterwards — open in maps, or remove.
 *
 * The tier cap is stated at the top rather than discovered at the eleventh
 * save: `TierLimitNotice` shows usage under the cap and the upgrade prompt at
 * it, and renders nothing at all for Platinum drivers.
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { ArrowLeft, Bookmark, Navigation2, Trash2 } from "lucide-react-native";
import { CutCornerSurface } from "@/components/CutCorner";
import TierLimitNotice from "@/components/platinum/TierLimitNotice";
import { PLACE_CATEGORY_ICONS } from "@/constants/placesCategories";
import { TerritoryGlyph } from "@/components/MapGlyphs";
import {
  CUSTOM_PLACE_CATEGORY,
  savedPlaceLabel,
} from "@/lib/savedPlaceDisplay";
import {
  borderWidth,
  colors,
  cut,
  fontFamily,
  spacing,
  textStyle,
} from "@/constants/theme";
import { useSavedPlaces, type SavedPlace } from "@/hooks/useSavedPlacesStore";

const ICON_MD = spacing.spacingLg;
const ICON_STROKE = 1.75;

/** Hands off to whatever maps app the platform prefers. */
function openInMaps(place: SavedPlace) {
  const label = encodeURIComponent(place.name);
  const url = Platform.select({
    ios: `maps:0,0?q=${label}@${place.lat},${place.lng}`,
    android: `geo:0,0?q=${place.lat},${place.lng}(${label})`,
    default: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
  }) as string;
  void Linking.openURL(url);
}

export default function SavedPlacesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { places, loading, refresh, removePlace, cap, count } = useSavedPlaces();

  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

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
          <ArrowLeft size={spacing.spacingXl} color={colors.textPrimary} strokeWidth={ICON_STROKE} />
        </Pressable>
        <Text style={styles.title}>SAVED PLACES</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.spacingXxxl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={colors.racingRed}
          />
        }
      >
        <TierLimitNotice
          current={count}
          cap={cap}
          noun="places"
          benefit="places"
          atCapMessage="Go Platinum to bookmark as many places as you like."
          style={styles.notice}
        />

        {places.length === 0 ? (
          loading ? (
            <ActivityIndicator color={colors.racingRed} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Bookmark size={spacing.spacingXl} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
              <Text style={styles.emptyHeading}>Nothing saved yet</Text>
              <Text style={styles.emptyBody}>
                Tap a cafe, gas station, workshop or hangout on the map and hit
                Save — or long-press anywhere to drop and name your own pin.
                Either way, it shows up here.
              </Text>
            </View>
          )
        ) : (
          places.map((place) => {
            const Glyph =
              place.category === CUSTOM_PLACE_CATEGORY
                ? TerritoryGlyph
                : PLACE_CATEGORY_ICONS[place.category];
            return (
              <CutCornerSurface
                key={place.id}
                fill={colors.carbonSurface}
                borderColor={colors.hairline}
                borderWidth={borderWidth.hairline}
                cutSize={cut.md}
                corners="topRight"
                style={styles.card}
                contentStyle={styles.cardContent}
              >
                <Glyph size={ICON_MD} color={colors.textPrimary} />
                <View style={styles.cardText}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  <Text style={styles.placeMeta}>
                    {savedPlaceLabel(place.category)} ·{" "}
                    {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Navigate to ${place.name}`}
                  onPress={() => openInMaps(place)}
                  hitSlop={spacing.spacingSm}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Navigation2 size={ICON_MD} color={colors.racingRed} strokeWidth={ICON_STROKE} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${place.name}`}
                  onPress={() => removePlace(place.place_id)}
                  hitSlop={spacing.spacingSm}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <Trash2 size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
                </Pressable>
              </CutCornerSurface>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

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
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.spacingLg,
    gap: spacing.spacingMd,
  },
  notice: {
    marginBottom: spacing.spacingXs,
  },
  loader: {
    marginTop: spacing.spacingXxl,
  },
  empty: {
    alignItems: "center",
    gap: spacing.spacingSm,
    paddingVertical: spacing.spacingXxxl,
  },
  emptyHeading: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  emptyBody: {
    ...textStyle("body"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.spacingLg,
  },
  card: {
    width: "100%",
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    padding: spacing.spacingLg,
  },
  cardText: {
    flex: 1,
    gap: spacing.spacingXs / 2,
  },
  placeName: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  placeMeta: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
  },
});
