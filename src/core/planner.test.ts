import { describe, expect, it } from "vitest";
import { canDo, exerciseById, EXERCISES, type Equipment } from "../data/exercises";
import { percentOfMax7 } from "../data/protocols";
import { addDays, daysBetween, weekdayOf, type Day } from "./days";
import {
  alternativesFor, buildPlan, chooseBlock, completeSession, DEFAULT_PROFILE, generateSession, hangLoad, latestTests, layoutWeek, lighten, moveSession, nearestGoodDay, nextSession,
  phaseOfWeek, planStart, sessionMinutes, sessionsInWeek, skipSession, slotsForWeek, swapExercise, todaysSession, weekdayName, type Plan, type Profile, type SlotKind, type Tests,
} from "./planner";

const MON: Day = "2026-11-09";
const profile = (over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, ...over });
const ids = () => { let n = 0; return () => `s${++n}`; };
const plan = (p: Profile, tests: Tests = {}, today: Day = MON, logs: "strength" | "endurance" | "balanced" | "unknown" = "strength"): Plan =>
  buildPlan({ id: "plan1", today, now: new Date(2026, 10, 9), profile: p, tests, logsEmphasis: logs, newId: ids(), createdAt: "2026-11-09 08:00:00" });
const FULL: Equipment[] = ["hangboard", "pullupBar", "weights", "campus"];
const TESTS: Tests = { hang7: 30, pullups: 12, legRaises: 10, hangFail: 40 };
const FINGER_SLOTS: SlotKind[] = ["finger", "endurance"];

describe("the published load table", () => {
  it("is exact at the published points and between them, and held at the ends", () => {
    expect([5, 7, 10, 12, 15].map(percentOfMax7)).toEqual([1.02, 1, 0.96, 0.94, 0.9]);
    expect(percentOfMax7(8.5)).toBeCloseTo(0.98, 5);
    expect(percentOfMax7(1)).toBe(1.02);
    expect(percentOfMax7(60)).toBe(0.9);
  });

  it("turns a 7-second test into a 10-second load, less a margin, with and without body weight", () => {
    // 96% x (1 - 3 x 2%) = 90.24% of (70 + 30) = 90.24, minus the 70 body weight.
    expect(hangLoad({ hang7: 30, bodyKg: 70, seconds: 10, marginS: 3, factor: 1 })).toMatchObject({ loadKg: 20 });
    expect(hangLoad({ hang7: 30, bodyKg: null, seconds: 10, marginS: 3, factor: 1 })).toMatchObject({ loadKg: 27 });
    expect(hangLoad({ hang7: undefined, bodyKg: 70, seconds: 10, marginS: 3, factor: 1 })).toBeNull();
  });

  it("an assisted test (negative) is helped a little more for a longer hang, never less", () => {
    const r = hangLoad({ hang7: -10, bodyKg: null, seconds: 10, marginS: 3, factor: 1 })!;
    expect(r.loadKg).toBeLessThan(-10);
  });

  it("the newest test of each kind wins", () => {
    expect(latestTests([{ id: "a", test: "hang7", value: 20, takenAt: "2026-09-01 10:00:00" }, { id: "b", test: "hang7", value: 25, takenAt: "2026-10-01 10:00:00" }, { id: "c", test: "pullups", value: 9, takenAt: "2026-08-01 10:00:00" }])).toEqual({ hang7: 25, pullups: 9 });
  });
});

