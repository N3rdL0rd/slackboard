import { describe, expect, it } from "vitest";
import { weekStart } from "./days";
import { angleTable, atAngle, overview } from "./stats";
import type { LogEntry } from "./types";

const e = (over: Partial<LogEntry>): LogEntry => ({ id: Math.random().toString(), provider: "tension", climbUuid: "c" + Math.random(), climbName: "x", angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty: 14, comment: "", climbedAt: "2026-10-28 18:00:00", isSend: true, ...over });
/** Stand-in for a provider's table: difficulty 10 is V0, every 2 steps one V grade, so grades on the shared scale are (d - 10) / 2. */
const v = (x: LogEntry) => (x.difficulty - 10) / 2;
const NOW = new Date(2026, 9, 31, 12); // Sat 31 Oct 2026

describe("weekStart", () => {
  it("is the Monday at local midnight", () => {
    expect(weekStart(new Date(2026, 9, 31, 12))).toEqual(new Date(2026, 9, 26));
    expect(weekStart(new Date(2026, 9, 26, 0, 1))).toEqual(new Date(2026, 9, 26));
    expect(weekStart(new Date(2026, 9, 25, 23, 59))).toEqual(new Date(2026, 9, 19)); // Sunday belongs to the week before
  });
});

describe("overview", () => {
  it("counts sends, tries, sessions, flash rate and the hardest send", () => {
    const o = overview([
      e({ climbName: "a", difficulty: 14, bidCount: 1, climbedAt: "2026-10-28 18:00:00" }),
      e({ climbName: "b", difficulty: 20, bidCount: 3, climbedAt: "2026-10-28 18:30:00" }),
      e({ climbName: "c", isSend: false, bidCount: 4, difficulty: 0, climbedAt: "2026-10-29 10:00:00" }),
    ], NOW, v);
    expect(o.sends).toBe(2);
    expect(o.attempts).toBe(8);
    expect(o.sessions).toBe(2);
    expect(o.flashRate).toBe(0.5);
    expect(o.hardest?.name).toBe("b");
    expect(o.byGrade).toEqual([{ v: 2, sends: 1, flashes: 1 }, { v: 5, sends: 1, flashes: 0 }]);
  });
  it("ignores ungraded sends on grade charts but still counts them", () => {
    const o = overview([e({ difficulty: 0 })], NOW, v);
    expect(o.sends).toBe(1);
    expect(o.hardest).toBeNull();
    expect(o.byGrade).toEqual([]);
  });
  it("last 30 days excludes older entries", () => {
    const o = overview([e({ climbedAt: "2026-10-20 10:00:00" }), e({ climbedAt: "2026-08-01 10:00:00" })], NOW, v);
    expect(o.last30).toEqual({ sends: 1, sessions: 1 });
  });
  it("builds a weekly series with empty weeks for gaps", () => {
    const o = overview([e({ climbedAt: "2026-10-05 10:00:00", difficulty: 16 }), e({ climbedAt: "2026-10-28 10:00:00", difficulty: 20 })], NOW, v);
    expect(o.weeks.map((w) => w.sends)).toEqual([1, 0, 0, 1]);
    expect(o.weeks[0].best).toBe(3);
    expect(o.weeks[1].best).toBeNull();
  });
  it("working grade averages the three hardest sends in the trailing window", () => {
    const rows = [14, 16, 18, 20].map((d, i) => e({ difficulty: d, climbedAt: `2026-10-2${i} 10:00:00` }));
    const o = overview(rows, NOW, v);
    expect(o.weeks[o.weeks.length - 1].working).toBeCloseTo((5 + 4 + 3) / 3);
  });
  it("trend compares the working grade now with eight weeks earlier", () => {
    const o = overview([e({ difficulty: 14, climbedAt: "2026-08-24 10:00:00" }), e({ difficulty: 20, climbedAt: "2026-10-28 10:00:00" })], NOW, v);
    expect(o.trend).toBe(3);
    expect(overview([e({})], NOW, v).trend).toBeNull();
  });
  it("streak counts consecutive active weeks and tolerates an empty current week", () => {
    const rows = [e({ climbedAt: "2026-10-12 10:00:00" }), e({ climbedAt: "2026-10-19 10:00:00" })];
    expect(overview(rows, NOW, v).streakWeeks).toBe(2); // this week (26 Oct) is empty but not broken
    expect(overview([...rows, e({ climbedAt: "2026-10-27 10:00:00" })], NOW, v).streakWeeks).toBe(3);
    expect(overview([e({ climbedAt: "2026-09-01 10:00:00" })], NOW, v).streakWeeks).toBe(0);
  });
  it("compares grades across providers through each one's own table", () => {
    // "moon" difficulties run 1 per V grade from V0 at 100; "tension" difficulties are 2 per V from 10.
    const grade = (x: LogEntry) => (x.provider === "moon" ? x.difficulty - 100 : (x.difficulty - 10) / 2);
    const o = overview([e({ provider: "tension", difficulty: 16, climbName: "t" }), e({ provider: "moon", difficulty: 105, climbName: "m" })], NOW, grade);
    expect(o.hardest).toMatchObject({ name: "m", grade: 5, provider: "moon" });
    expect(o.byGrade).toEqual([{ v: 3, sends: 1, flashes: 1 }, { v: 5, sends: 1, flashes: 1 }]);
  });
  it("handles an empty logbook", () => {
    const o = overview([], NOW, v);
    expect(o.sends).toBe(0);
    expect(o.flashRate).toBeNull();
    expect(o.weeks).toHaveLength(1);
  });
});

