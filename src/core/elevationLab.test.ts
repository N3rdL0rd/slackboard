import { describe, expect, it } from "vitest";
import { agreement, altitudeFromPressure, gainIn, pressureHeights, relativeElevation, smoothHeights } from "./elevationLab";
import type { MotionRow } from "./wear";

const prow = (sec: number, pressure: number | null): MotionRow => ({ at: sec * 1000, accRms: null, accMax: null, gyroRms: null, gyroMax: null, pressure, gx: null, gy: null, gz: null });

describe("height from pressure", () => {
  it("is about 8 to 9 metres per hectopascal near sea level, and zero at the reference", () => {
    expect(altitudeFromPressure(1013.25, 1013.25)).toBe(0);
    expect(altitudeFromPressure(1012.25, 1013.25)).toBeGreaterThan(8);
    expect(altitudeFromPressure(1012.25, 1013.25)).toBeLessThan(9);
    expect(altitudeFromPressure(1014.25, 1013.25)).toBeLessThan(0);
  });

  it("is relative to the first seconds of the session, and skips seconds with no reading", () => {
    const pts = pressureHeights([prow(0, 1010), prow(1, null), prow(2, 1010), prow(3, 1009)], 2);
    expect(pts).toHaveLength(3);
    expect(pts[0].m).toBeCloseTo(0);
    expect(pts[2].m).toBeGreaterThan(8);
    expect(pressureHeights([prow(0, null)])).toEqual([]);
  });
});

describe("the watch's elevation", () => {
  it("is relative to the mean of its first samples", () => {
    const pts = relativeElevation([{ at: 3000, metres: 105 }, { at: 1000, metres: 100 }, { at: 2000, metres: 100 }], 2);
    expect(pts.map((p) => p.m)).toEqual([0, 0, 5]);
  });
});

describe("smoothing and gain", () => {
  const spike = [0, 0, 10, 0, 0].map((m, i) => ({ at: i * 1000, m }));

  it("a median removes a single wild reading that a mean only spreads", () => {
    expect(smoothHeights(spike, 2, "median").map((p) => p.m)).toEqual([0, 0, 0, 0, 0]);
    expect(smoothHeights(spike, 2, "mean")[2].m).toBeCloseTo(10 / 3);
    expect(smoothHeights(spike, 2, "none")).toBe(spike);
  });

  it("gain is the net change and the range between two times, and null with under two points", () => {
    const pts = [0, 2, 5, 3, 4].map((m, i) => ({ at: i * 1000, m }));
    expect(gainIn(pts, 0, 4000)).toEqual({ net: 4, range: 5, points: 5 });
    expect(gainIn(pts, 1000, 3000)).toEqual({ net: 1, range: 3, points: 3 });
    expect(gainIn(pts, 0, 500)).toBeNull();
  });
});

describe("agreement of two sources", () => {
  const line = (f: (i: number) => number) => Array.from({ length: 60 }, (_, i) => ({ at: i * 1000, m: f(i) }));

  it("is a correlation of one and no difference for the same height, and shows an offset as a difference but not a drift", () => {
    const a = line((i) => Math.sin(i / 5) * 3);
    expect(agreement(a, a)).toMatchObject({ correlation: expect.closeTo(1, 6), rmsDiff: 0, drift: 0, seconds: 60 });
    const off = agreement(a, line((i) => Math.sin(i / 5) * 3 + 2));
    expect(off.rmsDiff).toBeCloseTo(2);
    expect(off.drift).toBeCloseTo(0);
  });

  it("shows one source creeping away from the other as drift", () => {
    const a = line(() => 0);
    const b = line((i) => i * 0.1);
    const ag = agreement(b, a);
    expect(ag.drift).toBeGreaterThan(4);
    expect(agreement(a, b).drift).toBeLessThan(-4);
  });

  it("says nothing with almost no shared seconds", () => {
    expect(agreement([{ at: 0, m: 1 }], [{ at: 0, m: 1 }])).toMatchObject({ correlation: null, seconds: 1 });
  });
});
