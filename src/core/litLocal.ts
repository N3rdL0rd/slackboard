import type { Db } from "./db";
import { LIT_MAX_ENTRIES, type LitEntry } from "./litHistory";

const COLUMNS = "id, provider, climb_id, climb_name, board_id, board_name, angle, lit_at";

interface Row { id: string; provider: string; climb_id: string; climb_name: string; board_id: string; board_name: string; angle: number; lit_at: string }

/** The history, newest first. */
export async function loadLit(db: Db, limit = LIT_MAX_ENTRIES): Promise<LitEntry[]> {
  const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM l_lit_history ORDER BY lit_at DESC, id DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({ id: r.id, provider: r.provider, climbUuid: r.climb_id, climbName: r.climb_name, boardId: r.board_id, boardName: r.board_name, angle: r.angle, litAt: r.lit_at }));
}

/** Adds (or replaces, by id) one entry, then drops the oldest beyond the limit. */
export async function saveLit(db: Db, e: LitEntry): Promise<void> {
  await db.run(`INSERT OR REPLACE INTO l_lit_history (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [e.id, e.provider, e.climbUuid, e.climbName, e.boardId, e.boardName, e.angle, e.litAt]);
  await db.run("DELETE FROM l_lit_history WHERE id NOT IN (SELECT id FROM l_lit_history ORDER BY lit_at DESC, id DESC LIMIT ?)", [LIT_MAX_ENTRIES]);
}

export async function clearLit(db: Db): Promise<void> {
  await db.run("DELETE FROM l_lit_history");
}
