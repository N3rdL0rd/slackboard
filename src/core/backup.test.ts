import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_VERSION, describeBackup, describeRestored, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson, logbookCsv, CSV_HEADER } from "./export";
import { ensureLocalSchema, loadLogicalCircuits, saveLogicalCircuits, type LogicalCircuit } from "./logicalCircuits";
import { encodeFrames } from "./frames";
import { EMPTY_MOON, exportMoon, parseMoon } from "./moonBackup";
import { climbCount, createBoard, LOCAL_USER_ID, saveLog, saveOwnClimb, setTag } from "./moonLocal";
import { layoutIdOf, setupByKey } from "./moonboard";
import { DEFAULT_NOTIFICATIONS } from "./settings";
import { EMPTY_PREFS, parsePreferences, preferencesOf } from "./prefsBackup";
import { loadLogbook, loadStatsAt } from "./repo";
import { localTables } from "./localMigrations";
import { ensureSchema } from "./schema";
import { EMPTY_SPACES, exportSpaces } from "./spacesBackup";
import { saveBoardPlace, saveLogSpace, saveSpaceLineage, saveSpaceName } from "./spaces";
import { openNodeDb } from "./nodeDb";
import type { OutsideLog } from "./outside";
import type { RopedLog } from "./roped";
import type { DayNote } from "./body";
import { loadOutside, saveOutside } from "./outsideLocal";
import type { TrainingEntry } from "./training";
import type { Goal } from "./goals";
import type { LitEntry } from "./litHistory";
import { loadLit, saveLit } from "./litLocal";
import type { LogEntry } from "./types";

const isLocal = (p: string) => p === "moon";
const gradeOf = () => ({ v: "V3", font: "6a" });

const off = (over: Partial<OutsideLog> = {}): OutsideLog => ({
  id: "o1", setting: "outdoor", name: "The Mandala", venue: "Bishop", link: "https://www.mountainproject.com/route/1", wall: "overhang", gradeSystem: "v", gradeLabel: "V4", grade: 4,
  result: "send", attempts: 3, tags: ["Crimpy", "Powerful"], note: "Great line", climbedAt: "2026-11-01 09:00:00", ...over,
});
const log = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: "l1", provider: "moon", climbUuid: "P1", climbName: "Problem", angle: 40, isMirror: false, bidCount: 2, quality: 3, difficulty: 105, comment: "", climbedAt: "2026-11-01 10:00:00", isSend: true, ...over,
});
const circuit = (over: Partial<LogicalCircuit> = {}): LogicalCircuit => ({
  uuid: "c1", name: "Warmups", description: "d", color: "00FF00", userId: 7, isPublic: false, items: [{ provider: "moon", id: "P1" }], climbs: ["P1"], projections: [],
  createdAt: "2026-10-01 10:00:00", updatedAt: "2026-10-02 10:00:00", ...over,
});

