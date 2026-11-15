import { beforeEach, describe, expect, it } from "vitest";
import { cmBetween, formatLength, parseBoardScale, scaleFromMeasurement, unitsBetween, type BoardScale } from "./boardScale";
import { deleteBoardScale, loadBoardScales, saveBoardScale } from "./boardScaleLocal";
import type { Db } from "./db";
import { clearLocalData, ensureLocalSchema } from "./logicalCircuits";
import { estimateMoves } from "./moveEstimate";
import { openNodeDb } from "./nodeDb";

const scale = (over: Partial<BoardScale> = {}): BoardScale => ({ board: "tension-11-8", cmPerUnit: 1.2, refA: "100", refB: "200", refCm: 120, measuredAt: "2026-11-15 10:00:00", ...over });

describe("board scale", () => {
  it("is the measured distance over the distance in board units", () => {
    expect(scaleFromMeasurement({ x: 0, y: 0 }, { x: 0, y: 100 }, 120)).toBeCloseTo(1.2);
    expect(scaleFromMeasurement({ x: 0, y: 0 }, { x: 30, y: 40 }, 100)).toBeCloseTo(2);
    expect(unitsBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(cmBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 2)).toBe(10);
  });

  it("is refused for the same hold twice, a tiny or huge distance, and a scale no board could have", () => {
    expect(scaleFromMeasurement({ x: 5, y: 5 }, { x: 5, y: 5 }, 100)).toBeNull();
    expect(scaleFromMeasurement({ x: 0, y: 0 }, { x: 0, y: 100 }, 3)).toBeNull();
    expect(scaleFromMeasurement({ x: 0, y: 0 }, { x: 0, y: 100 }, 900)).toBeNull();
    expect(scaleFromMeasurement({ x: 0, y: 0 }, { x: 0, y: 5000 }, 100)).toBeNull();
    expect(scaleFromMeasurement({ x: 0, y: 0 }, { x: 0, y: 100 }, Number.NaN)).toBeNull();
  });

  it("is written in centimetres and metres, or in inches and feet", () => {
    expect(formatLength(47.4, "m")).toBe("47 cm");
    expect(formatLength(130, "m")).toBe("1.3 m");
    expect(formatLength(45.7, "ft")).toBe("18 in");
    expect(formatLength(127, "ft")).toBe("4 ft 2 in");
  });

  it("reads back from a record, and refuses a damaged one", () => {
    expect(parseBoardScale(scale())).toEqual(scale());
    expect(parseBoardScale({ ...scale(), cmPerUnit: 0 })).toBeNull();
    expect(parseBoardScale({ ...scale(), refA: "" })).toBeNull();
    expect(parseBoardScale({ ...scale(), measuredAt: "now" })).toBeNull();
    expect(parseBoardScale(null)).toBeNull();
  });
});

describe("board scale storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("keeps one scale per board, replaced by a new measurement, and survives signing out", async () => {
    await saveBoardScale(db, scale());
    await saveBoardScale(db, scale({ cmPerUnit: 1.25, refCm: 125 }));
    await saveBoardScale(db, scale({ board: "moonboard-1-1", cmPerUnit: 2 }));
    await clearLocalData(db);
    expect((await loadBoardScales(db)).map((s) => `${s.board}:${s.cmPerUnit}`)).toEqual(["moonboard-1-1:2", "tension-11-8:1.25"]);
    await deleteBoardScale(db, "moonboard-1-1");
    expect(await loadBoardScales(db)).toHaveLength(1);
  });
});

describe("move estimate", () => {
  const h = (x: number, y: number, role: string) => ({ x, y, role });

  it("counts the hand holds after the start, and measures the path up the board", () => {
    const e = estimateMoves([h(0, 0, "start"), h(10, 0, "start"), h(0, 30, "middle"), h(0, 100, "middle"), h(10, 130, "finish"), h(5, -20, "foot")])!;
    expect(e.handHolds).toBe(5);
    expect(e.moves).toBe(3);
    expect(e.longestUnits).toBe(70);
    expect(e.pathUnits).toBeCloseTo(70 + 2 * Math.hypot(10, 30));
  });

  it("leaves feet out, treats a climb without a marked start as starting from its lowest hold, and says nothing for no hands", () => {
    expect(estimateMoves([h(0, 0, "middle"), h(0, 20, "finish")])!.moves).toBe(1);
    expect(estimateMoves([h(0, 0, "foot")])).toBeNull();
    expect(estimateMoves([])).toBeNull();
    expect(estimateMoves([h(0, 0, "start")])!.moves).toBe(0);
  });
});
