import type { Db } from "./db";
import type { RopedLog, RopedResult, RopedSetting, RopedStyle } from "./roped";
import type { RopedSystem } from "../data/ropedGrades";

interface Row {
  id: string; style: string; setting: string; name: string; venue: string; link: string; grade_system: string; grade_label: string; grade_value: number;
  result: string; attempts: number; length_m: number | null; pitches: number; note: string; climbed_at: string;
}

const COLUMNS = "id, style, setting, name, venue, link, grade_system, grade_label, grade_value, result, attempts, length_m, pitches, note, climbed_at";

/** Every roped log, newest first. */
export async function loadRoped(db: Db): Promise<RopedLog[]> {
  const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM l_roped_logs ORDER BY climbed_at DESC, id`);
  return rows.map((r) => ({
    id: r.id, style: r.style as RopedStyle, setting: r.setting as RopedSetting, name: r.name, venue: r.venue, link: r.link, gradeSystem: r.grade_system as RopedSystem,
    gradeLabel: r.grade_label, grade: r.grade_value, result: r.result as RopedResult, attempts: r.attempts, lengthM: r.length_m, pitches: r.pitches, note: r.note, climbedAt: r.climbed_at,
  }));
}

/** Inserts or replaces one log. */
export async function saveRoped(db: Db, l: RopedLog): Promise<void> {
  await db.run(
    `INSERT OR REPLACE INTO l_roped_logs (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [l.id, l.style, l.setting, l.name, l.venue, l.link, l.gradeSystem, l.gradeLabel, l.grade, l.result, l.attempts, l.lengthM, l.pitches, l.note, l.climbedAt],
  );
}

export async function deleteRoped(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM l_roped_logs WHERE id = ?", [id]);
}
