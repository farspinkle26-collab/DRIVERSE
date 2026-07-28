import { describe, expect, it } from "bun:test";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  describeSaveFailure,
  sanitizeCount,
  sanitizeMetric,
  validateRouteDraft,
} from "@/lib/routeDraft";

describe("sanitizeMetric", () => {
  it("passes finite non-negative numbers through", () => {
    expect(sanitizeMetric(0)).toBe(0);
    expect(sanitizeMetric(12.5)).toBe(12.5);
  });

  it("flattens the values PostgREST cannot serialise", () => {
    // distance / 0 and an unmeasured top speed are the two that reach here.
    expect(sanitizeMetric(NaN)).toBe(0);
    expect(sanitizeMetric(Infinity)).toBe(0);
    expect(sanitizeMetric(-Infinity)).toBe(0);
    expect(sanitizeMetric(undefined)).toBe(0);
    expect(sanitizeMetric(null)).toBe(0);
  });

  it("clamps negatives, which no metric on a drive can be", () => {
    expect(sanitizeMetric(-4)).toBe(0);
  });
});

describe("sanitizeCount", () => {
  it("rounds to the integer the column expects", () => {
    expect(sanitizeCount(3.4)).toBe(3);
    expect(sanitizeCount(3.6)).toBe(4);
    expect(sanitizeCount(NaN)).toBe(0);
  });
});

describe("validateRouteDraft", () => {
  const ok = { title: "Morning Drive", description: "test", pathLength: 24 };

  it("accepts a normal drive", () => {
    expect(validateRouteDraft(ok)).toBeNull();
  });

  it("accepts the shortest thing that is still a line", () => {
    expect(validateRouteDraft({ ...ok, pathLength: 2 })).toBeNull();
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(validateRouteDraft({ ...ok, title: "" })).toContain("name");
    expect(validateRouteDraft({ ...ok, title: "   " })).toContain("name");
  });

  it("rejects text longer than the column's CHECK constraint", () => {
    expect(validateRouteDraft({ ...ok, title: "x".repeat(TITLE_MAX + 1) })).toContain(
      String(TITLE_MAX)
    );
    expect(
      validateRouteDraft({ ...ok, description: "x".repeat(DESCRIPTION_MAX + 1) })
    ).toContain(String(DESCRIPTION_MAX));
  });

  it("rejects a path with fewer than two fixes", () => {
    expect(validateRouteDraft({ ...ok, pathLength: 1 })).toContain("GPS");
    expect(validateRouteDraft({ ...ok, pathLength: 0 })).toContain("GPS");
  });
});

describe("describeSaveFailure", () => {
  it("names the two failures a driver can act on", () => {
    expect(describeSaveFailure(new Error("Network request failed"))).toContain(
      "connection"
    );
    expect(describeSaveFailure({ message: "JWT expired" })).toContain("Sign in");
  });

  it("passes anything else through so the real reason is visible", () => {
    expect(
      describeSaveFailure({ message: 'relation "saved_routes" does not exist' })
    ).toContain("saved_routes");
  });

  it("never returns an empty string", () => {
    expect(describeSaveFailure(null)).toBeTruthy();
    expect(describeSaveFailure({})).toBeTruthy();
  });
});
