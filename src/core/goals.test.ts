import { describe, expect, it } from "vitest";
import type { Activity, ActivityKind } from "./activity";
import {
  bestBoulderV, closestGoal, decodeGoal, draftProblem, encodeGoal, goalMilestone, goalTitle, GOAL_TEMPLATES, isGoalClose, makeWindow, measure, newGoal, nextWindow, parseGoal, resolveGoals, retryDraft,
  shortDate, suggestNext, type Goal, type GoalContext, type GoalLabels, type GoalSpec,
} from "./goals";

const labels: GoalLabels = { boulder: (v) => `V${v}`, roped: (n) => `R${n}` };
const TODAY = "2026-11-12"; // a Thursday
const act = (kind: ActivityKind, day: string, over: Partial<Activity["facts"]> = {}, id = `${kind}${day}${Math.random()}`): Activity => ({
  id, kind, at: `${day} 10:00:00`, day, title: "t", ref: null,
  facts: { discipline: kind === "roped" ? "roped" : kind === "training" ? "training" : "boulder", send: kind !== "training", tries: 1, grade: null, effort: null, fingerIntense: false, ...over },
});
const board = (day: string, v: number) => act("board", day, { grade: v + 0.5 });
const ctx = (activities: Activity[], today = TODAY): GoalContext => ({ activities, today, labels });
const goal = (spec: GoalSpec, window = makeWindow("month", TODAY), over: Partial<Goal> = {}): Goal => ({
  id: "g1", title: "t", spec, window, status: "active", createdAt: "2026-11-01 09:00:00", achievedAt: null, ...over,
});

describe("windows", () => {
  it("covers this calendar week (Monday to Sunday) and month", () => {
    expect(makeWindow("week", TODAY)).toEqual({ kind: "week", start: "2026-11-09", end: "2026-11-15" });
    expect(makeWindow("month", TODAY)).toEqual({ kind: "month", start: "2026-11-01", end: "2026-11-30" });
    expect(makeWindow("month", "2028-02-10").end).toBe("2028-02-29");
    expect(makeWindow("none", TODAY)).toEqual({ kind: "none", start: TODAY, end: null });
  });

  it("an until-window never ends before it starts", () => {
    expect(makeWindow("until", TODAY, "2026-12-31")).toEqual({ kind: "until", start: TODAY, end: "2026-12-31" });
    expect(makeWindow("until", TODAY, "2026-01-01").end).toBe(TODAY);
  });

  it("moves on by one period, across a year end", () => {
    expect(nextWindow(makeWindow("week", TODAY))).toEqual({ kind: "week", start: "2026-11-16", end: "2026-11-22" });
    expect(nextWindow(makeWindow("month", "2026-12-05"))).toEqual({ kind: "month", start: "2027-01-01", end: "2027-01-31" });
    expect(nextWindow(makeWindow("until", TODAY, "2026-12-31")).kind).toBe("none");
  });

  it("writes dates short", () => { expect(shortDate("2026-12-31")).toBe("31 Dec"); expect(shortDate("2026-01-05")).toBe("5 Jan"); });
});

describe("titles", () => {
  const m = makeWindow("month", TODAY);
  it("reads like a sentence in the user's notation", () => {
    expect(goalTitle({ type: "grade", scope: "board", grade: 5 }, makeWindow("none", TODAY), labels)).toBe("Send a V5 on my board");
    expect(goalTitle({ type: "grade", scope: "roped", grade: 13 }, makeWindow("until", TODAY, "2026-12-31"), labels)).toBe("Send a R13 route by 31 Dec");
    expect(goalTitle({ type: "volume", scope: "any", metric: "sends", count: 20 }, m, labels)).toBe("20 sends this month");
    expect(goalTitle({ type: "volume", scope: "roped", metric: "sends", count: 1 }, m, labels)).toBe("1 route this month");
    expect(goalTitle({ type: "volume", scope: "any", metric: "days", count: 3 }, makeWindow("week", TODAY), labels)).toBe("Climb 3 days this week");
    expect(goalTitle({ type: "streak", days: 10 }, makeWindow("none", TODAY), labels)).toBe("A 10-day streak");
    expect(goalTitle({ type: "training", days: 2, fingers: true }, makeWindow("week", TODAY), labels)).toBe("Train fingers on 2 days this week");
  });
});

