import { describeEnv } from "@/lib/envCheck";

/**
 * `describeEnv` is the pure half of the env guard. The point of these tests is
 * not the string formatting — it is that the function CLASSIFIES rather than
 * gates: it must be impossible for a missing variable to throw, because this
 * module is imported by `app/_layout.tsx` and a throw there is a launch crash
 * (LAUNCH_SAFETY_REFERENCE.md §1/§2).
 */

const required = (name: string, value: string | undefined) => ({
  name,
  value,
  impact: "things break",
  optional: false,
});

const optional = (name: string, value: string | undefined) => ({
  name,
  value,
  impact: "a fallback carries it",
  optional: true,
});

describe("describeEnv", () => {
  it("reports ok when every required variable is present", () => {
    const report = describeEnv([
      required("EXPO_PUBLIC_SUPABASE_URL", "https://x.supabase.co"),
      required("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon"),
    ]);

    expect(report.ok).toBe(true);
    expect(report.missingRequired).toEqual([]);
    expect(report.lines).toEqual([]);
  });

  it("names the required variables that are missing", () => {
    const report = describeEnv([
      required("EXPO_PUBLIC_SUPABASE_URL", undefined),
      required("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon"),
    ]);

    expect(report.ok).toBe(false);
    expect(report.missingRequired).toEqual(["EXPO_PUBLIC_SUPABASE_URL"]);
  });

  it("treats an empty or whitespace-only value as missing", () => {
    // A build that inlines "" is a build that set the variable to nothing,
    // which fails exactly like never setting it — and is easier to do by
    // accident, since a blank line in an env file produces it.
    const report = describeEnv([
      required("EXPO_PUBLIC_SUPABASE_URL", ""),
      required("EXPO_PUBLIC_SUPABASE_ANON_KEY", "   "),
    ]);

    expect(report.missingRequired).toEqual([
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });

  it("keeps optional variables out of the ok verdict", () => {
    // A missing Mapbox token degrades to the bundled one. That is a note, not
    // a failure, and must not read as a broken build.
    const report = describeEnv([
      required("EXPO_PUBLIC_SUPABASE_URL", "https://x.supabase.co"),
      optional("EXPO_PUBLIC_MAPBOX_TOKEN", undefined),
    ]);

    expect(report.ok).toBe(true);
    expect(report.missingOptional).toEqual(["EXPO_PUBLIC_MAPBOX_TOKEN"]);
  });

  it("marks each line so required and optional cannot be confused", () => {
    const report = describeEnv([
      required("A", undefined),
      optional("B", undefined),
    ]);

    expect(report.lines[0].startsWith("REQUIRED")).toBe(true);
    expect(report.lines[1].startsWith("optional")).toBe(true);
  });

  it("never throws, whatever it is handed", () => {
    // The whole contract. A missing key must degrade the feature, never the
    // launch.
    expect(() => describeEnv([])).not.toThrow();
    expect(() => describeEnv()).not.toThrow();
  });
});
