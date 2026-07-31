/**
 * Driveverse — crash report shaping. Pure, no native, no storage.
 *
 * WHY THIS EXISTS
 *   The app has now shipped two "launch crash" fixes diagnosed entirely by
 *   reading the launch path, because a store build that dies on open leaves
 *   nothing behind: no screen, no log the driver can reach, no stack trace.
 *   `LAUNCH_SAFETY_REFERENCE.md` §6 says so outright — the diagnosis was from
 *   reading code rather than from a crash. That is the actual problem to fix.
 *   A third guess is worth less than one real report.
 *
 *   `lib/crashReporter.ts` does the wiring (global handler, AsyncStorage, the
 *   launch marker). Everything that can be decided without touching a native
 *   module lives here instead, so it can be unit-tested — the same split
 *   `lib/deepLink.ts` / `lib/deepLinkFormat.ts` uses, and for the same reason:
 *   the interesting logic runs on a path nobody exercises by hand.
 */

/** How the error reached us. Narrows where to look far faster than the text. */
export type CrashKind =
  /** `ErrorUtils` global handler — an uncaught throw. */
  | "fatal"
  /** A promise that rejected with nobody listening. */
  | "unhandled-rejection"
  /** Caught by `AppErrorBoundary` while rendering. */
  | "render";

export interface CrashReport {
  kind: CrashKind;
  message: string;
  /** Trimmed to `MAX_STACK_CHARS`; null when the thrown value carried none. */
  stack: string | null;
  /** React's component stack, when the boundary supplied one. */
  componentStack: string | null;
  /** ISO 8601, from the reporting device's clock. */
  at: string;
  /**
   * True when the app had not yet finished launching. This is the bit that
   * separates "died on open" — the store-rejection case — from "threw an hour
   * in", and it is the one fact a black screen otherwise destroys.
   */
  duringLaunch: boolean;
  /** `app.json` version of the build that died. */
  appVersion: string | null;
  platform: string | null;
}

/**
 * Stacks are capped before they are written. A runaway recursion produces a
 * stack measured in megabytes, and the last thing a dying app should do is
 * hand AsyncStorage a write large enough to fail on its own.
 */