describe("measuring a grade goal", () => {
  const g = goal({ type: "grade", scope: "boulder", grade: 5 }, makeWindow("none", "2026-11-01"));

  it("is the best send in scope on or after the window start, and reaches at the target", () => {
    const p = measure(g, ctx([board("2026-11-03", 4), act("offBoard", "2026-11-04", { grade: 3.2 }), board("2026-10-30", 7)]));
    expect(p).toMatchObject({ current: 4, target: 5, done: false });
    expect(p.summary).toBe("Best so far: V4");
    expect(measure(g, ctx([board("2026-11-05", 5)])).done).toBe(true);
    expect(measure(g, ctx([board("2026-11-05", 6)])).progress).toBe(1);
  });

  it("ignores attempts, ungraded sends, and kinds out of scope", () => {
    const list = [act("board", "2026-11-03", { send: false, grade: 9.5 }), act("board", "2026-11-03", { grade: null }), act("roped", "2026-11-03", { grade: 20 })];
    expect(measure(g, ctx(list))).toMatchObject({ current: 0, done: false, summary: "No send yet" });
    expect(measure(goal({ type: "grade", scope: "board", grade: 3 }, g.window), ctx([act("offBoard", "2026-11-03", { grade: 6.1 })])).done).toBe(false);
  });

  it("compares roped grades on their own scale", () => {
    const r = goal({ type: "grade", scope: "roped", grade: 13 }, g.window);
    expect(measure(r, ctx([act("roped", "2026-11-03", { grade: 13 })])).done).toBe(true);
    expect(measure(r, ctx([board("2026-11-03", 12)])).done).toBe(false);
  });
});

describe("measuring a volume goal", () => {
  it("counts sends in scope in the window, a roped entry as its routes", () => {
    const g = goal({ type: "volume", scope: "any", metric: "sends", count: 10 });
    const list = [board("2026-11-02", 3), board("2026-11-03", 3), act("offBoard", "2026-11-04", { grade: 2 }), act("board", "2026-11-05", { send: false }), board("2026-10-31", 3), act("training", "2026-11-06")];
    expect(measure(g, ctx(list))).toMatchObject({ current: 3, target: 10, remaining: "7 more sends", summary: "3 of 10 sends, this month" });
  });

  it("counts climbing days, with training included only for the any-scope", () => {
    const list = [board("2026-11-10", 3), board("2026-11-10", 4), act("training", "2026-11-11"), act("roped", "2026-11-12", { grade: 12 })];
    const wk = makeWindow("week", TODAY);
    expect(measure(goal({ type: "volume", scope: "any", metric: "days", count: 3 }, wk), ctx(list)).done).toBe(true);
    expect(measure(goal({ type: "volume", scope: "boulder", metric: "days", count: 3 }, wk), ctx(list))).toMatchObject({ current: 1, done: false });
  });

  it("does not count days before the week started", () => {
    const wk = makeWindow("week", TODAY);
    expect(measure(goal({ type: "volume", scope: "any", metric: "days", count: 1 }, wk), ctx([board("2026-11-08", 3)])).current).toBe(0);
  });
});

describe("measuring streak and training goals", () => {
  it("counts the longest chain of climbing days since the goal began, with one rest day allowed", () => {
    const g = goal({ type: "streak", days: 4 }, makeWindow("none", "2026-11-01"));
    const days = ["2026-11-02", "2026-11-04", "2026-11-05", "2026-11-07"].map((d) => board(d, 3));
    expect(measure(g, ctx(days))).toMatchObject({ current: 4, done: true });
    expect(measure(g, ctx([board("2026-10-20", 3), board("2026-10-21", 3), board("2026-10-22", 3), board("2026-10-23", 3)])).current).toBe(0);
    expect(measure(g, ctx(days.slice(0, 2))).summary).toBe("2 of 4 days in a row");
  });

  it("counts training days, and finger-intense days only for a fingers goal", () => {
    const wk = makeWindow("week", TODAY);
    const list = [act("training", "2026-11-09", { fingerIntense: true }), act("training", "2026-11-10"), act("training", "2026-11-10", { fingerIntense: true })];
    expect(measure(goal({ type: "training", days: 2, fingers: false }, wk), ctx(list)).done).toBe(true);
    expect(measure(goal({ type: "training", days: 2, fingers: true }, wk), ctx(list))).toMatchObject({ current: 2, done: true });
    expect(measure(goal({ type: "training", days: 3, fingers: true }, wk), ctx(list)).remaining).toBe("1 more training day");
  });

  it("a custom goal has no measure and is done only when ticked", () => {
    expect(measure(goal({ type: "custom" }), ctx([board("2026-11-02", 3)]))).toMatchObject({ done: false, progress: 0 });
    expect(measure(goal({ type: "custom" }, undefined, { status: "achieved", achievedAt: "2026-11-05 10:00:00" }), ctx([])).progress).toBe(1);
  });
});

