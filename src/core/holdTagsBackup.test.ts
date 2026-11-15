import { beforeEach, describe, expect, it } from "vitest";
import { describeBackup, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson } from "./export";
import type { HoldTag } from "./holdSurvey";
import { deleteHoldTag, loadHoldTags, saveHoldTag } from "./holdTagsLocal";
import { clearLocalData, ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";

const tag = (key: string, tags: HoldTag["tags"], over: Partial<HoldTag> = {}): HoldTag => ({ board: "tension-11-8", key, tags, note: "", taggedAt: "2026-11-15 10:00:00", ...over });
const file = (holdTags: unknown[]) => {
  const bundle = JSON.parse(exportJson({
    now: new Date("2026-11-15T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], training: [], goals: [], profile: null, tests: [], plans: [],
    dayNotes: [], litHistory: [], moon: EMPTY_MOON, spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
  }));
  return JSON.stringify({ ...bundle, holdTags });
};
const isLocal = (p: string) => p === "moon";
const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
const parse = (list: unknown[]) => { const p = parseBackup(file(list), isLocal); if (!p.ok) throw new Error(p.error); return p.backup; };

describe("hold tags storage", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("keeps several tags per hold in a fixed order, replaces by hold, and removes a hold with no tags", async () => {
    await saveHoldTag(db, tag("10", ["wood", "pinch", "crimp"], { note: "sharp" }));
    await saveHoldTag(db, tag("9", ["undercling"]));
    expect((await loadHoldTags(db)).find((t) => t.key === "10")).toEqual(tag("10", ["crimp", "pinch", "wood"], { note: "sharp" }));
    await saveHoldTag(db, tag("10", ["jug"]));
    expect((await loadHoldTags(db)).find((t) => t.key === "10")?.tags).toEqual(["jug"]);
    await saveHoldTag(db, tag("9", []));
    expect((await loadHoldTags(db)).map((t) => t.key)).toEqual(["10"]);
    await deleteHoldTag(db, "tension-11-8", "10");
    expect(await loadHoldTags(db)).toEqual([]);
  });

  it("keeps the same key on different boards apart, and survives signing out", async () => {
    await saveHoldTag(db, tag("5", ["jug"]));
    await saveHoldTag(db, tag("5", ["pocket"], { board: "moonboard-1-1" }));
    await clearLocalData(db);
    expect((await loadHoldTags(db)).map((t) => `${t.board}:${t.tags}`)).toEqual(["moonboard-1-1:pocket", "tension-11-8:jug"]);
  });
});

describe("hold tags in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("come back exactly as they were, and restoring twice changes nothing", async () => {
    await saveHoldTag(src, tag("1", ["crimp", "wood"], { note: "faces left" }));
    await saveHoldTag(src, tag("2", ["unsure", "gaston"]));
    const b = parse(await loadHoldTags(src));
    expect(b.skipped).toBe(0);
    expect(describeBackup(b)).toBe("2 hold tags");
    expect((await restoreBackup(targets(dst), b)).holdTags).toBe(2);
    await restoreBackup(targets(dst), b);
    expect(await loadHoldTags(dst)).toEqual(await loadHoldTags(src));
  });

  it("skips and counts a damaged record, and ignores a section that isn't a list", () => {
    const b = parse([tag("1", ["jug"]), { ...tag("2", ["jug"]), tags: ["sparkly"] }, "nope", { ...tag("3", ["jug"]), taggedAt: "soon" }]);
    expect(b.holdTags.map((t) => t.key)).toEqual(["1"]);
    expect(b.skipped).toBe(3);
    const p = parseBackup(JSON.stringify({ ...JSON.parse(file([])), holdTags: "oops" }), isLocal);
    expect(p.ok && p.backup.holdTags).toEqual([]);
  });

  it("reads an older backup that has no hold tags", () => {
    const old = JSON.parse(file([]));
    delete old.holdTags;
    const p = parseBackup(JSON.stringify(old), isLocal);
    expect(p.ok && p.backup.holdTags).toEqual([]);
  });
});