const lit = (over: Partial<LitEntry> = {}): LitEntry => ({ id: "t1", provider: "tension", climbUuid: "C1", climbName: "Pizza Box", boardId: "b1", boardName: "Home", angle: 40, litAt: "2026-11-02 18:00:00", ...over });
const file = (o: { offBoard?: OutsideLog[]; roped?: RopedLog[]; training?: TrainingEntry[]; goals?: Goal[]; dayNotes?: DayNote[]; logbook?: LogEntry[]; circuits?: LogicalCircuit[]; litHistory?: LitEntry[]; moon?: typeof EMPTY_MOON; spaces?: typeof EMPTY_SPACES; preferences?: typeof EMPTY_PREFS }) =>
  exportJson({ now: new Date("2026-11-02T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: o.logbook ?? [], circuits: o.circuits ?? [], offBoard: o.offBoard ?? [], roped: o.roped ?? [], training: o.training ?? [], goals: o.goals ?? [], dayNotes: o.dayNotes ?? [], litHistory: o.litHistory ?? [], moon: o.moon ?? EMPTY_MOON, spaces: o.spaces ?? EMPTY_SPACES, preferences: o.preferences ?? EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf });

/** Restore targets where every provider shares one database, which is all these tests need. */
const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });

describe("backup round trip", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("restores off-board climbs, MoonBoard log entries and unpublished circuits into an empty phone, exactly as they were", async () => {
    const ob = [off(), off({ id: "o2", setting: "gym", name: "", venue: "", link: "", gradeSystem: null, gradeLabel: null, grade: null, result: "attempt", attempts: 5, tags: [] })];
    await saveOutside(src, ob[0]); await saveOutside(src, ob[1]);
    await saveLogicalCircuits(src, [circuit()], []);
    await saveLit(src, lit());
    const text = file({ litHistory: await loadLit(src), offBoard: await loadOutside(src), logbook: [log()], circuits: await loadLogicalCircuits(src) });

    const parsed = parseBackup(text, isLocal);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const moonDst = openNodeDb();
    await ensureSchema(moonDst);
    const sum = await restoreBackup({ dbFor: async () => moonDst, local: dst }, parsed.backup);
    expect(sum).toMatchObject({ offBoard: 2, localLogs: 1, circuits: 1, litHistory: 1, moonBoards: 0, moonProblems: 0, moonTags: 0, places: 0, preferences: false, skipped: 0 });
    expect(await loadLit(dst)).toEqual(await loadLit(src));
    expect(await loadOutside(dst)).toEqual(await loadOutside(src));
    expect(await loadLogicalCircuits(dst)).toEqual(await loadLogicalCircuits(src));
    // The log lands in the MoonBoard database, where ticks and the send count come from.
    const restoredLog = (await loadLogbook(moonDst, LOCAL_USER_ID, "moon")).find((e) => e.id === "l1");
    expect(restoredLog).toMatchObject({ climbUuid: "P1", angle: 40, quality: 3, difficulty: 105, isSend: true, climbedAt: expect.stringMatching(/^2026-11-01 10:00:00/) });
  });

  it("is safe to restore twice: nothing doubles", async () => {
    await saveOutside(src, off());
    const parsed = parseBackup(file({ offBoard: await loadOutside(src) }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    await restoreBackup(targets(dst), parsed.backup);
    await restoreBackup(targets(dst), parsed.backup);
    expect(await loadOutside(dst)).toHaveLength(1);
  });

  it("leaves a circuit already on the phone alone, and does not restore a published one", async () => {
    await saveLogicalCircuits(dst, [circuit({ name: "Kept as is" })], []);
    const published = circuit({ uuid: "c2", projections: [{ provider: "tension", remoteUuid: "R1", isPublic: true, remoteHash: "h", remoteItems: [] }] });
    const parsed = parseBackup(file({ circuits: [circuit({ name: "From file" }), published] }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    const sum = await restoreBackup(targets(dst), parsed.backup);
    expect(sum.circuits).toBe(0);
    const after = await loadLogicalCircuits(dst);
    expect(after.map((c) => c.name)).toEqual(["Kept as is"]);
  });

  it("does not restore entries that live on a service, and does not count them as damaged", () => {
    const parsed = parseBackup(file({ logbook: [log(), log({ id: "l2", provider: "tension" })] }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.backup.localLogs.map((e) => e.id)).toEqual(["l1"]);
    expect(parsed.backup.skipped).toBe(0);
  });
});

describe("a backup file is untrusted", () => {
  it("rejects what is not a backup, and a newer format", () => {
    expect(parseBackup("not json", isLocal)).toMatchObject({ ok: false });
    expect(parseBackup("{}", isLocal)).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: "other", version: 1 }), isLocal)).toMatchObject({ ok: false });
    const newer = parseBackup(JSON.stringify({ app: "slackboard", version: BACKUP_VERSION + 1 }), isLocal);
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.error).toMatch(/newer version/);
  });

  it("skips damaged and unsafe records and keeps the good ones", () => {
    const text = JSON.stringify({
      app: "slackboard", version: BACKUP_VERSION, exportedAt: "2026-11-02T12:00:00Z",
      offBoard: [
        off(),
        off({ id: "bad-wall", wall: "ceiling" as never }),
        off({ id: "bad-date", climbedAt: "yesterday" }),
        off({ id: "bad-link", link: "javascript:alert(1)" }),
        off({ id: "bad-grade", grade: 9999 }),
        { id: 5 },
        "nope",
      ],
      logbook: [log(), { id: "x", provider: "moon" }],
      circuits: [{ ...circuit(), publishedOn: [] }, { uuid: "c9" }],
    });
    const parsed = parseBackup(text, isLocal);
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.backup.offBoard.map((l) => l.id)).toEqual(["o1"]);
    expect(parsed.backup.skipped).toBe(6 + 1 + 1);
    expect(parsed.backup.circuits).toHaveLength(1);
  });

  it("clamps attempts, drops unknown tags and cleans a bare link", () => {
    const text = JSON.stringify({ app: "slackboard", version: 2, offBoard: [off({ attempts: 5000, tags: ["Crimpy", "<script>"], link: "mountainproject.com/route/2" })] });
    const parsed = parseBackup(text, isLocal);
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.backup.offBoard[0]).toMatchObject({ attempts: 99, tags: ["Crimpy"], link: "https://mountainproject.com/route/2" });
  });

  it("skips a damaged lit-history record and keeps the good ones", () => {
    const parsed = parseBackup(JSON.stringify({ app: "slackboard", version: 2, litHistory: [lit(), lit({ id: "bad", litAt: "yesterday" }), { id: "x" }] }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.backup.litHistory.map((l) => l.id)).toEqual(["t1"]);
    expect(parsed.backup.skipped).toBe(2);
  });

  it("reads a version 1 file, which has no off-board climbs", () => {
    const parsed = parseBackup(JSON.stringify({ app: "slackboard", version: 1, logbook: [log()], circuits: [] }), isLocal);
    expect(parsed.ok && parsed.backup.offBoard).toEqual([]);
    expect(parsed.ok && parsed.backup.localLogs).toHaveLength(1);
  });
});

