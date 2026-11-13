import { beforeEach, describe, expect, it } from "vitest";
import { describeBackup, describeRestored, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson } from "./export";
import { ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { parsePlan, parseProfile, parsePlanSession, parseTestResult } from "./planData";
import { deletePlan, deleteTest, loadPlans, loadProfile, loadTests, savePlan, saveProfile, saveTest } from "./planLocal";
import { buildPlan, DEFAULT_PROFILE, skipSession, type Plan, type Profile, type TestResult } from "./planner";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";

const profile: Profile = { ...DEFAULT_PROFILE, bodyKg: 72.5, equipment: ["hangboard", "pullupBar", "weights"], injury: "", goalDate: "2027-01-24", emphasis: "strength" };
const test = (id = "t1"): TestResult => ({ id, test: "hang7", value: 25, takenAt: "2026-11-09 10:00:00" });
const mkPlan = (id = "p1"): Plan => { let n = 0; return buildPlan({ id, today: "2026-11-09", now: new Date(2026, 10, 9), profile, tests: { hang7: 25, pullups: 10 }, logsEmphasis: "strength", newId: () => `${id}s${++n}`, createdAt: "2026-11-09 08:00:00" }); };
const wire = <T,>(x: T): Record<string, unknown> => JSON.parse(JSON.stringify(x));

describe("reading a profile", () => {
  it("accepts a good one unchanged, and cleans up day lists", () => {
    expect(parseProfile(wire(profile))).toEqual(profile);
    expect(parseProfile({ ...wire(profile), trainDays: [4, 0, 0, 2] })!.trainDays).toEqual([0, 2, 4]);
  });

  it("refuses damaged ones instead of half-reading them", () => {
    for (const bad of [{ bodyKg: 5 }, { bodyKg: "70" }, { fingerHistory: "expert" }, { equipment: ["rocket"] }, { daysPerWeek: 0 }, { daysPerWeek: 7 }, { minutes: 5 }, { trainDays: [7] }, { climbDays: "mon" }, { emphasis: "speed" }, { goalDate: "soon" }, { injury: "x".repeat(501) }]) {
      expect(parseProfile({ ...wire(profile), ...bad }), JSON.stringify(bad)).toBeNull();
    }
    expect(parseProfile(null)).toBeNull();
  });
});

describe("reading a test result", () => {
  it("allows an assisted (negative) 7-second hang and nothing else negative", () => {
    expect(parseTestResult({ ...test(), value: -8 })).toMatchObject({ value: -8 });
    expect(parseTestResult({ ...test(), test: "pullups", value: -1 })).toBeNull();
    expect(parseTestResult({ ...test(), test: "kicks" })).toBeNull();
    expect(parseTestResult({ ...test(), takenAt: "today" })).toBeNull();
    expect(parseTestResult({ ...test(), value: Infinity })).toBeNull();
  });
});

describe("reading a plan", () => {
  const p = mkPlan();

  it("accepts a generated plan unchanged", () => {
    expect(parsePlan(wire(p))).toEqual(p);
  });

  it("refuses a plan or session with anything wrong, whole", () => {
    const w = wire(p);
    const s0 = (w.sessions as Record<string, unknown>[])[0];
    expect(parsePlan({ ...w, startDay: "2026-11-10" })).toBeNull(); // not a Monday
    expect(parsePlan({ ...w, status: "running" })).toBeNull();
    expect(parsePlan({ ...w, block: { ...(w.block as object), weeks: 40 } })).toBeNull();
    expect(parsePlan({ ...w, sessions: [s0, s0] })).toBeNull(); // the same id twice
    expect(parsePlanSession({ ...s0, items: [{ exerciseId: "not-in-library", sets: [{ restS: 60 }] }] })).toBeNull();
    expect(parsePlanSession({ ...s0, items: [{ exerciseId: "max-hang", sets: [{ reps: null, onS: 10, offS: null, restS: -5, loadKg: 0, edgeMm: 20, grip: "halfCrimp" }] }] })).toBeNull();
    expect(parsePlanSession({ ...s0, items: [{ exerciseId: "max-hang", sets: [{ reps: null, onS: 10, offS: null, restS: 60, loadKg: 9999, edgeMm: 20, grip: null }] }] })).toBeNull();
    expect(parsePlanSession({ ...s0, items: [{ exerciseId: "max-hang", sets: [] }] })).toBeNull();
    expect(parsePlanSession({ ...s0, slot: "technique" })).toBeNull();
    expect(parsePlanSession({ ...s0, day: "2026-13-40" })).toBeNull();
    expect(parsePlanSession(s0)).toEqual(p.sessions[0]);
  });
});

describe("plan storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("saves and reads a profile, replacing it", async () => {
    expect(await loadProfile(db)).toBeNull();
    await saveProfile(db, profile);
    await saveProfile(db, { ...profile, bodyKg: 80 });
    expect(await loadProfile(db)).toEqual({ ...profile, bodyKg: 80 });
  });

  it("saves tests, newest first, and deletes one", async () => {
    await saveTest(db, test("a"));
    await saveTest(db, { ...test("b"), takenAt: "2026-12-01 10:00:00", value: 30 });
    expect((await loadTests(db)).map((t) => t.id)).toEqual(["b", "a"]);
    await deleteTest(db, "b");
    expect((await loadTests(db)).map((t) => t.id)).toEqual(["a"]);
  });

  it("saves a plan with its sessions, replaces it by id, and deletes the sessions with it", async () => {
    const p = mkPlan();
    await savePlan(db, p);
    expect(await loadPlans(db)).toEqual([p]);
    const skipped = skipSession(p, p.sessions[0].id);
    await savePlan(db, skipped);
    const again = await loadPlans(db);
    expect(again).toHaveLength(1);
    expect(again[0].sessions[0].status).toBe("skipped");
    expect(again[0].sessions).toHaveLength(p.sessions.length);
    await deletePlan(db, p.id);
    expect(await loadPlans(db)).toEqual([]);
    expect(await db.all("SELECT * FROM l_plan_sessions")).toEqual([]);
  });

  it("a damaged session drops only itself, and a damaged plan row is left out without failing", async () => {
    const p = mkPlan();
    await savePlan(db, p);
    await db.run("UPDATE l_plan_sessions SET items_json = '{oops' WHERE id = ?", [p.sessions[1].id]);
    const [read] = await loadPlans(db);
    expect(read.sessions).toHaveLength(p.sessions.length - 1);
    await db.run("UPDATE l_plans SET block_json = 'nope' WHERE id = ?", [p.id]);
    expect(await loadPlans(db)).toEqual([]);
  });
});

