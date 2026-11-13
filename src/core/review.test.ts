import { describe, expect, it } from "vitest";
import type { Activity, ActivityKind } from "./activity";
import { blankNote } from "./body";
import { addDays } from "./days";
import type { Goal } from "./goals";
import { makeWindow } from "./goals";
import { bodySummary, compareText, latestYear, reviewNotificationText, weeklyReview, yearlyReview, yearsWithEntries, type ReviewLabels } from "./review";

const labels: ReviewLabels = { boulder: (v) => `V${v}`, roped: (n) => `R${n}` };
let n = 0;
const act = (kind: ActivityKind, day: string, over: Partial<Activity["facts"]> = {}, title = `t${n++}`, ref: unknown = null): Activity => ({
  id: `${kind}${n++}`, kind, at: `${day} 10:00:00`, day, title, ref,
  facts: { discipline: kind === "roped" ? "roped" : kind === "training" ? "training" : "boulder", send: kind !== "training", tries: 1, grade: null, effort: null, fingerIntense: false, ...over },
});
const board = (day: string, v: number, title?: string) => act("board", day, { grade: v + 0.5 }, title);
const TODAY = "2026-11-12"; // a Thursday; its week is Mon 2026-11-09 to Sun 2026-11-15
const week = (list: Activity[], over: Partial<Parameters<typeof weeklyReview>[0]> = {}) =>
  weeklyReview({ activities: list, notes: [], goals: [], today: TODAY, day: TODAY, labels, ...over });

