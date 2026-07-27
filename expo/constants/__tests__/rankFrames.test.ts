/**
 * The frame config is data, so it is testable as data — and worth testing,
 * because the failure mode is subtle: a tier whose frame is quieter than the
 * tier below it still renders perfectly, it just silently makes a promotion
 * feel like a demotion. The monotonicity assertions below exist because that
 * exact regression slipped into the first draft of the table.
 */

import { describe, expect, it } from "bun:test";
import {
  RANK_FRAMES,
  frameForLevel,
  resolveAvatarFrame,
  type FrameDetail,
  type FrameShape,
} from "@/constants/rankFrames";
import { RANKS } from "@/constants/ranks";
import {
  frameGeometry,
  segmentDash,
  trailDash,
} from "@/components/frames/frameGeometry";

describe("the table", () => {
  it("has exactly one frame per rank, in ladder order", () => {
    expect(RANK_FRAMES).toHaveLength(RANKS.length);
    expect(RANK_FRAMES.map((f) => f.rankId)).toEqual(RANKS.map((r) => r.id));
  });

  it("takes its colours from ranks.ts and never invents them", () => {
    for (const [i, frame] of RANK_FRAMES.entries()) {
      expect(frame.color).toBe(RANKS[i].color);
      expect(frame.accent).toBe(RANKS[i].colorDark);
    }
  });

  it("never makes a promotion look like a demotion", () => {
    for (let i = 1; i < RANK_FRAMES.length; i++) {
      const prev = RANK_FRAMES[i - 1];
      const next = RANK_FRAMES[i];
      expect(next.thickness).toBeGreaterThanOrEqual(prev.thickness);
      expect(next.glow).toBeGreaterThanOrEqual(prev.glow);
      expect(next.segments).toBeGreaterThanOrEqual(prev.segments);
    }
  });
});

describe("the escalation bands", () => {
  it("keeps tiers 1-3 static, unglowed and undecorated", () => {
    for (const frame of RANK_FRAMES.slice(0, 3)) {
      expect(frame.animation).toBe("none");
      expect(frame.glow).toBe(0);
      expect(frame.corner).toBe("none");
    }
  });

  it("turns the silhouette angular by the mid band", () => {
    for (const frame of RANK_FRAMES.slice(3, 7)) {
      expect(frame.shape).not.toBe("circle");
      expect(frame.glow).toBeGreaterThan(0);
      expect(frame.corner).toBe("ticks");
    }
  });

  it("runs a travelling trail across the high band", () => {
    for (const frame of RANK_FRAMES.slice(7, 11)) {
      expect(frame.animation).toBe("trail");
      expect(frame.segments).toBeGreaterThan(1);
      expect(frame.trailPeriod).toBeGreaterThanOrEqual(7);
    }
  });

  it("gives the top tier a silhouette and details nothing else has", () => {
    const king = RANK_FRAMES[RANK_FRAMES.length - 1];
    expect(king.shape).toBe("octagon");
    expect(king.animation).toBe("dualTrail");
    expect(king.sparks).toBe(true);
    // Uniqueness is the whole point of the top tier — assert no one else
    // shares any of it.
    expect(RANK_FRAMES.filter((f) => f.shape === "octagon")).toHaveLength(1);
    expect(RANK_FRAMES.filter((f) => f.sparks)).toHaveLength(1);
    expect(RANK_FRAMES.filter((f) => f.animation === "dualTrail")).toHaveLength(1);
  });
});

describe("level mapping", () => {
  it.each([
    [1, "rookie"],
    [9, "rookie"],
    [10, "explorer"],
    [100, "racer"],
    [999, "mythic-driver"],
    [1000, "king"],
    [99999, "king"],
  ])("level %i earns the %s frame", (level, rankId) => {
    expect(frameForLevel(level as number).rankId).toBe(rankId);
  });

  it("treats junk levels as tier 1 rather than throwing", () => {
    expect(frameForLevel(0).rankId).toBe("rookie");
    expect(frameForLevel(-5).rankId).toBe("rookie");
    expect(frameForLevel(NaN).rankId).toBe("rookie");
  });
});