describe("choosing a block", () => {
  it("starts a block on Monday: this week early on, next week from Friday", () => {
    expect(planStart("2026-11-09")).toBe("2026-11-09");
    expect(planStart("2026-11-12")).toBe("2026-11-09");
    expect(planStart("2026-11-13")).toBe("2026-11-16");
    expect(planStart("2026-11-15")).toBe("2026-11-16");
  });

  it("follows what the logs point to, and the user's own view outranks it", () => {
    expect(chooseBlock(profile(), "strength", MON).kind).toBe("strength");
    expect(chooseBlock(profile(), "endurance", MON).kind).toBe("endurance");
    expect(chooseBlock(profile(), "unknown", MON).kind).toBe("balanced");
    const said = chooseBlock(profile({ emphasis: "endurance" }), "strength", MON);
    expect(said.kind).toBe("endurance");
    expect(said.reasons[0]).toMatch(/outranks/);
  });

  it("starts gently for someone new to finger training or with an injury noted, whatever the logs say", () => {
    for (const p of [profile({ fingerHistory: "new" }), profile({ injury: "left ring finger pulley" })]) {
      const b = chooseBlock(p, "strength", MON);
      expect(b.kind).toBe("starter");
      expect(b.weeks).toBe(6);
      expect(b.reasons.join(" ")).toMatch(/gently/);
    }
  });

  it("has phases that cover every week once, a lighter fourth and last week, and the retest in the last", () => {
    for (const logs of ["strength", "endurance", "balanced"] as const) {
      const b = chooseBlock(profile(), logs, MON);
      expect(b.weeks).toBe(8);
      expect(b.phases.reduce((n, p) => n + p.weeks, 0)).toBe(8);
      expect(b.phases[0].startWeek).toBe(1);
      expect(b.deloadWeeks).toEqual([4, 8]);
      expect(b.retestWeek).toBe(8);
      for (let w = 1; w <= 8; w++) expect(phaseOfWeek(b, w)).toBeTruthy();
    }
    expect(chooseBlock(profile(), "strength", MON).phases.map((p) => p.focus)).toEqual(["weight", "edge"]);
    expect(chooseBlock(profile(), "endurance", MON).phases.map((p) => p.focus)).toEqual(["repeaters", "intermittent"]);
    expect(chooseBlock(profile(), "balanced", MON).phases.map((p) => p.focus)).toEqual(["weight", "repeaters"]);
  });

  it("a date shapes the length: weeks until it, between 6 and 12", () => {
    expect(chooseBlock(profile({ goalDate: "2027-01-24" }), "strength", MON).weeks).toBe(11);
    expect(chooseBlock(profile({ goalDate: "2026-11-30" }), "strength", MON).weeks).toBe(6);
    expect(chooseBlock(profile({ goalDate: "2027-12-01" }), "strength", MON).weeks).toBe(12);
  });
});

describe("the week's sessions", () => {
  it("gives as many as the user has days, with at most two finger-intense ones (three for a regular with five days)", () => {
    const p = (n: number, over: Partial<Profile> = {}) => profile({ daysPerWeek: n, trainDays: [0, 1, 2, 3, 4, 5, 6], ...over });
    expect(slotsForWeek("weight", false, p(1))).toEqual(["finger"]);
    expect(slotsForWeek("weight", false, p(3))).toEqual(["finger", "pullcore", "finger"]);
    expect(slotsForWeek("repeaters", false, p(4))).toEqual(["endurance", "pullcore", "endurance", "mobility"]);
    expect(slotsForWeek("weight", false, p(6)).filter((s) => s === "finger")).toHaveLength(2);
    expect(slotsForWeek("weight", false, p(6, { fingerHistory: "regular" })).filter((s) => s === "finger")).toHaveLength(3);
    expect(slotsForWeek("starter", false, p(6, { fingerHistory: "regular" })).filter((s) => s === "finger")).toHaveLength(2);
    expect(slotsForWeek("weight", false, p(5, { trainDays: [0, 2] }))).toHaveLength(2);
  });

  it("a light week keeps the pattern shorter", () => {
    expect(slotsForWeek("weight", true, profile({ daysPerWeek: 6, trainDays: [0, 1, 2, 3, 4, 5, 6] }))).toEqual(["finger", "pullcore", "mobility"]);
  });
});

