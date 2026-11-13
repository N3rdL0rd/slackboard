import { isBlankNote, parseDayNote, type DayNote } from "./body";
import type { Day } from "./days";
import type { Db } from "./db";

interface Row { day: string; effort: number | null; energy: number | null; fingers: string; elbows: string; shoulders: string; other: string; note: string }

const COLUMNS = "day, effort, energy, fingers, elbows, shoulders, other, note";

/** Every day note, newest day first. A row that doesn't read back as a valid note is left out. */
export async function loadDayNotes(db: Db): Promise<DayNote[]> {
  const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM l_day_notes ORDER BY day DESC`);
  return rows.map((r) => parseDayNote(r)).filter((n): n is DayNote => n !== null);
}

/** Saves a day's note, replacing the one for that day. A note that says nothing is removed instead of stored. */
export async function saveDayNote(db: Db, n: DayNote): Promise<void> {
  if (isBlankNote(n)) { await db.run("DELETE FROM l_day_notes WHERE day = ?", [n.day]); return; }
  await db.run(`INSERT OR REPLACE INTO l_day_notes (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [n.day, n.effort, n.energy, n.fingers, n.elbows, n.shoulders, n.other, n.note]);
}

export async function deleteDayNote(db: Db, day: Day): Promise<void> {
  await db.run("DELETE FROM l_day_notes WHERE day = ?", [day]);
}

/** What has been snoozed: the last day each line is hidden through, by key. */
export type SnoozeMap = Record<string, Day>;

export async function loadSnoozes(db: Db): Promise<SnoozeMap> {
  const rows = await db.all<{ key: string; snoozed_until: string | null }>("SELECT key, snoozed_until FROM l_nudge_state WHERE snoozed_until IS NOT NULL");
  return Object.fromEntries(rows.map((r) => [r.key, r.snoozed_until as Day]));
}

/** Hides a line (such as the rest nudge) through `day`. */
export async function saveSnooze(db: Db, key: string, day: Day): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_nudge_state (key, shown_at, snoozed_until, dismissed) VALUES (?, NULL, ?, 0)", [key, day]);
}
