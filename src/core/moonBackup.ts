/**
 * What only the phone has about MoonBoard, for a backup: the boards, the problems the user set, and their likes and blocks. The
 * downloaded problem lists are not included (they download again when a board is opened), and logs travel with the logbook.
 *
 * Like the rest of a backup file this is untrusted input on the way back in: each record is checked and a damaged one is skipped.
 */
import type { Db } from "./db";
import { edgesOf, setupByKey } from "./moonboard";
import { parseFrames } from "./frames";
import { createBoard, LOCAL_USER_ID, saveOwnClimb, seedSetup, setTag } from "./moonLocal";
import { targetOfLayout } from "./moonSources";

export interface MoonBoardBackup { uuid: string; name: string; setupKey: string; angle: number }
export interface MoonProblemBackup { uuid: string; layoutId: number; name: string; method: string; frames: string; angle: number; difficulty: number }
export interface MoonTagBackup { climbUuid: string; name: "~flag" | "~block"; listed: boolean }
export interface MoonBackup { boards: MoonBoardBackup[]; problems: MoonProblemBackup[]; tags: MoonTagBackup[] }

export const EMPTY_MOON: MoonBackup = { boards: [], problems: [], tags: [] };
export const hasMoon = (m: MoonBackup): boolean => m.boards.length + m.problems.length + m.tags.length > 0;

/** Reads the MoonBoard database's own data. */
export async function exportMoon(db: Db): Promise<MoonBackup> {
  const walls = await db.all<{ uuid: string; name: string; layout_id: number }>("SELECT uuid, name, layout_id FROM walls WHERE user_id = ? ORDER BY created_at, uuid", [LOCAL_USER_ID]);
  const boards: MoonBoardBackup[] = [];
  for (const w of walls) {
    const target = targetOfLayout(w.layout_id);
    if (target) boards.push({ uuid: w.uuid, name: w.name, setupKey: target.setup.key, angle: target.angle });
  }
  const own = await db.all<{ uuid: string; layout_id: number; name: string; description: string; frames: string; angle: number | null; difficulty: number | null }>(
    `SELECT c.uuid, c.layout_id, c.name, c.description, c.frames, c.angle, s.display_difficulty AS difficulty
     FROM climbs c LEFT JOIN climb_stats s ON s.climb_uuid = c.uuid AND s.angle = c.angle WHERE c.setter_id = ? ORDER BY c.created_at, c.uuid`, [LOCAL_USER_ID]);
  const problems = own.flatMap((p) => p.angle == null ? [] : [{ uuid: p.uuid, layoutId: p.layout_id, name: p.name, method: p.description, frames: p.frames, angle: p.angle, difficulty: p.difficulty ?? 0 }]);
  const tagRows = await db.all<{ entity_uuid: string; name: string; is_listed: number }>(
    "SELECT entity_uuid, name, is_listed FROM tags WHERE user_id = ? AND name IN ('~flag', '~block') AND is_listed = 1 ORDER BY entity_uuid", [LOCAL_USER_ID]);
  return { boards, problems, tags: tagRows.map((t) => ({ climbUuid: t.entity_uuid, name: t.name as MoonTagBackup["name"], listed: true })) };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const ID = /^[0-9A-Fa-f]{32}$/;

function boardOf(v: unknown): MoonBoardBackup | null {
  if (!isObj(v)) return null;
  const uuid = str(v.uuid, 32), name = str(v.name, 200), key = str(v.setupKey, 40), angle = num(v.angle);
  const setup = key ? setupByKey(key) : undefined;
  if (!uuid || !ID.test(uuid) || name == null || !setup || angle == null || !setup.angles.includes(angle)) return null;
  return { uuid: uuid.toUpperCase(), name, setupKey: setup.key, angle };
}

function problemOf(v: unknown): MoonProblemBackup | null {
  if (!isObj(v)) return null;
  const uuid = str(v.uuid, 32), name = str(v.name, 300), method = str(v.method, 300), frames = str(v.frames, 5000);
  const layoutId = num(v.layoutId), angle = num(v.angle), difficulty = num(v.difficulty);
  if (!uuid || !ID.test(uuid) || !name || method == null || !frames || layoutId == null || angle == null || difficulty == null) return null;
  const target = targetOfLayout(layoutId);
  if (!target || target.angle !== angle || difficulty < 0 || difficulty > 60) return null;
  const frame = parseFrames(frames)[0];
  if (!frame || !edgesOf(frame)) return null;
  return { uuid: uuid.toUpperCase(), layoutId, name, method, frames, angle, difficulty };
}

function tagOf(v: unknown): MoonTagBackup | null {
  if (!isObj(v)) return null;
  const climbUuid = str(v.climbUuid, 32);
  if (!climbUuid || !ID.test(climbUuid) || (v.name !== "~flag" && v.name !== "~block") || typeof v.listed !== "boolean") return null;
  return { climbUuid: climbUuid.toUpperCase(), name: v.name, listed: v.listed };
}

/** Checks the `moon` part of a backup file. `bad` is called once per damaged record. */
export function parseMoon(raw: unknown, bad: () => void): MoonBackup {
  if (!isObj(raw)) return EMPTY_MOON;
  const each = <T,>(list: unknown, parse: (v: unknown) => T | null): T[] => {
    if (!Array.isArray(list)) return [];
    const out: T[] = [];
    for (const item of list) { const r = parse(item); if (r) out.push(r); else bad(); }
    return out;
  };
  return { boards: each(raw.boards, boardOf), problems: each(raw.problems, problemOf), tags: each(raw.tags, tagOf) };
}

/** Puts the data back. Boards come back with their old ids, so spaces, angles and logs that name them still match. */
export async function restoreMoon(db: Db, m: MoonBackup): Promise<void> {
  for (const b of m.boards) {
    const setup = setupByKey(b.setupKey);
    if (setup) await createBoard(db, { name: b.name, setup, angle: b.angle, uuid: b.uuid });
  }
  for (const p of m.problems) {
    const target = targetOfLayout(p.layoutId);
    if (!target) continue;
    await seedSetup(db, target.setup, target.angle);
    await saveOwnClimb(db, { uuid: p.uuid, restore: true, layoutId: p.layoutId, name: p.name, method: p.method, frames: p.frames, angle: p.angle, difficulty: p.difficulty });
  }
  for (const t of m.tags) await setTag(db, t.climbUuid, t.name, t.listed);
}