describe("laying out a week", () => {
  it("puts finger sessions 48 hours apart and the rest around them", () => {
    const l = layoutWeek({ trainDays: [0, 2, 4], climbDays: [], slots: ["finger", "pullcore", "finger"], prevFingerGap: null });
    expect(l.placed).toEqual([{ weekday: 0, slot: "finger" }, { weekday: 2, slot: "finger" }, { weekday: 4, slot: "pullcore" }]);
    expect(l.dropped).toEqual([]);
    expect(l.restDays).toEqual([1, 3, 5, 6]);
  });

  it("keeps 48 hours from last week's finger session, and drops a finger session there is no day for", () => {
    const l = layoutWeek({ trainDays: [0, 2], climbDays: [], slots: ["finger", "finger"], prevFingerGap: 1 });
    expect(l.placed).toEqual([{ weekday: 2, slot: "finger" }]);
    expect(l.dropped).toEqual(["finger"]);
  });

  it("avoids the user's own climbing days when it can, and uses them when it must", () => {
    expect(layoutWeek({ trainDays: [0, 2, 4], climbDays: [0], slots: ["finger"], prevFingerGap: null }).placed[0].weekday).toBe(2);
    expect(layoutWeek({ trainDays: [0], climbDays: [0], slots: ["finger"], prevFingerGap: null }).placed[0].weekday).toBe(0);
  });

  it("keeps a rest day, dropping the least important session if it has to", () => {
    const l = layoutWeek({ trainDays: [0, 1, 2, 3, 4, 5, 6], climbDays: [], slots: ["finger", "pullcore", "finger", "mobility", "pullcore", "mobility", "mobility"], prevFingerGap: null });
    expect(l.restDays.length).toBeGreaterThanOrEqual(1);
    expect(l.placed.length).toBeLessThanOrEqual(6);
    expect(l.dropped.length).toBeGreaterThanOrEqual(1);
  });

  it("puts a mobility day after a finger day rather than before one", () => {
    const l = layoutWeek({ trainDays: [0, 1, 3], climbDays: [], slots: ["finger", "mobility"], prevFingerGap: null });
    expect(l.placed.find((x) => x.slot === "mobility")!.weekday).toBe(1);
  });

  it("is deterministic", () => {
    const a = layoutWeek({ trainDays: [0, 2, 3, 5], climbDays: [1], slots: ["finger", "pullcore", "finger", "mobility"], prevFingerGap: 2 });
    expect(layoutWeek({ trainDays: [0, 2, 3, 5], climbDays: [1], slots: ["finger", "pullcore", "finger", "mobility"], prevFingerGap: 2 })).toEqual(a);
  });
});

