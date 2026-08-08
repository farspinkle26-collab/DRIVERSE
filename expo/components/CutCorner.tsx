/**
 * Driveverse — angular corner-cut surfaces.
 *
 * The signature shape of the brand: one corner sliced at 45°, echoing the
 * diagonal of the logo's speed-swoosh. Everything that needs the shape
 * should come through here rather than reimplementing it per screen.
 *
 * WHERE TO USE IT
 *   Yes — primary buttons, feature/stat cards, badges, bottom sheets,
 *         anything that is meant to read as a Driveverse brand surface.
 *   No  — text inputs, small icon buttons, chips, list rows, dropdowns.
 *         Those stay plain rectangles at `radius.sharp` (4) or 0. If the
 *         cut is on everything it stops being a signature.
 *
 * HOW IT WORKS
 *   React Native has no `clip-path`, and `borderRadius` cannot express a
 *   straight diagonal, so the shape is drawn as an SVG polygon behind the
 *   content. The container measures itself via `onLayout`; until the first
 *   measurement lands it paints a plain rectangle in the fill colour, so
 *   there is no flash of empty space.
 *
 *   `cutCornerPoints` / `cutCornerClipPath` are exported for the cases
 *   where you need the raw geometry (a custom SVG, or a web-only
 *   `clipPath`) instead of the components.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Polygon, Polyline } from "react-native-svg";
import {
  cutCornerBottomEdge,
  cutCornerPoints,
  cutCornerTopEdge,
  DEFAULT_CORNERS,
  type CutCornerName,
} from "@/lib/cutCornerGeometry";
import { usePressMotion, type PressMotionKind } from "@/hooks/usePressMotion";
import {
  alpha,
  borderWidth as borderWidthTokens,
  colors,
  cut,
  edge as edgeTokens,
  elevation as elevationTokens,
  fontFamily,
  onRacingRed,
  spacing,
  type ElevationToken,
} from "@/constants/theme";

/**
 * The geometry lives in `lib/cutCornerGeometry.ts` — no React/SVG imports —
 * and is re-exported here so every existing `@/components/CutCorner` import
 * keeps working. Import from either; they are the same functions.
 */
export {
  cutCornerPoints,
  cutCornerClipPath,
  cutCornerTopEdge,
  cutCornerBottomEdge,
  DEFAULT_CORNERS,
  type CutCornerName,
} from "@/lib/cutCornerGeometry";

function toCornerList(
  corners: CutCornerName | CutCornerName[] | undefined
): CutCornerName[] {
  if (!corners) return DEFAULT_CORNERS;
  return Array.isArray(corners) ? corners : [corners];
}

/* ------------------------------------------------------------------ *
 * CutCornerSurface — the primitive everything else is built on
 * ------------------------------------------------------------------ */

/** Serialises a point list for an SVG `points` attribute. */
function toPointsAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

