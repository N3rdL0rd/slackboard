import { beforeEach, describe, expect, it } from "vitest";
import { describeBackup, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import { blankNote, type DayNote } from "./body";
import { loadDayNotes, loadSnoozes, saveDayNote, saveSnooze } from "./dayNotesLocal";
import type { Db } from "./db";
import { exportJson } from "./export";
import { clearLocalData, ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";

const note = (day: string, over: Partial<DayNote> = {}): DayNote => ({ ...blankNote(day), ...over });
const file = (dayNotes: unknown[]) => {
  const bundle = JSON.parse(exportJson({
    now: new Date("2026-11-05T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], dayNotes: [], litHistory: [], moon: EMPTY_MOON,
    spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
  }));
  return JSON.stringify({ ...bundle, dayNotes });
};
const isLocal = (p: string) => p === "moon";
const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
const parse = (list: unknown[]) => { const p = parseBackup(file(list), isLocal); if (!p.ok) throw new Error(p.error); return p.backup; };

describe("day notes storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("saves, reads back exactly, replaces by day, and drops a note that says nothing", async () => {
    await saveDayNote(db, note("2026-11-03", { effort: 7, fingers: "sore", note: "tweaky" }));
    await saveDayNote(db, note("2026-11-04", { energy: 2 }));
    expect((await loadDayNotes(db)).map((n) => n.day)).toEqual(["2026-11-04", "2026-11-03"]);
    expect((await loadDayNotes(db))[1]).toEqual(note("2026-11-03", { effort: 7, fingers: "sore", note: "tweaky" }));
    await saveDayNote(db, note("2026-11-03", { effort: 3 }));
    expect((await loadDayNotes(db)).find((n) => n.day === "2026-11-03")).toMatchObject({ effort: 3, fingers: "fine" });
    await saveDayNote(db, note("2026-11-03"));
    expect((await loadDayNotes(db)).map((n) => n.day)).toEqual(["2026-11-04"]);
  });

  it("keeps notes when the user signs out, and forgets the snoozes", async () => {
    await saveDayNote(db, note("2026-11-03", { effort: 7 }));
    await saveSnooze(db, "nudge", "2026-11-03");
    expect(await loadSnoozes(db)).toEqual({ nudge: "2026-11-03" });
    await clearLocalData(db);
    expect(await loadDayNotes(db)).toHaveLength(1);
    expect(await loadSnoozes(db)).toEqual({});
  });

  it("remembers the last snooze for a key", async () => {
    await saveSnooze(db, "nudge", "2026-11-03");
    await saveSnooze(db, "nudge", "2026-11-05");
    await saveSnooze(db, "motivation", "2026-11-05");
    expect(await loadSnoozes(db)).toEqual({ nudge: "2026-11-05", motivation: "2026-11-05" });
  });
});

describe("day notes in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("come back exactly as they were, and restoring twice changes nothing", async () => {
    await saveDayNote(src, note("2026-11-03", { effort: 7, energy: 4, fingers: "hurts", elbows: "sore", note: "pop on the crimp" }));
    await saveDayNote(src, note("2026-11-04", { shoulders: "sore" }));
    const b = parse(await loadDayNotes(src));
    expect(b.skipped).toBe(0);
    expect(describeBackup(b)).toBe("2 body check-ins");
    expect((await restoreBackup(targets(dst), b)).dayNotes).toBe(2);
    await restoreBackup(targets(dst), b);
    expect(await loadDayNotes(dst)).toEqual(await loadDayNotes(src));
  });

  it("skips and counts a damaged record, reads a bad rating as not given, and ignores a section that isn't a list", () => {
    const b = parse([note("2026-11-03", { effort: 5 }), { day: "2026-13-40", note: "" }, "nope", { day: "2026-11-06", effort: 99, fingers: "broken", note: "" }]);
    expect(b.dayNotes.map((n) => n.day)).toEqual(["2026-11-03", "2026-11-06"]);
    expect(b.dayNotes[1]).toEqual(blankNote("2026-11-06"));
    expect(b.skipped).toBe(2);
    const p = parseBackup(JSON.stringify({ ...JSON.parse(file([])), dayNotes: "oops" }), isLocal);
    expect(p.ok && p.backup.dayNotes).toEqual([]);
  });
});
