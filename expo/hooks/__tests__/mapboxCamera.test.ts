import { cameraStopFor, paddingArray } from "@/hooks/useMapboxCamera";

/**
 * `cameraStopFor` is where thirteen camera call sites' coordinates get flipped
 * into Mapbox order, and where "move only this property" is preserved. Both
 * are silent when wrong: a transposed pair moves the map to the wrong
 * hemisphere, and an emitted `pitch: undefined` flattens a tilted map with no
 * error anywhere.
 */

const JAKARTA = { latitude: -6.2088, longitude: 106.8456 };

describe("cameraStopFor", () => {
  it("puts the centre in [longitude, latitude] order", () => {
    expect(cameraStopFor({ center: JAKARTA }).centerCoordinate).toEqual([106.8456, -6.2088]);
  });

  it("renames zoom to zoomLevel and passes pitch and heading through", () => {
    const stop = cameraStopFor({ center: JAKARTA, zoom: 18, pitch: 60, heading: 128 }, 900);

    expect(stop).toEqual({
      centerCoordinate: [106.8456, -6.2088],
      zoomLevel: 18,
      pitch: 60,
      heading: 128,
      animationDuration: 900,
    });
  });

  it("omits keys the caller did not set, rather than sending undefined", () => {
    // The compass button sets heading alone and must leave the driver's zoom
    // and pitch untouched. setCamera animates toward a present-but-undefined
    // key, so an omitted key and an undefined one are not the same thing.
    const stop = cameraStopFor({ heading: 0 }, 500);

    expect(stop).toEqual({ heading: 0, animationDuration: 500 });
    expect("zoomLevel" in stop).toBe(false);
    expect("pitch" in stop).toBe(false);
    expect("centerCoordinate" in stop).toBe(false);
  });

  it("keeps a zero heading, which is a real bearing and not a missing one", () => {
    // `heading: 0` is due north — pointing the map north is exactly what the
    // compass button does. A truthiness check here would drop it.
    expect(cameraStopFor({ heading: 0 })).toHaveProperty("heading", 0);
  });

  it("keeps a zero pitch, which is a flat top-down map", () => {
    expect(cameraStopFor({ pitch: 0 })).toHaveProperty("pitch", 0);
  });

  it("defaults to an instant move when no duration is given", () => {
    expect(cameraStopFor({ center: JAKARTA }).animationDuration).toBe(0);
  });
});

describe("paddingArray", () => {
  it("emits padding in [top, right, bottom, left] order", () => {
    expect(paddingArray({ top: 1, right: 2, bottom: 3, left: 4 })).toEqual([1, 2, 3, 4]);
  });
});
