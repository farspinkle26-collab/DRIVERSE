/**
 * Driveverse Founder — badge configuration.
 *
 * The Founder badge is earned once, by redeeming the launch code, never by
 * paying or by progression. It sits alongside Platinum (subscription) and
 * rank (progression) as a third, independent status a driver can hold.
 *
 * VISUAL IDENTITY
 *   Gold, not chrome and not racingRed. Chrome is already Platinum's
 *   identity colour — reusing it would read as "cheap Platinum". racingRed
 *   is the primary-action accent. Gold is free, and it is the traditional
 *   colour of a founding/charter mark, which is exactly the message here.
 */

export const founder = {
  /** Identity colour: badge face, star mark, wordmark text. */
  gold: "#D4A017",
  /** Specular highlight on the badge's lit edge. */
  goldLight: "#F5D061",
  /** Mid tone — secondary strokes, dimmer facet. */
  goldDim: "#A9832A",
  /** Shadowed facet of the badge. */
  goldDeep: "#5C4712",
} as const;

/**
 * Foreground for content sitting on top of a solid `gold` fill.
 * voidBlack-on-gold is ~8.6:1 — comfortably passes WCAG AA.
 */
export const onFounder = "#0B0C10";

/** The exact redeem code. Compared server-side in `redeem_founder_code()`;
 * kept here only so the client can validate shape before round-tripping. */
export const FOUNDER_CODE = "IAMaFounder#";
