/**
 * The phone's copy of what the watch recorded: sessions and their heart rate, elevation, motion and hand-made labels, in the local
 * database. Writing is idempotent (a sample already stored is left alone), so a message that arrives twice, or a backup restored twice,
 * changes nothing. This is developer data for now; see watchData.ts.
 */
import type { Db } from "./db";
import {
  isLabelKind, type BatchRecord, type SessionData, type SessionLabel, type StreamKind, type WatchSession,
} from "./watchData";
import { parseMessageBody, WEAR_PATHS, type WatchMessage, type WorkoutStats } from "./wear";

const EMPTY_STATS: WorkoutStats = { calories: null, gain: null, hrAvg: null, hrMin: null, hrMax: null };

export interface Received { message: WatchMessage; receivedAt: number }

export interface IngestResult { sessions: number; hr: number; elevation: number; motion: number }

interface SessionRow {
  id: string; startedAt: number; endedAt: number | null; mode: string | null;
  calories: number | null; gain: number | null; hrAvg: number | null; hrMin: number | null; hrMax: number | null;
}

const SESSION_COLUMNS = "id, started_at AS startedAt, ended_at AS endedAt, mode, calories, gain, hr_avg AS hrAvg, hr_min AS hrMin, hr_max AS hrMax";

const sessionOf = (r: SessionRow): WatchSession => ({
  id: r.id,
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  mode: r.mode === "workout" || r.mode === "heart-rate" ? r.mode : null,
  stats: { calories: r.calories, gain: r.gain, hrAvg: r.hrAvg, hrMin: r.hrMin, hrMax: r.hrMax },
});

/** Makes sure a session exists, and that it did not start later than a sample it holds. */
async function ensure(db: Db, id: string, at: number): Promise<void> {
  await db.run("INSERT OR IGNORE INTO l_watch_sessions (id, started_at) VALUES (?, ?)", [id, at]);
  await db.run("UPDATE l_watch_sessions SET started_at = ? WHERE id = ? AND started_at > ?", [at, id, at]);
}

/** Applies stats, keeping what is already known for a value the message leaves out. */
async function applyStats(db: Db, id: string, s: WorkoutStats): Promise<void> {
  await db.run(
    "UPDATE l_watch_sessions SET calories = COALESCE(?, calories), gain = COALESCE(?, gain), hr_avg = COALESCE(?, hr_avg), hr_min = COALESCE(?, hr_min), hr_max = COALESCE(?, hr_max) WHERE id = ?",
    [s.calories, s.gain, s.hrAvg, s.hrMin, s.hrMax, id],
  );
}

async function recordBatch(db: Db, session: string, kind: StreamKind, receivedAt: number, times: number[], dropped: number): Promise<void> {
  if (times.length === 0 && dropped === 0) return;
  await db.run(
    "INSERT INTO l_watch_batches (session, kind, received_at, first_at, last_at, count, dropped) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [session, kind, receivedAt, times.length ? Math.min(...times) : 0, times.length ? Math.max(...times) : 0, times.length, dropped],
  );
}

/**
 * Stores what the watch sent. `recordBatches` keeps a record of each message's arrival (for judging the link); a restored backup has no
 * arrival times, so it turns that off.
 */
