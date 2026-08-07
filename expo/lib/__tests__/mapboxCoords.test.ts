import {
  boundsForPoints,
  featureCollection,
  fromPosition,
  fromPositions,
  latitudeDeltaForZoom,
  lineFeature,
  MAX_ZOOM,
  MIN_ZOOM,
  pointFeature,
  toPosition,
  toPositions,
  zoomForLatitudeDelta,
} from "@/lib/mapboxCoords";

/**
 * The bug every one of these guards is the same bug: longitude and latitude
 * swapped. It cannot be caught by types (both are `number`), it does not
 * throw, and it is invisible in review — so the coordinates below are chosen
 * so that a swap is arithmetically impossible to miss. Jakarta is at
 * latitude -6.2, longitude 106.8: the two values have different signs AND
 * differ by an order of magnitude, so a transposed pair is never plausible.
 */
const JAKARTA = { latitude: -6.2088, longitude: 106.8456 };

describe("toPosition / fromPosition", () => {
  it("puts longitude first, latitude second", () => {
    expect(toPosition(JAKARTA)).toEqual([106.8456, -6.2088]);
  });

  it("reads longitude from index 0 and latitude from index 1", () => {
    expect(fromPosition([106.8456, -6.2088])).toEqual(JAKARTA);
  });

  it("round-trips a point unchanged", () => {
    expect(fromPosition(toPosition(JAKARTA))).toEqual(JAKARTA);
  });

  it("round-trips a path unchanged and in order", () => {
    const path = [JAKARTA, { latitude: -6.9, longitude: 107.6 }];
    expect(fromPositions(toPositions(path))).toEqual(path);
  });
});

describe("lineFeature", () => {
  it("builds a LineString whose coordinates are [lng, lat]", () => {
    const feature = lineFeature([JAKARTA, { latitude: -6.9, longitude: 107.6 }]);

    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("LineString");
    expect(feature.geometry.coordinates).toEqual([
      [106.8456, -6.2088],
      [107.6, -6.9],
    ]);
  });

  it("carries properties through for data-driven styling", () => {
    // The speed heatmap colours segments from a property rather than mounting
    // one layer per segment; losing this silently flattens the heatmap.
    const feature = lineFeature([JAKARTA], { color: "#FF0000", speedKmh: 82 });
    expect(feature.properties).toEqual({ color: "#FF0000", speedKmh: 82 });
  });

  it("defaults properties to an object, never null", () => {
    // A null `properties` is legal GeoJSON but crashes style expressions that
    // read a key off it.
    expect(lineFeature([JAKARTA]).properties).toEqual({});
  });
});

describe("pointFeature", () => {
  it("builds a Point whose coordinates are [lng, lat]", () => {
    const feature = pointFeature(JAKARTA);
    expect(feature.type).toBe("Feature");
    expect(feature.geometry.type).toBe("Point");
    expect(feature.geometry.coordinates).toEqual([106.8456, -6.2088]);
  });

  it("carries properties through", () => {
    const feature = pointFeature(JAKARTA, { role: "start" });
    expect(feature.properties).toEqual({ role: "start" });
  });

  it("defaults properties to an object, never null", () => {
    expect(pointFeature(JAKARTA).properties).toEqual({});
  });
});

describe("featureCollection", () => {
  it("wraps features in a FeatureCollection", () => {
    const a = lineFeature([JAKARTA]);
    expect(featureCollection([a])).toEqual({
      type: "FeatureCollection",
      features: [a],
    });
  });

  it("survives an empty list", () => {
    expect(featureCollection([]).features).toEqual([]);
  });
});

describe("boundsForPoints", () => {
  it("returns null for an empty path rather than a degenerate box", () => {
    // fitBounds on a zero-area box zooms to maximum; a caller with no points
    // wants its own default camera instead.
    expect(boundsForPoints([])).toBeNull();
  });

  it("puts north-east and south-west the right way round", () => {
    const bounds = boundsForPoints([
      { latitude: -6.2, longitude: 106.8 },
      { latitude: -6.9, longitude: 107.6 },
      { latitude: -6.5, longitude: 106.2 },
    ]);

    // ne = (max lng, max lat), sw = (min lng, min lat)
    expect(bounds).toEqual({ ne: [107.6, -6.2], sw: [106.2, -6.9] });
  });

  it("handles a single point", () => {
    expect(boundsForPoints([JAKARTA])).toEqual({
      ne: [106.8456, -6.2088],
      sw: [106.8456, -6.2088],
    });
  });

  it("keeps signs straight across the equator and meridian", () => {
    const bounds = boundsForPoints([
      { latitude: -1, longitude: -1 },
      { latitude: 1, longitude: 1 },
    ]);
    expect(bounds).toEqual({ ne: [1, 1], sw: [-1, -1] });
  });
});

describe("zoomForLatitudeDelta", () => {
  it("maps the whole world to zoom 0", () => {
    expect(zoomForLatitudeDelta(360)).toBeCloseTo(0);
  });

  it("gains one zoom level each time the delta halves", () => {
    expect(zoomForLatitudeDelta(180)).toBeCloseTo(1);
    expect(zoomForLatitudeDelta(90)).toBeCloseTo(2);
  });

  it("clamps rather than returning Infinity for a zero delta", () => {
    // A zero delta is a caller with no region yet, not an infinite zoom.
    expect(zoomForLatitudeDelta(0)).toBe(MAX_ZOOM);
    expect(zoomForLatitudeDelta(-1)).toBe(MAX_ZOOM);
    expect(zoomForLatitudeDelta(NaN)).toBe(MAX_ZOOM);
  });

  it("never exceeds Mapbox's own zoom range", () => {
    const zoom = zoomForLatitudeDelta(0.0000001);
    expect(zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it("round-trips against latitudeDeltaForZoom", () => {
    // mapClustering's thresholds are written in latitudeDelta; a lossy
    // round-trip would move the zoom at which clustering switches off.
    for (const delta of [0.02, 0.05, 0.5, 5]) {
      expect(latitudeDeltaForZoom(zoomForLatitudeDelta(delta))).toBeCloseTo(delta, 6);
    }
  });
});

describe("latitudeDeltaForZoom", () => {
  it("maps zoom 0 to the whole world", () => {
    expect(latitudeDeltaForZoom(0)).toBeCloseTo(360);
  });

  it("halves the delta for each zoom level", () => {
    expect(latitudeDeltaForZoom(1)).toBeCloseTo(180);
    expect(latitudeDeltaForZoom(2)).toBeCloseTo(90);
  });

  it("falls back to the whole world for a non-finite zoom", () => {
    expect(latitudeDeltaForZoom(NaN)).toBe(360);
  });
});
