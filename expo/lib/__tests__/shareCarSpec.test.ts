/**
 * The share card's car spec line — what the garage knows vs what it only
 * thinks it knows. This is public output, so placeholders leaking onto it is
 * a real defect, not a cosmetic one.
 */
import { carSpecParts, isPlaceholderSpec } from "@/lib/shareCarSpec";

describe("isPlaceholderSpec", () => {
  it("treats empty and whitespace as unanswered", () => {
    expect(isPlaceholderSpec(undefined)).toBe(true);
    expect(isPlaceholderSpec(null)).toBe(true);
    expect(isPlaceholderSpec("")).toBe(true);
    expect(isPlaceholderSpec("   ")).toBe(true);
  });

  it("catches the garage's placeholder values case-insensitively", () => {
    ["Other", "other", "OTHER", "Custom", "unknown", "N/A", "-"].forEach((v) => {
      expect(isPlaceholderSpec(v)).toBe(true);
    });
  });

  it("keeps a real make that merely contains a placeholder word", () => {
    // Substring, not equality — "Otherland Motors" is a real answer.
    expect(isPlaceholderSpec("Otherland Motors")).toBe(false);
    expect(isPlaceholderSpec("Toyota")).toBe(false);
  });
});

describe("carSpecParts", () => {
  it("drops a placeholder make but keeps the model the driver typed", () => {
    // The reported card: make picked as "Other", real car typed into model.
    expect(
      carSpecParts({ make: "Other", model: "VINFAST VF 6", year: "2025", hp: 300 })
    ).toEqual(["VINFAST VF 6", "2025", "300 HP"]);
  });

  it("joins a real make and model", () => {
    expect(
      carSpecParts({ make: "Toyota", model: "GR Yaris", year: "2024", hp: 257 })
    ).toEqual(["Toyota GR Yaris", "2024", "257 HP"]);
  });

  it("returns nothing at all when the garage knows nothing real", () => {
    expect(carSpecParts({ make: "Other", model: "", year: "", hp: 0 })).toEqual([]);
    expect(carSpecParts({})).toEqual([]);
  });

  it("omits a zero, negative or missing horsepower rather than printing '0 HP'", () => {
    expect(carSpecParts({ make: "Honda", hp: 0 })).toEqual(["Honda"]);
    expect(carSpecParts({ make: "Honda", hp: -5 })).toEqual(["Honda"]);
    expect(carSpecParts({ make: "Honda", hp: null })).toEqual(["Honda"]);
  });

  it("rounds fractional horsepower", () => {
    expect(carSpecParts({ hp: 296.6 })).toEqual(["297 HP"]);
  });

  it("trims stray whitespace out of every field", () => {
    expect(
      carSpecParts({ make: "  BMW ", model: " M3  ", year: " 2023 ", hp: 473 })
    ).toEqual(["BMW M3", "2023", "473 HP"]);
  });
});
