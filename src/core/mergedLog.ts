import { compareText } from "./collate";
import type { DoneState } from "./filters";
import type { Db } from "./db";
import type { ProviderId } from "./provider";
import type { LogEntry } from "./types";

/** Key for "what have I done with this climb at this angle". Climb ids are only unique within a provider. */
export const doneKey = (provider: ProviderId, climbUuid: string, angle: number): string => `${provider}:${climbUuid.toUpperCase()}:${angle}`;

/** One logbook from several sources, newest first, with an entry that appears twice (same provider and id) kept once. */
export function mergeLogs(...sources: LogEntry[][]): LogEntry[] {
  const seen = new Set<string>();
  const out: LogEntry[] = [];
  for (const list of sources) {
    for (const e of list) {
      const k = `${e.provider}:${e.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
  }
  return out.sort((a, b) => compareText(b.climbedAt, a.climbedAt));
}

/** A send beats attempts: once a climb is sent at an angle it stays "sent", whatever else was logged. */
export function doneMap(entries: LogEntry[]): Map<string, DoneState> {
  const done = new Map<string, DoneState>();
  for (const e of entries) {
    const k = doneKey(e.provider, e.climbUuid, e.angle);
    if (e.isSend) done.set(k, "sent");
    else if (!done.has(k)) done.set(k, "tried");
  }
  return done;
}

// Entries no provider's server holds (a provider without a logbook, or a board with no service) live on the device.

export async function loadLocalLogs(db: Db): Promise<LogEntry[]> {
  const rows = await db.all<{ id: string; provider: string; climb_id: string; climb_name: string; angle: number; is_mirror: number; bid_count: number; quality: number; difficulty: number; comment: string; climbed_at: string; is_send: number }>(
    "SELECT id, provider, climb_id, climb_name, angle, is_mirror, bid_count, quality, difficulty, comment, climbed_at, is_send FROM l_local_logs");
  return rows.map((r) => ({
    id: r.id, provider: r.provider, climbUuid: r.climb_id, climbName: r.climb_name, angle: r.angle, isMirror: !!r.is_mirror, bidCount: r.bid_count,
    quality: r.quality, difficulty: r.difficulty, comment: r.comment, climbedAt: r.climbed_at, isSend: !!r.is_send,
  }));
}

export async function saveLocalLog(db: Db, e: LogEntry): Promise<void> {
  await db.run(
    "INSERT OR REPLACE INTO l_local_logs (id, provider, climb_id, climb_name, angle, is_mirror, bid_count, quality, difficulty, comment, climbed_at, is_send) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, e.provider, e.climbUuid, e.climbName, e.angle, e.isMirror ? 1 : 0, e.bidCount, e.quality, e.difficulty, e.comment, e.climbedAt, e.isSend ? 1 : 0]);
}

export async function deleteLocalLog(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM l_local_logs WHERE id = ?", [id]);
}
