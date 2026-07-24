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
import Svg, { Polygon } from "react-native-svg";
import {
  alpha,
  borderWidth as borderWidthTokens,
  colors,
  cut,
  fontFamily,
  onRacingRed,
  spacing,
} from "@/constants/theme";

export type CutCornerName =
  | "topLeft"
  | "topRight"
  | "bottomRight"
  | "bottomLeft";

const DEFAULT_CORNERS: CutCornerName[] = ["topRight"];

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/**
 * Vertices of a rectangle with one or more corners cut at 45°, walked
 * clockwise from the top-left.
 *
 * `inset` pulls the polygon in from the edge — pass half the stroke width
 * so a stroked outline sits fully inside the layout box instead of being
 * clipped in half by the SVG viewport.
 */
export function cutCornerPoints(
  width: number,
  height: number,
  size: number,
  corners: CutCornerName[] = DEFAULT_CORNERS,
  inset: number = 0
): [number, number][] {
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;

  // A cut can never eat more than half of either side, or the polygon
  // folds in on itself on small elements (badges, compact buttons).
  const c = Math.max(0, Math.min(size, (x1 - x0) / 2, (y1 - y0) / 2));

  const has = (corner: CutCornerName) => c > 0 && corners.includes(corner);
  const points: [number, number][] = [];

  if (has("topLeft")) points.push([x0 + c, y0]);
  else points.push([x0, y0]);

  if (has("topRight")) points.push([x1 - c, y0], [x1, y0 + c]);
  else points.push([x1, y0]);

  if (has("bottomRight")) points.push([x1, y1 - c], [x1 - c, y1]);
  else points.push([x1, y1]);

  if (has("bottomLeft")) points.push([x0 + c, y1], [x0, y1 - c]);
  else points.push([x0, y1]);

  if (has("topLeft")) points.push([x0, y0 + c]);

  return points;
}

/**
 * The same geometry as a CSS `clip-path` value, in percentages, for web
 * surfaces that are styled outside React Native's style system.
 *
 * Percentages mean the cut is not a fixed 14px — pass the element's size
 * so the utility can convert. Prefer the components below when you can.
 */
export function cutCornerClipPath(
  width: number,
  height: number,
  size: number = cut.md,
  corners: CutCornerName[] = DEFAULT_CORNERS
): string {
  const pts = cutCornerPoints(width, height, size, corners)
    .map(
      ([x, y]) =>
        `${((x / width) * 100).toFixed(3)}% ${((y / height) * 100).toFixed(3)}%`
    )
    .join(", ");
  return `polygon(${pts})`;
}

function toCornerList(
  corners: CutCornerName | CutCornerName[] | undefined
): CutCornerName[] {
  if (!corners) return DEFAULT_CORNERS;
  return Array.isArray(corners) ? corners : [corners];
}

/* ------------------------------------------------------------------ *
 * CutCornerSurface — the primitive everything else is built on
 * ------------------------------------------------------------------ */

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

  const points = useMemo(() => {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    return cutCornerPoints(
      size.width,
      size.height,
      cutSize,
      cornerList,
      borderWidth / 2
    )
      .map(([x, y]) => `${x},${y}`)
      .join(" ");
  }, [size, cutSize, cornerList, borderWidth]);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      // Before the first measurement the polygon cannot be drawn, so fall
      // back to a plain rect in the fill colour rather than flashing empty.
      style={[!points && { backgroundColor: fill }, style]}
    >
      {points && size ? (
        <Svg
          width={size.width}
          height={size.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon
            points={points}
            fill={fill}
            stroke={borderWidth > 0 ? borderColor : "none"}
            strokeWidth={borderWidth}
          />
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
 * A raised brand surface: carbon fill, hairline outline, one cut corner.
 * Deliberately has no shadow — separation comes from the surface step and
 * the hairline.
 */
export function CutCornerCard({
  padding = spacing.spacingLg,
  contentStyle,
  ...rest
}: CutCornerCardProps) {
  return (
    <CutCornerSurface
      {...rest}
      contentStyle={[{ padding }, contentStyle]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * CutCornerButton
 * ------------------------------------------------------------------ */

export type CutCornerButtonVariant = "primary" | "outline";
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
  style,
  textStyle,
  disabled,
  ...rest
}: CutCornerButtonProps) {
  const [pressed, setPressed] = useState(false);
  const metrics = BUTTON_SIZES[size];

  const isPrimary = variant === "primary";
  const fill = isPrimary
    ? pressed
      ? alpha(colors.racingRed, 0.85)
      : colors.racingRed
    : pressed
      ? alpha(colors.racingRed, 0.12)
      : "transparent";
  const labelColor = isPrimary ? onRacingRed : colors.racingRed;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[disabled ? styles.disabled : null, style]}
      {...rest}
    >
      <CutCornerSurface
        fill={fill}
        borderColor={colors.racingRed}
        borderWidth={borderWidthTokens.hairline}
        cutSize={metrics.cut}
        corners={corners}
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
      </CutCornerSurface>
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
          { color: solid ? colors.voidBlack : color },
        ]}
        numberOfLines={1}
      >
        {numeric ? label : label.toUpperCase()}
      </Text>
    </CutCornerSurface>
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
});

export default CutCornerSurface;
