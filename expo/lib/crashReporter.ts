/**
 * Driveverse — making the next launch crash diagnosable.
 *
 * THE PROBLEM THIS SOLVES
 *   `LAUNCH_SAFETY_REFERENCE.md` §6 admits the uncomfortable thing: both
 *   launch-crash fixes so far were diagnosed by reading the launch path,
 *   because a store build that dies on open produces nothing anyone can read.
 *   The driver sees black and taps the icon again. `adb logcat` needs the
 *   phone in hand and the crash reproduced on cue. Play Console aggregates
 *   *native* stacks, which for a JavaScript throw says only that Hermes
 *   aborted — the same line for every possible cause.
 *
 *   So the app carries its own black box. A JavaScript error anywhere after
 *   the tree mounts is captured, written to storage, and shown on the next
 *   launch as copyable text. One driver reporting "it says X" ends a class of
 *   bug that has now cost two release cycles of guessing.
 *
 * WHAT IT CAN AND CANNOT SEE
 *   Covered: uncaught throws, unhandled promise rejections, and render errors
 *   from `AppErrorBoundary` — from the first mount effect onward.
 *
 *   NOT covered: a throw during bundle evaluation (§1). Nothing written in
 *   JavaScript can be, and the honest reason is that recording it would mean
 *   an AsyncStorage write at module scope, which is the exact native-call-at-
 *   import-time rule (§2) that caused both crashes in the first place. Curing
 *   the disease with the disease is not a trade worth making. The launch
 *   marker below still narrows it: a run that reaches `beginLaunch()` and dies
 *   before `markLaunchComplete()` is flagged, and a run that never reaches
 *   `beginLaunch()` at all leaves no marker — which is itself the signature of
 *   a bundle-evaluation death, and sends you back to §2 and §5.
 *
 * LAUNCH SAFETY OF THIS MODULE
 *   Nothing here touches a native module at import time. `AsyncStorage` and
 *   `expo-constants` are both `require`d lazily inside functions, every one of
 *   which is called from a mount effect or from an error handler. Installing
 *   the global handler is pure JavaScript (`ErrorUtils` is a plain global) and
 *   is the one thing safe to do early.
 */

import { Platform } from "react-native";
import {
  parseReport,
  serializeReport,
  toReport,
  type CrashKind,
  type CrashReport,
} from "@/lib/crashReport";

const REPORT_KEY = "driverse:last-crash";
const LAUNCH_KEY = "driverse:launch-state";
const LAUNCHING = "launching";

/* ------------------------------------------------------------------ *
 * Lazy native access
 * ------------------------------------------------------------------ */

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

let storage: Storage | null | undefined;

/**
 * AsyncStorage, or null where it isn't linked. Resolved on first use, never at
 * import — see the module header.
 */
function store(): Storage | null {
  if (storage !== undefined) return storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require("@react-native-async-storage/async-storage");
    storage = (required?.default ?? required) as Storage;
  } catch {
    storage = null;
  }
  return storage;
}

let appVersion: string | null | undefined;

/**
 * The build's version string, for the report header.
 *
 * `expo-constants` is the sharp edge of §2 — it is what `expo-linking` reads
 * when `createURL` throws — so this is guarded twice: lazily required, and
 * wrapped. A missing version costs one line of a report; a throw here would
 * cost the launch.
 *
 * Reports the NATIVE build number alongside the name, not `expoConfig`
 * alone. `expoConfig.version` is the manifest's, and the manifest can be
 * updated independently of the binary — `app.json` currently says `1.0.0`
 * for the binaries App Store Connect calls `1.0.2 (9)`, so a report carrying
 * only that names the wrong build. `platform.ios.buildNumber` is read out of
 * the embedded `Info.plist` and never changes for a given binary, which is
 * exactly the identity a crash report has to carry.
 */
function version(): string | null {
  if (appVersion !== undefined) return appVersion;

  let resolved: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require("expo-constants");
    const constants = required?.default ?? required;
    const name = constants?.expoConfig?.version;
    const build =
      constants?.platform?.ios?.buildNumber ??
      constants?.platform?.android?.versionCode;
    const parts = [
      typeof name === "string" && name.length > 0 ? name : null,
      build === null || build === undefined ? null : `(${String(build)})`,
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) resolved = parts.join(" ");
  } catch {
    // Leave it null.
  }

  appVersion = resolved;
  return resolved;
}

/* ------------------------------------------------------------------ *
 * Run state
 * ------------------------------------------------------------------ */

let launchComplete = false;
let installed = false;
/**
 * Whether this run has already banked a report, and whether that report was a
 * launch failure. One stored slot per run, and a launch failure owns it —
 * see `record`.
 */
let storedDuringLaunch: boolean | null = null;

/** Fire-and-forget write. A failed write must never become a second crash. */
function persist(report: CrashReport): void {
  const s = store();
  const encoded = serializeReport(report);
  if (!s || !encoded) return;
  void s.setItem(REPORT_KEY, encoded).catch(() => {});
}

