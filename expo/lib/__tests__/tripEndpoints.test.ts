import { describe, expect, it } from "bun:test";
import {
  DESTINATION_FALLBACK,
  ENDPOINT_LABEL_MAX,
  FREE_DRIVE_TITLE,
  ORIGIN_FALLBACK,
  coordinateLabel,
  displayName,
  endpointLabels,
  isPlaceholderName,
  shareTripTitle,
  shortPlaceLabel,
} from "@/lib/tripEndpoints";

describe("isPlaceholderName", () => {
  it("recognises the strings the card used to hardcode", () => {
    expect(isPlaceholderName("Current Location")).toBe(true);
    expect(isPlaceholderName("Dropped Pin")).toBe(true);
    expect(isPlaceholderName("dropped pin")).toBe(true);
    expect(isPlaceholderName("Unknown")).toBe(true);
  });

  it("recognises nothing at all", () => {
    expect(isPlaceholderName("")).toBe(true);
    expect(isPlaceholderName("   ")).toBe(true);
    expect(isPlaceholderName(null)).toBe(true);
    expect(isPlaceholderName(undefined)).toBe(true);
  });

  it("leaves real places alone", () => {
    expect(isPlaceholderName("Kopi Nako")).toBe(false);
    expect(isPlaceholderName("Puncak Pass")).toBe(false);
  });
});

describe("shortPlaceLabel", () => {
  it("keeps the first segment of a Mapbox place_name", () => {
    expect(
      shortPlaceLabel(
        "Kopi Nako, Jalan Bintaro Utama, Tangerang Selatan, Banten, Indonesia"
      )
    ).toBe("Kopi Nako");
  });

  it("absorbs the next segment when the first is a bare number or abbreviation", () => {
    expect(shortPlaceLabel("12, Jalan Kemang Raya, Jakarta")).toBe("12 Jalan Kemang Raya");
    expect(shortPlaceLabel("Jl, Sudirman, Jakarta")).toBe("Jl Sudirman");
  });

  it("collapses whitespace", () => {
    expect(shortPlaceLabel("  Puncak   Pass ,  Bogor ")).toBe("Puncak Pass");
  });

  it("truncates a long name on a word boundary", () => {
    const label = shortPlaceLabel(
      "Stasiun Pengisian Bahan Bakar Umum Pertamina Cibubur, Jakarta"
    );
    expect(label!.length).toBeLessThanOrEqual(ENDPOINT_LABEL_MAX);
    expect(label!.endsWith("…")).toBe(true);
    expect(label!.startsWith("Stasiun Pengisian")).toBe(true);
  });

  it("hard-truncates a single long word rather than collapsing it", () => {
    const label = shortPlaceLabel("A".repeat(60), 10);
    expect(label).toBe(`${"A".repeat(9)}…`);
  });

  it("returns null when there is nothing usable", () => {
    expect(shortPlaceLabel(null)).toBeNull();
    expect(shortPlaceLabel(undefined)).toBeNull();
    expect(shortPlaceLabel("")).toBeNull();
    expect(shortPlaceLabel(" , , ")).toBeNull();
    // A geocoder that echoes a placeholder is still no name.
    expect(shortPlaceLabel("Unknown, Indonesia")).toBeNull();
  });
});

describe("coordinateLabel", () => {
  it("formats a fix to four decimals", () => {
    expect(coordinateLabel(-6.26012, 106.78104)).toBe("-6.2601, 106.7810");
  });

  it("refuses a missing or non-finite fix", () => {
    expect(coordinateLabel(null, 106.7)).toBeNull();
    expect(coordinateLabel(-6.2, undefined)).toBeNull();
    expect(coordinateLabel(NaN, NaN)).toBeNull();
  });
});

describe("displayName", () => {
  it("passes a real place through", () => {
    expect(displayName("Kopi Nako")).toBe("Kopi Nako");
  });

  it("hides a coordinate pair, which is storage not a label", () => {
    expect(displayName("-6.2601, 106.7810")).toBeNull();
  });

  it("hides placeholders", () => {
    expect(displayName("Current Location")).toBeNull();
  });
});

describe("endpointLabels", () => {
  it("uses the resolved names when both ends were geocoded", () => {
    expect(
      endpointLabels({ origin_name: "Blok M", destination_name: "Puncak Pass" })
    ).toEqual({ origin: "Blok M", destination: "Puncak Pass" });
  });

  it("falls back to Point A / Point B, never to the old placeholders", () => {
    expect(
      endpointLabels({ origin_name: "Current Location", destination_name: "Dropped Pin" })
    ).toEqual({ origin: ORIGIN_FALLBACK, destination: DESTINATION_FALLBACK });
  });

  it("falls back per end, so one known name is still shown", () => {
    expect(endpointLabels({ origin_name: null, destination_name: "Kopi Nako" })).toEqual({
      origin: ORIGIN_FALLBACK,
      destination: "Kopi Nako",
    });
  });

  it("always returns two non-empty strings", () => {
    const labels = endpointLabels({});
    expect(labels.origin).toBe(ORIGIN_FALLBACK);
    expect(labels.destination).toBe(DESTINATION_FALLBACK);
  });
});

describe("shareTripTitle", () => {
  it("prefers an explicitly saved trip name", () => {
    expect(
      shareTripTitle({ name: "Sunday Puncak run", destination_name: "Puncak Pass" })
    ).toBe("Sunday Puncak run");
  });

  it("otherwise titles the drive after where it went", () => {
    expect(shareTripTitle({ destination_name: "Kopi Nako" })).toBe("Kopi Nako");
  });

  it("falls back to the origin when there was no destination", () => {
    expect(shareTripTitle({ origin_name: "Blok M", destination_name: "Unknown" })).toBe(
      "Blok M"
    );
  });

  it("never titles a card with a placeholder", () => {
    expect(
      shareTripTitle({ origin_name: "Current Location", destination_name: "Dropped Pin" })
    ).toBe(FREE_DRIVE_TITLE);
    expect(shareTripTitle({})).toBe(FREE_DRIVE_TITLE);
  });
});