describe("writing a session", () => {
  const base = { slot: "finger" as const, focus: "weight" as const, week: 2, weekInPhase: 1, deload: false, profile: profile({ bodyKg: 70, equipment: FULL }), tests: { hang7: 30 } as Tests };

  it("a finger session has a warm-up, ramp sets at half and three quarters, then work sets from the test", () => {
    const s = generateSession(base);
    expect(s.title).toBe("Finger strength");
    expect(s.items[0].exerciseId).toBe("climbing-warm-up");
    const hang = s.items[1];
    expect(hang.exerciseId).toBe("max-hang");
    const work = hang.sets.filter((t) => t.onS === 10);
    expect(work).toHaveLength(4);
    expect(work.every((t) => t.loadKg === 20 && t.edgeMm === 20 && t.restS === 180)).toBe(true);
    const ramps = hang.sets.filter((t) => t.onS === 5);
    expect(ramps.map((t) => t.loadKg)).toEqual([10, 15]);
    expect(s.why.join(" ")).toMatch(/96% of your 7-second max for a 10 second hang, less a 3 second margin \(about 90% in all\)/);
  });

  it("the first week of a block is lighter, a light week lighter again, with fewer sets", () => {
    const wk1 = generateSession({ ...base, week: 1, weekInPhase: 0 }).items[1].sets.filter((t) => t.onS === 10);
    expect(wk1[0].loadKg).toBeLessThan(20);
    expect(wk1).toHaveLength(3);
    const light = generateSession({ ...base, deload: true });
    expect(light.light).toBe(true);
    expect(light.items[1].sets.filter((t) => t.onS === 10)).toHaveLength(3);
    expect(light.items[1].sets.filter((t) => t.onS === 10)[0].loadKg).toBeLessThan(20);
  });

  it("sets build across a cycle: 3, then 4, then 5", () => {
    const n = (w: number) => generateSession({ ...base, weekInPhase: w }).items[1].sets.filter((t) => t.onS === 10).length;
    expect([n(0), n(1), n(2), n(3)]).toEqual([3, 4, 5, 5]);
  });

  it("without a test, hangs are bodyweight on a bigger edge, and it says so", () => {
    const s = generateSession({ ...base, tests: {} });
    const work = s.items[1].sets.filter((t) => t.onS === 10);
    expect(work.every((t) => t.loadKg === 0 && t.edgeMm === 25)).toBe(true);
    expect(s.why.join(" ")).toMatch(/No test yet/);
  });

  it("the smaller-edge phase uses no added weight and a shrinking edge", () => {
    const edge = (w: number) => generateSession({ ...base, focus: "edge", weekInPhase: w }).items[1].sets.filter((t) => t.onS === 10)[0];
    expect(edge(0)).toMatchObject({ loadKg: 0, edgeMm: 18 });
    expect(edge(3).edgeMm).toBe(15);
    expect(generateSession({ ...base, focus: "edge" }).items[1].exerciseId).toBe("min-edge-hang");
  });

  it("starts gently: a big edge, two sets, never added weight", () => {
    const s = generateSession({ ...base, focus: "starter", profile: profile({ fingerHistory: "new", equipment: FULL, bodyKg: 70 }) });
    const work = s.items[1].sets.filter((t) => t.onS === 10);
    expect(work).toHaveLength(2);
    expect(work.every((t) => t.edgeMm === 30 && t.loadKg === 0)).toBe(true);
  });

  it("endurance sessions use repeaters, then intermittent hangs", () => {
    const rep = generateSession({ ...base, slot: "endurance", focus: "repeaters" });
    expect(rep.items[1]).toMatchObject({ exerciseId: "repeaters" });
    expect(rep.items[1].sets[0]).toMatchObject({ reps: 6, onS: 7, offS: 3 });
    expect(generateSession({ ...base, slot: "endurance", focus: "intermittent" }).items[1].exerciseId).toBe("intermittent-hang");
  });

  it("a starter block uses ladders, not added weight, even with a good test", () => {
    const s = generateSession({ ...base, slot: "pullcore", focus: "starter", tests: { pullups: 15 }, profile: profile({ equipment: FULL, fingerHistory: "new" }) });
    expect(s.items[0].exerciseId).toBe("pull-up-ladder");
  });

  it("pull and core uses weighted pull-ups from a good test, ladders from a modest one, push-ups with no bar", () => {
    const pc = (tests: Tests, equipment: Equipment[]) => generateSession({ ...base, slot: "pullcore", tests, profile: profile({ equipment }) });
    expect(pc({ pullups: 12 }, FULL).items[0]).toMatchObject({ exerciseId: "weighted-pull-up" });
    expect(pc({ pullups: 12 }, FULL).items[0].sets[0].loadKg).toBe(7.5);
    expect(pc({ pullups: 5 }, ["pullupBar"]).items[0].exerciseId).toBe("pull-up-ladder");
    expect(pc({}, []).items[0].exerciseId).toBe("push-up");
    expect(pc({}, []).items.some((i) => i.exerciseId === "plank")).toBe(true);
  });

  it("with no hangboard a finger day becomes pulling and core, and says so", () => {
    const s = generateSession({ ...base, profile: profile({ equipment: ["pullupBar"] }) });
    expect(s.title).toBe("Pull and core");
    expect(s.items.some((i) => ["max-hang", "min-edge-hang", "repeaters"].includes(i.exerciseId))).toBe(false);
    expect(s.why.join(" ")).toMatch(/no hangboard/);
  });

  it("a mobility day is light and short", () => {
    const s = generateSession({ ...base, slot: "mobility" });
    expect(s.light).toBe(true);
    expect(s.items.map((i) => i.exerciseId)).toEqual(["climbing-warm-up", "hip-thoracic-mobility"]);
  });

  it("trims the extras to fit the user's time, never the main work, and says when it can't", () => {
    const long = generateSession({ ...base, profile: profile({ equipment: FULL, bodyKg: 70, minutes: 120 }) });
    const short = generateSession({ ...base, profile: profile({ equipment: FULL, bodyKg: 70, minutes: 20 }) });
    expect(long.items.length).toBeGreaterThan(short.items.length);
    expect(short.items.some((i) => i.exerciseId === "max-hang")).toBe(true);
    expect(short.why.join(" ")).toMatch(/a little over/);
    expect(sessionMinutes(long.items)).toBe(long.minutes);
  });
});

