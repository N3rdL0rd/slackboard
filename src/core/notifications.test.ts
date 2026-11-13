import { describe, expect, it } from "vitest";
import type { Activity, ActivityKind } from "./activity";
import { climbingDays } from "./activity";
import { blankNote } from "./body";
import { dayOf } from "./days";
import { afterQuiet, atTime, diff, HORIZON_DAYS, isOurs, isQuiet, plan, restEndAlert, routeOf, type PlanInput, type PlannedNotification, type ScheduledNotification } from "./notifications";
import type { Milestone } from "./milestones";
import type { ReviewLabels } from "./review";
import { DEFAULT_NOTIFICATIONS, type NotificationPrefs } from "./settings";
import { streakInfo } from "./streak";

const labels: ReviewLabels = { boulder: (v) => `V${v}`, roped: (n) => `R${n}` };
let n = 0;
const act = (kind: ActivityKind, day: string, over: Partial<Activity["facts"]> = {}): Activity => ({
  id: `${kind}${n++}`, kind, at: `${day} 10:00:00`, day, title: `t${n}`, ref: null,
  facts: { discipline: kind === "training" ? "training" : "boulder", send: kind !== "training", tries: 1, grade: null, effort: null, fingerIntense: false, ...over },
});
const board = (day: string, v = 3) => act("board", day, { grade: v + 0.5 });
const NOW = new Date(2026, 10, 12, 12, 0, 0); // Thursday 12 Nov 2026, noon
const ON: NotificationPrefs = { ...DEFAULT_NOTIFICATIONS, review: true, streak: true, rest: true, milestone: true };
const MILESTONE: Milestone = { id: "m", kind: "sendCount", text: "3 more V4s until you have 10.", current: 7, target: 10, progress: 0.7, why: "" };

const only = (kind: "review" | "streak" | "rest" | "milestone"): NotificationPrefs => ({ ...DEFAULT_NOTIFICATIONS, [kind]: true });

const input = (over: Partial<PlanInput> & { acts?: Activity[] } = {}): PlanInput => {
  const activities = over.acts ?? over.activities ?? [];
  const now = over.now ?? NOW;
  return { now, prefs: ON, activities, notes: [], streak: streakInfo(climbingDays(activities), dayOf(now)), labels, working: {}, milestone: null, ...over };
};
const ids = (list: PlannedNotification[]) => list.map((x) => x.id);

describe("every type is off until the user turns it on", () => {
  it("plans nothing with the defaults, whatever the log says", () => {
    const acts = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => board(d));
    expect(plan(input({ acts, prefs: DEFAULT_NOTIFICATIONS, milestone: MILESTONE }))).toEqual([]);
  });
});

describe("the streak reminder", () => {
  const acts = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => board(d));

  it("fires late afternoon on the last day that keeps the streak alive, with the streak's length", () => {
    const [p] = plan(input({ acts, prefs: only("streak") }));
    expect(p).toMatchObject({ id: "streak:2026-11-13", kind: "streak", title: "Keep your streak going", body: "Today keeps your 3-day streak going.", route: "/stats" });
    expect(p.fireAt).toEqual(new Date(2026, 10, 13, 16, 30));
  });

  it("moves to the new last day once something is logged, so the old reminder goes", () => {
    const [p] = plan(input({ acts: [...acts, board("2026-11-12")], prefs: only("streak") }));
    expect(p.id).toBe("streak:2026-11-14");
  });

  it("is not planned for a short streak or a broken one", () => {
    expect(plan(input({ acts: acts.slice(0, 2), prefs: only("streak") }))).toEqual([]);
    expect(plan(input({ acts: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((d) => board(d)), prefs: only("streak") }))).toEqual([]);
  });

  it("is not sent once the time has passed, and not inside quiet hours", () => {
    expect(plan(input({ acts, now: new Date(2026, 10, 13, 17, 0), prefs: only("streak") }))).toEqual([]);
    expect(plan(input({ acts, prefs: { ...only("streak"), quietStart: "16:00", quietEnd: "17:00" } }))).toEqual([]);
  });

  it("counts training as a day, and does not remind on a day that already has one logged", () => {
    const withTraining = [board("2026-11-09"), act("training", "2026-11-10"), board("2026-11-11")];
    expect(plan(input({ acts: withTraining, prefs: only("streak") }))[0].body).toBe("Today keeps your 3-day streak going.");
  });
});

