import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_VERSION, describeBackup, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson } from "./export";
import { ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { EMPTY_PREFS } from "./prefsBackup";
import type { RopedLog } from "./roped";
import { loadRoped, saveRoped } from "./ropedLocal";
import { EMPTY_SPACES } from "./spacesBackup";

const rope = (over: Partial<RopedLog> = {}): RopedLog => ({
  id: "r1", style: "sport", setting: "outdoor", name: "Slab Happy", venue: "Index", link: "https://thecrag.com/r", gradeSystem: "french", gradeLabel: "6a+", grade: 13,
  result: "redpoint", attempts: 3, lengthM: 24.5, pitches: 2, note: "good", climbedAt: "2026-11-04 18:00:00", ...over,
});
const file = (roped: unknown[]) => {
  const bundle = JSON.parse(exportJson({
    now: new Date("2026-11-05T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], litHistory: [], moon: EMPTY_MOON,
    spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
  }));
  return JSON.stringify({ ...bundle, roped });
};
const isLocal = (p: string) => p === "moon";
const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
const parse = (roped: unknown[]) => { const p = parseBackup(file(roped), isLocal); if (!p.ok) throw new Error(p.error); return p.backup; };

describe("roped climbs in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("comes back exactly as it was, on an empty phone", async () => {
    await saveRoped(src, rope());
    await saveRoped(src, rope({ id: "r2", style: "autobelay", setting: "indoor", name: "", venue: "", link: "", gradeSystem: "yds", gradeLabel: "5.10a", grade: 11, attempts: 6, lengthM: null, pitches: 1, note: "", climbedAt: "2026-11-03 18:00:00" }));
    const b = parse(await loadRoped(src));
    expect(b.skipped).toBe(0);
    const sum = await restoreBackup(targets(dst), b);
    expect(sum.roped).toBe(2);
    expect(await loadRoped(dst)).toEqual(await loadRoped(src));
  });

  it("is safe to restore twice: nothing doubles", async () => {
    const b = parse([rope()]);
    await restoreBackup(targets(dst), b);
    await restoreBackup(targets(dst), b);
    expect(await loadRoped(dst)).toHaveLength(1);
  });

  it("replaces a climb already on the phone with the file's copy, and leaves the others", async () => {
    await saveRoped(dst, rope({ note: "old" }));
    await saveRoped(dst, rope({ id: "keep" }));
    await restoreBackup(targets(dst), parse([rope({ note: "from the file" })]));
    const after = await loadRoped(dst);
    expect(after.find((l) => l.id === "r1")?.note).toBe("from the file");
    expect(after.map((l) => l.id).sort()).toEqual(["keep", "r1"]);
  });

  it("is named when previewing a backup", () => {
    expect(describeBackup(parse([rope(), rope({ id: "r2" })]))).toBe("2 roped climbs");
    expect(describeBackup(parse([rope()]))).toBe("1 roped climb");
  });

  it("is a section of the current format, and a file made before it still reads", () => {
    expect(BACKUP_VERSION).toBeGreaterThanOrEqual(4);
    const old = parseBackup(JSON.stringify({ app: "slackboard", version: 3, exportedAt: "2026-11-01T00:00:00Z", offBoard: [] }), isLocal);
    expect(old.ok).toBe(true);
    if (old.ok) expect(old.backup.roped).toEqual([]);
  });
});

describe("roped records in a backup file are untrusted", () => {
  const bad: [string, unknown][] = [
    ["not an object", "nope"],
    ["no id", { ...rope(), id: undefined }],
    ["a style that doesn't exist", rope({ style: "aid" as never })],
    ["a setting that doesn't exist", rope({ setting: "moon" as never })],
    ["a result that doesn't exist", rope({ result: "sent" as never })],
    ["a grade label the list doesn't have", rope({ gradeLabel: "5.10e" })],
    ["a French label under YDS", rope({ gradeSystem: "yds", gradeLabel: "6a+" })],
    ["a link that isn't a web address", rope({ link: "javascript:alert(1)" })],
    ["a length of zero", rope({ lengthM: 0 })],
    ["a length beyond any route", rope({ lengthM: 99999 })],
    ["a date that isn't one", rope({ climbedAt: "yesterday" })],
    ["an attempt count that isn't a number", { ...rope(), attempts: "3" }],
  ];

  it.each(bad)("skips and counts a record with %s", (_why, record) => {
    const b = parse([record, rope({ id: "good" })]);
    expect(b.roped.map((l) => l.id)).toEqual(["good"]);
    expect(b.skipped).toBe(1);
  });

  it("repairs what can be repaired instead of trusting it", () => {
    const [l] = parse([{ ...rope(), grade: 99, attempts: 500, pitches: 400, style: "autobelay", result: "fell", link: "thecrag.com/r" }]).roped;
    // The grade number comes from the label, not from the file; counts are clamped; autobelay is stored as laps.
    expect(l).toMatchObject({ grade: 13, attempts: 99, pitches: 30, result: "redpoint", link: "https://thecrag.com/r" });
  });

  it("reads no length as none, whether null or left out, but not a length that is present and unusable", () => {
    expect(parse([rope({ lengthM: null })]).roped[0].lengthM).toBeNull();
    const { lengthM: _omitted, ...noLength } = rope();
    const left = parse([noLength]);
    expect(left.roped[0].lengthM).toBeNull();
    expect(left.skipped).toBe(0);
    expect(parse([{ ...rope(), lengthM: "tall" }]).skipped).toBe(1);
  });

  it("ignores a roped section that isn't a list", () => {
    const text = JSON.stringify({ ...JSON.parse(file([])), roped: "oops" });
    const p = parseBackup(text, isLocal);
    expect(p.ok && p.backup.roped).toEqual([]);
  });
});