export async function ingestWatchMessages(db: Db, items: Received[], recordBatches = true): Promise<IngestResult> {
  const result: IngestResult = { sessions: 0, hr: 0, elevation: 0, motion: 0 };
  const seen = new Set<string>();
  await db.transaction(async () => {
    for (const { message: m, receivedAt } of items) {
      switch (m.kind) {
        case "state": {
          // An answer to a ping says nothing about a session; a change of state does.
          if (m.pong || !m.session) break;
          await ensure(db, m.session, m.startedAt ?? receivedAt);
          seen.add(m.session);
          if (m.state === "running") {
            if (m.startedAt) await db.run("UPDATE l_watch_sessions SET started_at = ? WHERE id = ?", [m.startedAt, m.session]);
            if (m.mode) await db.run("UPDATE l_watch_sessions SET mode = ? WHERE id = ?", [m.mode, m.session]);
          } else if (receivedAt) {
            await db.run("UPDATE l_watch_sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL", [receivedAt, m.session]);
          }
          break;
        }
        case "hr": {
          if (m.samples.length) {
            await ensure(db, m.session, Math.min(...m.samples.map((s) => s.at)));
            await db.batch("INSERT OR IGNORE INTO l_watch_hr (session, at, bpm) VALUES (?, ?, ?)", m.samples.map((s) => [m.session, s.at, s.bpm]));
            seen.add(m.session);
          }
          result.hr += m.samples.length;
          if (recordBatches) await recordBatch(db, m.session, "hr", receivedAt, m.samples.map((s) => s.at), m.dropped);
          break;
        }
        case "elevation": {
          if (m.samples.length) {
            await ensure(db, m.session, Math.min(...m.samples.map((s) => s.at)));
            await db.batch("INSERT OR IGNORE INTO l_watch_elev (session, at, m) VALUES (?, ?, ?)", m.samples.map((s) => [m.session, s.at, s.metres]));
            seen.add(m.session);
          }
          result.elevation += m.samples.length;
          if (recordBatches) await recordBatch(db, m.session, "elevation", receivedAt, m.samples.map((s) => s.at), m.dropped);
          break;
        }
        case "motion": {
          if (m.rows.length) {
            await ensure(db, m.session, Math.min(...m.rows.map((r) => r.at)));
            await db.batch(
              "INSERT OR IGNORE INTO l_watch_motion (session, at, acc_rms, acc_max, gyro_rms, gyro_max, pressure, gx, gy, gz) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              m.rows.map((r) => [m.session, r.at, r.accRms, r.accMax, r.gyroRms, r.gyroMax, r.pressure, r.gx, r.gy, r.gz]),
            );
            seen.add(m.session);
          }
          result.motion += m.rows.length;
          if (recordBatches) await recordBatch(db, m.session, "motion", receivedAt, m.rows.map((r) => r.at), m.dropped);
          break;
        }
        case "stats": {
          await ensure(db, m.session, receivedAt || Date.now());
          await applyStats(db, m.session, m.stats);
          seen.add(m.session);
          break;
        }
        case "summary": {
          await ensure(db, m.session, m.startedAt);
          await db.run("UPDATE l_watch_sessions SET started_at = ?, ended_at = ? WHERE id = ?", [m.startedAt, m.endedAt, m.session]);
          await applyStats(db, m.session, m);
          seen.add(m.session);
          break;
        }
        case "capabilities":
          break;
      }
    }
  });
  result.sessions = seen.size;
  return result;
}

export interface WatchSessionListing extends WatchSession {
  counts: { hr: number; elevation: number; motion: number; labels: number };
  /** First and last sample time of each stream, null when it has none: enough for a mean interval without loading the samples. */
  spans: Record<StreamKind, [number, number] | null>;
}

/** Every session, newest first, with how many samples of each kind it holds. */
export async function loadWatchSessions(db: Db): Promise<WatchSessionListing[]> {
  type Span = { lo: number | null; hi: number | null };
  const rows = await db.all<SessionRow & { hrN: number; elevN: number; motionN: number; labelN: number; hrLo: number | null; hrHi: number | null; elevLo: number | null; elevHi: number | null; motionLo: number | null; motionHi: number | null }>(
    `SELECT ${SESSION_COLUMNS},
       (SELECT MIN(at) FROM l_watch_hr x WHERE x.session = s.id) AS hrLo, (SELECT MAX(at) FROM l_watch_hr x WHERE x.session = s.id) AS hrHi,
       (SELECT MIN(at) FROM l_watch_elev x WHERE x.session = s.id) AS elevLo, (SELECT MAX(at) FROM l_watch_elev x WHERE x.session = s.id) AS elevHi,
       (SELECT MIN(at) FROM l_watch_motion x WHERE x.session = s.id) AS motionLo, (SELECT MAX(at) FROM l_watch_motion x WHERE x.session = s.id) AS motionHi,
       (SELECT COUNT(*) FROM l_watch_hr x WHERE x.session = s.id) AS hrN,
       (SELECT COUNT(*) FROM l_watch_elev x WHERE x.session = s.id) AS elevN,
       (SELECT COUNT(*) FROM l_watch_motion x WHERE x.session = s.id) AS motionN,
       (SELECT COUNT(*) FROM l_watch_labels x WHERE x.session = s.id) AS labelN
     FROM l_watch_sessions s ORDER BY started_at DESC`,
  );
  const span = (s: Span): [number, number] | null => (s.lo !== null && s.hi !== null ? [s.lo, s.hi] : null);
  return rows.map((r) => ({
    ...sessionOf(r),
    counts: { hr: r.hrN, elevation: r.elevN, motion: r.motionN, labels: r.labelN },
    spans: { hr: span({ lo: r.hrLo, hi: r.hrHi }), elevation: span({ lo: r.elevLo, hi: r.elevHi }), motion: span({ lo: r.motionLo, hi: r.motionHi }) },
  }));
}

