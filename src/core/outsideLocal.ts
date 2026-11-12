import type { Db } from "./db";
import type { OutsideLog, OutsideGradeSystem, OutsideResult, OutsideSetting, WallStyleId } from "./outside";

interface Row {
  id: string; setting: string; name: string; venue: string; link: string; wall: string; grade_system: string | null; grade_label: string | null;
  grade: number | null; result: string; attempts: number; tags: string; note: string; climbed_at: string;
}

const COLUMNS = "id, setting, name, venue, link, wall, grade_system, grade_label, grade, result, attempts, tags, note, climbed_at";

/** Every off-board log, newest first. */
export async function loadOutside(db: Db): Promise<OutsideLog[]> {
  const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM l_outside_logs ORDER BY climbed_at DESC, id`);
  return rows.map((r) => ({
    id: r.id, setting: r.setting as OutsideSetting, name: r.name, venue: r.venue, link: r.link, wall: r.wall as WallStyleId,
    gradeSystem: r.grade_system as OutsideGradeSystem | null, gradeLabel: r.grade_label, grade: r.grade, result: r.result as OutsideResult,
    attempts: r.attempts, tags: r.tags ? r.tags.split(",") : [], note: r.note, climbedAt: r.climbed_at,
  }));
}

/** Inserts or replaces one log. */
export async function saveOutside(db: Db, l: OutsideLog): Promise<void> {
  await db.run(
    `INSERT OR REPLACE INTO l_outside_logs (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [l.id, l.setting, l.name, l.venue, l.link, l.wall, l.gradeSystem, l.gradeLabel, l.grade, l.result, l.attempts, l.tags.join(","), l.note, l.climbedAt],
  );
}

export async function deleteOutside(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM l_outside_logs WHERE id = ?", [id]);
}
