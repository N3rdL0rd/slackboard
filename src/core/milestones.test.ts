import { describe, expect, it } from "vitest";
import { activitiesOf, ropedActivity, type Activity } from "./activity";
import { isMilestoneClose, milestoneCandidates, motivationLine, pickMilestone, toastMilestone, vOf, type Milestone, type MilestoneInput } from "./milestones";
import type { RopedLog } from "./roped";
import { streakInfo } from "./streak";
import { climbingDays } from "./activity";
import type { LogEntry } from "./types";

const shared = (e: LogEntry) => e.difficulty;
let n = 0;
/** A board send at shared grade `g` (so V4 is 4.2 and so on) on a given day. */
const send = (g: number, day: string, over: Partial<LogEntry> = {}): LogEntry => ({
  id: `s${++n}`, provider: "tension", climbUuid: `C${n}`, climbName: "Climb", angle: 40, isMirror: false, bidCount: 1, quality: 3, difficulty: g, comment: "", climbedAt: `${day} 10:00:00`, isSend: true, ...over,
});
const rope = (over: Partial<RopedLog> = {}): RopedLog => ({
  id: `r${++n}`, style: "sport", setting: "indoor", name: "", venue: "", link: "", gradeSystem: "yds", gradeLabel: "5.10c", grade: 13, result: "fell", attempts: 1, lengthM: null, pitches: 1, note: "",
  climbedAt: "2026-11-02 10:00:00", ...over,
});
const input = (board: LogEntry[], today: string, roped: RopedLog[] = []): MilestoneInput => {
  const activities = activitiesOf({ board, roped, gradeOf: shared });
  return { activities, today, streak: streakInfo(climbingDays(activities), today) };
};
const find = (m: Milestone[], kind: string) => m.find((x) => x.kind === kind);
const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => `2026-10-${String(from + i).padStart(2, "0")}`);

describe("count at a grade", () => {
  it("says how many more sends until the next target, as the spec words it", () => {
    const board = [...Array(7)].map((_, i) => send(4.2, `2026-10-${String(i + 1).padStart(2, "0")}`));
    const m = find(milestoneCandidates(input(board, "2026-11-02")), "countAtGrade")!;
    expect(m).toMatchObject({ text: "3 more V4s until you have 10", current: 7, target: 10, grade: 4 });
    expect(m.why).toBe("You have 7 V4 sends on boards, and the next milestone is 10.");
    expect(m.progress).toBeCloseTo(0.7);
  });

  it("says 'V4' not 'V4s' for the last one, and reads the V grade from the whole number", () => {
    const board = [...Array(9)].map((_, i) => send(4.9, `2026-10-${String(i + 1).padStart(2, "0")}`));
    expect(find(milestoneCandidates(input(board, "2026-11-02")), "countAtGrade")!.text).toBe("1 more V4 until you have 10");
    expect(vOf(4.9999999999)).toBe(5);
    expect(vOf(3.5)).toBe(3);
  });

  it("is quiet for a grade with fewer than three sends, and ignores attempts, off-board and roped entries", () => {
    const board = [send(4.2, "2026-10-01"), send(4.2, "2026-10-02"), send(4.2, "2026-10-03", { isSend: false, difficulty: 0 })];
    expect(find(milestoneCandidates(input(board, "2026-11-02")), "countAtGrade")).toBeUndefined();
  });
});

describe("closeness", () => {
  const m = (current: number, target: number): Milestone => ({ id: "x", kind: "sendCount", text: "", current, target, progress: current / target, why: "" });
  it("needs at most five to go or at least 70% there, and something still to do", () => {
    expect(isMilestoneClose(m(95, 100))).toBe(true);
    expect(isMilestoneClose(m(70, 100))).toBe(true);
    expect(isMilestoneClose(m(69, 100))).toBe(false);
    expect(isMilestoneClose(m(5, 10))).toBe(true);
    expect(isMilestoneClose(m(100, 100))).toBe(false);
  });
});

describe("totals, streaks, weeks and months", () => {
  it("counts boulder sends to the next round number", () => {
    const board = [...Array(95)].map((_, i) => send(1.2 + (i % 3), `2026-0${1 + (i % 9)}-1${i % 9}`));
    expect(find(milestoneCandidates(input(board, "2026-11-02")), "sendCount")).toMatchObject({ text: "5 sends to reach 100", current: 95, target: 100 });
  });

  it("closes in on the longest streak", () => {
    // A 5-day chain long ago, then 3 days in a row ending today.
    const board = [...days(1, 5), "2026-10-20", "2026-10-21", "2026-10-22"].map((d) => send(1.2, d));
    const x = input(board, "2026-10-22");
    expect(x.streak).toMatchObject({ current: 3, longest: 5 });
    expect(find(milestoneCandidates(x), "streak")).toMatchObject({ text: "3 more climbing days to beat your longest streak", current: 3, target: 6 });
  });

  it("compares this week with the best week, in days climbed", () => {
    // Best week: Mon 5 Oct to Sun 11 Oct, four days. This week (from Mon 2 Nov): two days.
    const board = ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-10", "2026-11-02", "2026-11-03"].map((d) => send(1.2, d));
    expect(find(milestoneCandidates(input(board, "2026-11-04")), "week")).toMatchObject({ text: "2 more days this week to match your best week", current: 2, target: 4 });
  });

  it("compares this month's sends with the best month", () => {
    const oct = [...Array(12)].map((_, i) => send(1.2, `2026-10-${String(i + 1).padStart(2, "0")}`));
    const nov = [...Array(9)].map((_, i) => send(1.2, `2026-11-0${i + 1}`));
    expect(find(milestoneCandidates(input([...oct, ...nov], "2026-11-09")), "month")).toMatchObject({ text: "You're 3 sends from your best month", current: 9, target: 12 });
  });

  it("offers nothing about a best week or month that is the current one", () => {
    // Four days in this week only (Mon 9 Nov to Thu 12 Nov), nothing earlier: nothing to beat.
    const nov = [...Array(4)].map((_, i) => send(1.2, `2026-11-${String(i + 9).padStart(2, "0")}`));
    const c = milestoneCandidates(input(nov, "2026-11-12"));
    expect(find(c, "week")).toBeUndefined();
    expect(find(c, "month")).toBeUndefined();
  });
});