describe("the weekly review", () => {
  it("rounds any day back to its Monday and spans seven days", () => {
    const r = week([], { day: "2026-11-15" });
    expect([r.weekStart, r.weekEnd]).toEqual(["2026-11-09", "2026-11-15"]);
  });

  it("an empty week says so and has nothing else", () => {
    const r = week([board("2026-11-02", 3)]);
    expect(r).toMatchObject({ empty: true, days: 0, sends: 0, attempts: 0, compare: null, highlight: null, body: null, goals: [] });
    expect(reviewNotificationText(r, labels)).toBeNull();
  });

  it("counts days, sends and tries for the week only, a roped entry as its routes and training as a day but not a send", () => {
    const rope = act("roped", "2026-11-10", { grade: 13, tries: 6 }, "Laps", { style: "autobelay", attempts: 6, venue: "Gym" });
    const list = [board("2026-11-09", 3), board("2026-11-09", 4), act("board", "2026-11-10", { send: false, tries: 4 }), rope, act("training", "2026-11-11"), board("2026-11-08", 5), board("2026-11-16", 5)];
    const r = week(list);
    expect(r).toMatchObject({ days: 3, sends: 2 + 6, attempts: 1 + 1 + 4 + 6, trainingEntries: 1, trainingDays: 1 });
  });

  it("finds the week's hardest sends and a new hardest only when it beats everything before", () => {
    const earlier = [board("2026-10-01", 4), act("roped", "2026-10-02", { grade: 15 })];
    const r = week([...earlier, board("2026-11-10", 5), act("roped", "2026-11-11", { grade: 13 })]);
    expect(r).toMatchObject({ hardestBoulder: 5, newHardestBoulder: 5, hardestRoped: 13, newHardestRoped: null });
    expect(r.highlight).toBe("A new hardest boulder: V5.");
    expect(week([...earlier, board("2026-11-10", 4)]).newHardestBoulder).toBeNull();
    // Nothing before: a first send is not "a new hardest".
    expect(week([board("2026-11-10", 5)]).newHardestBoulder).toBeNull();
  });

  it("falls back to a new hardest route, then the most repeated climb, then nothing", () => {
    expect(week([act("roped", "2026-10-02", { grade: 11 }), act("roped", "2026-11-10", { grade: 13 })]).highlight).toBe("A new hardest route: R13.");
    const r = week([board("2026-11-09", 3, "Pizza Box"), board("2026-11-10", 3, "Pizza Box"), board("2026-11-11", 3, "Pizza Box"), board("2026-11-11", 4, "Other")]);
    expect(r.highlight).toBe("Most repeated: Pizza Box, 3 times.");
    expect(week([board("2026-11-09", 3, "A"), board("2026-11-10", 3, "B")]).highlight).toBeNull();
  });

  it("compares the load with the four weeks before in plain words, and not at all with nothing before", () => {
    expect(week([board("2026-11-10", 3)]).compare).toBeNull();
    // Four busy weeks before (six sends each), then a week of the same, and a week of three times as many.
    const busy = (monday: string, count: number) => Array.from({ length: count }, (_, i) => board(addDays(monday, i % 7), 3));
    const usual = [...busy("2026-11-02", 6), ...busy("2026-10-26", 6), ...busy("2026-10-19", 6), ...busy("2026-10-12", 6)];
    expect(week([...usual, ...busy("2026-11-09", 6)]).compare).toBe("About your usual.");
    expect(week([...usual, ...busy("2026-11-09", 18)]).compare).toBe("A lot more than usual.");
    expect(week([...usual, ...busy("2026-11-09", 1)]).compare).toBe("A lot lighter than usual.");
  });

  it("compareText covers the whole range", () => {
    expect([0.3, 0.7, 1, 1.2, 2].map((r) => compareText(r, 1))).toEqual(["A lot lighter than usual.", "A bit lighter than usual.", "About your usual.", "A bit more than usual.", "A lot more than usual."]);
  });

  it("the streak is as of the end of the week reviewed, or today for this week", () => {
    const list = ["2026-11-09", "2026-11-11", "2026-11-12"].map((d) => board(d, 3));
    expect(week(list).streak.current).toBe(3);
    expect(week(list, { today: "2026-12-30", day: "2026-11-09" }).streak.longest).toBe(3);
  });

  it("summarises body check-ins by area, and says nothing when all was fine", () => {
    const notes = [{ ...blankNote("2026-11-09"), fingers: "sore" as const }, { ...blankNote("2026-11-10"), fingers: "sore" as const, elbows: "hurts" as const }, { ...blankNote("2026-11-02"), fingers: "hurts" as const }];
    expect(bodySummary(notes, "2026-11-09", "2026-11-15")).toBe("Fingers sore on 2 days. Elbows hurt on 1 day.");
    expect(bodySummary([blankNote("2026-11-09")], "2026-11-09", "2026-11-15")).toBeNull();
  });

  it("lists goals reached this week, and active goals only for the week that holds today", () => {
    const goal = (over: Partial<Goal>): Goal => ({ id: "g", title: "20 sends this month", spec: { type: "volume", scope: "any", metric: "sends", count: 20 }, window: makeWindow("month", TODAY), status: "active", createdAt: "2026-11-01 09:00:00", achievedAt: null, ...over });
    const reached = goal({ id: "r", title: "A 5-day streak", status: "achieved", achievedAt: "2026-11-10 12:00:00" });
    const r = week([board("2026-11-10", 3)], { goals: [goal({}), reached] });
    expect(r.goals.map((g) => [g.title, g.reached])).toEqual([["20 sends this month", false], ["A 5-day streak", true]]);
    expect(r.goals[0].summary).toBe("1 of 20 sends, this month");
    expect(week([board("2026-11-03", 3)], { goals: [goal({})], day: "2026-11-03" }).goals).toEqual([]);
  });

  it("writes the Monday notification with the numbers that matter", () => {
    const withNew = week([board("2026-10-01", 3), board("2026-11-09", 4), board("2026-11-10", 3), act("training", "2026-11-11")]);
    expect(reviewNotificationText(withNew, labels)).toBe("Your week is ready: 3 days, 2 sends, a new V4.");
    expect(reviewNotificationText(week([act("training", "2026-11-10")]), labels)).toBe("Your week is ready: 1 day, 1 training entry.");
  });
});

