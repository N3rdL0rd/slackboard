import type { Db } from "./db";
import { decodeGoal, encodeGoal, type Goal } from "./goals";

interface Row { id: string; title: string; type: string; scope_json: string; window_json: string; target_json: string; status: string; created_at: string; achieved_at: string | null }

/** Every goal, newest first. A row that no longer makes a goal is left out of the list (and left in the table). */
export async function loadGoals(db: Db): Promise<Goal[]> {
  const rows = await db.all<Row>("SELECT id, title, type, scope_json, window_json, target_json, status, created_at, achieved_at FROM l_goals ORDER BY created_at DESC, id");
  return rows.flatMap((r) => decodeGoal({ id: r.id, title: r.title, type: r.type, scope: r.scope_json, window: r.window_json, target: r.target_json, status: r.status, created_at: r.created_at, achieved_at: r.achieved_at }) ?? []);
}

/** Inserts or replaces one goal. */
export async function saveGoal(db: Db, g: Goal): Promise<void> {
  const e = encodeGoal(g);
  await db.run(
    "INSERT OR REPLACE INTO l_goals (id, type, scope_json, window_json, target_json, status, title, created_at, achieved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [g.id, e.type, e.scope, e.window, e.target, g.status, g.title, g.createdAt, g.achievedAt],
  );
}

export async function deleteGoal(db: Db, id: string): Promise<void> {
  await db.run("DELETE FROM l_goals WHERE id = ?", [id]);
}