describe("geometry", () => {
  const shapes: FrameShape[] = ["circle", "cut1", "cut2", "cut4", "octagon"];

  it.each(shapes)("produces a finite, closed %s outline", (shape) => {
    const geo = frameGeometry(shape, 80, 3);
    expect(geo.path).not.toMatch(/NaN|Infinity/);
    expect(geo.length).toBeGreaterThan(0);
    expect(Number.isFinite(geo.length)).toBe(true);
    expect(geo.path.trim().endsWith("Z")).toBe(true);
  });

  it.each([
    ["cut1", 1],
    ["cut2", 2],
    ["cut4", 4],
    ["octagon", 8],
  ] as const)("exposes %s's %i decoration points", (shape, count) => {
    expect(frameGeometry(shape, 80, 3).corners).toHaveLength(count);
  });

  it("survives sizes small enough to fold the polygon", () => {
    // A 16pt chat avatar with a heavy stroke is where the cut would eat more
    // than half the side; `cutCornerPoints` clamps it rather than inverting.
    const geo = frameGeometry("cut4", 16, 4);
    expect(geo.path).not.toMatch(/NaN|-\d{4,}/);
    expect(geo.length).toBeGreaterThan(0);
  });

  it("tiles segment dashes exactly around the outline", () => {
    const geo = frameGeometry("cut4", 80, 3);
    const [mark, gap] = segmentDash(geo.length, 4)!.split(",").map(Number);
    expect((mark + gap) * 4).toBeCloseTo(geo.length, 1);
  });

  it("treats a single segment as a continuous stroke", () => {
    expect(segmentDash(frameGeometry("circle", 80, 3).length, 1)).toBeUndefined();
  });

  it("shows exactly one trail at a time", () => {
    const geo = frameGeometry("octagon", 80, 3);
    const { dash, span } = trailDash(geo.length);
    const [lit, dark] = dash.split(",").map(Number);
    expect(lit + dark).toBeCloseTo(geo.length, 1);
    // `dash` is emitted at 2dp for the SVG attribute; `span` is the raw value.
    expect(lit).toBeCloseTo(span, 1);
    expect(lit).toBeLessThan(geo.length / 2);
  });
});

describe("resolution: Platinum over rank", () => {
  it("uses the rank frame when nothing is equipped", () => {
    const r = resolveAvatarFrame({ level: 5 });
    expect(r.fromPlatinum).toBe(false);
    expect(r.rankId).toBe("rookie");
  });

  it("lets an entitled Platinum selection win", () => {
    const r = resolveAvatarFrame({ level: 5, isPlatinum: true, platinumFrame: "apex" });
    expect(r.fromPlatinum).toBe(true);
    expect(r.platinumFrameId).toBe("apex");
  });

  it("falls a lapsed subscriber back to rank without destroying the selection", () => {
    const r = resolveAvatarFrame({ level: 5, isPlatinum: false, platinumFrame: "apex" });
    expect(r.fromPlatinum).toBe(false);
    expect(r.rankId).toBe("rookie");
  });

  it("treats the Platinum 'default' frame as no selection at all", () => {
    const r = resolveAvatarFrame({ level: 900, isPlatinum: true, platinumFrame: "default" });
    expect(r.fromPlatinum).toBe(false);
    expect(r.rankId).toBe("mythic-driver");
  });

  it("still reports the rank underneath a Platinum frame", () => {
    // Callers tint level badges by rank even when the frame is Platinum.
    const r = resolveAvatarFrame({ level: 1000, isPlatinum: true, platinumFrame: "grid" });
    expect(r.fromPlatinum).toBe(true);
    expect(r.rankId).toBe("king");
    expect(r.color).toBe("#FFD700");
  });

  it("prefers an explicit rankId over level", () => {
    expect(resolveAvatarFrame({ level: 1, rankId: "king" }).rankId).toBe("king");
  });
});

describe("detail levels and reduced motion", () => {
  const details: FrameDetail[] = ["full", "list", "marker"];
  const top = { level: 1000 };

  it.each(details)("keeps shape and colour intact at %s detail", (detail) => {
    const r = resolveAvatarFrame({ ...top, detail });
    expect(r.shape).toBe("octagon");
    expect(r.color).toBe("#FFD700");
  });

  it.each(details)("goes fully static under reduced motion at %s detail", (detail) => {
    const r = resolveAvatarFrame({ ...top, detail, reducedMotion: true });
    expect(r.effectiveAnimation).toBe("none");
    expect(r.effectiveSparks).toBe(false);
  });

  it("never animates a map marker, whatever the tier", () => {
    for (const frame of RANK_FRAMES) {
      const r = resolveAvatarFrame({ rankId: frame.rankId, detail: "marker" });
      expect(r.effectiveAnimation).toBe("none");
      expect(r.effectiveSparks).toBe(false);
      expect(r.effectiveGlow).toBe(0);
    }
  });

  it("simplifies the two-tone trail down to one in list contexts", () => {
    expect(resolveAvatarFrame({ ...top, detail: "list" }).effectiveAnimation).toBe("trail");
    expect(resolveAvatarFrame({ ...top, detail: "full" }).effectiveAnimation).toBe("dualTrail");
  });

  it("reserves sparks for the profile page", () => {
    expect(resolveAvatarFrame({ ...top, detail: "full" }).effectiveSparks).toBe(true);
    expect(resolveAvatarFrame({ ...top, detail: "list" }).effectiveSparks).toBe(false);
  });

  it("does not animate a Platinum frame, which has no trail outline", () => {
    const r = resolveAvatarFrame({
      ...top,
      isPlatinum: true,
      platinumFrame: "telemetry",
      detail: "full",
    });
    expect(r.effectiveAnimation).toBe("none");
    expect(r.effectiveSparks).toBe(false);
  });
});