describe("the yearly review", () => {
  const rope = (day: string, grade: number, venue = "", title?: string) => act("roped", day, { grade }, title, { venue, style: "sport", attempts: 1 });
  const off = (day: string, v: number, venue = "") => act("offBoard", day, { grade: v + 0.2 }, undefined, { venue });
  const list = [
    board("2025-12-30", 2), board("2026-01-05", 2, "Pizza Box"), board("2026-01-06", 3, "Pizza Box"), board("2026-02-10", 4), board("2026-03-01", 5, "Pizza Box"),
    off("2026-03-02", 3, "Gym A"), off("2026-03-03", 3, "Gym A"), rope("2026-04-01", 13, "Index"), rope("2026-04-02", 15, "Index"), act("training", "2026-04-03"),
    ...Array.from({ length: 8 }, (_, i) => board(`2026-06-0${i + 1}`, 3)),
  ];
  const y = yearlyReview({ activities: list, goals: [], year: 2026, labels });

  it("totals the year, leaving the year before out", () => {
    expect(y.empty).toBe(false);
    expect(y.byKind).toEqual({ board: 4 + 8, offBoard: 2, roped: 2, training: 1 });
    expect(y.sends).toBe(4 + 8 + 2 + 2);
    expect(y.days).toBe(new Set(list.filter((a) => a.day >= "2026-01-01").map((a) => a.day)).size);
  });

  it("builds the pyramids hardest first and the hardest sends with their day", () => {
    expect(y.pyramid.boulder[0]).toEqual({ grade: 5, count: 1 });
    expect(y.pyramid.boulder.find((p) => p.grade === 3)!.count).toBe(1 + 2 + 8);
    expect(y.pyramid.roped).toEqual([{ grade: 15, count: 1 }, { grade: 13, count: 1 }]);
    expect(y.hardestBoulder).toEqual({ grade: 5, day: "2026-03-01" });
    expect(y.hardestRoped).toEqual({ grade: 15, day: "2026-04-02" });
  });

  it("has twelve months with their climbing days, and the hardest boulder of each", () => {
    expect(y.months).toHaveLength(12);
    expect(y.months[0].days).toEqual([5, 6]);
    expect(y.months[10].days).toEqual([]);
    expect(y.progression.slice(0, 6)).toEqual([3, 4, 5, null, null, 3]);
  });

  it("finds the best week, top climbs and the most-used place", () => {
    expect(y.bestWeek).toMatchObject({ weekStart: "2026-06-01", days: 7 });
    expect(y.topClimbs[0]).toEqual({ title: "Pizza Box", count: 3 });
    expect(y.topPlace).toEqual({ name: "Gym A", count: 2 });
  });

  it("the longest streak is the longest chain in the year", () => {
    expect(y.longestStreak).toBe(8);
  });

  it("lists first sends at a grade that fell this year, and total-send landmarks crossed this year", () => {
    expect(y.firsts.map((f) => f.text)).toContain("First V5 boulder");
    expect(y.firsts.map((f) => f.text)).not.toContain("First V2 boulder");
    expect(y.firsts.map((f) => f.text)).toContain("First R15 route");
    expect(y.sendMilestones.map((m) => m.count)).toEqual([10]);
  });

  it("lists goals reached this year only", () => {
    const g = (id: string, at: string): Goal => ({ id, title: id, spec: { type: "custom" }, window: makeWindow("none", "2026-01-01"), status: "achieved", createdAt: "2025-12-01 09:00:00", achievedAt: at });
    const r = yearlyReview({ activities: list, goals: [g("a", "2026-05-05 10:00:00"), g("b", "2025-05-05 10:00:00")], year: 2026, labels });
    expect(r.goalsReached).toEqual([{ title: "a", day: "2026-05-05" }]);
  });

  it("an empty year is empty", () => {
    expect(yearlyReview({ activities: list, goals: [], year: 2024, labels })).toMatchObject({ empty: true, days: 0, sends: 0, bestWeek: null, topPlace: null, hardestBoulder: null });
  });

  it("finds the years that have entries", () => {
    expect(yearsWithEntries(list)).toEqual([2026, 2025]);
    expect(latestYear(list, TODAY)).toBe(2026);
    expect(latestYear([], TODAY)).toBe(2026);
  });
});