describe("a whole plan", () => {
  const p = plan(profile({ equipment: FULL, bodyKg: 70 }), TESTS);

  it("covers the block with sessions that start today or later, one a day, in order, with reasons", () => {
    expect(p.block.weeks).toBe(8);
    expect(p.startDay).toBe(MON);
    expect(p.status).toBe("active");
    const days = p.sessions.map((s) => s.day);
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort()).toEqual(days);
    expect(days[0] >= MON && days[days.length - 1] < addDays(MON, 56)).toBe(true);
    expect(p.sessions.every((s) => s.why.length >= 2 && s.minutes > 0 && s.status === "planned")).toBe(true);
    expect(new Set(p.sessions.map((s) => s.id)).size).toBe(p.sessions.length);
  });

  it("only writes sessions from the start date: an early-week start has week one from today", () => {
    const wed = plan(profile({ equipment: FULL }), TESTS, "2026-11-11");
    expect(wed.sessions.every((s) => s.day >= "2026-11-11")).toBe(true);
    expect(wed.startDay).toBe(MON);
  });

  it("is the same every time for the same inputs", () => {
    expect(JSON.stringify(plan(profile({ equipment: FULL, bodyKg: 70 }), TESTS))).toBe(JSON.stringify(p));
  });

  it("changes phase half way and has light weeks 4 and 8", () => {
    const wk = (n: number) => p.sessions.filter((s) => s.week === n);
    expect(wk(1)[0].items.some((i) => i.exerciseId === "max-hang")).toBe(true);
    expect(wk(5).some((s) => s.items.some((i) => i.exerciseId === "min-edge-hang"))).toBe(true);
    expect(wk(4).every((s) => s.light)).toBe(true);
    expect(wk(8).every((s) => s.light)).toBe(true);
    expect(wk(2).some((s) => !s.light)).toBe(true);
  });
});

