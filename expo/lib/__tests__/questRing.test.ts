/**
 * The quest card's progress ring and symbol resolution — the two pieces of
 * the redesigned card that are arithmetic rather than layout.
 */
import {
  QUEST_SYMBOLS,
  questSymbolName,
  ringGeometry,
} from "@/lib/questRing";

describe("ringGeometry", () => {
  it("insets the radius by half the stroke so the ring is not clipped", () => {
    // A 64pt medallion with a 4pt stroke draws on r = 30, not r = 32.
    expect(ringGeometry(64, 4, 50).radius).toBe(30);
  });

  it("draws nothing at 0% and closes the circle at 100%", () => {
    const empty = ringGeometry(64, 4, 0);
    expect(empty.dash).toBe(0);
    expect(empty.gap).toBeCloseTo(empty.circumference, 6);

    const full = ringGeometry(64, 4, 100);
    expect(full.dash).toBeCloseTo(full.circumference, 6);
    expect(full.gap).toBeCloseTo(0, 6);
  });

  it("splits the circumference proportionally in between", () => {
    const { dash, gap, circumference } = ringGeometry(64, 4, 25);
    expect(dash).toBeCloseTo(circumference * 0.25, 6);
    expect(dash + gap).toBeCloseTo(circumference, 6);
  });

  it("clamps out-of-range percentages instead of inverting the arc", () => {
    // A negative dash is the failure that silently paints a FULL ring.
    expect(ringGeometry(64, 4, -20).dash).toBe(0);
    expect(ringGeometry(64, 4, 140).gap).toBeCloseTo(0, 6);
  });

  it("never produces a negative radius from a stroke wider than the medallion", () => {
    expect(ringGeometry(4, 12, 50).radius).toBe(0);
  });
});

describe("questSymbolName", () => {
  it("uses the template's own icon when it names a symbol we can draw", () => {
    expect(
      questSymbolName({ icon: "Flame", objective_type: "drive_distance" })
    ).toBe("Flame");
    expect(
      questSymbolName({ icon: "Handshake", objective_type: "attend_meetup" })
    ).toBe("Handshake");
  });

  it("falls back to the objective's symbol for an unknown icon name", () => {
    // The shape of a row seeded outside this repo — see DAILY_QUEST_SYSTEM §10.
    expect(
      questSymbolName({ icon: "Utensils", objective_type: "reach_speed" })
    ).toBe("Gauge");
    expect(
      questSymbolName({ icon: "", objective_type: "make_friend" })
    ).toBe("Users");
    expect(
      questSymbolName({ icon: null as unknown as string, objective_type: "attend_meetup" })
    ).toBe("Handshake");
  });

  it("resolves every objective to a drawable symbol", () => {
    const objectives = [
      "drive_distance",
      "night_drive",
      "reach_speed",
      "make_friend",
      "attend_meetup",
      "photo_capture",
    ] as const;
    objectives.forEach((objective_type) => {
      const symbol = questSymbolName({ icon: "nonsense", objective_type });
      expect(QUEST_SYMBOLS).toContain(symbol);
    });
  });
});