/**
 * Records an error, if it is more worth keeping than what is already stored.
 *
 * There is one slot, so the precedence is deliberate: the first error during
 * launch wins outright and is never overwritten. It is the one that made the
 * app unusable, and everything after it is fallout from a half-mounted tree —
 * a later rejection replacing the original throw would destroy the only
 * useful fact in the report. Once the app is up, the opposite is true: the
 * most recent error is the interesting one, so post-launch errors replace
 * each other.
 */
function record(kind: CrashKind, value: unknown, componentStack?: string): void {
  try {
    const duringLaunch = !launchComplete;

    // A banked launch failure outranks everything that follows it. Anything
    // else is replaced by the newest error.
    if (storedDuringLaunch === true) return;

    storedDuringLaunch = duringLaunch;
    persist(
      toReport(kind, value, {
        duringLaunch,
        appVersion: version(),
        platform: `${Platform.OS} ${String(Platform.Version)}`,
        componentStack,
      })
    );
  } catch {
    // The reporter is not allowed to be the thing that crashes.
  }
}

/* ------------------------------------------------------------------ *
 * Installation
 * ------------------------------------------------------------------ */

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (
    handler: (error: unknown, isFatal?: boolean) => void
  ) => void;
}

/**
 * Installs the global JavaScript error and rejection handlers.
 *
 * Pure JavaScript and idempotent, so it is safe to call from the earliest
 * mount effect. React's own error handling is left intact: the previous
 * global handler is always called after ours, so the red box in development
 * and the native teardown in release both still happen. This observes, it
 * does not swallow — an app that hides its own fatal errors is worse than one
 * that crashes honestly.
 */
export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  try {
    const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike })
      .ErrorUtils;
    const previous = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error, isFatal) => {
      record("fatal", error);
      previous?.(error, isFatal);
    });
  } catch {
    // No ErrorUtils on this runtime (web). The boundary still reports.
  }

  try {
    // Hermes tracks rejections that nothing ever attached a `catch` to. These
    // are invisible in a release build and are exactly how a launch turns into
    // a screen that never advances rather than a crash — `getSession()` never
    // settling leaves `loading` true forever.
    const hermes = (
      globalThis as {
        HermesInternal?: {
          enablePromiseRejectionTracker?: (options: unknown) => void;
        };
      }
    ).HermesInternal;
    hermes?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id: number, rejection: unknown) => {
        // After launch these are worth a log but not the stored slot: the app
        // is up, and a stale rejection must not be what greets the next start.
        if (launchComplete) {
          console.warn("[crash] unhandled rejection:", rejection);
          return;
        }
        record("unhandled-rejection", rejection);
      },
    });
  } catch {
    // Not Hermes, or a version without the tracker.
  }
}

/** Called by `AppErrorBoundary` so a render error lands in the same place. */
export function recordRenderError(error: unknown, componentStack?: string): void {
  record("render", error, componentStack);
}

/* ------------------------------------------------------------------ *
 * The launch marker
 * ------------------------------------------------------------------ */

export interface LaunchDiagnostics {
  /**
   * The previous run set the marker and never cleared it — it died between
   * mount and first usable screen.
   */
  previousLaunchFailed: boolean;
  /** The stored report, if the previous run managed to write one. */
  report: CrashReport | null;
}

/**
 * Reads what the previous run left behind, then marks this one in progress.
 *
 * Read before write, in that order: the marker is the evidence, so it has to
 * be collected before it is overwritten.
 */
export async function beginLaunch(): Promise<LaunchDiagnostics> {
  const s = store();
  if (!s) return { previousLaunchFailed: false, report: null };

  let previousLaunchFailed = false;
  let report: CrashReport | null = null;

  try {
    const [marker, raw] = await Promise.all([
      s.getItem(LAUNCH_KEY),
      s.getItem(REPORT_KEY),
    ]);
    previousLaunchFailed = marker === LAUNCHING;
    report = parseReport(raw);
  } catch {
    // Storage unreadable. Nothing to report, and definitely nothing to throw.
  }

  try {
    await s.setItem(LAUNCH_KEY, LAUNCHING);
  } catch {
    // A missing marker costs a diagnosis, not a launch.
  }

  return { previousLaunchFailed, report };
}

/**
 * Clears the marker. Called once the app has a usable screen up — that is the
 * definition of "launched" this whole mechanism turns on, so it must not be
 * called any earlier (a splash screen is not a launched app).
 */
export function markLaunchComplete(): void {
  if (launchComplete) return;
  launchComplete = true;
  const s = store();
  if (!s) return;
  void s.removeItem(LAUNCH_KEY).catch(() => {});
}

/** Drops the stored report once the driver has seen or sent it. */
export async function clearCrashReport(): Promise<void> {
  const s = store();
  if (!s) return;
  storedDuringLaunch = null;
  try {
    await s.removeItem(REPORT_KEY);
  } catch {
    // Nothing to do; a stale report is harmless.
  }
}

/** The stored report, for a diagnostics or support surface. */
export async function getCrashReport(): Promise<CrashReport | null> {
  const s = store();
  if (!s) return null;
  try {
    return parseReport(await s.getItem(REPORT_KEY));
  } catch {
    return null;
  }
}