describe("plans are safe across many profiles", () => {
  const trainDaySets = [[0, 2, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5, 6], [2], [5, 6], [0, 2, 4, 6]];
  const climbSets = [[], [1, 5], [0, 1, 2, 3, 4, 5, 6]];
  const equipments: Equipment[][] = [FULL, [], ["hangboard"], ["pullupBar"], ["hangboard", "pullupBar"]];
  const todays: Day[] = [MON, "2026-11-11", "2026-11-13", "2026-11-15"];

  it("keeps finger sessions 48 hours apart, a rest day each week, and only exercises the user can do", () => {
    let count = 0;
    for (const days of [1, 2, 3, 4, 5, 6]) for (const trainDays of trainDaySets) for (const climbDays of climbSets) for (const equipment of equipments)
      for (const fingerHistory of ["new", "some", "regular"] as const) for (const tests of [{}, TESTS]) for (const today of todays) {
        const prof = profile({ daysPerWeek: days, trainDays, climbDays, equipment, fingerHistory, bodyKg: 70, injury: count % 7 === 0 ? "sore finger" : "" });
        const pl = plan(prof, tests, today, (["strength", "endurance", "balanced", "unknown"] as const)[count % 4]);
        count++;
        const finger = pl.sessions.filter((s) => FINGER_SLOTS.includes(s.slot));
        for (let i = 1; i < finger.length; i++) expect(daysBetween(finger[i - 1].day, finger[i].day), `${JSON.stringify(prof)} ${today}`).toBeGreaterThanOrEqual(2);
        const byDay = new Map(pl.sessions.map((s) => [s.day, s]));
        expect(byDay.size).toBe(pl.sessions.length);
        if (climbDays.length < 7) {
          for (let w = 1; w <= pl.block.weeks; w++) {
            const start = addDays(pl.startDay, 7 * (w - 1));
            if (start < today) continue;
            const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !byDay.has(addDays(start, d)) && !climbDays.includes(d));
            expect(free.length, `week ${w} ${JSON.stringify(prof)}`).toBeGreaterThanOrEqual(1);
          }
        }
        for (const s of pl.sessions) {
          expect(s.items.length).toBeGreaterThan(0);
          for (const it of s.items) {
            const ex = exerciseById(it.exerciseId);
            expect(ex, it.exerciseId).toBeTruthy();
            expect(canDo(ex!, equipment), `${it.exerciseId} with ${equipment}`).toBe(true);
            expect(it.sets.length).toBeGreaterThan(0);
            for (const t of it.sets) {
              expect(Number.isFinite(t.restS) && t.restS >= 0).toBe(true);
              if (t.loadKg !== null) expect(Math.abs(t.loadKg)).toBeLessThan(150);
              if (pl.block.kind === "starter") expect(t.loadKg === null || t.loadKg <= 0).toBe(true);
            }
          }
        }
      }
    expect(count).toBeGreaterThan(5000);
  }, 120_000);
});

