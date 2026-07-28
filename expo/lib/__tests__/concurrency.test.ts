import { describe, expect, it } from "bun:test";
import { mapWithConcurrency } from "../concurrency";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    // Reverse the delays so the last item finishes first.
    const items = [40, 30, 20, 10];
    const results = await mapWithConcurrency(items, 4, async (ms) => {
      await tick(ms);
      return ms;
    });
    expect(results).toEqual([40, 30, 20, 10]);
  });

  it("never exceeds the limit — the whole point of the helper", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([...Array(9).keys()], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(5);
      inFlight--;
      return n;
    });

    expect(peak).toBe(3);
  });

  it("still processes every item once the window frees up", async () => {
    const seen: number[] = [];
    const results = await mapWithConcurrency([...Array(9).keys()], 3, async (n) => {
      await tick(1);
      seen.push(n);
      return n * 2;
    });

    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16]);
  });

  it("handles an empty list without hanging", async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
  });

  it("treats a limit above the item count as 'all of them'", async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2], 10, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick(2);
      inFlight--;
      return n;
    });
    expect(peak).toBe(2);
  });

  it("coerces a nonsense limit to one runner rather than spinning zero", async () => {
    const results = await mapWithConcurrency([1, 2, 3], 0, async (n) => n + 1);
    expect(results).toEqual([2, 3, 4]);
  });

  it("propagates a rejection like Promise.all does", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});