describe("a new hardest grade and a first roped redpoint", () => {
  it("offers the next grade up once the hardest has been sent three times", () => {
    const board = [...Array(4)].map((_, i) => send(5.2, `2026-10-0${i + 1}`));
    expect(find(milestoneCandidates(input(board, "2026-11-02")), "newGrade")).toMatchObject({ grade: 6, text: "A first V6 would be a new hardest for you", current: 4, target: 5 });
    expect(find(milestoneCandidates(input(board.slice(0, 2), "2026-11-02")), "newGrade")).toBeUndefined();
  });

  it("mentions a first roped redpoint only for someone who logs roped climbs and has none", () => {
    const climbs = [rope(), rope(), rope()];
    expect(find(milestoneCandidates(input([], "2026-11-02", climbs)), "ropedFirst")?.text).toBe("Log a first roped redpoint");
    expect(find(milestoneCandidates(input([], "2026-11-02", climbs.slice(0, 2))), "ropedFirst")).toBeUndefined();
    expect(find(milestoneCandidates(input([], "2026-11-02", [...climbs, rope({ result: "redpoint" })])), "ropedFirst")).toBeUndefined();
  });
});

describe("which one is shown", () => {
  const cand = (id: string, current: number, target: number, over: Partial<Milestone> = {}): Milestone => ({ id, kind: "sendCount", text: id, current, target, progress: current / target, why: "", ...over });

  it("shows nothing when nothing is close", () => {
    expect(pickMilestone([cand("a", 1, 100)], "2026-11-02")).toBeNull();
    expect(pickMilestone([], "2026-11-02")).toBeNull();
  });

  it("puts the grade just logged first", () => {
    const list = [cand("near", 99, 100), cand("v4", 7, 10, { kind: "countAtGrade", grade: 4 })];
    expect(pickMilestone(list, "2026-11-02", 4)?.id).toBe("v4");
    expect(pickMilestone(list, "2026-11-02", 3)?.id).not.toBeUndefined();
  });

  it("gives the same answer all day and rotates among the closest few across days", () => {
    const list = [cand("a", 99, 100), cand("b", 98, 100), cand("c", 97, 100), cand("d", 70, 100)];
    expect(pickMilestone(list, "2026-11-02")?.id).toBe(pickMilestone([...list].reverse(), "2026-11-02")?.id);
    const seen = new Set(Array.from({ length: 30 }, (_, i) => pickMilestone(list, `2026-11-${String(i + 1).padStart(2, "0")}`)?.id));
    expect([...seen].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("the line and the toast", () => {
  const board = [...Array(7)].map((_, i) => send(4.2, `2026-10-0${i + 1}`));

  it("says nothing until enough has been logged", () => {
    expect(motivationLine(input(board.slice(0, 4), "2026-11-02"))).toBeNull();
    expect(motivationLine(input(board, "2026-11-02"))).not.toBeNull();
  });

  it("gives the toast for the grade just logged, only when its milestone is close", () => {
    expect(toastMilestone(input(board, "2026-11-02"), 4)?.text).toBe("3 more V4s until you have 10");
    expect(toastMilestone(input(board, "2026-11-02"), 5)).toBeNull();
    expect(toastMilestone(input(board.slice(0, 4), "2026-11-02"), 4)).toBeNull();
    // Three V4 sends aim at 5 (two to go), with two easier sends so there is enough logged to say anything.
    const three = [...Array(3)].map((_, i) => send(4.2, `2026-10-0${i + 1}`));
    const easy = [send(1.2, "2026-10-04"), send(1.2, "2026-10-05")];
    expect(toastMilestone(input([...three, ...easy], "2026-11-02"), 4)).toMatchObject({ target: 5, text: "2 more V4s until you have 5" });
  });

  it("never mentions anyone else or being behind", () => {
    const all = milestoneCandidates(input([...board, ...days(10, 6).map((d) => send(2.2, d))], "2026-11-02"));
    for (const m of all) expect(m.text + m.why).not.toMatch(/behind|others|everyone|average|compared/i);
  });
});

it("reads roped entries without mixing them into boulder counts", () => {
  const a: Activity[] = [ropedActivity(rope({ result: "redpoint", climbedAt: "2026-10-01 10:00:00" }))];
  expect(milestoneCandidates({ activities: a, today: "2026-11-02", streak: streakInfo(["2026-10-01"], "2026-11-02") }).find((m) => m.kind === "sendCount")).toMatchObject({ current: 0 });
});
