import { beforeEach, describe, expect, it } from "vitest";
import { BACKUP_VERSION, parseBackup, restoreBackup } from "./backup";
import type { Db } from "./db";
import { exportJson, logbookCsv, CSV_HEADER } from "./export";
import { ensureLocalSchema, loadLogicalCircuits, saveLogicalCircuits, type LogicalCircuit } from "./logicalCircuits";
import { loadLocalLogs, saveLocalLog } from "./mergedLog";
import { openNodeDb } from "./nodeDb";
import type { OutsideLog } from "./outside";
import { loadOutside, saveOutside } from "./outsideLocal";
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
const file = (o: { offBoard?: OutsideLog[]; logbook?: LogEntry[]; circuits?: LogicalCircuit[]; litHistory?: LitEntry[] }) =>
  exportJson({ now: new Date("2026-11-02T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: o.logbook ?? [], circuits: o.circuits ?? [], offBoard: o.offBoard ?? [], litHistory: o.litHistory ?? [], liked: [], blocked: [], boards: [], gradeOf });

describe("backup round trip", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });

  it("restores off-board climbs, local board entries and unpublished circuits into an empty phone, exactly as they were", async () => {
    const ob = [off(), off({ id: "o2", setting: "gym", name: "", venue: "", link: "", gradeSystem: null, gradeLabel: null, grade: null, result: "attempt", attempts: 5, tags: [] })];
    await saveOutside(src, ob[0]); await saveOutside(src, ob[1]);
    await saveLocalLog(src, log());
    await saveLogicalCircuits(src, [circuit()], []);
    await saveLit(src, lit());
    const text = file({ litHistory: await loadLit(src), offBoard: await loadOutside(src), logbook: await loadLocalLogs(src), circuits: await loadLogicalCircuits(src) });

    const parsed = parseBackup(text, isLocal);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sum = await restoreBackup(dst, parsed.backup);
    expect(sum).toEqual({ offBoard: 2, localLogs: 1, circuits: 1, litHistory: 1, skipped: 0 });
    expect(await loadLit(dst)).toEqual(await loadLit(src));
    expect(await loadOutside(dst)).toEqual(await loadOutside(src));
    expect(await loadLocalLogs(dst)).toEqual(await loadLocalLogs(src));
    expect(await loadLogicalCircuits(dst)).toEqual(await loadLogicalCircuits(src));
  });

  it("is safe to restore twice: nothing doubles", async () => {
    await saveOutside(src, off());
    const parsed = parseBackup(file({ offBoard: await loadOutside(src) }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    await restoreBackup(dst, parsed.backup);
    await restoreBackup(dst, parsed.backup);
    expect(await loadOutside(dst)).toHaveLength(1);
  });

  it("leaves a circuit already on the phone alone, and does not restore a published one", async () => {
    await saveLogicalCircuits(dst, [circuit({ name: "Kept as is" })], []);
    const published = circuit({ uuid: "c2", projections: [{ provider: "tension", remoteUuid: "R1", isPublic: true, remoteHash: "h", remoteItems: [] }] });
    const parsed = parseBackup(file({ circuits: [circuit({ name: "From file" }), published] }), isLocal);
    if (!parsed.ok) throw new Error("parse");
    const sum = await restoreBackup(dst, parsed.backup);
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
      app: "slackboard", version: 2, exportedAt: "2026-11-02T12:00:00Z",
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
