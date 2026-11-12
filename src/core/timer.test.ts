import { describe, expect, it } from "vitest";
import { buildSchedule, countdown, formatClock, startOf, stateAt, type TimerConfig } from "./timer";

const cfg: TimerConfig = { prepSec: 5, workSec: 7, restSec: 3, reps: 3, sets: 2, setRestSec: 60 };

describe("buildSchedule", () => {
  it("puts rest between reps but not after the last rep, and a set rest between sets", () => {
    const kinds = buildSchedule(cfg).map((s) => s.kind);
    expect(kinds).toEqual(["prep", "work", "rest", "work", "rest", "work", "setrest", "work", "rest", "work", "rest", "work"]);
  });
  it("numbers reps and sets from one", () => {
    const work = buildSchedule(cfg).filter((s) => s.kind === "work").map((s) => `${s.set}.${s.rep}`);
    expect(work).toEqual(["1.1", "1.2", "1.3", "2.1", "2.2", "2.3"]);
  });
  it("skips zero-length segments", () => {
    expect(buildSchedule({ ...cfg, prepSec: 0, setRestSec: 0, sets: 2 }).map((s) => s.kind)).not.toContain("prep");
    expect(buildSchedule({ ...cfg, prepSec: 0, setRestSec: 0, sets: 2 }).map((s) => s.kind)).not.toContain("setrest");
  });
  it("clamps reps and sets to at least one", () => {
    expect(buildSchedule({ ...cfg, reps: 0, sets: 0, prepSec: 0 }).map((s) => s.kind)).toEqual(["work"]);
  });
});

describe("stateAt", () => {
  const sched = buildSchedule(cfg);
  it("finds the running segment and what is left in it", () => {
    expect(stateAt(sched, 0)).toMatchObject({ index: 0, remainingMs: 5000, done: false });
    expect(stateAt(sched, 5000)).toMatchObject({ index: 1, remainingMs: 7000 });
    expect(stateAt(sched, 5000 + 7000 + 1000)).toMatchObject({ index: 2, remainingMs: 2000 });
  });
  it("is done at and after the end, with elapsed capped at the total", () => {
    const total = sched.reduce((n, s) => n + s.sec * 1000, 0);
    expect(stateAt(sched, total)).toMatchObject({ done: true, segment: null, elapsedMs: total });
    expect(stateAt(sched, total + 9999).elapsedMs).toBe(total);
  });
  it("skip targets line up with segment starts", () => {
    expect(stateAt(sched, startOf(sched, 3)).index).toBe(3);
  });
});

describe("formatClock", () => {
  it("rounds up so a clock never shows 0:00 while time remains", () => {
    expect(formatClock(100)).toBe("0:01");
    expect(formatClock(60_000)).toBe("1:00");
    expect(formatClock(179_001)).toBe("3:00");
    expect(formatClock(0)).toBe("0:00");
  });
  it("countdown is one rest segment", () => {
    expect(stateAt(countdown(90), 30_000).remainingMs).toBe(60_000);
  });
});
