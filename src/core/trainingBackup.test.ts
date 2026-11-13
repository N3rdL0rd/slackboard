import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_VERSION, describeBackup, describeRestored, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson, logbookCsv } from "./export";
import { ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";
import type { TrainingEntry } from "./training";
import { deleteTraining, loadTraining, saveTraining } from "./trainingLocal";

const entry = (over: Partial<TrainingEntry> = {}): TrainingEntry => ({
  id: "t1", exerciseId: "repeaters", performedAt: "2026-11-04 18:00:00", effort: 7, note: "felt good",
  sets: [
    { position: 0, reps: 6, loadKg: 10, timeS: 7, edgeMm: 20, grip: "halfCrimp", restS: 180, done: true },
    { position: 1, reps: 4, loadKg: 10, timeS: 7, edgeMm: 20, grip: "halfCrimp", restS: 180, done: true },
  ], ...over,
});
const file = (training: unknown[]) => {
  const bundle = JSON.parse(exportJson({
    now: new Date("2026-11-05T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], training: [], goals: [], dayNotes: [], litHistory: [], moon: EMPTY_MOON,
    spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
  }));
  return JSON.stringify({ ...bundle, training });
};
const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
const parse = (training: unknown[]) => { const p = parseBackup(file(training), (x) => x === "moon"); if (!p.ok) throw new Error(p.error); return p.backup; };

describe("training storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("saves an entry with its sets, newest first, and replaces it by id", async () => {
    await saveTraining(db, entry());
    await saveTraining(db, entry({ id: "t0", performedAt: "2026-11-01 08:00:00", exerciseId: "plank", sets: [{ position: 0, reps: null, loadKg: null, timeS: 45, edgeMm: null, grip: null, restS: null, done: false }] }));
    const all = await loadTraining(db);
    expect(all.map((e) => e.id)).toEqual(["t1", "t0"]);
    expect(all[0]).toEqual(entry());
    expect(all[1].sets[0]).toMatchObject({ done: false, grip: null, loadKg: null });
    await saveTraining(db, entry({ sets: [entry().sets[0]] }));
    expect((await loadTraining(db))[0].sets).toHaveLength(1);
  });

  it("deletes an entry and its sets together", async () => {
    await saveTraining(db, entry());
    await deleteTraining(db, "t1");
    expect(await loadTraining(db)).toEqual([]);
    expect(await db.all("SELECT * FROM l_training_sets")).toEqual([]);
  });
});

describe("training in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("comes back exactly as it was, on an empty phone, and restoring twice doubles nothing", async () => {
    await saveTraining(src, entry());
    await saveTraining(src, entry({ id: "t2", exerciseId: "plank", sets: [{ position: 0, reps: null, loadKg: null, timeS: 45, edgeMm: null, grip: null, restS: 60, done: true }] }));
    const b = parse(await loadTraining(src));
    expect(b.skipped).toBe(0);
    const sum = await restoreBackup(targets(dst), b);
    await restoreBackup(targets(dst), b);
    expect(sum.training).toBe(2);
    expect(await loadTraining(dst)).toEqual(await loadTraining(src));
  });

  it("skips and counts damaged entries and exercises this version doesn't know, and keeps the good ones", () => {
    const b = parse([entry(), { ...entry({ id: "t3" }), exerciseId: "from-the-future" }, { id: "t4" }, "oops"]);
    expect(b.training.map((e) => e.id)).toEqual(["t1"]);
    expect(b.skipped).toBe(3);
  });

  it("reads a file from before training existed, and ignores a training section that isn't a list", () => {
    const old = JSON.parse(file([]));
    delete old.training;
    old.version = 4;
    const p = parseBackup(JSON.stringify(old), (x) => x === "moon");
    expect(p.ok && p.backup.training).toEqual([]);
    expect(parse([]).training).toEqual([]);
    expect(BACKUP_VERSION).toBeGreaterThanOrEqual(5);
  });

  it("says what a backup holds and what was restored", () => {
    const b = parse([entry(), entry({ id: "t2" })]);
    expect(describeBackup(b)).toContain("2 training entries");
    expect(describeRestored({ offBoard: 0, roped: 0, training: 1, goals: 0, dayNotes: 0, localLogs: 0, circuits: 0, litHistory: 0, moonBoards: 0, moonProblems: 0, moonTags: 0, places: 0, preferences: false, skipped: 0 })).toBe("Restored 1 training entry.");
  });
});

describe("training in the CSV", () => {
  it("adds a row for each entry with a done set, quoting the exercise name, and skips entries with none done", () => {
    const empty = entry({ id: "t9", sets: [{ ...entry().sets[0], done: false }] });
    const lines = logbookCsv([], () => ({ v: "", font: "" }), [], () => ({ v: "", font: "" }), [], [entry(), empty]).trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-11-04 18:00:00,,"Repeaters (7 on, 3 off)",t1,training,,,2,,,,felt good,,,,,,training,,,,,,,2 sets: 4 \u00D7 7 s \u00B7 20 mm \u00B7 +10 kg \u00B7 Half crimp');
  });
});