export interface CutCornerSurfaceProps {
  children?: React.ReactNode;
  /** Polygon fill. Defaults to the elevated surface colour. */
  fill?: string;
  /** Outline colour. Pass `undefined` with `borderWidth: 0` for no outline. */
  borderColor?: string;
  borderWidth?: number;
  /** Length of the 45° cut in points. Keep to 12–16. */
  cutSize?: number;
  corners?: CutCornerName | CutCornerName[];
  /**
   * Draw the lit top edge and grounded bottom edge (`edge` in the theme).
   * Off by default: this is reserved for primary surfaces, the same way the
   * cut itself is. Do not switch it on for badges, list rows or inputs.
   */
  edges?: boolean;
  /**
   * Colour of the lit top edge. Defaults to `edge.highlight`, which is tuned
   * for a dark surface — pass `edge.highlightOnAccent` on a racingRed slab,
   * where a 9% white line disappears.
   */
  highlightColor?: string;
  /** Outer shadow step. See `elevation` in the theme (iOS only, by design). */
  elevation?: ElevationToken;
  /** Layout styles for the outer box (size, margin, flex). */
  style?: StyleProp<ViewStyle>;
  /** Styles for the content layer (padding, alignment). */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function CutCornerSurface({
  children,
  fill = colors.carbonSurface,
  borderColor = colors.hairline,
  borderWidth = borderWidthTokens.hairline,
  cutSize = cut.md,
  corners,
  edges = false,
  highlightColor = edgeTokens.highlight,
  elevation = "flat",
  style,
  contentStyle,
  testID,
}: CutCornerSurfaceProps) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height }
    );
  }, []);

  const cornerList = useMemo(() => toCornerList(corners), [corners]);

  const geometry = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    // Every path takes the same inset, so the edges land exactly on the
    // outline rather than half a stroke inside or outside it.
    const inset = borderWidth / 2;
    const args = [size.width, size.height, cutSize, cornerList, inset] as const;
    return {
      outline: toPointsAttr(cutCornerPoints(...args)),
      top: edges ? toPointsAttr(cutCornerTopEdge(...args)) : null,
      bottom: edges ? toPointsAttr(cutCornerBottomEdge(...args)) : null,
    };
  }, [size, cutSize, cornerList, borderWidth, edges]);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      // Before the first measurement the polygon cannot be drawn, so fall
      // back to a plain rect in the fill colour rather than flashing empty.
      style={[
        !geometry && { backgroundColor: fill },
        elevationTokens[elevation],
        style,
      ]}
    >
      {geometry && size ? (
        <Svg
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon
            points={geometry.outline}
            fill={fill}
            stroke={borderWidth > 0 ? borderColor : "none"}
            strokeWidth={borderWidth}
          />
          {/* Grounded edge first, lit edge last: where a surface is small
              enough that the two meet at a shared diagonal, the light should
              be the one that wins. */}
          {geometry.bottom ? (
            <Polyline
              points={geometry.bottom}
              fill="none"
              stroke={edgeTokens.shade}
              strokeWidth={borderWidthTokens.hairline}
            />
          ) : null}
          {geometry.top ? (
            <Polyline
              points={geometry.top}
              fill="none"
              stroke={highlightColor}
              strokeWidth={borderWidthTokens.hairline}
            />
          ) : null}
        </Svg>
      ) : null}
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * CutCornerCard
 * ------------------------------------------------------------------ */

export interface CutCornerCardProps extends CutCornerSurfaceProps {
  /** Padding inside the card. Defaults to `spacingLg` (16). */
  padding?: number;
}

/**
 * A raised brand surface: carbon fill, hairline outline, one cut corner, a lit
 * top edge and a grounded bottom one.
 *
 * The edges and the elevation are ON by default, which is what puts every
 * existing card on the dimensional treatment without each call site opting in
 * — the alternative is a long tail of cards that stayed flat because nobody
 * remembered them. A card that genuinely should not lift (one nested inside
 * another surface, where a second shadow just muddies the first) passes
 * `edges={false} elevation="flat"` and says so.
 */
