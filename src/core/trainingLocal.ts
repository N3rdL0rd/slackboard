import type { Db } from "./db";
import type { Grip } from "../data/exercises";
import type { Feel, TrainingEntry, TrainingSet } from "./training";

interface EntryRow { id: string; exercise_id: string; performed_at: string; effort: number | null; note: string }
interface SetRow { entry_id: string; position: number; reps: number | null; load_kg: number | null; time_s: number | null; edge_mm: number | null; grip: string | null; rest_s: number | null; done: number; feel: string | null }

/** Every training entry with its sets, newest first. */
export async function loadTraining(db: Db): Promise<TrainingEntry[]> {
  const entries = await db.all<EntryRow>("SELECT id, exercise_id, performed_at, effort, note FROM l_training_entries ORDER BY performed_at DESC, id");
  const sets = await db.all<SetRow>("SELECT entry_id, position, reps, load_kg, time_s, edge_mm, grip, rest_s, done, feel FROM l_training_sets ORDER BY entry_id, position");
  const byEntry = new Map<string, TrainingSet[]>();
  for (const r of sets) {
    const list = byEntry.get(r.entry_id) ?? [];
    list.push({ position: r.position, reps: r.reps, loadKg: r.load_kg, timeS: r.time_s, edgeMm: r.edge_mm, grip: r.grip as Grip | null, restS: r.rest_s, done: r.done === 1, feel: (r.feel as Feel | null) ?? null });
    byEntry.set(r.entry_id, list);
  }
  return entries.map((e) => ({ id: e.id, exerciseId: e.exercise_id, performedAt: e.performed_at, effort: e.effort, note: e.note, sets: byEntry.get(e.id) ?? [] }));
}

/** Inserts or replaces one entry and all its sets, together or not at all. */
export async function saveTraining(db: Db, e: TrainingEntry): Promise<void> {
  await db.transaction(async () => {
    await db.run("INSERT OR REPLACE INTO l_training_entries (id, exercise_id, performed_at, effort, note) VALUES (?, ?, ?, ?, ?)", [e.id, e.exerciseId, e.performedAt, e.effort, e.note]);
    await db.run("DELETE FROM l_training_sets WHERE entry_id = ?", [e.id]);
    for (const s of e.sets) {
      await db.run(
        "INSERT INTO l_training_sets (entry_id, position, reps, load_kg, time_s, edge_mm, grip, rest_s, done, feel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [e.id, s.position, s.reps, s.loadKg, s.timeS, s.edgeMm, s.grip, s.restS, s.done ? 1 : 0, s.feel],
      );
    }
  });
}

export async function deleteTraining(db: Db, id: string): Promise<void> {
  await db.transaction(async () => {
    await db.run("DELETE FROM l_training_sets WHERE entry_id = ?", [id]);
    await db.run("DELETE FROM l_training_entries WHERE id = ?", [id]);
  });
}
