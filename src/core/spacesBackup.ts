/** Spaces, for a backup: where each board is, what spaces are called, and which space each log belongs to. All of it lives on the phone. */
import type { Db } from "./db";
import {
  loadBoardPlaces, loadLogSpaces, loadSpaceLineage, loadSpaceNames, saveBoardPlace, saveLogSpace, saveSpaceLineage, saveSpaceName, type BoardPlace, type LogSpace,
} from "./spaces";

export interface SpacesBackup {
  places: BoardPlace[];
  names: Record<string, string>;
  lineage: Record<string, string>;
  logSpaces: LogSpace[];
}

export const EMPTY_SPACES: SpacesBackup = { places: [], names: {}, lineage: {}, logSpaces: [] };
export const hasSpaces = (s: SpacesBackup): boolean => s.places.length + Object.keys(s.names).length + s.logSpaces.length > 0;

export async function exportSpaces(db: Db): Promise<SpacesBackup> {
  const [places, names, lineage, logs] = await Promise.all([loadBoardPlaces(db), loadSpaceNames(db), loadSpaceLineage(db), loadLogSpaces(db)]);
  // An entry still waiting to upload has a temporary id; once it uploads the app attributes it again.
  return { places: Object.values(places), names, lineage, logSpaces: Object.values(logs).filter((l) => !l.entryId.startsWith("pending:")) };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const STAMP = /^\d{4}-\d{2}-\d{2}/;

function placeOf(v: unknown): BoardPlace | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 100), addedAt = str(v.addedAt, 40);
  const gymName = v.gymName === null ? null : str(v.gymName, 200);
  const manual = v.manualSpaceId === null ? null : str(v.manualSpaceId, 200);
  let location: BoardPlace["location"] = null;
  if (v.location !== null) {
    if (!isObj(v.location)) return null;
    const lat = num(v.location.lat), lon = num(v.location.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    location = { lat, lon };
  }
  if (!id || !addedAt || !STAMP.test(addedAt) || gymName === undefined || manual === undefined) return null;
  return { id, gymName, location, addedAt, manualSpaceId: manual };
}

function logSpaceOf(v: unknown): LogSpace | null {
  if (!isObj(v)) return null;
  const entryId = str(v.entryId, 100), spaceId = str(v.spaceId, 200), boardId = str(v.boardId, 100), spaceName = str(v.spaceName, 300);
  if (!entryId || entryId.startsWith("pending:") || !spaceId || !boardId || spaceName == null) return null;
  return { entryId, spaceId, boardId, spaceName };
}

/** A map of text to text, with a cap so a hostile file cannot fill the phone. */
function textMap(v: unknown, bad: () => void): Record<string, string> {
  if (!isObj(v)) return {};
  const out: Record<string, string> = {};
  let n = 0;
  for (const [k, val] of Object.entries(v)) {
    const name = str(val, 300);
    if (!k || k.length > 200 || name == null || ++n > 5000) { bad(); continue; }
    out[k] = name;
  }
  return out;
}

export function parseSpaces(raw: unknown, bad: () => void): SpacesBackup {
  if (!isObj(raw)) return EMPTY_SPACES;
  const each = <T,>(list: unknown, parse: (v: unknown) => T | null, cap: number): T[] => {
    if (!Array.isArray(list)) return [];
    const out: T[] = [];
    for (const item of list.slice(0, cap)) { const r = parse(item); if (r) out.push(r); else bad(); }
    return out;
  };
  return { places: each(raw.places, placeOf, 1000), names: textMap(raw.names, bad), lineage: textMap(raw.lineage, bad), logSpaces: each(raw.logSpaces, logSpaceOf, 50000) };
}

export async function restoreSpaces(db: Db, s: SpacesBackup): Promise<void> {
  for (const p of s.places) await saveBoardPlace(db, p);
  for (const [id, name] of Object.entries(s.names)) await saveSpaceName(db, id, name);
  for (const [from, to] of Object.entries(s.lineage)) await saveSpaceLineage(db, from, to);
  for (const l of s.logSpaces) await saveLogSpace(db, l);
}
