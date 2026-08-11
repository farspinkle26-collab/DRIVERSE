/**
 * Driveverse — the value shown during onboarding, before the form starts.
 *
 * ⚠️ READ THIS BEFORE ADDING A NUMBER TO THIS FILE ⚠️
 *
 * Everything in `ONBOARDING_BENEFITS` below is a claim about what this app
 * DOES — verifiable by opening it. There is deliberately **no invented
 * research and no invented statistic** anywhere in here:
 *
 *   - "Drivers who track their trips improve their driving by 40%" and
 *     similar are the obvious things to put on a screen like this, and they
 *     are exactly what must not be here. A fabricated statistic on an
 *     onboarding screen is a false claim shipped to every new user, and
 *     both stores treat unsubstantiated performance claims as grounds for
 *     rejection (App Store Review Guideline 2.3, "Accurate Metadata";
 *     Google Play's Deceptive Behaviour policy).
 *   - Aggregate numbers about Driveverse itself ("12,000 drives logged")
 *     would be honest, but they are not available on the client and would
 *     go stale the moment they were hardcoded. If those are wanted, they
 *     need a real endpoint behind them — see `STAT_PROOF_POINTS` below.
 *
 * WHAT TO DO IF YOU WANT REAL RESEARCH ON THIS SCREEN
 *   Fill in `STAT_PROOF_POINTS` with figures you can actually cite. Every
 *   entry REQUIRES a `source` string, because that is the difference between
 *   a proof point and a marketing invention — and the screen renders that
 *   source underneath the claim so a reader can check it. The array is empty
 *   by default and the benefits step simply omits the section when it is
 *   empty, so nothing needs to change in the UI to turn this on.
 */

/**
 * A capability of the app, stated plainly.
 *
 * `icon` names a lucide-react-native export; the screen resolves it, keeping
 * this file free of React — the same split `constants/platinum.ts` uses for
 * its benefit catalogue.
 */
export interface OnboardingBenefit {
  id: string;
  title: string;
  /** One line. What the app does, not how it will make you feel. */
  description: string;
  icon: string;
}

export const ONBOARDING_BENEFITS: OnboardingBenefit[] = [
  {
    id: "log",
    title: "Every drive, logged",
    description:
      "Distance, duration, average and top speed — recorded automatically while you drive.",
    icon: "Route",
  },
  {
    id: "map",
    title: "See who else is out",
    description:
      "Other drivers appear on your map live, and you can roll together in a convoy.",
    icon: "Users",
  },
  {
    id: "progress",
    title: "Levels, ranks and quests",
    description:
      "Drives earn XP against daily quests, so the driving you already do adds up to something.",
    icon: "Trophy",
  },
  {
    id: "garage",
    title: "A garage worth showing",
    description:
      "Keep your cars with their real specs, and share a drive as a card built from its own route.",
    icon: "Car",
  },
];

/**
 * Cited statistics. **Empty on purpose — see the header.**
 *
 * Every entry needs a `source` you could hand to a reviewer. The screen
 * renders it beneath the figure; an uncited number does not belong here and
 * the type will not let you add one.
 *
 * Shape, when you have a real one:
 *
 *   {
 *     id: "telematics-feedback",
 *     figure: "…",
 *     claim: "…",
 *     source: "Author et al., Journal, Year",
 *   }
 */
export interface StatProofPoint {
  id: string;
  /** The number itself, e.g. "23%". Shown large, in the data typeface. */
  figure: string;
  /** What the number is about. One line. */
  claim: string;
  /** Required. Rendered under the claim — no source, no stat. */
  source: string;
}

export const STAT_PROOF_POINTS: StatProofPoint[] = [];