describe("resolving statuses", () => {
  const now = new Date(2026, 10, 12, 18, 30, 0);

  it("achieves a reached goal once, and keeps it achieved after its entries are gone", () => {
    const g = goal({ type: "volume", scope: "any", metric: "sends", count: 2 });
    const first = resolveGoals([g], ctx([board("2026-11-02", 3), board("2026-11-03", 3)]), now);
    expect(first.achieved.map((x) => x.id)).toEqual(["g1"]);
    expect(first.goals[0]).toMatchObject({ status: "achieved", achievedAt: "2026-11-12 18:30:00" });
    const again = resolveGoals(first.goals, ctx([]), now);
    expect(again.goals[0].status).toBe("achieved");
    expect(again.changed).toEqual([]);
  });

  it("ends a goal whose window passed, quietly, and never reaches it afterwards", () => {
    const g = goal({ type: "volume", scope: "any", metric: "sends", count: 5 }, makeWindow("week", "2026-11-02"));
    const r = resolveGoals([g], ctx([board("2026-11-03", 3)]), now);
    expect(r.goals[0].status).toBe("missed");
    expect(r.achieved).toEqual([]);
    expect(resolveGoals(r.goals, ctx([board("2026-11-04", 3), board("2026-11-05", 3), board("2026-11-06", 3), board("2026-11-07", 3), board("2026-11-08", 3)]), now).goals[0].status).toBe("missed");
  });

  it("reaches a goal on its last day, before ending it", () => {
    const g = goal({ type: "volume", scope: "any", metric: "sends", count: 1 }, makeWindow("week", "2026-11-09"));
    expect(resolveGoals([g], ctx([board("2026-11-15", 3)], "2026-11-15"), now).goals[0].status).toBe("achieved");
  });

  it("leaves paused goals alone, and never reaches a custom goal by itself", () => {
    const paused = goal({ type: "volume", scope: "any", metric: "sends", count: 1 }, undefined, { status: "paused" });
    expect(resolveGoals([paused, goal({ type: "custom" })], ctx([board("2026-11-02", 3)]), now).changed).toEqual([]);
  });
});

describe("a goal that is close", () => {
  it("is close when five or fewer are left or most of the way there, and a grade goal when one step away", () => {
    const sends = (n: number, count: number) => measure(goal({ type: "volume", scope: "any", metric: "sends", count }), ctx(Array.from({ length: n }, (_, i) => board(`2026-11-0${(i % 9) + 1}`, 2))));
    const g = (count: number) => goal({ type: "volume", scope: "any", metric: "sends", count });
    expect(isGoalClose(g(20), sends(15, 20))).toBe(true);
    expect(isGoalClose(g(30), sends(4, 30))).toBe(false);
    expect(isGoalClose(g(8), sends(4, 8))).toBe(true);
    const grade = goal({ type: "grade", scope: "boulder", grade: 5 }, makeWindow("none", "2026-11-01"));
    expect(isGoalClose(grade, measure(grade, ctx([board("2026-11-03", 4)])))).toBe(true);
    expect(isGoalClose(grade, measure(grade, ctx([board("2026-11-03", 2)])))).toBe(false);
  });

  it("is never close once paused, achieved or custom", () => {
    const g = goal({ type: "volume", scope: "any", metric: "sends", count: 2 });
    const p = measure(g, ctx([board("2026-11-03", 2)]));
    expect(isGoalClose({ ...g, status: "paused" }, p)).toBe(false);
    expect(isGoalClose(goal({ type: "custom" }), measure(goal({ type: "custom" }), ctx([])))).toBe(false);
  });

  it("picks the goal furthest along and turns it into a line without any pressure", () => {
    const a = goal({ type: "volume", scope: "any", metric: "sends", count: 10 }, undefined, { id: "a", title: "10 sends this month" });
    const b = goal({ type: "volume", scope: "any", metric: "sends", count: 4 }, undefined, { id: "b", title: "4 sends this month" });
    const list = [board("2026-11-02", 2), board("2026-11-03", 2), board("2026-11-04", 2)];
    const best = closestGoal([a, b], ctx(list))!;
    expect(best.goal.id).toBe("b");
    const m = goalMilestone(best.goal, best.progress);
    expect(m).toMatchObject({ id: "goal:b", kind: "goal", current: 3, target: 4 });
    expect(m.text).toBe("1 more send to go. Goal: 4 sends this month.");
    expect(closestGoal([], ctx(list))).toBeNull();
  });
});

