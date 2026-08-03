/**
 * Driveverse Platinum — AI Car Showcase.
 *
 * Pick a style → pick a photo → wait → look at the render → share it.
 *
 * COST IS PART OF THE DESIGN
 *   Every generation is a real per-image spend, so the allowance is not
 *   hidden behind a "you've run out" surprise. The remaining count is on
 *   screen before the driver commits, in JetBrains Mono like every other
 *   number in the app, and it refreshes from the server after each render.
 *   The client's count is a courtesy; `generate-showcase` is what actually
 *   enforces both the entitlement and the quota.
 *
 * GENERATION TAKES A FEW SECONDS
 *   The busy state says what is happening and warns not to leave, rather
 *   than showing a bare spinner — a driver who backgrounds the app mid-call
 *   still burns a generation.
 *
 * SHARING
 *   Reuses `ShareCardModal` / `ShareableCard`'s `showcase` variant, i.e. the
 *   same 1080×1920 capture-and-hand-to-the-OS path the Share Trip card
 *   already uses. Nothing about the export is re-implemented here.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePickerExpo from "expo-image-picker";
import { Share2, Sparkles, X } from "lucide-react-native";
import { CutCornerButton, CutCornerSurface } from "@/components/CutCorner";
import ShareCardModal from "@/components/ShareCardModal";
import { PlatinumBadge } from "@/components/platinum/PlatinumBadge";
import { platinum } from "@/constants/platinum";
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
import { resizeForUpload } from "@/lib/resizeForUpload";
import {
  fetchShowcaseQuota,
  generateShowcase,
  SHOWCASE_STYLES,
  type ShowcaseQuota,
  type ShowcaseStyle,
} from "@/lib/aiShowcase";

const ICON_MD = spacing.spacingLg;
const ICON_STROKE = 1.75;

export interface ShowcaseModalProps {
  visible: boolean;
  onClose: () => void;
  car: { id: string; name: string; make?: string; year?: string; hp?: number } | null;
}

export default function ShowcaseModal({ visible, onClose, car }: ShowcaseModalProps) {
  const insets = useSafeAreaInsets();
  const { isPlatinum, openPaywall } = usePlatinum();

  const [style, setStyle] = useState<ShowcaseStyle>("signature");
  const [quota, setQuota] = useState<ShowcaseQuota | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  /* ─── Quota ─────────────────────────────────────────────── */

  useEffect(() => {
    if (!visible || !isPlatinum) return;
    let active = true;
    fetchShowcaseQuota().then((q) => {
      if (active) setQuota(q);
    });
    return () => {
      active = false;
    };
  }, [visible, isPlatinum]);

  // A fresh open should start on the style picker, not on the last render.
  useEffect(() => {
    if (!visible) {
      setResult(null);
      setGenerating(false);
      setShareOpen(false);
    }
  }, [visible]);

  /* ─── Generate ──────────────────────────────────────────── */

  const handleGenerate = useCallback(async () => {
    if (!car) return;
    if (!isPlatinum) {
      onClose();
      openPaywall("showcase");
      return;
    }

    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePickerExpo.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          Alert.alert("Permission needed", "We need photo access to build your showcase.");
          return;
        }
      }
      const picked = await ImagePickerExpo.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.9,
      });
      const asset = picked.canceled ? null : picked.assets?.[0];
      if (!asset) return;

      setGenerating(true);
      const { base64: imageBase64, mimeType } = await resizeForUpload(asset.uri);
      const outcome = await generateShowcase({
        carId: car.id,
        imageBase64,
        mimeType,
        style,
      });
      setGenerating(false);

      if (outcome.status === "generated") {
        setResult(outcome.imageUrl);
        setQuota(outcome.quota ?? (await fetchShowcaseQuota()));
        return;
      }
      if (outcome.status === "not_platinum") {
        // The server disagreed with the client gate — a lapsed subscription
        // the SDK hasn't caught up on. The paywall is the honest response.
        onClose();
        openPaywall("showcase");
        return;
      }
      if (outcome.status === "quota_exhausted") {
        setQuota(outcome.quota ?? quota);
        Alert.alert("Out of showcases", outcome.message);
        return;
      }
      Alert.alert("Couldn't generate", outcome.message);
    } catch (err) {
      setGenerating(false);
      Alert.alert(
        "Couldn't generate",
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
  }, [car, isPlatinum, style, quota, onClose, openPaywall]);

  /* ─── Render ────────────────────────────────────────────── */

  const specLine = car
    ? [car.make, car.year, car.hp ? `${car.hp} HP` : null].filter(Boolean).join(" · ")
    : "";
  const styleLabel =
    SHOWCASE_STYLES.find((s) => s.id === style)?.label ?? "Studio";
  const remaining = quota?.remaining ?? null;
  const outOfShowcases = remaining !== null && remaining <= 0;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => !generating && onClose()}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => !generating && onClose()}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.spacingLg }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <PlatinumBadge size={spacing.spacingXl} />
              <Text style={styles.title}>AI SHOWCASE</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={() => !generating && onClose()}
              hitSlop={spacing.spacingSm}
            >
              <X size={ICON_MD} color={colors.textSecondary} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {result ? (
              /* ═══ RESULT ═══ */
              <View style={styles.resultBlock}>
                <CutCornerSurface
                  fill={colors.carbonSurface}
                  borderColor={alpha(platinum.chrome, 0.35)}
                  borderWidth={borderWidth.hairline}
                  cutSize={cut.lg}
                  corners="topRight"
                  style={styles.resultFrame}
                  contentStyle={styles.resultFrameContent}
                >
                  <Image
                    source={{ uri: result }}
                    style={styles.resultImage}
                    resizeMode="cover"
                  />
                </CutCornerSurface>

                <Text style={styles.resultCaption}>
                  {car?.name ?? "Your car"} · {styleLabel}
                </Text>

                <CutCornerButton
                  title="Save & Share"
                  variant="primary"
                  size="md"
                  corners="topRight"
                  onPress={() => setShareOpen(true)}
                  icon={
                    <Share2
                      size={ICON_MD}
                      color={colors.voidBlack}
                      strokeWidth={ICON_STROKE}
                    />
                  }
                />
                <CutCornerButton
                  title={outOfShowcases ? "No showcases left" : "Generate another"}
                  variant="ghost"
                  size="md"
                  corners="topRight"
                  disabled={outOfShowcases}
                  onPress={() => setResult(null)}
                />
                <QuotaLine quota={quota} />
              </View>
            ) : generating ? (
              /* ═══ GENERATING ═══ */
              <View style={styles.busyBlock}>
                <ActivityIndicator color={platinum.chrome} size="large" />
                <Text style={styles.busyTitle}>Building your showcase…</Text>
                <Text style={styles.busyBody}>
                  This takes a few seconds. Keep Driveverse open — leaving now
                  still uses one of your monthly showcases.
                </Text>
              </View>
            ) : (
              /* ═══ SETUP ═══ */
              <View style={styles.setupBlock}>
                <Text style={styles.body}>
                  Choose a photo of {car?.name ?? "your car"}. Gemini keeps the
                  real vehicle intact and applies the Driveverse Signature style
                  used for every generated car.
                </Text>

                <Text style={styles.overline}>DRIVEVERSE SIGNATURE</Text>
                <View style={styles.styleList}>
                  {SHOWCASE_STYLES.map((option) => {
                    const active = option.id === style;
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        onPress={() => setStyle(option.id)}
                        style={({ pressed }) => [
                          styles.styleRow,
                          active && styles.styleRowActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.styleText}>
                          <Text
                            style={[
                              styles.styleLabel,
                              active && styles.styleLabelActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                          <Text style={styles.styleNote}>{option.note}</Text>
                        </View>
                        <View
                          style={[styles.radio, active && styles.radioActive]}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                <CutCornerButton
                  title={outOfShowcases ? "No showcases left" : "Generate Showcase"}
                  variant="primary"
                  size="lg"
                  corners="topRight"
                  disabled={!car || outOfShowcases}
                  onPress={handleGenerate}
                  icon={
                    <Sparkles
                      size={ICON_MD}
                      color={colors.voidBlack}
                      strokeWidth={ICON_STROKE}
                    />
                  }
                />
                <QuotaLine quota={quota} />
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Same export path as the Share Trip card: render at 1080×1920,
          capture, hand to Instagram Stories or the OS sheet. */}
      {result && car ? (
        <ShareCardModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          type="showcase"
          payload={{
            imageUrl: result,
            carName: car.name,
            styleLabel,
            specLine: specLine || undefined,
          }}
          caption={`${car.name} — built in Driveverse.`}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Quota line
 * ------------------------------------------------------------------ */

/** The allowance readout. A count, so JetBrains Mono. */
function QuotaLine({ quota }: { quota: ShowcaseQuota | null }) {
  if (!quota) return null;
  return (
    <Text style={styles.quota}>
      {quota.remaining} of {quota.allowance} showcases left this month
    </Text>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    backgroundColor: colors.carbonSurface,
    borderTopWidth: borderWidth.hairline,
    borderTopColor: colors.hairline,
    paddingHorizontal: spacing.spacingLg,
    paddingTop: spacing.spacingLg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.spacingLg,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingSm,
  },
  title: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  overline: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    color: colors.textSecondary,
  },
  body: {
    ...textStyle("body"),
    color: colors.textSecondary,
  },

  setupBlock: {
    gap: spacing.spacingMd,
    paddingBottom: spacing.spacingLg,
  },
  styleList: {
    gap: spacing.spacingSm,
  },
  styleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingMd,
    borderWidth: borderWidth.hairline,
    borderColor: colors.hairline,
    borderRadius: radius.sharp,
  },
  styleRowActive: {
    borderColor: platinum.chrome,
    backgroundColor: alpha(platinum.chrome, 0.06),
  },
  styleText: {
    flex: 1,
    gap: spacing.spacingXs / 2,
  },
  styleLabel: {
    ...textStyle("body"),
    fontFamily: fontFamily.bodySemiBold,
    color: colors.textPrimary,
  },
  styleLabelActive: {
    color: platinum.chrome,
  },
  styleNote: {
    ...textStyle("caption"),
    color: colors.textSecondary,
  },
  radio: {
    width: spacing.spacingMd,
    height: spacing.spacingMd,
    borderRadius: radius.circle,
    borderWidth: borderWidth.hairline,
    borderColor: colors.textSecondary,
  },
  radioActive: {
    borderColor: platinum.chrome,
    backgroundColor: platinum.chrome,
  },

  busyBlock: {
    alignItems: "center",
    gap: spacing.spacingMd,
    paddingVertical: spacing.spacingXxl,
  },
  busyTitle: {
    ...textStyle("displayMd"),
    color: colors.textPrimary,
  },
  busyBody: {
    ...textStyle("caption"),
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.spacingLg,
  },

  resultBlock: {
    gap: spacing.spacingMd,
    paddingBottom: spacing.spacingLg,
  },
  resultFrame: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  resultFrameContent: {
    flex: 1,
  },
  resultImage: {
    flex: 1,
    width: "100%",
  },
  resultCaption: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
    textAlign: "center",
  },

  quota: {
    ...textStyle("dataSm"),
    color: colors.textSecondary,
    textAlign: "center",
  },
});
