import type { Db } from "./db";
import { canonicalTags, parseHoldTag, type HoldTag } from "./holdSurvey";

interface Row { board: string; key: string; tags: string; note: string; taggedAt: string }

const SELECT = "SELECT board, key, tags, note, tagged_at AS taggedAt FROM l_hold_tags";

/** Every hold tag. A row that does not read back as a valid tag is left out. */
export async function loadHoldTags(db: Db): Promise<HoldTag[]> {
  const rows = await db.all<Row>(`${SELECT} ORDER BY board, key`);
  return rows.map((r) => parseHoldTag(r)).filter((t): t is HoldTag => t !== null);
}

/** Saves one hold's tags, replacing the earlier ones. A hold with no tags is removed instead. */
export async function saveHoldTag(db: Db, t: HoldTag): Promise<void> {
  const tags = canonicalTags(t.tags);
  if (tags.length === 0) return deleteHoldTag(db, t.board, t.key);
  await db.run("INSERT OR REPLACE INTO l_hold_tags (board, key, tags, note, tagged_at) VALUES (?, ?, ?, ?, ?)", [t.board, t.key, tags.join(","), t.note, t.taggedAt]);
}

export async function deleteHoldTag(db: Db, board: string, key: string): Promise<void> {
  await db.run("DELETE FROM l_hold_tags WHERE board = ? AND key = ?", [board, key]);
}