describe("suggesting the next goal", () => {
  const done = (spec: GoalSpec, window = makeWindow("none", TODAY)) => goal(spec, window, { status: "achieved", achievedAt: "2026-11-12 10:00:00" });

  it("offers the next grade, a doubled streak, and a bit more in the next period, capped sensibly", () => {
    expect(suggestNext(done({ type: "grade", scope: "board", grade: 5 }), TODAY)!.spec).toEqual({ type: "grade", scope: "board", grade: 6 });
    expect(suggestNext(done({ type: "streak", days: 10 }), TODAY)!.spec).toEqual({ type: "streak", days: 20 });
    const weekly = suggestNext(done({ type: "volume", scope: "any", metric: "days", count: 3 }, makeWindow("week", TODAY)), TODAY)!;
    expect(weekly.spec).toMatchObject({ count: 4 });
    expect(weekly.window).toEqual({ kind: "week", start: "2026-11-16", end: "2026-11-22" });
    expect(suggestNext(done({ type: "volume", scope: "any", metric: "days", count: 7 }, makeWindow("week", TODAY)), TODAY)!.spec).toMatchObject({ count: 7 });
    expect(suggestNext(done({ type: "volume", scope: "any", metric: "sends", count: 20 }, makeWindow("month", TODAY)), TODAY)!.spec).toMatchObject({ count: 25 });
    expect(suggestNext(done({ type: "training", days: 2, fingers: true }, makeWindow("week", TODAY)), TODAY)!.spec).toMatchObject({ days: 3, fingers: true });
  });

  it("a goal with a date or no end is followed by one with no end, from today", () => {
    const s = suggestNext(done({ type: "streak", days: 5 }, makeWindow("until", "2026-11-01", "2026-11-30")), TODAY)!;
    expect(s.window).toEqual({ kind: "none", start: TODAY, end: null });
  });

  it("offers nothing after a custom goal", () => { expect(suggestNext(done({ type: "custom" }), TODAY)).toBeNull(); });
});

describe("making goals", () => {
  const now = new Date(2026, 10, 12, 9, 0, 0);

  it("starts every template as an active goal with a written title", () => {
    for (const t of GOAL_TEMPLATES.filter((x) => x.id !== "custom")) {
      const g = newGoal("x", t.draft(TODAY, null)!, "", labels, now);
      expect(g).toMatchObject({ status: "active", achievedAt: null, createdAt: "2026-11-12 09:00:00" });
      expect(g.title.length, t.id).toBeGreaterThan(3);
    }
    expect(newGoal("x", GOAL_TEMPLATES[0].draft(TODAY, 4)!, "", labels, now).spec).toMatchObject({ grade: 5 });
    expect(newGoal("x", GOAL_TEMPLATES[0].draft(TODAY, null)!, "", labels, now).spec).toMatchObject({ grade: 1 });
  });

  it("uses the user's words for a custom goal, trimmed, and asks for them", () => {
    const d = GOAL_TEMPLATES[4].draft(TODAY, null)!;
    expect(newGoal("x", d, "  Try the slab at Index  ", labels, now).title).toBe("Try the slab at Index");
    expect(draftProblem(d, "  ")).toBe("Write what you want to do.");
    expect(draftProblem(d, "ok")).toBeNull();
  });

  it("refuses more than seven days in a week", () => {
    const d = { spec: { type: "volume", scope: "any", metric: "days", count: 8 } as GoalSpec, windowKind: "week" as const, window: makeWindow("week", TODAY) };
    expect(draftProblem(d, "")).toBe("A week has seven days.");
  });
});

