import { beforeEach, describe, expect, it } from "vitest";
import { describeBackup, describeRestored, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson } from "./export";
import { type Goal, makeWindow } from "./goals";
import { deleteGoal, loadGoals, saveGoal } from "./goalsLocal";
import { ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g1", title: "20 sends this month", spec: { type: "volume", scope: "any", metric: "sends", count: 20 }, window: makeWindow("month", "2026-11-12"),
  status: "active", createdAt: "2026-11-01 09:00:00", achievedAt: null, ...over,
});
const done = (id: string): Goal => goal({ id, status: "achieved", achievedAt: "2026-11-09 18:00:00", createdAt: "2026-10-30 09:00:00", title: "Send a V5", spec: { type: "grade", scope: "boulder", grade: 5 }, window: makeWindow("none", "2026-11-01") });

const file = (goals: unknown[]) => {
  const bundle = JSON.parse(exportJson({
    now: new Date("2026-11-12T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], training: [], goals: [], dayNotes: [], litHistory: [],
    moon: EMPTY_MOON, spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
  }));
  return JSON.stringify({ ...bundle, goals });
};
const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
const parse = (goals: unknown[]) => { const p = parseBackup(file(goals), (x) => x === "moon"); if (!p.ok) throw new Error(p.error); return p.backup; };

describe("goal storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("saves, replaces by id, and lists newest first", async () => {
    await saveGoal(db, goal());
    await saveGoal(db, done("g0"));
    await saveGoal(db, goal({ title: "20 sends this month", status: "missed" }));
    const all = await loadGoals(db);
    expect(all.map((g) => g.id)).toEqual(["g1", "g0"]);
    expect(all[0].status).toBe("missed");
    expect(all[1]).toEqual(done("g0"));
  });

  it("deletes a goal, and leaves out a row that no longer makes a goal without failing", async () => {
    await saveGoal(db, goal());
    await db.run("UPDATE l_goals SET scope_json = '{not json' WHERE id = 'g1'");
    await saveGoal(db, done("g2"));
    expect((await loadGoals(db)).map((g) => g.id)).toEqual(["g2"]);
    await deleteGoal(db, "g2");
    expect(await loadGoals(db)).toEqual([]);
  });
});

describe("goals in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("comes back exactly as it was, achieved goals staying achieved, and restoring twice doubles nothing", async () => {
    await saveGoal(src, goal());
    await saveGoal(src, done("g2"));
    const b = parse(await loadGoals(src));
    expect(b.skipped).toBe(0);
    const sum = await restoreBackup(targets(dst), b);
    await restoreBackup(targets(dst), b);
    expect(sum.goals).toBe(2);
    expect(await loadGoals(dst)).toEqual(await loadGoals(src));
  });

  it("skips and counts damaged goals and keeps the good ones", () => {
    const b = parse([goal(), { ...goal({ id: "g3" }), status: "done" }, { id: "g4" }, "oops", { ...goal({ id: "g5" }), spec: { type: "volume", scope: "any", metric: "sends", count: -1 } }]);
    expect(b.goals.map((g) => g.id)).toEqual(["g1"]);
    expect(b.skipped).toBe(4);
  });

  it("reads a file from before goals existed", () => {
    const old = JSON.parse(file([]));
    delete old.goals;
    old.version = 5;
    const p = parseBackup(JSON.stringify(old), (x) => x === "moon");
    expect(p.ok && p.backup.goals).toEqual([]);
  });

  it("says what a backup holds and what was restored", () => {
    expect(describeBackup(parse([goal(), done("g2")]))).toContain("2 goals");
    expect(describeRestored({ offBoard: 0, roped: 0, training: 0, goals: 1, dayNotes: 0, localLogs: 0, circuits: 0, litHistory: 0, moonBoards: 0, moonProblems: 0, moonTags: 0, places: 0, preferences: false, skipped: 0 })).toBe("Restored 1 goal.");
  });
});
