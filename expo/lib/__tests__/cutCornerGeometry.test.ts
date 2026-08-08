import {
  cutCornerBottomEdge,
  cutCornerPoints,
  cutCornerTopEdge,
} from "@/lib/cutCornerGeometry";

/**
 * The edge paths exist to be stroked directly on top of the outline the
 * polygon draws, so the property that actually matters is not "these are the
 * right numbers" but "every point is also a point of the outline". A highlight
 * that is a pixel off its own edge reads as a rendering fault, and it is the
 * kind of drift a later change to the clamp would reintroduce silently.
 */
function outlineHas(
  outline: [number, number][],
  point: [number, number]
): boolean {
  return outline.some(([x, y]) => x === point[0] && y === point[1]);
}

describe("cutCornerTopEdge", () => {
  it("is a plain two-point line when no top corner is cut", () => {
    expect(cutCornerTopEdge(100, 60, 14, ["bottomRight"])).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it("follows the diagonal on a topRight cut", () => {
    expect(cutCornerTopEdge(100, 60, 14, ["topRight"])).toEqual([
      [0, 0],
      [86, 0],
      [100, 14],
    ]);
  });

  it("comes in from below on a topLeft cut", () => {
    expect(cutCornerTopEdge(100, 60, 14, ["topLeft"])).toEqual([
      [0, 14],
      [14, 0],
      [100, 0],
    ]);
  });

  it("covers both diagonals when both top corners are cut", () => {
    expect(cutCornerTopEdge(100, 60, 14, ["topLeft", "topRight"])).toEqual([
      [0, 14],
      [14, 0],
      [86, 0],
      [100, 14],
    ]);
  });

  it("ignores a cut on the bottom corners", () => {
    expect(cutCornerTopEdge(100, 60, 14, ["bottomLeft", "bottomRight"])).toEqual(
      [
        [0, 0],
        [100, 0],
      ]
    );
  });

  it("walks left to right", () => {
    const xs = cutCornerTopEdge(100, 60, 14, ["topLeft", "topRight"]).map(
      ([x]) => x
    );
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe("cutCornerBottomEdge", () => {
  it("is a plain two-point line when no bottom corner is cut", () => {
    expect(cutCornerBottomEdge(100, 60, 14, ["topRight"])).toEqual([
      [0, 60],
      [100, 60],
    ]);
  });

  it("follows the diagonal on a bottomRight cut", () => {
    expect(cutCornerBottomEdge(100, 60, 14, ["bottomRight"])).toEqual([
      [0, 60],
      [86, 60],
      [100, 46],
    ]);
  });

  it("comes in from above on a bottomLeft cut", () => {
    expect(cutCornerBottomEdge(100, 60, 14, ["bottomLeft"])).toEqual([
      [0, 46],
      [14, 60],
      [100, 60],
    ]);
  });

  it("walks left to right", () => {
    const xs = cutCornerBottomEdge(100, 60, 14, [
      "bottomLeft",
      "bottomRight",
    ]).map(([x]) => x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe("edges sit exactly on the outline", () => {
  const cases: { corners: Parameters<typeof cutCornerPoints>[3] }[] = [
    { corners: ["topRight"] },
    { corners: ["topLeft"] },
    { corners: ["bottomRight"] },
    { corners: ["bottomLeft"] },
    { corners: ["topLeft", "topRight"] },
    { corners: ["topLeft", "topRight", "bottomRight", "bottomLeft"] },
  ];

  it.each(cases)("every top-edge point is an outline point (%j)", ({ corners }) => {
    const outline = cutCornerPoints(120, 80, 14, corners, 0.5);
    for (const point of cutCornerTopEdge(120, 80, 14, corners, 0.5)) {
      expect(outlineHas(outline, point)).toBe(true);
    }
  });

  it.each(cases)(
    "every bottom-edge point is an outline point (%j)",
    ({ corners }) => {
      const outline = cutCornerPoints(120, 80, 14, corners, 0.5);
      for (const point of cutCornerBottomEdge(120, 80, 14, corners, 0.5)) {
        expect(outlineHas(outline, point)).toBe(true);
      }
    }
  );

  /**
   * The clamp is the piece most likely to drift, because it is the only place
   * the three functions do arithmetic rather than assembling known corners.
   */
  it("clamps in step with the outline on an element smaller than the cut", () => {
    const corners: Parameters<typeof cutCornerPoints>[3] = ["topRight"];
    const outline = cutCornerPoints(20, 16, 14, corners);
    for (const point of cutCornerTopEdge(20, 16, 14, corners)) {
      expect(outlineHas(outline, point)).toBe(true);
    }
  });

  it("degenerates to a plain rectangle edge when the cut is zero", () => {
    expect(cutCornerTopEdge(100, 60, 0, ["topRight"])).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(cutCornerBottomEdge(100, 60, 0, ["bottomLeft"])).toEqual([
      [0, 60],
      [100, 60],
    ]);
  });
});
