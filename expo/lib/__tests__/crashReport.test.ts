import { describe, expect, it } from "bun:test";
import {
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  describeError,
  formatReport,
  parseReport,
  serializeReport,
  shouldSurfaceOnLaunch,
  toReport,
  type CrashReport,
} from "@/lib/crashReport";

/**
 * These run on the path nobody exercises by hand: the app is already dying,
 * and whatever it hands the reporter is whatever some third-party module
 * decided to throw. The one behaviour that matters throughout is that none of
 * it throws a second time.
 */

const NOW = () => new Date("2026-07-31T09:00:00.000Z");

describe("describeError", () => {
  it("reads message and stack off a real Error", () => {
    const err = new Error("boom");
    const { message, stack } = describeError(err);
    expect(message).toBe("boom");
    expect(stack).toContain("boom");
  });

  it("falls back to the name when an Error carries no message", () => {
    expect(describeError(new TypeError()).message).toBe("TypeError");
  });

  it("handles a bare string throw", () => {
    expect(describeError("just a string")).toEqual({
      message: "just a string",
      stack: null,
    });
  });

  it("names null and undefined instead of stringifying them into nothing", () => {
    expect(describeError(null).message).toBe("null thrown");
    expect(describeError(undefined).message).toBe("undefined thrown");
  });

  it("keeps the code from a native-bridge style error object", () => {
    const { message, stack } = describeError({
      code: "E_NO_MANIFEST",
      message: "missing manifest",
      stack: "at resolveScheme",
    });
    expect(message).toBe("missing manifest (code E_NO_MANIFEST)");
    expect(stack).toBe("at resolveScheme");
  });

  it("serialises an object with no message rather than losing it", () => {
    expect(describeError({ reason: "offline" }).message).toBe(
      '{"reason":"offline"}'
    );
  });

  it("survives a circular object", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
    expect(describeError(circular).message.length).toBeGreaterThan(0);
  });

  it("survives an object whose getter throws", () => {
    const hostile = {
      get message(): string {
        throw new Error("nope");
      },
    };
    expect(() => describeError(hostile)).not.toThrow();
  });
});

describe("toReport", () => {
  it("stamps the launch flag, time and build context", () => {
    const report = toReport("fatal", new Error("boom"), {
      duringLaunch: true,
      appVersion: "1.0.0",
      platform: "android 34",
      now: NOW,
    });
    expect(report.kind).toBe("fatal");
    expect(report.duringLaunch).toBe(true);
    expect(report.at).toBe("2026-07-31T09:00:00.000Z");
    expect(report.appVersion).toBe("1.0.0");
    expect(report.platform).toBe("android 34");
  });

  it("caps a runaway stack so the dying app never writes megabytes", () => {
    const err = new Error("recursion");
    err.stack = "x".repeat(MAX_STACK_CHARS * 3);
    const report = toReport("fatal", err, { duringLaunch: true, now: NOW });
    expect(report.stack!.length).toBeLessThan(MAX_STACK_CHARS + 100);
    expect(report.stack).toContain("truncated");
  });

  it("caps an overlong message too", () => {
    const report = toReport("fatal", "y".repeat(MAX_MESSAGE_CHARS * 2), {
      duringLaunch: false,
      now: NOW,
    });
    expect(report.message.length).toBeLessThan(MAX_MESSAGE_CHARS + 100);
  });

  it("normalises an empty component stack to null", () => {
    const report = toReport("render", new Error("boom"), {
      duringLaunch: false,
      componentStack: "",
      now: NOW,
    });
    expect(report.componentStack).toBeNull();
  });
});

describe("serialize / parse round trip", () => {
  it("survives a round trip intact", () => {
    const report = toReport("render", new Error("boom"), {
      duringLaunch: true,
      appVersion: "1.0.0",
      platform: "android 34",
      componentStack: "\n  in RootLayout",
      now: NOW,
    });
    expect(parseReport(serializeReport(report))).toEqual(report);
  });

  it("returns null for anything unreadable rather than throwing", () => {
    // A build that cannot read an older build's report must still launch.
    expect(parseReport(null)).toBeNull();
    expect(parseReport(undefined)).toBeNull();
    expect(parseReport("")).toBeNull();
    expect(parseReport("not json at all")).toBeNull();
    expect(parseReport("[1,2,3]")).toBeNull();
    expect(parseReport('"a string"')).toBeNull();
    expect(parseReport("null")).toBeNull();
  });

  it("rejects a record with no message — there is nothing to show", () => {
    expect(parseReport(JSON.stringify({ kind: "fatal", at: "x" }))).toBeNull();
  });

  it("defaults an unknown kind instead of discarding the report", () => {
    const parsed = parseReport(
      JSON.stringify({ kind: "something-new", message: "boom" })
    );
    expect(parsed?.kind).toBe("fatal");
    expect(parsed?.message).toBe("boom");
  });

  it("treats a missing duringLaunch as false", () => {
    expect(parseReport(JSON.stringify({ message: "boom" }))?.duringLaunch).toBe(
      false
    );
  });
});

describe("formatReport", () => {
  const base: CrashReport = {
    kind: "fatal",
    message: "Cannot make a deep link into a standalone app",
    stack: "at resolveScheme\nat createURL",
    componentStack: null,
    at: "2026-07-31T09:00:00.000Z",
    duringLaunch: true,
    appVersion: "1.0.0",
    platform: "android 34",
  };

  it("leads with the fact that decides where to look", () => {
    expect(formatReport(base).split("\n")[0]).toBe("Uncaught error during launch");
  });

  it("does not claim a launch failure when it wasn't one", () => {
    const formatted = formatReport({ ...base, duringLaunch: false });
    expect(formatted).not.toContain("during launch");
  });

  it("includes the message, the stack and the build context", () => {
    const formatted = formatReport(base);
    expect(formatted).toContain("Cannot make a deep link");
    expect(formatted).toContain("at resolveScheme");
    expect(formatted).toContain("android 34");
    expect(formatted).toContain("v1.0.0");
  });

  it("renders a report with nothing but a message", () => {
    const bare = formatReport({
      ...base,
      stack: null,
      at: "",
      appVersion: null,
      platform: null,
    });
    expect(bare).toContain("Cannot make a deep link");
    expect(bare).not.toContain("undefined");
    expect(bare).not.toContain("null");
  });
});

describe("shouldSurfaceOnLaunch", () => {
  const report = (duringLaunch: boolean): CrashReport => ({
    kind: "fatal",
    message: "boom",
    stack: null,
    componentStack: null,
    at: "",
    duringLaunch,
    appVersion: null,
    platform: null,
  });

  it("interrupts the next start only for a launch failure", () => {
    expect(shouldSurfaceOnLaunch(report(true))).toBe(true);
  });

  it("keeps a mid-session crash out of the way", () => {
    expect(shouldSurfaceOnLaunch(report(false))).toBe(false);
  });

  it("has nothing to say when there is no report", () => {
    expect(shouldSurfaceOnLaunch(null)).toBe(false);
  });
});