describe("CSV with off-board climbs", () => {
  it("merges them with board entries, newest first, with their setting, venue, wall, tags and link", () => {
    const csv = logbookCsv([log({ climbedAt: "2026-10-01 10:00:00" })], () => ({ v: "V1", font: "5a" }), [off()], () => ({ v: "V4", font: "6b+" }));
    const lines = csv.trim().split("\r\n");
    expect(lines[0].split(",")).toEqual(CSV_HEADER);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("The Mandala");
    expect(lines[1]).toContain("outdoor,Bishop,Overhang,Crimpy;Powerful,https://www.mountainproject.com/route/1");
    expect(lines[1]).toContain("V4,6b+");
    expect(lines[2]).toContain("Problem");
  });
  it("marks attempts-only climbs as attempts and leaves an ungraded one's grade empty", () => {
    const csv = logbookCsv([], () => ({ v: "", font: "" }), [off({ result: "attempt", gradeLabel: null, gradeSystem: null, grade: null, attempts: 4 })]);
    const row = csv.trim().split("\r\n")[1].split(",");
    expect(row[4]).toBe("attempts");
    expect(row[7]).toBe("4");
    expect(row[8]).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------------------------------

const full = setupByKey("2016")!;
const holes = encodeFrames([new Map([[101, 5], [150, 6], [180, 7]])]);

describe("everything that only this phone had", () => {
  async function seeded() {
    const moon = openNodeDb();
    const local = openNodeDb();
    await ensureSchema(moon);
    await ensureLocalSchema(local);
    const board = await createBoard(moon, { name: "Garage", setup: full, angle: 40 });
    const own = await saveOwnClimb(moon, { layoutId: layoutIdOf(full, 40), name: "My project", method: "Footless", frames: holes, angle: 40, difficulty: 20 });
    await setTag(moon, own, "~flag", true);
    await setTag(moon, "ABCDEF0123456789ABCDEF0123456789", "~block", true);
    await saveLog(moon, { climbUuid: own, angle: 40, isMirror: false, bidCount: 2, comment: "felt good", climbedAt: new Date(2026, 10, 3, 18, 0, 0), quality: 3, difficulty: 20 }, "A".repeat(32));
    await saveBoardPlace(local, { id: board, gymName: "Home", location: { lat: 43.04, lon: -87.9 }, addedAt: "2026-11-01T10:00:00.000Z", manualSpaceId: null });
    await saveSpaceName(local, `space:${board}`, "My garage");
    await saveSpaceLineage(local, "space:old", `space:${board}`);
    await saveLogSpace(local, { entryId: "A".repeat(32), spaceId: `space:${board}`, boardId: board, spaceName: "My garage" });
    await saveLogSpace(local, { entryId: "pending:7", spaceId: `space:${board}`, boardId: board, spaceName: "My garage" });
    return { moon, local, board, own };
  }

  it("round trips MoonBoard boards, problems you set, likes and blocks, spaces and preferences", async () => {
    const { moon, local } = await seeded();
    const prefs = preferencesOf({ settings: { gradeDisplay: "v", shapes: true, haptics: false, autoDisconnectSec: 30, trainTab: false, nudges: "relaxed", units: { weight: "lb", length: "ft" }, notifications: { ...DEFAULT_NOTIFICATIONS, plan: true, planTime: "06:30" } }, angles: { b1: 35 }, timer: { prepSec: 5, workSec: 7, restSec: 3, reps: 6, sets: 2, setRestSec: 60 }, restSec: 180 });
    const logs = (await loadLogbook(moon, LOCAL_USER_ID, "moon")).map((e) => ({ ...e, provider: "moon" }));
    const text = file({ moon: await exportMoon(moon), spaces: await exportSpaces(local), preferences: prefs, logbook: logs });
    const parsed = parseBackup(text, isLocal);
    if (!parsed.ok) throw new Error("parse");
    expect(parsed.backup.skipped).toBe(0);
    // A log entry still waiting to upload is not exported as a space attribution.
    expect(parsed.backup.spaces.logSpaces.map((l) => l.entryId)).toEqual(["A".repeat(32)]);

    const moon2 = openNodeDb();
    const local2 = openNodeDb();
    await ensureSchema(moon2);
    await ensureLocalSchema(local2);
    const sum = await restoreBackup({ dbFor: async () => moon2, local: local2 }, parsed.backup);
    expect(sum).toMatchObject({ moonBoards: 1, moonProblems: 1, moonTags: 2, places: 1, preferences: true, localLogs: 1 });

    expect(await exportMoon(moon2)).toEqual(await exportMoon(moon));
    expect(await exportSpaces(local2)).toEqual(await exportSpaces(local));
    expect(parsed.backup.preferences).toEqual(prefs);
    expect((await loadLogbook(moon2, LOCAL_USER_ID, "moon")).map((e) => [e.id, e.comment, e.climbedAt])).toEqual((await loadLogbook(moon, LOCAL_USER_ID, "moon")).map((e) => [e.id, e.comment, e.climbedAt]));
    // The restored send is counted against the restored problem again.
    const stats = await loadStatsAt(moon2, layoutIdOf(full, 40), 40);
    expect([...stats.values()][0][2]).toBe(1);
  });

  it("restores a board under its old id, so its spaces and logs still find it", async () => {
    const { moon, board } = await seeded();
    const parsed = parseBackup(file({ moon: await exportMoon(moon) }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    const moon2 = openNodeDb();
    await ensureSchema(moon2);
    await restoreBackup({ dbFor: async () => moon2, local: openNodeDb() }, parsed.backup).catch(() => undefined);
    expect((await exportMoon(moon2)).boards.map((b) => b.uuid)).toEqual([board]);
  });

  it("does not stop the problem list downloading: the problems you set do not count as a downloaded list", async () => {
    const { moon } = await seeded();
    const parsed = parseBackup(file({ moon: await exportMoon(moon) }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    const empty = openNodeDb();
    await ensureSchema(empty);
    await ensureLocalSchema(empty);
    await restoreBackup(targets(empty), parsed.backup);
    expect(await climbCount(empty, full, 40)).toBe(0);
    expect((await exportMoon(empty)).problems).toHaveLength(1);
  });

  it("is safe to restore twice", async () => {
    const { moon, local } = await seeded();
    const parsed = parseBackup(file({ moon: await exportMoon(moon), spaces: await exportSpaces(local) }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    const m = openNodeDb(); const l = openNodeDb();
    await ensureSchema(m); await ensureLocalSchema(l);
    const t = { dbFor: async () => m, local: l };
    await restoreBackup(t, parsed.backup);
    await restoreBackup(t, parsed.backup);
    expect(await exportMoon(m)).toEqual(await exportMoon(moon));
    expect((await exportSpaces(l)).places).toHaveLength(1);
  });
});

describe("MoonBoard records from a file", () => {
  const board = { uuid: "0123456789ABCDEF0123456789ABCDEF", name: "Garage", setupKey: "2016", angle: 40 };
  const problem = { uuid: "ABCDEF0123456789ABCDEF0123456789", layoutId: layoutIdOf(full, 40), name: "P", method: "", frames: holes, angle: 40, difficulty: 20 };
  const tag = { climbUuid: problem.uuid, name: "~flag", listed: true };

  it("keeps good records and counts each damaged one", () => {
    let bad = 0;
    const m = parseMoon({
      boards: [board, { ...board, uuid: "nope" }, { ...board, setupKey: "1999" }, { ...board, angle: 33 }, "x"],
      problems: [problem, { ...problem, frames: "" }, { ...problem, angle: 25 }, { ...problem, layoutId: 99999 }, { ...problem, difficulty: 500 }, { ...problem, name: "" }],
      tags: [tag, { ...tag, name: "~other" }, { ...tag, listed: "yes" }, { climbUuid: "short", name: "~flag", listed: true }],
    }, () => { bad++; });
    expect(m.boards).toHaveLength(1);
    expect(m.problems).toHaveLength(1);
    expect(m.tags).toHaveLength(1);
    expect(bad).toBe(4 + 5 + 3);
  });

  it("treats a missing or wrong-shaped section as empty", () => {
    expect(parseMoon(undefined, () => undefined)).toEqual(EMPTY_MOON);
    expect(parseMoon([], () => undefined)).toEqual(EMPTY_MOON);
  });
});

describe("preferences from a file", () => {
  it("keeps valid values and drops bad ones, field by field", () => {
    const p = parsePreferences({
      settings: { gradeDisplay: "font", shapes: true, haptics: "yes", autoDisconnectSec: 99999, logLit: false, unknown: 1 },
      angles: { b1: 35, b2: 500, "": 40 },
      timer: { prepSec: 5, workSec: 7, restSec: 3, reps: 6, sets: 2, setRestSec: 60 },
      restSec: -3,
    });
    expect(p.settings).toEqual({ gradeDisplay: "font", shapes: true, logLit: false });
    expect(p.angles).toEqual({ b1: 35 });
    expect(p.timer).toEqual({ prepSec: 5, workSec: 7, restSec: 3, reps: 6, sets: 2, setRestSec: 60 });
    expect(p.restSec).toBeNull();
  });

  it("ignores a timer with a missing field, and a file with no preferences", () => {
    expect(parsePreferences({ timer: { prepSec: 5 } }).timer).toBeNull();
    expect(parsePreferences(undefined)).toEqual(EMPTY_PREFS);
  });
});

describe("saying what a backup holds", () => {
  it("lists only what is there, and says so when nothing is", () => {
    const parsed = parseBackup(file({ offBoard: [off()], preferences: { ...EMPTY_PREFS, restSec: 90 } }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    expect(describeBackup(parsed.backup)).toBe("1 off-board climb, your settings");
    const none = parseBackup(file({}), isLocal);
    if (!none.ok) throw new Error("parse");
    expect(describeBackup(none.backup)).toBe("nothing this phone keeps on its own");
  });

  it("reports a restore, with a count of skipped records", () => {
    const base = { offBoard: 2, roped: 0, training: 0, goals: 0, dayNotes: 0, localLogs: 0, circuits: 0, litHistory: 0, moonBoards: 1, moonProblems: 3, moonTags: 0, places: 0, preferences: false, skipped: 0 };
    expect(describeRestored(base)).toBe("Restored 2 off-board climbs, 1 MoonBoard, 3 problems you set.");
    expect(describeRestored({ ...base, skipped: 2 })).toContain("2 records were damaged and skipped.");
    expect(describeRestored({ ...base, offBoard: 0, moonBoards: 0, moonProblems: 0, roped: 3 })).toBe("Restored 3 roped climbs.");
    expect(describeRestored({ ...base, offBoard: 0, moonBoards: 0, moonProblems: 0, dayNotes: 4 })).toBe("Restored 4 body check-ins.");
    expect(describeRestored({ offBoard: 0, roped: 0, training: 0, goals: 0, dayNotes: 0, localLogs: 0, circuits: 0, litHistory: 0, moonBoards: 0, moonProblems: 0, moonTags: 0, places: 0, preferences: false, skipped: 0 })).toBe("Nothing needed restoring.");
  });
});

describe("every local table is backed up or says why not", () => {
  it("names a section the backup file really has", () => {
    const sections = Object.keys(JSON.parse(file({})));
    for (const t of localTables()) if (t.backup !== "none") expect(sections, t.name).toContain(t.backup);
  });
});