describe("reading a goal from storage or a file", () => {
  const good = (): Goal => newGoal("g9", GOAL_TEMPLATES[1].draft(TODAY, null)!, "", labels, new Date(2026, 10, 12, 9, 0, 0));
  const wire = (over: Record<string, unknown> = {}) => JSON.parse(JSON.stringify({ ...good(), ...over }));

  it("round-trips every kind of goal through the stored columns", () => {
    for (const t of GOAL_TEMPLATES) {
      const g = newGoal("r", t.draft(TODAY, 3)!, "Mine", labels, new Date(2026, 10, 12, 9, 0, 0));
      const e = encodeGoal(g);
      expect(decodeGoal({ id: g.id, title: g.title, type: e.type, scope: e.scope, window: e.window, target: e.target, status: g.status, created_at: g.createdAt, achieved_at: g.achievedAt })).toEqual(g);
    }
    const roped = goal({ type: "volume", scope: "roped", metric: "sends", count: 12 }, makeWindow("until", TODAY, "2026-12-31"));
    const e = encodeGoal(roped);
    expect(decodeGoal({ id: "g1", title: "t", type: e.type, scope: e.scope, window: e.window, target: e.target, status: "active", created_at: roped.createdAt, achieved_at: null })).toEqual(roped);
  });

  it("returns null for stored text that no longer makes a goal", () => {
    expect(decodeGoal({ id: "a", title: "t", type: "grade", scope: "{bad", window: "{}", target: "{}", status: "active", created_at: "2026-11-01 09:00:00", achieved_at: null })).toBeNull();
  });

  it("accepts a good goal and refuses damaged ones instead of half-reading them", () => {
    expect(parseGoal(wire())).toEqual(good());
    expect(parseGoal(null)).toBeNull();
    expect(parseGoal(wire({ status: "done" }))).toBeNull();
    expect(parseGoal(wire({ spec: { type: "volume", scope: "any", metric: "sends", count: 0 } }))).toBeNull();
    expect(parseGoal(wire({ spec: { type: "grade", scope: "any", grade: 5 } }))).toBeNull();
    expect(parseGoal(wire({ spec: { type: "streak", days: 1.5 } }))).toBeNull();
    expect(parseGoal(wire({ window: { kind: "week", start: "2026-11-09", end: null } }))).toBeNull();
    expect(parseGoal(wire({ window: { kind: "until", start: "2026-11-09", end: "2026-11-01" } }))).toBeNull();
    expect(parseGoal(wire({ createdAt: "yesterday" }))).toBeNull();
    expect(parseGoal(wire({ title: "x".repeat(101) }))).toBeNull();
  });

  it("only an achieved goal has an achieved date", () => {
    expect(parseGoal(wire({ status: "achieved", achievedAt: null }))).toBeNull();
    expect(parseGoal(wire({ status: "active", achievedAt: "2026-11-12 10:00:00" }))).toBeNull();
    expect(parseGoal(wire({ status: "achieved", achievedAt: "2026-11-12 10:00:00" }))?.status).toBe("achieved");
  });

  it("a custom goal needs a title", () => {
    expect(parseGoal(wire({ spec: { type: "custom" }, title: " " }))).toBeNull();
    expect(parseGoal(wire({ spec: { type: "custom" }, title: "Try it" }))?.spec).toEqual({ type: "custom" });
  });
});

describe("trying an ended goal again", () => {
  it("keeps the target and moves a week or month goal to this period, and a dated one to no end", () => {
    const missed = (window = makeWindow("week", "2026-11-02")) => goal({ type: "volume", scope: "any", metric: "days", count: 3 }, window, { status: "missed" });
    expect(retryDraft(missed(), TODAY)).toMatchObject({ spec: { count: 3 }, windowKind: "week", window: { start: "2026-11-09", end: "2026-11-15" } });
    expect(retryDraft(missed(makeWindow("until", "2026-10-01", "2026-10-31")), TODAY).window).toEqual({ kind: "none", start: TODAY, end: null });
  });
});

describe("best boulder grade", () => {
  it("is the hardest board or off-board send as a V number, ignoring attempts and roped", () => {
    expect(bestBoulderV([board("2026-11-02", 3), act("offBoard", "2026-11-03", { grade: 4.2 }), act("roped", "2026-11-03", { grade: 20 }), act("board", "2026-11-04", { send: false, grade: 9.5 })])).toBe(4);
    expect(bestBoulderV([])).toBeNull();
  });
});
