import { describe, expect, it } from "vitest";
import { bucketSeries, nearestPoint, panRange, valueRange, zoomRange } from "./chartData";

const pts = (vs: number[]) => vs.map((v, i) => ({ at: i * 1000, v }));

describe("thinning a series for drawing", () => {
  it("keeps every point when they fit, and only those inside the range", () => {
    expect(bucketSeries(pts([1, 2, 3, 4]), 1000, 2000, 10).map((p) => p.v)).toEqual([2, 3]);
    expect(bucketSeries(pts([1, 2]), 5, 5, 10)).toEqual([]);
  });

  it("keeps the lowest and highest of a crowded column, so a spike survives", () => {
    const vs = Array.from({ length: 1000 }, (_, i) => (i === 500 ? 99 : i === 700 ? -50 : 5));
    const out = bucketSeries(pts(vs), 0, 999_000, 10);
    expect(out.length).toBeLessThan(40);
    expect(out.some((p) => p.v === 99)).toBe(true);
    expect(out.some((p) => p.v === -50)).toBe(true);
    expect(out.map((p) => p.at)).toEqual([...out.map((p) => p.at)].sort((a, b) => a - b));
  });
});

describe("chart helpers", () => {
  it("finds the nearest point in time, and null for none", () => {
    expect(nearestPoint(pts([1, 2, 3]), 1400)?.v).toBe(2);
    expect(nearestPoint([], 5)).toBeNull();
  });

  it("pads a range a little, and gives a flat series room", () => {
    const r = valueRange(pts([0, 10]), 0, 1000);
    expect(r.lo).toBeCloseTo(-0.8);
    expect(r.hi).toBeCloseTo(10.8);
    expect(valueRange(pts([4, 4, 4]), 0, 2000)).toEqual({ lo: 3, hi: 5 });
    expect(valueRange([], 0, 1)).toEqual({ lo: 0, hi: 1 });
  });
});

describe("zooming and panning a chart", () => {
  const full = { from: 0, to: 600_000 };

  it("zooms about a point, keeping that point where it was, and stays inside the whole range", () => {
    const z = zoomRange(full, full, 0.5, 300_000);
    expect(z).toEqual({ from: 150_000, to: 450_000 });
    expect(zoomRange(z, full, 2, 300_000)).toEqual(full);
    expect(zoomRange(full, full, 2)).toEqual(full);
  });

  it("will not zoom in past a few seconds, or out past the whole session", () => {
    let v = full;
    for (let i = 0; i < 30; i++) v = zoomRange(v, full, 0.5);
    expect(v.to - v.from).toBe(5000);
    expect(zoomRange(full, full, 10)).toEqual(full);
  });

  it("pans by a share of the width and stops at the ends", () => {
    const v = { from: 100_000, to: 200_000 };
    expect(panRange(v, full, 0.5)).toEqual({ from: 150_000, to: 250_000 });
    expect(panRange(v, full, -5)).toEqual({ from: 0, to: 100_000 });
    expect(panRange(v, full, 100)).toEqual({ from: 500_000, to: 600_000 });
  });
});
