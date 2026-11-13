import { describe, expect, it } from "vitest";
import { ACTIVITY_KINDS, activitiesOf, boardActivity, byDay, climbingDays, offBoardActivity, type Activity } from "./activity";
import { adjustedGrade, type OutsideLog } from "./outside";
import type { LogEntry } from "./types";

/** The tests use a board's own difficulty as its shared grade, which is all they need. */
const raw = (e: LogEntry) => e.difficulty;
const send = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: "l1", provider: "tension", climbUuid: "C1", climbName: "Pizza Box", angle: 40, isMirror: false, bidCount: 2, quality: 3, difficulty: 30, comment: "", climbedAt: "2026-11-03 18:00:00", isSend: true, ...over,
});
const gym = (over: Partial<OutsideLog> = {}): OutsideLog => ({
  id: "o1", setting: "gym", name: "", venue: "Adventure Rock", link: "", wall: "overhang", gradeSystem: "v", gradeLabel: "V3", grade: 30, result: "send", attempts: 1, tags: [], note: "", climbedAt: "2026-11-02 09:00:00", ...over,
});
const training = (day: string): Activity => ({
  id: `training:${day}`, kind: "training", at: `${day} 07:00:00`, day, title: "Max hangs", ref: null,
  facts: { discipline: "training", send: false, tries: 3, grade: null, effort: null, fingerIntense: true },
});

describe("board entries as activities", () => {
  it("carries the send's grade and tries, and no grade for attempts only", () => {
    const a = boardActivity(send(), raw);
    expect(a).toMatchObject({ id: "board:l1", kind: "board", day: "2026-11-03", title: "Pizza Box" });
    expect(a.facts).toMatchObject({ discipline: "boulder", send: true, tries: 2, grade: 30, fingerIntense: false });
    const attempts = boardActivity(send({ id: "l2", isSend: false, bidCount: 5, difficulty: 0 }), raw);
    expect(attempts.facts).toMatchObject({ send: false, tries: 5, grade: null });
  });
  it("never reports fewer than one try", () => {
    expect(boardActivity(send({ bidCount: 0 }), raw).facts.tries).toBe(1);
  });
});

describe("gym and outdoor climbs as activities", () => {
  it("uses the grade the stats use, with the gym or outdoor offset applied", () => {
    const l = gym({ setting: "outdoor", grade: 30 });
    expect(offBoardActivity(l).facts.grade).toBe(adjustedGrade(l));
    expect(offBoardActivity(l).facts.grade).not.toBe(30);
  });
  it("titles an unnamed climb by its setting and wall, and leaves an ungraded or attempts-only one without a grade", () => {
    expect(offBoardActivity(gym()).title).toBe("Gym overhang");
    expect(offBoardActivity(gym({ name: "Red crimpy" })).title).toBe("Red crimpy");
    expect(offBoardActivity(gym({ gradeLabel: null, gradeSystem: null, grade: null })).facts.grade).toBeNull();
    const tried = offBoardActivity(gym({ result: "attempt", attempts: 4 }));
    expect(tried.facts).toMatchObject({ send: false, tries: 4, grade: null });
  });
});

describe("the combined list", () => {
  it("puts every kind in one list, newest first, with unique ids", () => {
    const list = activitiesOf({ gradeOf: raw, board: [send()], offBoard: [gym()], extra: [training("2026-11-04")] });
    expect(list.map((a) => a.kind)).toEqual(["training", "board", "offBoard"]);
    expect(new Set(list.map((a) => a.id)).size).toBe(3);
  });
  it("keeps two entries of different kinds that share an id apart", () => {
    const list = activitiesOf({ gradeOf: raw, board: [send({ id: "x" })], offBoard: [gym({ id: "x" })] });
    expect(list.map((a) => a.id).sort()).toEqual(["board:x", "offBoard:x"]);
  });
  it("groups by local day", () => {
    const map = byDay(activitiesOf({ gradeOf: raw, board: [send(), send({ id: "l2", climbedAt: "2026-11-03 09:00:00" })], offBoard: [gym()] }));
    expect([...map.keys()].sort()).toEqual(["2026-11-02", "2026-11-03"]);
    expect(map.get("2026-11-03")).toHaveLength(2);
  });
});

describe("climbing days", () => {
  it("counts a training-only day as a climbing day", () => {
    const days = climbingDays(activitiesOf({ gradeOf: raw, board: [send()], extra: [training("2026-11-04"), training("2026-11-04")] }));
    expect(days).toEqual(["2026-11-03", "2026-11-04"]);
  });
  it("lists each day once, ascending", () => {
    const days = climbingDays(activitiesOf({ gradeOf: raw, board: [send({ id: "a", climbedAt: "2026-11-05 10:00:00" }), send({ id: "b", climbedAt: "2026-11-01 10:00:00" }), send({ id: "c", climbedAt: "2026-11-05 20:00:00" })] }));
    expect(days).toEqual(["2026-11-01", "2026-11-05"]);
  });
  it("knows that every kind counts towards a streak", () => {
    expect(Object.values(ACTIVITY_KINDS).every((k) => k.countsTowardStreak)).toBe(true);
  });
});
