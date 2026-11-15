import type { BoardScale } from "./boardScale";
import { parseBoardScale } from "./boardScale";
import type { Db } from "./db";

interface Row { board: string; cmPerUnit: number; refA: string; refB: string; refCm: number; measuredAt: string }

/** Every measured board scale. A row that does not read back as a valid scale is left out. */
export async function loadBoardScales(db: Db): Promise<BoardScale[]> {
  const rows = await db.all<Row>("SELECT board, cm_per_unit AS cmPerUnit, ref_a AS refA, ref_b AS refB, ref_cm AS refCm, measured_at AS measuredAt FROM l_board_scales ORDER BY board");
  return rows.map((r) => parseBoardScale(r)).filter((s): s is BoardScale => s !== null);
}

/** Saves a board's scale, replacing the earlier measurement. */
export async function saveBoardScale(db: Db, s: BoardScale): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_board_scales (board, cm_per_unit, ref_a, ref_b, ref_cm, measured_at) VALUES (?, ?, ?, ?, ?, ?)", [s.board, s.cmPerUnit, s.refA, s.refB, s.refCm, s.measuredAt]);
}

export async function deleteBoardScale(db: Db, board: string): Promise<void> {
  await db.run("DELETE FROM l_board_scales WHERE board = ?", [board]);
}