export function CutCornerCard({
  padding = spacing.spacingLg,
  contentStyle,
  edges = true,
  elevation = "raised",
  ...rest
}: CutCornerCardProps) {
  return (
    <CutCornerSurface
      {...rest}
      edges={edges}
      elevation={elevation}
      contentStyle={[{ padding }, contentStyle]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * CutCornerPressable — a card you can tap
 * ------------------------------------------------------------------ */

export interface CutCornerPressableProps
  extends Omit<PressableProps, "style" | "children"> {
  children?: React.ReactNode;
  /** Padding inside the card. Defaults to `spacingLg` (16). */
  padding?: number;
  fill?: string;
  borderColor?: string;
  borderWidth?: number;
  cutSize?: number;
  corners?: CutCornerName | CutCornerName[];
  edges?: boolean;
  highlightColor?: string;
  elevation?: ElevationToken;
  /**
   * `scale` (default) for cards; `sink` for anything shaped like a button —
   * the map's Drive slab, a tile in a grid of actions. See
   * `hooks/usePressMotion.ts` for why the two differ.
   */
  motion?: PressMotionKind;
  /** Layout styles for the outer box. */
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * The tappable form of {@link CutCornerCard} — a trip in the log, a quest, a
 * car in the garage, an event.
 *
 * It scales rather than sinks (see `hooks/usePressMotion.ts`) and drops an
 * elevation step while held, so a card behaves like the thing it looks like
 * instead of like a link that happens to have a border. Use this anywhere a
 * `CutCornerCard` currently sits inside a bare `Pressable` or `TouchableOpacity`
 * — the opacity flash those give is the flat-era feedback this replaces.
 */
export function CutCornerPressable({
  children,
  padding = spacing.spacingLg,
  fill,
  borderColor,
  borderWidth,
  cutSize,
  corners,
  edges = true,
  highlightColor,
  elevation = "raised",
  motion: motionKind = "scale",
  style,
  contentStyle,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: CutCornerPressableProps) {
  const [pressed, setPressed] = useState(false);
  const motion = usePressMotion(motionKind);

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        motion.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        motion.onPressOut();
        onPressOut?.(e);
      }}
      style={[disabled ? styles.disabled : null, style]}
      {...rest}
    >
      <Animated.View style={motion.style}>
        <CutCornerSurface
          fill={fill}
          borderColor={borderColor}
          borderWidth={borderWidth}
          cutSize={cutSize}
          corners={corners}
          edges={edges}
          highlightColor={highlightColor}
          elevation={pressed ? "flat" : elevation}
          contentStyle={[{ padding }, contentStyle]}
        >
          {children}
        </CutCornerSurface>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * CutCornerButton
 * ------------------------------------------------------------------ */

/**
 * `ghost` was added for the map's driving HUD (MAP_SCREEN_REFERENCE D-2).
 * `outline` is a *red* outline, so a row of three outline buttons puts
 * three red controls in one viewport and the primary action stops being
 * the loudest thing on screen. `ghost` is the neutral secondary: hairline
 * border, primary-text label, no fill. Additive — the existing two
 * variants are unchanged.
 */
export type CutCornerButtonVariant = "primary" | "outline" | "ghost";
export type CutCornerButtonSize = "sm" | "md" | "lg";

const BUTTON_SIZES: Record<
  CutCornerButtonSize,
  { paddingVertical: number; paddingHorizontal: number; fontSize: number; cut: number }
> = {
  sm: {
    paddingVertical: spacing.spacingSm,
    paddingHorizontal: spacing.spacingLg,
    fontSize: 13,
    cut: cut.sm,
  },
  md: {
    paddingVertical: spacing.spacingMd,
    paddingHorizontal: spacing.spacingXl,
    fontSize: 15,
    cut: cut.md,
  },
  lg: {
    paddingVertical: spacing.spacingLg,
    paddingHorizontal: spacing.spacingXxl,
    fontSize: 17,
    cut: cut.lg,
  },
};

export interface CutCornerButtonProps
  extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: CutCornerButtonVariant;
  size?: CutCornerButtonSize;
  corners?: CutCornerName | CutCornerName[];
  /** Rendered before the label. */
  icon?: React.ReactNode;
  /**
   * Rendered after the label. For the directional mark on a button that
   * moves the user forward (a chevron on "enter the app"), which reads
   * wrong on the leading edge.
   */
  trailingIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * The primary action shape. `primary` is a solid racingRed slab with black
 * text; `outline` is transparent with a red hairline. Only one primary
 * button should be visible at a time — that is what makes the red read as
 * an accent rather than a theme colour.
 *
 * The label is set in Rajdhani, uppercase, with tracking: signage, not prose.
 */
export function CutCornerButton({
  title,
  variant = "primary",
  size = "md",
  corners,
  icon,
  trailingIcon,
  style,
  textStyle,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: CutCornerButtonProps) {
  const [pressed, setPressed] = useState(false);
  const motion = usePressMotion("sink");
  const metrics = BUTTON_SIZES[size];

  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  const isOutline = !isPrimary && !isGhost;

  const fill = isPrimary
    ? pressed
      ? alpha(colors.racingRed, 0.85)
      : colors.racingRed
    : isGhost
      ? pressed
        ? colors.hairline
        : colors.carbonSurface
      : pressed
        ? alpha(colors.racingRed, 0.12)
        : "transparent";
  const outlineColor = isGhost ? colors.hairline : colors.racingRed;
  const labelColor = isPrimary
    ? onRacingRed
    : isGhost
      ? colors.textPrimary
      : colors.racingRed;

  /**
   * `outline` has no fill, so there is no surface for a light to fall on —
   * an edge highlight on a transparent slab is just a stray line. It keeps
   * the press depression and nothing else.
   */
  const hasEdges = !isOutline;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        motion.onPressIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        motion.onPressOut();
        onPressOut?.(e);
      }}
      style={[disabled ? styles.disabled : null, style]}
      {...rest}
    >
      <Animated.View style={motion.style}>
        <CutCornerSurface
          fill={fill}
          borderColor={outlineColor}
          borderWidth={borderWidthTokens.hairline}
          cutSize={metrics.cut}
          corners={corners}
          edges={hasEdges}
          highlightColor={
            isPrimary ? edgeTokens.highlightOnAccent : edgeTokens.highlight
          }
          // Sinking into the surface means losing the gap that was casting
          // the shadow, so the shadow goes with it rather than trailing a
          // pressed button at full strength.
          elevation={pressed || disabled ? "flat" : "floating"}
          contentStyle={[
            styles.buttonContent,
            {
              paddingVertical: metrics.paddingVertical,
              paddingHorizontal: metrics.paddingHorizontal,
            },
          ]}
        >
          {icon}
          <Text
            style={[
              styles.buttonLabel,
              { fontSize: metrics.fontSize, color: labelColor },
              textStyle,
            ]}
            numberOfLines={1}
          >
            {title.toUpperCase()}
          </Text>
          {trailingIcon}
        </CutCornerSurface>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * CutCornerBadge
 * ------------------------------------------------------------------ */

export interface CutCornerBadgeProps {
  label: string;
  /** Accent colour for text and outline. Defaults to `racingRed`. */
  color?: string;
  /**
   * Overrides the label colour when the outline should be quieter than the
   * text — a neutral hairline badge around a primary-text value, say. Only
   * applies to outlined badges; a solid badge always takes dark text.
   */
  textColor?: string;
  /** Solid fill in `color`, with dark text. Defaults to outlined. */
  solid?: boolean;
  /** Render the label in JetBrains Mono — for counts, times, distances. */
  numeric?: boolean;
  corners?: CutCornerName | CutCornerName[];
  style?: StyleProp<ViewStyle>;
}

/**
 * Small status/label chip. Badges carry the brand shape, so keep them for
 * things worth labelling (rank, live state, XP) rather than every list row.
 */
export function CutCornerBadge({
  label,
  color = colors.racingRed,
  textColor,
  solid = false,
  numeric = false,
  corners,
  style,
}: CutCornerBadgeProps) {
  return (
    <CutCornerSurface
      fill={solid ? color : "transparent"}
      borderColor={color}
      borderWidth={borderWidthTokens.hairline}
      cutSize={cut.sm}
      corners={corners}
      style={style}
      contentStyle={styles.badgeContent}
    >
      <Text
        style={[
          numeric ? styles.badgeLabelNumeric : styles.badgeLabel,
          { color: solid ? colors.voidBlack : (textColor ?? color) },
        ]}
        numberOfLines={1}
      >
        {numeric ? label : label.toUpperCase()}
      </Text>
    </CutCornerSurface>
  );
}

/* ------------------------------------------------------------------ *
 * CutCornerChip
 * ------------------------------------------------------------------ */

export interface CutCornerChipProps {
  label: string;
  active?: boolean;
  /** Rendered before the label, already coloured by the caller. */
  icon?: React.ReactNode;
  /** Colour the caller should draw `icon` in — active vs inactive. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /**
   * `button` (default) for a single-select segment, `checkbox` for a chip
   * that toggles independently of its neighbours — the map's category
   * filters. Additive: existing callers keep the single-select semantics
   * they were written against.
   */
  accessibilityRole?: "button" | "checkbox";
  corners?: CutCornerName | CutCornerName[];
  style?: StyleProp<ViewStyle>;
}

/**
 * A filter / segment control, single- or multi-select.
 *
 * The header comment above says chips stay plain rectangles, and for a
 * *tag* — an inert label attached to a value, like the location pill on a
 * profile — that still holds. A filter chip is a different thing: it is a
 * control the user presses, in the same family as the buttons, and the map
 * established it as a brand surface (MAP_SCREEN_REFERENCE §7). Active is a
 * solid racingRed slab with black content, inactive is a carbon slab with a
 * hairline — the same primary/outline pair `CutCornerButton` uses.
 *
 * The label is Rajdhani, uppercase, tracked: a control sizing its own label,
 * not body copy.
 *
 * Callers colour their own icon; `chipContentColor()` returns the value to
 * use so an icon can never drift from its label.
 */
export function chipContentColor(active: boolean): string {
  return active ? onRacingRed : colors.textSecondary;
}

export function CutCornerChip({
  label,
  active = false,
  icon,
  onPress,
  accessibilityLabel,
  accessibilityRole = "button",
  corners = "topRight",
  style,
}: CutCornerChipProps) {
  const motion = usePressMotion("scale");

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      // A checkbox announces `checked`; a segment announces `selected`.
      // Sending the wrong one makes a toggle read as inert to a screen
      // reader, which for the map's filters is the same failure the
      // rebuild was asked to eliminate visually.
      accessibilityState={
        accessibilityRole === "checkbox" ? { checked: active } : { selected: active }
      }
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      onPressIn={motion.onPressIn}
      onPressOut={motion.onPressOut}
      style={[styles.chipHit, style]}
    >
      <Animated.View style={motion.style}>
        <CutCornerSurface
          fill={active ? colors.racingRed : colors.carbonSurface}
          borderColor={active ? colors.racingRed : colors.hairline}
          borderWidth={borderWidthTokens.hairline}
          cutSize={cut.sm}
          corners={corners}
          edges
          highlightColor={
            active ? edgeTokens.highlightOnAccent : edgeTokens.highlight
          }
          // Flat on purpose: chips come in rows of six to nine on the map's
          // filter bar, and a shadow under each one is noise rather than
          // depth. The edges alone carry it.
          elevation="flat"
          contentStyle={styles.chipContent}
        >
          {icon}
          <Text
            style={[styles.chipLabel, { color: chipContentColor(active) }]}
            numberOfLines={1}
          >
            {label.toUpperCase()}
          </Text>
        </CutCornerSurface>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingSm,
  },
  buttonLabel: {
    fontFamily: fontFamily.displaySemiBold,
    letterSpacing: 1,
  },
  badgeContent: {
    paddingVertical: spacing.spacingXs,
    paddingHorizontal: spacing.spacingSm,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  badgeLabelNumeric: {
    fontFamily: fontFamily.dataMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  chipHit: {
    // Keeps the tap target on the chip itself; the surface draws inside it.
    minHeight: spacing.spacingXxl,
  },
  chipContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.spacingXs,
    paddingHorizontal: spacing.spacingSm,
    paddingVertical: spacing.spacingSm,
  },
  chipLabel: {
    fontFamily: fontFamily.displaySemiBold,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
  },
});

export default CutCornerSurface;