/** One session with all its samples, labels and batch records; null when there is no such session. */
export async function loadSessionData(db: Db, id: string): Promise<SessionData | null> {
  const row = (await db.all<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM l_watch_sessions WHERE id = ?`, [id]))[0];
  if (!row) return null;
  const hr = await db.all<{ at: number; bpm: number }>("SELECT at, bpm FROM l_watch_hr WHERE session = ? ORDER BY at", [id]);
  const elevation = await db.all<{ at: number; metres: number }>("SELECT at, m AS metres FROM l_watch_elev WHERE session = ? ORDER BY at", [id]);
  const motion = await db.all<{ at: number; accRms: number | null; accMax: number | null; gyroRms: number | null; gyroMax: number | null; pressure: number | null; gx: number | null; gy: number | null; gz: number | null }>(
    "SELECT at, acc_rms AS accRms, acc_max AS accMax, gyro_rms AS gyroRms, gyro_max AS gyroMax, pressure, gx, gy, gz FROM l_watch_motion WHERE session = ? ORDER BY at", [id]);
  const labels = (await db.all<{ id: string; session: string; at: number; kind: string; note: string }>("SELECT id, session, at, kind, note FROM l_watch_labels WHERE session = ? ORDER BY at", [id]))
    .filter((l): l is SessionLabel => isLabelKind(l.kind));
  const batches = (await db.all<{ session: string; kind: string; receivedAt: number; firstAt: number; lastAt: number; count: number; dropped: number }>(
    "SELECT session, kind, received_at AS receivedAt, first_at AS firstAt, last_at AS lastAt, count, dropped FROM l_watch_batches WHERE session = ? ORDER BY received_at, id", [id]))
    .filter((b): b is BatchRecord => b.kind === "hr" || b.kind === "elevation" || b.kind === "motion");
  return { session: sessionOf(row), hr, elevation, motion, labels, batches };
}

export async function saveSessionLabel(db: Db, l: SessionLabel): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_watch_labels (id, session, at, kind, note) VALUES (?, ?, ?, ?, ?)", [l.id, l.session, l.at, l.kind, l.note.slice(0, 200)]);
}

export async function deleteSessionLabel(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM l_watch_labels WHERE id = ?", [id]);
}

const SESSION_TABLES = ["l_watch_hr", "l_watch_elev", "l_watch_motion", "l_watch_labels", "l_watch_batches"] as const;

export async function deleteWatchSession(db: Db, id: string): Promise<void> {
  await db.transaction(async () => {
    for (const t of SESSION_TABLES) await db.run(`DELETE FROM ${t} WHERE session = ?`, [id]);
    await db.run("DELETE FROM l_watch_sessions WHERE id = ?", [id]);
  });
}

export async function deleteAllWatchData(db: Db): Promise<void> {
  await db.transaction(async () => {
    for (const t of SESSION_TABLES) await db.run(`DELETE FROM ${t}`);
    await db.run("DELETE FROM l_watch_sessions");
  });
}

/** Removes every session that started before `beforeMs`. Returns how many. */
export async function pruneWatchSessions(db: Db, beforeMs: number): Promise<number> {
  const old = await db.all<{ id: string }>("SELECT id FROM l_watch_sessions WHERE started_at < ?", [beforeMs]);
  for (const s of old) await deleteWatchSession(db, s.id);
  return old.length;
}

// ---- Backup ----------------------------------------------------------------------------------------------------------------------

/** A session in a backup file. The sample columns use the wire format, so they are checked by the same code as live messages. */
export interface WatchBackupSession {
  session: WatchSession;
  hr: unknown;
  elevation: unknown;
  motion: unknown;
  labels: SessionLabel[];
}

const col = <T,>(xs: T[], f: (x: T) => unknown) => xs.map(f);

export async function exportWatchSessions(db: Db): Promise<WatchBackupSession[]> {
  const out: WatchBackupSession[] = [];
  for (const listing of await loadWatchSessions(db)) {
    const d = await loadSessionData(db, listing.id);
    if (!d) continue;
    out.push({
      session: d.session,
      hr: { t: col(d.hr, (s) => s.at), b: col(d.hr, (s) => s.bpm) },
      elevation: { t: col(d.elevation, (s) => s.at), m: col(d.elevation, (s) => s.metres) },
      motion: {
        t: col(d.motion, (r) => r.at), a: col(d.motion, (r) => r.accRms), am: col(d.motion, (r) => r.accMax), g: col(d.motion, (r) => r.gyroRms),
        gm: col(d.motion, (r) => r.gyroMax), p: col(d.motion, (r) => r.pressure), gx: col(d.motion, (r) => r.gx), gy: col(d.motion, (r) => r.gy), gz: col(d.motion, (r) => r.gz),
      },
      labels: d.labels,
    });
  }
  return out;
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A session from a backup file. Untrusted: the header must be whole, the samples are checked by the live-message parsers, and a label that is not whole is left out. */
export function parseWatchBackup(v: unknown): WatchBackupSession | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const s = r.session as Record<string, unknown> | undefined;
  if (typeof s !== "object" || s === null) return null;
  const id = typeof s.id === "string" && s.id.length > 0 && s.id.length <= 100 ? s.id : null;
  if (!id || !Number.isInteger(s.startedAt) || (s.startedAt as number) <= 0) return null;
  const endedAt = Number.isInteger(s.endedAt) && (s.endedAt as number) > 0 ? (s.endedAt as number) : null;
  const st = (typeof s.stats === "object" && s.stats !== null ? s.stats : {}) as Record<string, unknown>;
  const n = (x: unknown) => (finite(x) ? x : null);
  const labels: SessionLabel[] = [];
  if (Array.isArray(r.labels)) {
    for (const l of r.labels as Record<string, unknown>[]) {
      if (l && typeof l.id === "string" && finite(l.at) && l.at > 0 && isLabelKind(l.kind)) labels.push({ id: l.id.slice(0, 60), session: id, at: l.at, kind: l.kind, note: typeof l.note === "string" ? l.note.slice(0, 200) : "" });
    }
  }
  return {
    session: {
      id, startedAt: s.startedAt as number, endedAt,
      mode: s.mode === "workout" || s.mode === "heart-rate" ? s.mode : null,
      stats: { calories: n(st.calories), gain: n(st.gain), hrAvg: n(st.hrAvg), hrMin: n(st.hrMin), hrMax: n(st.hrMax) },
    },
    hr: r.hr, elevation: r.elevation, motion: r.motion, labels,
  };
}

/** Puts a backed-up session back. Samples that fail the live checks are dropped; restoring twice changes nothing. */
export async function restoreWatchSession(db: Db, b: WatchBackupSession): Promise<void> {
  const id = b.session.id;
  const items: Received[] = [];
  const add = (path: string, body: unknown) => {
    if (typeof body !== "object" || body === null) return;
    const m = parseMessageBody(path, { ...(body as object), session: id });
    if (m) items.push({ message: m, receivedAt: 0 });
  };
  add(WEAR_PATHS.hr, b.hr);
  add(WEAR_PATHS.elevation, b.elevation);
  add(WEAR_PATHS.motion, b.motion);
  await ingestWatchMessages(db, items, false);
  await db.run("INSERT OR IGNORE INTO l_watch_sessions (id, started_at) VALUES (?, ?)", [id, b.session.startedAt]);
  await db.run("UPDATE l_watch_sessions SET started_at = ?, ended_at = ?, mode = ? WHERE id = ?", [b.session.startedAt, b.session.endedAt, b.session.mode, id]);
  await applyStats(db, id, b.session.stats ?? EMPTY_STATS);
  for (const l of b.labels) await saveSessionLabel(db, l);
}