describe("planner data in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });
  const file = (extra: Record<string, unknown>) => JSON.stringify({
    ...JSON.parse(exportJson({
      now: new Date("2026-11-12T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], training: [], goals: [], profile: null, tests: [], plans: [], dayNotes: [], litHistory: [],
      moon: EMPTY_MOON, spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
    })), ...extra,
  });
  const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
  const parse = (extra: Record<string, unknown>) => { const r = parseBackup(file(extra), (x) => x === "moon"); if (!r.ok) throw new Error(r.error); return r.backup; };

  it("comes back as it was, and restoring twice doubles nothing", async () => {
    await saveProfile(src, profile);
    await saveTest(src, test());
    await savePlan(src, mkPlan());
    const b = parse({ profile: await loadProfile(src), tests: await loadTests(src), plans: await loadPlans(src) });
    expect(b.skipped).toBe(0);
    const sum = await restoreBackup(targets(dst), b);
    await restoreBackup(targets(dst), b);
    expect(sum).toMatchObject({ plans: 1, tests: 1, profile: true });
    expect(await loadPlans(dst)).toEqual(await loadPlans(src));
    expect(await loadTests(dst)).toEqual(await loadTests(src));
    expect(await loadProfile(dst)).toEqual(profile);
  });

  it("skips and counts damaged records, keeps the good ones, and reads a file from before the planner", () => {
    const b = parse({ profile: { bodyKg: 1 }, tests: [test(), { id: "x" }], plans: [wire(mkPlan("good")), { id: "bad" }] });
    expect([b.profile, b.tests.length, b.plans.length, b.skipped]).toEqual([null, 1, 1, 3]);
    const old = JSON.parse(file({}));
    delete old.plans; delete old.tests; delete old.profile; old.version = 6;
    const r = parseBackup(JSON.stringify(old), (x) => x === "moon");
    expect(r.ok && [r.backup.profile, r.backup.tests, r.backup.plans]).toEqual([null, [], []]);
  });

  it("says what it holds and what was restored", () => {
    const b = parse({ profile: wire(profile), tests: [wire(test())], plans: [wire(mkPlan())] });
    expect(describeBackup(b)).toMatch(/1 training plan.*1 test result.*your training profile/);
    expect(describeRestored({ offBoard: 0, roped: 0, training: 0, goals: 0, plans: 1, tests: 2, profile: true, dayNotes: 0, localLogs: 0, circuits: 0, litHistory: 0, moonBoards: 0, moonProblems: 0, moonTags: 0, places: 0, preferences: false, skipped: 0 })).toBe("Restored 1 training plan, 2 test results, your training profile.");
  });
});
