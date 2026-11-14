import { describe, expect, it } from "vitest";
import type { Activity } from "./activity";
import { deloadAdvice, planIsLightNow, snoozeUntil, DELOAD_KEY } from "./deload";
import { buildPlan, DEFAULT_PROFILE, lightenBetween, type Plan } from "./planner";
import type { TrainingEntry } from "./training";

const TODAY = "2026-11-12"; // a Thursday; weeks start Mon 2026-11-09, 11-02, 10-26, 10-19
let n = 0;
const act = (day: string, effort: number | null = null): Activity => ({
  id: `a${n++}`, kind: "board", at: `${day} 10:00:00`, day, title: "t", ref: null,
  facts: { discipline: "boulder", send: true, tries: 1, grade: null, effort, fingerIntense: false },
});
/** `count` entries spread over the days of the week that starts on `monday`. */
const week = (monday: string, count: number): Activity[] =>
  Array.from({ length: count }, (_, i) => act(`${monday.slice(0, 8)}${String(Number(monday.slice(8)) + (i % 7)).padStart(2, "0")}`));
const session = (day: string, effort: number): TrainingEntry => ({ id: `t${n++}`, exerciseId: "max-hang", performedAt: `${day} 18:00:00`, effort, note: "", sets: [] });
const input = (activities: Activity[], over: Partial<Parameters<typeof deloadAdvice>[0]> = {}) => ({ activities, training: [], working: {}, today: TODAY, inLightWeek: false, ...over });

// Weeks (Monday) are 10-19 (three back), 10-26 (two back), 11-02 (last), 11-09 (this one). Days in October have 31 days, so offsets stay in range.
const w3 = "2026-10-19", w2 = "2026-10-26", w1 = "2026-11-02";
const steady = [...week(w3, 6), ...week(w2, 6), ...week(w1, 6)];

describe("when a lighter week is suggested", () => {
  it("suggests nothing for a steady few weeks", () => {
    expect(deloadAdvice(input(steady))).toBeNull();
  });
  it("suggests it after load rising three weeks running and well above the usual", () => {
    const rising = [...week(w3, 3), ...week(w2, 6), ...week(w1, 12)];
    const a = deloadAdvice(input(rising))!;
    expect(a.reasons).toContain("Your load has gone up three weeks in a row.");
  });
  it("suggests it after a spike against the usual", () => {
    const a = deloadAdvice(input([...steady, ...week("2026-11-09", 14)]))!;
    expect(a.reasons).toContain("You are doing a lot more than your usual.");
  });
  it("suggests it after four hard days in a week", () => {
    const hardDays = ["2026-11-06", "2026-11-08", "2026-11-10", "2026-11-12"].map((d) => act(d, 8));
    const a = deloadAdvice(input([...steady, ...hardDays]))!;
    expect(a.reasons).toContain("4 hard days in the last week.");
  });
  it("suggests it after the last few sessions were rated very hard", () => {
    const training = [session("2026-11-11", 9), session("2026-11-09", 9), session("2026-11-06", 8.5)];
    const a = deloadAdvice(input(steady, { training }))!;
    expect(a.reasons[0]).toMatch(/very hard, about 8\.8 out of 10/);
  });
  it("does not suggest it on high ratings from long ago, or from fewer than three sessions", () => {
    expect(deloadAdvice(input(steady, { training: [session("2026-09-01", 10), session("2026-09-02", 10), session("2026-09-03", 10)] }))).toBeNull();
    expect(deloadAdvice(input(steady, { training: [session("2026-11-11", 10), session("2026-11-09", 10)] }))).toBeNull();
  });
});

describe("when it is not suggested", () => {
  const rising = [...week(w3, 3), ...week(w2, 6), ...week(w1, 12)];
  it("needs a few weeks of history", () => {
    expect(deloadAdvice(input(week(w1, 14)))).toBeNull();
  });
  it("is quiet when the plan already has a light week", () => {
    expect(deloadAdvice(input(rising, { inLightWeek: true }))).toBeNull();
  });
  it("is quiet after a week that was already light", () => {
    expect(deloadAdvice(input([...week(w3, 8), ...week(w2, 8), ...week(w1, 2)]))).toBeNull();
  });
});

describe("the plan's light weeks", () => {
  const plan = (): Plan => buildPlan({ id: "p", today: "2026-11-09", createdAt: "2026-11-09 08:00:00", profile: { ...DEFAULT_PROFILE, bodyKg: 70, daysPerWeek: 3, trainDays: [0, 2, 4], climbDays: [], equipment: ["hangboard", "weights", "pullupBar"] }, tests: {}, logs: [], newId: (() => { let i = 0; return () => `s${++i}`; })(), climbingHistory: [] } as never);

  it("lightens only the sessions still to do in the range, once", () => {
    const p = plan();
    const inWeek = p.sessions.filter((s) => s.day >= "2026-11-12" && s.day <= "2026-11-15" && s.status === "planned" && !s.light);
    expect(inWeek.length).toBeGreaterThan(0);
    const lighter = lightenBetween(p, "2026-11-12", "2026-11-15");
    const changed = lighter.sessions.filter((s, i) => s.light !== p.sessions[i].light);
    expect(changed.map((s) => s.id).sort()).toEqual(inWeek.map((s) => s.id).sort());
    const twice = lightenBetween(lighter, "2026-11-12", "2026-11-15");
    expect(twice.sessions.map((s) => s.why.length)).toEqual(lighter.sessions.map((s) => s.why.length));
    const allDone = { ...p, sessions: p.sessions.map((s) => ({ ...s, status: "done" as const })) };
    expect(lightenBetween(allDone, "2026-11-09", "2026-11-30")).toEqual(allDone);
  });
  it("knows when the week is already light", () => {
    const p = plan();
    expect(planIsLightNow(null, TODAY)).toBe(false);
    expect(planIsLightNow(p, TODAY)).toBe(false);
    expect(planIsLightNow(lightenBetween(p, "2026-11-09", "2026-11-15"), TODAY)).toBe(true);
  });
  it("keeps a dismissed suggestion away for a week", () => {
    expect(snoozeUntil("2026-11-12")).toBe("2026-11-19");
    expect(DELOAD_KEY).toBe("deload");
  });
});