export const MAX_STACK_CHARS = 4000;
export const MAX_MESSAGE_CHARS = 500;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n… truncated (${value.length} chars total)`;
}

/**
 * Pulls a message and a stack out of whatever was thrown.
 *
 * A `throw` is not required to carry an `Error`. Real crashes arrive as bare
 * strings, as `{ code, message }` objects from native bridges, and — the worst
 * case for a reader — as `undefined` from a rejected promise with no reason.
 * Every one of those has to come back as something legible rather than
 * "[object Object]".
 */
export function describeError(value: unknown): {
  message: string;
  stack: string | null;
} {
  if (value instanceof Error) {
    return {
      message: value.message || value.name || "Error",
      stack: typeof value.stack === "string" ? value.stack : null,
    };
  }

  if (typeof value === "string") {
    return { message: value || "Empty string thrown", stack: null };
  }

  if (value === null) return { message: "null thrown", stack: null };
  if (value === undefined) return { message: "undefined thrown", stack: null };

  if (typeof value === "object") {
    // Every read below is inside the guard on purpose. Reading a property is
    // not safe on an object you did not construct: a getter can throw, and a
    // Proxy can throw on the `in` check itself. This function runs while the
    // app is already dying, so it is the last place that can afford to be the
    // second thing that throws.
    try {
      const bag = value as { message?: unknown; stack?: unknown; code?: unknown };
      const stack = typeof bag.stack === "string" ? bag.stack : null;

      if (typeof bag.message === "string" && bag.message.length > 0) {
        const code = bag.code === undefined ? "" : ` (code ${String(bag.code)})`;
        return { message: `${bag.message}${code}`, stack };
      }

      // No `message`: serialise it rather than losing it to "[object Object]".
      return { message: JSON.stringify(value) ?? String(value), stack };
    } catch {
      // Circular, a throwing getter, or a hostile Proxy.
      try {
        return { message: String(value), stack: null };
      } catch {
        return { message: "Unreadable object thrown", stack: null };
      }
    }
  }

  return { message: String(value), stack: null };
}

export interface ReportMeta {
  duringLaunch: boolean;
  appVersion?: string | null;
  platform?: string | null;
  componentStack?: string | null;
  /** Injectable for tests. */
  now?: () => Date;
}

/** Builds the record that gets persisted. Never throws. */
export function toReport(
  kind: CrashKind,
  value: unknown,
  meta: ReportMeta
): CrashReport {
  const { message, stack } = describeError(value);
  return {
    kind,
    message: truncate(message, MAX_MESSAGE_CHARS),
    stack: stack === null ? null : truncate(stack, MAX_STACK_CHARS),
    componentStack:
      typeof meta.componentStack === "string" && meta.componentStack.length > 0
        ? truncate(meta.componentStack, MAX_STACK_CHARS)
        : null,
    at: (meta.now?.() ?? new Date()).toISOString(),
    duringLaunch: meta.duringLaunch,
    appVersion: meta.appVersion ?? null,
    platform: meta.platform ?? null,
  };
}

/** Serialises for storage. Returns null if the record can't be encoded. */
export function serializeReport(report: CrashReport): string | null {
  try {
    return JSON.stringify(report);
  } catch {
    return null;
  }
}

function isCrashKind(value: unknown): value is CrashKind {
  return (
    value === "fatal" || value === "unhandled-rejection" || value === "render"
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a record back out of storage.
 *
 * Deliberately tolerant: a report written by an older build must not be able
 * to take down the build that reads it. Anything unparseable or missing its
 * required fields comes back as `null` — "no report" — rather than throwing on
 * the launch path this whole module exists to protect.
 */
export function parseReport(raw: string | null | undefined): CrashReport | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const bag = parsed as Record<string, unknown>;

  const message = nullableString(bag.message);
  if (!message) return null;

  return {
    kind: isCrashKind(bag.kind) ? bag.kind : "fatal",
    message,
    stack: nullableString(bag.stack),
    componentStack: nullableString(bag.componentStack),
    at: nullableString(bag.at) ?? "",
    duringLaunch: bag.duringLaunch === true,
    appVersion: nullableString(bag.appVersion),
    platform: nullableString(bag.platform),
  };
}

const KIND_LABEL: Record<CrashKind, string> = {
  fatal: "Uncaught error",
  "unhandled-rejection": "Unhandled promise rejection",
  render: "Render error",
};

/**
 * The copyable block shown on the diagnostics screen.
 *
 * Written to be pasted into a bug report by someone who is not a developer,
 * so it leads with the two facts that decide where to look — whether it
 * happened during launch, and what kind of error it was — before the stack.
 */
export function formatReport(report: CrashReport): string {
  const lines: string[] = [
    `${KIND_LABEL[report.kind]}${report.duringLaunch ? " during launch" : ""}`,
    report.message,
  ];

  const context: string[] = [];
  if (report.at) context.push(report.at);
  if (report.platform) context.push(report.platform);
  if (report.appVersion) context.push(`v${report.appVersion}`);
  if (context.length > 0) lines.push("", context.join(" · "));

  if (report.stack) lines.push("", report.stack);
  if (report.componentStack) {
    lines.push("", `Component stack:${report.componentStack}`);
  }

  return lines.join("\n");
}

/**
 * Whether a stored report is worth interrupting the driver for on next launch.
 *
 * Only a launch failure is: it is the one the driver cannot get past on their
 * own and the one nobody can otherwise see. A crash deep inside the app is
 * kept for the diagnostics screen but must not hijack the next cold start —
 * the app still works, and a modal about last Tuesday's error is noise.
 */
export function shouldSurfaceOnLaunch(report: CrashReport | null): boolean {
  return report !== null && report.duringLaunch;
}
