import { beforeEach, describe, expect, it } from "vitest";
import { describeBackup, parseBackup, restoreBackup, type RestoreTargets } from "./backup";
import type { Db } from "./db";
import { exportJson } from "./export";
import { clearLocalData, ensureLocalSchema } from "./logicalCircuits";
import { EMPTY_MOON } from "./moonBackup";
import { openNodeDb } from "./nodeDb";
import { EMPTY_PREFS } from "./prefsBackup";
import { EMPTY_SPACES } from "./spacesBackup";
import {
  deleteSessionLabel, deleteWatchSession, exportWatchSessions, ingestWatchMessages, loadSessionData, loadWatchSessions, parseWatchBackup,
  pruneWatchSessions, restoreWatchSession, saveSessionLabel, deleteAllWatchData, type Received,
} from "./watchLocal";
import type { MotionRow } from "./wear";

const T0 = 1_700_000_000_000;
const motionRow = (sec: number, over: Partial<MotionRow> = {}): MotionRow => ({ at: T0 + sec * 1000, accRms: 1, accMax: 2, gyroRms: 0.5, gyroMax: 1, pressure: 1010, gx: 0, gy: -9.8, gz: 0.5, ...over });

const feed = (session = "s1"): Received[] => [
  { receivedAt: T0 + 1000, message: { kind: "state", pong: false, state: "running", mode: "workout", session, startedAt: T0, bpm: null, error: null } },
  { receivedAt: T0 + 4000, message: { kind: "hr", session, samples: [{ at: T0 + 1000, bpm: 88 }, { at: T0 + 2000, bpm: 90 }, { at: T0 + 3000, bpm: 95 }], dropped: 1 } },
  { receivedAt: T0 + 4000, message: { kind: "elevation", session, samples: [{ at: T0 + 2000, metres: 100.5 }, { at: T0 + 3000, metres: 101.5 }], dropped: 0 } },
  { receivedAt: T0 + 4100, message: { kind: "motion", session, rows: [motionRow(1), motionRow(2, { pressure: null })], dropped: 0 } },
  { receivedAt: T0 + 4200, message: { kind: "stats", session, stats: { calories: 12.5, gain: 1.2, hrAvg: 91, hrMin: 88, hrMax: 95 } } },
  { receivedAt: T0 + 9000, message: { kind: "summary", session, startedAt: T0, endedAt: T0 + 8000, calories: 14, gain: 1.4, hrAvg: 92, hrMin: 88, hrMax: 97 } },
];

describe("storing what the watch sends", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("builds a session from its messages, with the samples, the latest totals and the batch records", async () => {
    const r = await ingestWatchMessages(db, feed());
    expect(r).toEqual({ sessions: 1, hr: 3, elevation: 2, motion: 2 });
    const [s] = await loadWatchSessions(db);
    expect(s).toMatchObject({ id: "s1", startedAt: T0, endedAt: T0 + 8000, mode: "workout", counts: { hr: 3, elevation: 2, motion: 2, labels: 0 } });
    expect(s.stats).toEqual({ calories: 14, gain: 1.4, hrAvg: 92, hrMin: 88, hrMax: 97 });
    const d = (await loadSessionData(db, "s1"))!;
    expect(d.hr.map((x) => x.bpm)).toEqual([88, 90, 95]);
    expect(d.motion[1].pressure).toBeNull();
    expect(d.batches).toHaveLength(3);
    expect(d.batches[0]).toMatchObject({ kind: "hr", receivedAt: T0 + 4000, firstAt: T0 + 1000, lastAt: T0 + 3000, count: 3, dropped: 1 });
  });

  it("changes nothing when the same messages arrive again", async () => {
    await ingestWatchMessages(db, feed());
    await ingestWatchMessages(db, feed());
    const [s] = await loadWatchSessions(db);
    expect(s.counts).toMatchObject({ hr: 3, elevation: 2, motion: 2 });
    expect(await loadWatchSessions(db)).toHaveLength(1);
  });

  it("starts a session from its first sample when no state message arrived, keeps a known total over a missing one, and ignores a ping answer", async () => {
    await ingestWatchMessages(db, [
      { receivedAt: T0 + 5000, message: { kind: "hr", session: "s2", samples: [{ at: T0 + 3000, bpm: 80 }, { at: T0 + 1000, bpm: 70 }], dropped: 0 } },
      { receivedAt: T0 + 6000, message: { kind: "stats", session: "s2", stats: { calories: 5, gain: null, hrAvg: null, hrMin: null, hrMax: null } } },
      { receivedAt: T0 + 7000, message: { kind: "stats", session: "s2", stats: { calories: null, gain: 2, hrAvg: null, hrMin: null, hrMax: null } } },
      { receivedAt: T0 + 8000, message: { kind: "state", pong: true, state: "idle", mode: null, session: "ghost", startedAt: null, bpm: null, error: null } },
    ]);
    const list = await loadWatchSessions(db);
    expect(list.map((x) => x.id)).toEqual(["s2"]);
    expect(list[0].startedAt).toBe(T0 + 1000);
    expect(list[0].stats).toMatchObject({ calories: 5, gain: 2 });
  });

  it("keeps labels, and deletes a session with everything that belongs to it", async () => {
    await ingestWatchMessages(db, feed("a"));
    await ingestWatchMessages(db, feed("b"));
    await saveSessionLabel(db, { id: "l1", session: "a", at: T0 + 2000, kind: "attempt-start", note: "slab" });
    await saveSessionLabel(db, { id: "l2", session: "a", at: T0 + 5000, kind: "attempt-end", note: "" });
    expect((await loadSessionData(db, "a"))!.labels.map((l) => l.kind)).toEqual(["attempt-start", "attempt-end"]);
    await deleteSessionLabel(db, "l2");
    expect((await loadSessionData(db, "a"))!.labels).toHaveLength(1);
    await deleteWatchSession(db, "a");
    expect(await loadSessionData(db, "a")).toBeNull();
    expect((await loadSessionData(db, "b"))!.hr).toHaveLength(3);
    expect((await db.all("SELECT * FROM l_watch_hr WHERE session = 'a'"))).toEqual([]);
  });

  it("prunes sessions older than a date, and keeps watch data when the user signs out", async () => {
    await ingestWatchMessages(db, feed("old"));
    await ingestWatchMessages(db, feed("new").map((x) => ({ ...x, message: x.message.kind === "capabilities" ? x.message : { ...x.message } })));
    await db.run("UPDATE l_watch_sessions SET started_at = ? WHERE id = 'old'", [T0 - 90 * 86_400_000]);
    expect(await pruneWatchSessions(db, T0 - 30 * 86_400_000)).toBe(1);
    expect((await loadWatchSessions(db)).map((s) => s.id)).toEqual(["new"]);
    await clearLocalData(db);
    expect(await loadWatchSessions(db)).toHaveLength(1);
    await deleteAllWatchData(db);
    expect(await loadWatchSessions(db)).toEqual([]);
  });
});