describe("the rest reminder", () => {
  const hard = [act("training", "2026-11-12", { fingerIntense: true })];

  it("fires that evening after a hard day, once, with advice and no pressure", () => {
    const [p] = plan(input({ acts: hard, prefs: only("rest") }));
    expect(p).toMatchObject({ id: "rest:2026-11-12", kind: "rest", body: "A rest day tomorrow helps you recover." });
    expect(p.fireAt).toEqual(new Date(2026, 10, 12, 19, 30));
  });

  it("is not planned after an easy day, once the evening has passed, or inside quiet hours", () => {
    expect(plan(input({ acts: [board("2026-11-12", 1)], prefs: only("rest") }))).toEqual([]);
    expect(plan(input({ acts: hard, now: new Date(2026, 10, 12, 20, 0), prefs: only("rest") }))).toEqual([]);
    expect(plan(input({ acts: hard, prefs: { ...only("rest"), quietStart: "19:00", quietEnd: "08:00" } }))).toEqual([]);
  });

  it("never looks at another day", () => {
    expect(plan(input({ acts: [act("training", "2026-11-11", { fingerIntense: true })], prefs: only("rest") }))).toEqual([]);
  });
});

describe("the weekly review reminder", () => {
  const week = [board("2026-11-09"), board("2026-11-10", 4), act("training", "2026-11-11")];

  it("fires Monday morning for the week that just ended, with that week's numbers", () => {
    const [p] = plan(input({ acts: [board("2026-11-09"), board("2026-11-10"), board("2026-11-11")], prefs: { ...ON, streak: false } }));
    expect(p).toMatchObject({ id: "review:2026-11-16", kind: "review", title: "Your week", body: "Your week is ready: 3 days, 3 sends.", route: "/review?day=2026-11-09" });
    expect(p.fireAt).toEqual(new Date(2026, 10, 16, 8, 0));
  });

  it("is only for a week that had something in it, so an empty week or an unlived one gets nothing", () => {
    const list = plan(input({ acts: week, prefs: { ...ON, streak: false } }));
    expect(ids(list)).toEqual(["review:2026-11-16"]);
    expect(plan(input({ acts: [], prefs: { ...ON, streak: false } }))).toEqual([]);
  });

  it("moves out of quiet hours instead of firing in them", () => {
    const [p] = plan(input({ acts: week, prefs: { ...ON, streak: false, reviewTime: "07:00" } }));
    expect(p.fireAt).toEqual(new Date(2026, 10, 16, 8, 0));
  });
});

describe("the milestone reminder", () => {
  it("is one, on the next Wednesday at noon, saying the single closest milestone", () => {
    const list = plan(input({ milestone: MILESTONE, prefs: { ...ON, streak: false, review: false, rest: false } }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "milestone:2026-11-16", kind: "milestone", body: "3 more V4s until you have 10." });
    expect(list[0].fireAt).toEqual(new Date(2026, 10, 18, 12, 0));
  });

  it("is not planned without a milestone, and skips a Wednesday whose noon has passed", () => {
    expect(plan(input({ milestone: null }))).toEqual([]);
    const wed = plan(input({ milestone: MILESTONE, now: new Date(2026, 10, 18, 13, 0), prefs: { ...ON, streak: false, review: false, rest: false } }));
    expect(wed[0].fireAt).toEqual(new Date(2026, 10, 25, 12, 0));
  });
});

describe("one a day, within the horizon", () => {
  it("keeps the streak reminder over the review when both fall on one day", () => {
    // Saturday 14th: the last climb was today, so the last day that keeps the streak is Monday 16th, which is also the review's day.
    const acts = ["2026-11-12", "2026-11-13", "2026-11-14"].map((d) => board(d));
    const list = plan(input({ acts, now: new Date(2026, 10, 14, 12, 0), prefs: { ...ON, rest: false } }));
    expect(list.filter((x) => x.day === "2026-11-16").map((x) => x.kind)).toEqual(["streak"]);
  });

  it("never has two on a day, and never beyond the horizon or in the past", () => {
    const acts = ["2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"].map((d) => board(d)).concat(act("training", "2026-11-12", { fingerIntense: true }));
    const list = plan(input({ acts, milestone: MILESTONE }));
    expect(new Set(list.map((x) => x.day)).size).toBe(list.length);
    expect(list.every((x) => x.fireAt > NOW && x.fireAt < atTime("2026-11-26", "00:00"))).toBe(true);
    expect(HORIZON_DAYS).toBe(14);
  });

  it("returns them soonest first, with the same ids when asked twice", () => {
    const acts = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => board(d));
    const a = plan(input({ acts, milestone: MILESTONE }));
    expect(a.map((x) => x.fireAt.getTime())).toEqual([...a.map((x) => x.fireAt.getTime())].sort((x, y) => x - y));
    expect(ids(plan(input({ acts, milestone: MILESTONE })))).toEqual(ids(a));
  });
});

