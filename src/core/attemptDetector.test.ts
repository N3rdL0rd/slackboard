import { describe, expect, it } from "vitest";
import { DEFAULT_DETECTOR, activityScores, compareToLabels, detectAttempts, labelledAttempts, smoothScores } from "./attemptDetector";
import type { MotionRow } from "./wear";
import type { SessionLabel } from "./watchData";

const row = (sec: number, acc: number | null, gyro: number | null = 0): MotionRow => ({ at: sec * 1000, accRms: acc, accMax: acc, gyroRms: gyro, gyroMax: gyro, pressure: null, gx: null, gy: null, gz: null });
/** A quiet minute with two bursts of climbing: seconds 20 to 39 and 80 to 99. */
const session = (): MotionRow[] => Array.from({ length: 120 }, (_, s) => row(s, (s >= 20 && s < 40) || (s >= 80 && s < 100) ? 4 : 0.2, 0.1));
const label = (id: string, sec: number, kind: SessionLabel["kind"]): SessionLabel => ({ id, session: "s", at: sec * 1000, kind, note: "" });

describe("activity score", () => {
  it("adds weighted rotation to acceleration, and skips a second with no reading at all", () => {
    expect(activityScores([row(0, 2, 1), row(1, null, null), row(2, null, 0.5)], 2)).toEqual([{ at: 0, score: 4 }, { at: 2000, score: 1 }]);
  });

  it("is smoothed by the mean of the points around it", () => {
    const sm = smoothScores([0, 0, 6, 0, 0].map((score, i) => ({ at: i * 1000, score })), 2);
    expect(sm.map((p) => p.score)).toEqual([0, 2, 2, 2, 0]);
  });
});

describe("detecting attempts", () => {
  it("finds each burst and none of the quiet between", () => {
    const d = detectAttempts(session(), DEFAULT_DETECTOR);
    expect(d).toHaveLength(2);
    expect(d[0].start).toBeGreaterThanOrEqual(18_000);
    expect(d[0].start).toBeLessThanOrEqual(22_000);
    expect(d[1].end).toBeGreaterThanOrEqual(97_000);
  });

  it("merges bursts closer together than the merge gap, and drops a burst that is too short", () => {
    expect(detectAttempts(session(), { ...DEFAULT_DETECTOR, mergeGapSec: 60 })).toHaveLength(1);
    expect(detectAttempts(session(), { ...DEFAULT_DETECTOR, minSec: 60 })).toHaveLength(0);
    const blip = Array.from({ length: 60 }, (_, s) => row(s, s === 30 ? 9 : 0.1, 0));
    expect(detectAttempts(blip, { ...DEFAULT_DETECTOR, smoothSec: 1, minSec: 3 })).toHaveLength(0);
  });

  it("finds nothing in a quiet session, and nothing without data", () => {
    expect(detectAttempts(Array.from({ length: 60 }, (_, s) => row(s, 0.1)), DEFAULT_DETECTOR)).toEqual([]);
    expect(detectAttempts([], DEFAULT_DETECTOR)).toEqual([]);
  });

  it("ends a burst at a hole in the data instead of bridging it", () => {
    const rows = [...Array.from({ length: 12 }, (_, s) => row(s, 4)), ...Array.from({ length: 12 }, (_, s) => row(s + 40, 4))];
    expect(detectAttempts(rows, { ...DEFAULT_DETECTOR, smoothSec: 1, mergeGapSec: 0 })).toHaveLength(2);
  });
});

describe("labelled attempts and the comparison", () => {
  it("pairs each start with the next end, and ignores strays", () => {
    const t = labelledAttempts([label("1", 5, "attempt-end"), label("2", 20, "attempt-start"), label("3", 40, "attempt-end"), label("4", 80, "attempt-start"), label("5", 85, "fall")]);
    expect(t).toEqual([{ start: 20_000, end: 40_000 }]);
  });

  it("counts matched, missed and extra, with recall and precision", () => {
    const truth = [{ start: 20_000, end: 40_000 }, { start: 80_000, end: 100_000 }, { start: 150_000, end: 160_000 }];
    const found = [{ start: 21_000, end: 39_000 }, { start: 85_000, end: 99_000 }, { start: 300_000, end: 310_000 }];
    const c = compareToLabels(found, truth);
    expect(c).toMatchObject({ matched: 2, missed: 1, extra: 1 });
    expect(c.recall).toBeCloseTo(2 / 3);
    expect(c.precision).toBeCloseTo(2 / 3);
  });

  it("matches one labelled attempt to only one detection, and reports null where there is nothing to divide", () => {
    const c = compareToLabels([{ start: 0, end: 10_000 }, { start: 1000, end: 9000 }], [{ start: 0, end: 10_000 }]);
    expect(c).toMatchObject({ matched: 1, extra: 1, missed: 0 });
    expect(compareToLabels([], [])).toMatchObject({ recall: null, precision: null });
  });
});
