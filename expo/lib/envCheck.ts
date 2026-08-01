/**
 * Reports which build-time environment variables are missing from this build.
 *
 * WHY — `EXPO_PUBLIC_*` variables are inlined into the bundle by Metro at build
 * time, so "is the key present" is decided by the machine that built the app,
 * not by the phone running it. A build made without them is indistinguishable
 * from a good one until a driver hits the feature: sign-in fails, the paywall
 * shows no prices, every Supabase call 401s. This app has no `eas.json` and no
 * EAS build profile — it is built through Rork — so there is no `env` block to
 * read and no secret list to audit. Writing down what was actually inlined is
 * the only record there is.
 *
 * SAFETY — this module is imported by `app/_layout.tsx`, so every rule in
 * LAUNCH_SAFETY_REFERENCE.md §1/§2 applies to it. It therefore contains no
 * native call, no `throw`, and nothing that runs at import: it is a pure
 * function over `process.env` reads that Metro has already turned into string
 * literals. It reports; it never gates. A missing key must never be the reason
 * the app fails to start — that would be trading a broken feature for a
 * rejected binary, which is the exact trade §3 was written to stop.
 *
 * `describeEnv()` is pure and tested; `logEnv()` is the side-effecting caller.
 */

/** A build-time variable the app reads, and what breaks when it is absent. */
interface EnvVar {
  name: string;
  value: string | undefined;
  /** What stops working, in the words a bug report would use. */
  impact: string;
  /** True when the app has a working fallback and only degrades. */
  optional: boolean;
}

/**
 * The variables this build depends on.
 *
 * Read as literal `process.env.X` expressions on purpose — Metro substitutes
 * these at build time by matching the exact text, so `process.env[name]` with a
 * computed key would inline nothing and report every variable as missing.
 */
function readEnv(): EnvVar[] {
  return [
    {
      name: "EXPO_PUBLIC_SUPABASE_URL",
      value: process.env.EXPO_PUBLIC_SUPABASE_URL,
      impact: "every Supabase call fails — sign-in, trips, chat, the map",
      optional: false,
    },
    {
      name: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
      value: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      impact: "every Supabase call fails — sign-in, trips, chat, the map",
      optional: false,
    },
    {
      name: "EXPO_PUBLIC_REVENUECAT_IOS_KEY",
      value: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
      impact: "Platinum cannot be bought or restored on iOS; the paywall shows no prices",
      optional: false,
    },
    {
      name: "EXPO_PUBLIC_REVENUECAT_ANDROID_KEY",
      value: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
      impact: "Platinum cannot be bought or restored on Android; the paywall shows no prices",
      optional: false,
    },
    {
      name: "EXPO_PUBLIC_MAPBOX_TOKEN",
      value: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
      impact: "map tiles fall back to the token bundled in constants/mapbox.ts",
      optional: true,
    },
  ];
}

export interface EnvReport {
  /** Required variables with no value. The app runs; these features do not. */
  missingRequired: string[];
  /** Optional variables with no value — a fallback is carrying them. */
  missingOptional: string[];
  /** One line per missing variable, ready to log or show. */
  lines: string[];
  /** True when every required variable is present. */
  ok: boolean;
}

/**
 * Shapes the report. Pure — no logging, no `process.exit`, no throw — so the
 * rule stays testable without a bundler.
 */
export function describeEnv(vars: EnvVar[] = readEnv()): EnvReport {
  const missing = vars.filter((v) => !v.value || v.value.trim() === "");
  const missingRequired = missing.filter((v) => !v.optional).map((v) => v.name);
  const missingOptional = missing.filter((v) => v.optional).map((v) => v.name);

  return {
    missingRequired,
    missingOptional,
    lines: missing.map(
      (v) => `${v.optional ? "optional" : "REQUIRED"} ${v.name} is not set — ${v.impact}`
    ),
    ok: missingRequired.length === 0,
  };
}

/**
 * Logs the report once, from a mount effect.
 *
 * Called after `installCrashReporter()`, so if anything later in startup does
 * fail, these lines are already in the console the crash report screen shows —
 * which turns "the app opens but nothing works" from a support thread into a
 * screenshot.
 */
export function logEnv(): EnvReport {
  const report = describeEnv();

  if (report.ok && report.missingOptional.length === 0) {
    console.log("[env] all build-time variables present");
    return report;
  }

  for (const line of report.lines) {
    if (line.startsWith("REQUIRED")) console.error(`[env] ${line}`);
    else console.warn(`[env] ${line}`);
  }

  if (!report.ok) {
    console.error(
      `[env] ${report.missingRequired.length} required variable(s) were not inlined into this ` +
        "build. They are substituted by Metro at BUILD time, so this is a property of the " +
        "machine that built the app — check the build environment, not the device. See .env.example."
    );
  }

  return report;
}

export default logEnv;