describe("reconciling with what the phone has", () => {
  const acts = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => board(d));
  const desired = plan(input({ acts, milestone: MILESTONE }));
  const asScheduled = (p: PlannedNotification): ScheduledNotification => ({ id: p.id, title: p.title, body: p.body, route: p.route, fireAtMs: p.fireAt.getTime() });

  it("schedules everything on a phone with nothing, and nothing when it already matches", () => {
    expect(diff(desired, []).schedule).toEqual(desired);
    expect(diff(desired, desired.map(asScheduled))).toEqual({ cancel: [], schedule: [] });
  });

  it("cancels what is no longer wanted and replaces what changed, and leaves other apps' and the session's alerts alone", () => {
    const existing = [...desired.map(asScheduled), { id: "streak:2026-11-20", title: "x", body: "y", route: "/", fireAtMs: 1 }, { id: "session-rest", title: "Rest is over", body: "", route: "/", fireAtMs: 5 }, { id: "other", title: "", body: "", route: "", fireAtMs: 0 }];
    existing[0] = { ...existing[0], body: "an older sentence" };
    const d = diff(desired, existing);
    expect(d.cancel.sort()).toEqual([desired[0].id, "streak:2026-11-20"].sort());
    expect(d.schedule.map((x) => x.id)).toEqual([desired[0].id]);
  });

  it("running it again after applying it does nothing", () => {
    const existing = [{ id: "review:2026-11-09", title: "old", body: "old", route: "/", fireAtMs: 1 }];
    const first = diff(desired, existing);
    const after = [...existing.filter((e) => !first.cancel.includes(e.id)), ...first.schedule.map(asScheduled)];
    expect(diff(desired, after)).toEqual({ cancel: [], schedule: [] });
  });

  it("knows which identifiers are ours", () => {
    expect(["review:2026-11-16", "streak:2026-11-13", "rest:2026-11-12", "milestone:2026-11-16"].every(isOurs)).toBe(true);
    expect(["session-rest", "other", "plan:2026-11-12"].some(isOurs)).toBe(false);
  });
});

describe("quiet hours and times", () => {
  it("handles hours that run past midnight and ones that do not", () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m);
    expect(isQuiet(at(22), "21:00", "08:00")).toBe(true);
    expect(isQuiet(at(3), "21:00", "08:00")).toBe(true);
    expect(isQuiet(at(8), "21:00", "08:00")).toBe(false);
    expect(isQuiet(at(12), "21:00", "08:00")).toBe(false);
    expect(isQuiet(at(13), "12:00", "14:00")).toBe(true);
    expect(isQuiet(at(13), "12:00", "12:00")).toBe(false);
  });

  it("moves to the end of the quiet hours, today if still ahead and otherwise tomorrow", () => {
    expect(afterQuiet(new Date(2026, 10, 12, 6, 0), "21:00", "08:00")).toEqual(new Date(2026, 10, 12, 8, 0));
    expect(afterQuiet(new Date(2026, 10, 12, 22, 0), "21:00", "08:00")).toEqual(new Date(2026, 10, 13, 8, 0));
  });

  it("an empty note list and a note with nothing off change nothing", () => {
    const a = plan(input({ acts: [board("2026-11-09"), board("2026-11-10"), board("2026-11-11")], prefs: { ...ON, streak: false, rest: false, milestone: false } }));
    const b = plan(input({ acts: [board("2026-11-09"), board("2026-11-10"), board("2026-11-11")], notes: [blankNote("2026-11-10")], prefs: { ...ON, streak: false, rest: false, milestone: false } }));
    expect(ids(a)).toEqual(ids(b));
  });
});

describe("the alert for the end of a rest", () => {
  it("is for the moment the rest ends, saying what is next, and not for a rest about to end", () => {
    const a = restEndAlert(NOW, 90_000, "Set 3 of 5")!;
    expect(a).toMatchObject({ title: "Rest is over", body: "Set 3 of 5" });
    expect(a.fireAt.getTime()).toBe(NOW.getTime() + 90_000);
    expect(restEndAlert(NOW, 3_000, "x")).toBeNull();
  });
});

describe("which routes a tapped notification may open", () => {
  it("opens the screens the app chose and nothing else", () => {
    for (const r of ["/", "/review", "/review?day=2026-11-09", "/stats", "/year-review"]) expect(routeOf({ route: r }), r).toBe(r);
    for (const r of ["/settings", "/session", "https://example.com", "//evil", "/review?day=x", "/review?day=2026-11-09&x=1", "", 5, null]) expect(routeOf({ route: r }), String(r)).toBeNull();
    expect(routeOf(null)).toBeNull();
    expect(routeOf(undefined)).toBeNull();
  });

  it("every route the scheduler plans is one it may open", () => {
    const acts = ["2026-11-09", "2026-11-10", "2026-11-11"].map((d) => board(d)).concat(act("training", "2026-11-12", { fingerIntense: true }));
    const list = plan(input({ acts, milestone: MILESTONE }));
    expect(list.length).toBeGreaterThan(0);
    for (const p of list) expect(routeOf({ route: p.route }), p.route).toBe(p.route);
  });
});