describe("following and changing a plan", () => {
  const p = plan(profile({ equipment: FULL, bodyKg: 70 }), TESTS);
  const first = p.sessions[0];

  it("finds today's and the next session, and nothing when the plan is paused", () => {
    expect(todaysSession(p, first.day)?.id).toBe(first.id);
    expect(todaysSession(p, addDays(first.day, 1))).toBeNull();
    expect(nextSession(p, addDays(first.day, 1))!.day > first.day).toBe(true);
    expect(todaysSession({ ...p, status: "paused" }, first.day)).toBeNull();
    expect(sessionsInWeek(p, MON).length).toBeGreaterThan(0);
  });

  it("skipping and completing change the status and nothing else, and a skipped session is not today's", () => {
    const s = skipSession(p, first.id);
    expect(s.sessions[0].status).toBe("skipped");
    expect(s.sessions.slice(1)).toEqual(p.sessions.slice(1));
    expect(todaysSession(s, first.day)).toBeNull();
    expect(completeSession(p, first.id).sessions[0].status).toBe("done");
  });

  it("moves a session to a free day that keeps 48 hours, remembering where it came from", () => {
    const finger = p.sessions.filter((s) => s.slot === "finger")[0];
    const target = addDays(finger.day, 5);
    const free = [target, addDays(target, 1), addDays(target, -1)].find((d) => !p.sessions.some((s) => s.day === d && s.id !== finger.id))!;
    const r = moveSession(p, finger.id, free, MON);
    if (r.ok) { const moved = r.plan.sessions.find((s) => s.id === finger.id)!; expect(moved.day).toBe(free); expect(moved.movedFrom).toBe(finger.day); expect([...r.plan.sessions.map((s) => s.day)].sort()).toEqual(r.plan.sessions.map((s) => s.day)); } else expect(r.reason).toBeTruthy();
  });

  it("says why it can't move one: a day that has passed, a taken day, or too close to a finger session, and offers the nearest good day", () => {
    const fingers = p.sessions.filter((s) => s.slot === "finger");
    const a = fingers[0];
    const b = fingers[1];
    const past = moveSession(p, a.id, addDays(a.day, -3), a.day);
    expect(past).toMatchObject({ ok: false, reason: "That day has passed." });
    const taken = moveSession(p, a.id, b.day, MON);
    expect(taken).toMatchObject({ ok: false });
    if (!taken.ok) expect(taken.reason).toMatch(/already a session on/);
    const tooClose = p.sessions.find((s) => !FINGER_SLOTS.includes(s.slot) && fingers.some((f) => Math.abs(daysBetween(f.day, s.day)) === 1));
    if (tooClose) {
      const r = moveSession(p, a.id, addDays(b.day, 1), MON);
      expect(r.ok).toBe(false);
    }
    const bad = moveSession(p, a.id, addDays(b.day, 1), MON);
    if (!bad.ok) {
      expect(bad.reason.length).toBeGreaterThan(5);
      if (bad.nearest) expect(nearestGoodDay(p, a, addDays(b.day, 1), MON)).toBe(bad.nearest);
    }
  });

  it("will not move a done or skipped session", () => {
    expect(moveSession(skipSession(p, first.id), first.id, addDays(first.day, 3), MON)).toMatchObject({ ok: false });
  });

  it("makes a session lighter: fewer work sets, a tenth less load, the ramp sets kept", () => {
    const finger = p.sessions.find((s) => s.slot === "finger" && s.week === 2)!;
    const l = lighten(finger);
    const before = finger.items.find((i) => i.exerciseId === "max-hang")!;
    const after = l.items.find((i) => i.exerciseId === "max-hang")!;
    expect(after.sets.filter((t) => t.onS === 5)).toHaveLength(before.sets.filter((t) => t.onS === 5).length);
    expect(after.sets.filter((t) => t.onS === 10).length).toBeLessThan(before.sets.filter((t) => t.onS === 10).length);
    expect(after.sets.filter((t) => t.onS === 10)[0].loadKg!).toBeLessThan(before.sets.filter((t) => t.onS === 10)[0].loadKg!);
    expect(l.light).toBe(true);
    expect(l.minutes).toBeLessThan(finger.minutes);
    expect(lighten(lighten(lighten(finger))).items.every((i) => i.sets.length >= 1)).toBe(true);
  });

  it("offers swaps of the same kind that the user can do, and swaps keep the number of sets", () => {
    const alts = alternativesFor("weighted-pull-up", ["pullupBar"], EXERCISES);
    expect(alts.map((e) => e.id)).toContain("pull-up-ladder");
    expect(alts.map((e) => e.id)).not.toContain("weighted-pull-up");
    expect(alts.every((e) => e.category === "pulling" && canDo(e, ["pullupBar"]))).toBe(true);
    expect(alternativesFor("nope", FULL, EXERCISES)).toEqual([]);
    const pc = p.sessions.find((s) => s.slot === "pullcore")!;
    const main = pc.items[0];
    const sw = swapExercise(pc, main.exerciseId, "lock-off");
    expect(sw.items[0].exerciseId).toBe("lock-off");
    expect(sw.items[0].sets).toHaveLength(main.sets.length);
    expect(sw.why[sw.why.length - 1]).toBe("Swapped for Lock-offs.");
    expect(swapExercise(pc, main.exerciseId, "unknown-id")).toBe(pc);
  });

  it("names weekdays", () => { expect(weekdayName("2026-11-09")).toBe("Monday"); expect(weekdayOf("2026-11-15")).toBe(6); });
});