describe("stats by angle", () => {
  const list = [
    e({ climbName: "a", angle: 40, difficulty: 14, bidCount: 1, climbedAt: "2026-10-28 18:00:00" }),
    e({ climbName: "b", angle: 40, difficulty: 18, bidCount: 3, climbedAt: "2026-10-28 18:30:00" }),
    e({ climbName: "c", angle: 30, difficulty: 20, bidCount: 1, climbedAt: "2026-10-29 10:00:00" }),
    e({ climbName: "d", angle: 30, isSend: false, bidCount: 2, difficulty: 0, climbedAt: "2026-10-29 10:20:00" }),
  ];

  it("all angles is the plain overview, untouched", () => {
    expect(atAngle(list, null)).toBe(list);
    expect(overview(atAngle(list, null), NOW, v)).toEqual(overview(list, NOW, v));
  });
  it("one angle counts only its own entries", () => {
    const o = overview(atAngle(list, 40), NOW, v);
    expect(o).toMatchObject({ sends: 2, attempts: 4, flashRate: 0.5 });
    expect(o.hardest?.name).toBe("b");
    expect(overview(atAngle(list, 30), NOW, v)).toMatchObject({ sends: 1, attempts: 3 });
  });
  it("counts flashes by grade", () => {
    expect(overview(list, NOW, v).byGrade).toEqual([{ v: 2, sends: 1, flashes: 1 }, { v: 4, sends: 1, flashes: 0 }, { v: 5, sends: 1, flashes: 1 }]);
  });
  it("lists each angle once, most sends first, with its own numbers", () => {
    const rows = angleTable(list, NOW, v);
    expect(rows.map((r) => r.angle)).toEqual([40, 30]);
    expect(rows[0]).toMatchObject({ sends: 2, attempts: 4, flashRate: 0.5, hardest: 4 });
    expect(rows[1]).toMatchObject({ sends: 1, attempts: 3, flashRate: 1, hardest: 5 });
  });
  it("breaks ties by angle and gives an angle with no send no grade", () => {
    const rows = angleTable([e({ angle: 50, isSend: false, difficulty: 0 }), e({ angle: 20, isSend: false, difficulty: 0 })], NOW, v);
    expect(rows.map((r) => r.angle)).toEqual([20, 50]);
    expect(rows[0]).toMatchObject({ sends: 0, flashRate: null, hardest: null, working: null });
  });
  it("is empty for an empty logbook", () => {
    expect(angleTable([], NOW, v)).toEqual([]);
  });
});