describe("watch data in a backup", () => {
  let src: Db, dst: Db;
  beforeEach(async () => { src = openNodeDb(); dst = openNodeDb(); await ensureLocalSchema(src); await ensureLocalSchema(dst); });
  const targets = (db: Db): RestoreTargets => ({ dbFor: async () => db, local: db });
  const file = (watch: unknown) => JSON.stringify({
    ...JSON.parse(exportJson({
      now: new Date("2026-11-15T12:00:00Z"), user: { id: 7, username: "n" }, range: "all", logbook: [], circuits: [], offBoard: [], roped: [], training: [], goals: [], profile: null, tests: [], plans: [],
      dayNotes: [], litHistory: [], moon: EMPTY_MOON, spaces: EMPTY_SPACES, preferences: EMPTY_PREFS, liked: [], blocked: [], boards: [], gradeOf: () => ({ v: "", font: "" }),
    })),
    watch,
  });

  it("comes back exactly, with labels and totals, and restoring twice changes nothing", async () => {
    await ingestWatchMessages(src, feed());
    await saveSessionLabel(src, { id: "l1", session: "s1", at: T0 + 2000, kind: "fall", note: "slipped" });
    const watch = JSON.parse(JSON.stringify(await exportWatchSessions(src)));
    const p = parseBackup(file(watch), (x) => x === "moon");
    if (!p.ok) throw new Error(p.error);
    expect(describeBackup(p.backup)).toBe("1 watch session");
    expect((await restoreBackup(targets(dst), p.backup)).watchSessions).toBe(1);
    await restoreBackup(targets(dst), p.backup);
    const a = (await loadSessionData(src, "s1"))!;
    const b = (await loadSessionData(dst, "s1"))!;
    expect(b.session).toEqual(a.session);
    expect(b.hr).toEqual(a.hr);
    expect(b.elevation).toEqual(a.elevation);
    expect(b.motion).toEqual(a.motion);
    expect(b.labels).toEqual(a.labels);
    // The record of when messages arrived describes the link, so it is not carried over.
    expect(b.batches).toEqual([]);
  });

  it("drops samples that are not believable, refuses a session with no header, and ignores a section that is not a list", async () => {
    await ingestWatchMessages(src, feed());
    const [good] = JSON.parse(JSON.stringify(await exportWatchSessions(src)));
    good.hr.b[0] = 900;
    const p = parseBackup(file([good, { session: { id: "" } }, "nope"]), (x) => x === "moon");
    if (!p.ok) throw new Error(p.error);
    expect(p.backup.watch).toHaveLength(1);
    expect(p.backup.skipped).toBe(2);
    await restoreWatchSession(dst, p.backup.watch[0]);
    expect((await loadSessionData(dst, "s1"))!.hr.map((x) => x.bpm)).toEqual([90, 95]);
    const q = parseBackup(JSON.stringify({ ...JSON.parse(file([])), watch: "oops" }), (x) => x === "moon");
    expect(q.ok && q.backup.watch).toEqual([]);
    expect(parseWatchBackup(null)).toBeNull();
  });
});
