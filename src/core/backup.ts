/**
 * Reading a backup file back in. A backup is the JSON export (see export.ts). Server-held data (board sends, server circuits) comes
 * back by signing in and syncing, so a restore brings back only what exists on the phone alone: off-board climbs, MoonBoard boards,
 * problems, logs, likes and blocks, circuits that were never published, lit history, spaces, and settings.
 *
 * The file is untrusted input: every record is checked, and one that doesn't pass is skipped and counted, never half-applied.
 */
import type { Db } from "./db";
import type { LitEntry } from "./litHistory";
import { saveLit } from "./litLocal";
import { EMPTY_MOON, hasMoon, parseMoon, restoreMoon, type MoonBackup } from "./moonBackup";
import { EMPTY_PREFS, hasPreferences, parsePreferences, type Preferences } from "./prefsBackup";
import { EMPTY_SPACES, hasSpaces, parseSpaces, restoreSpaces, type SpacesBackup } from "./spacesBackup";
import { saveLog } from "./moonLocal";
import type { SaveSendInput } from "./api";
import { loadLogicalCircuits, saveLogicalCircuits, type LogicalCircuit } from "./logicalCircuits";
import { cleanLink, MAX_ATTEMPTS, STYLE_TAGS, WALL_STYLES, type OutsideGradeSystem, type OutsideLog, type OutsideResult, type OutsideSetting, type WallStyleId } from "./outside";
import { saveOutside } from "./outsideLocal";
import type { LogEntry } from "./types";

/** The newest file format this version of the app writes and reads. */
export const BACKUP_VERSION = 3;

export interface ParsedBackup {
  exportedAt: string;
  offBoard: OutsideLog[];
  /** Sends and attempts on boards that have no service. */
  localLogs: LogEntry[];
  /** Circuits that were never published to a service. */
  circuits: LogicalCircuit[];
  /** Climbs lit on boards. */
  litHistory: LitEntry[];
  /** MoonBoard boards, the problems set on them, and likes and blocks. */
  moon: MoonBackup;
  spaces: SpacesBackup;
  preferences: Preferences;
  /** Records in the file that were damaged or of a kind this app can't use. */
  skipped: number;
}

export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };

export interface RestoreSummary {
  offBoard: number;
  localLogs: number;
  circuits: number;
  litHistory: number;
  moonBoards: number;
  moonProblems: number;
  /** Likes and blocks on MoonBoard problems. */
  moonTags: number;
  places: number;
  preferences: boolean;
  skipped: number;
}

/** Where a restore finds each provider's database, and the phone's own. */
export interface RestoreTargets {
  dbFor: (provider: string) => Promise<Db>;
  local: Db;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 5000): string | null => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const STAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const stamp = (v: unknown): string | null => { const s = str(v, 40); return s && STAMP.test(s) ? s : null; };
const SETTINGS: OutsideSetting[] = ["gym", "outdoor"];
const RESULTS: OutsideResult[] = ["flash", "send", "attempt"];
const SYSTEMS: OutsideGradeSystem[] = ["v", "font"];

function outsideOf(v: unknown): OutsideLog | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 100), name = str(v.name, 200), venue = str(v.venue, 200), link = str(v.link, 2000), note = str(v.note), climbedAt = stamp(v.climbedAt);
  const attempts = num(v.attempts);
  const setting = SETTINGS.find((s) => s === v.setting), result = RESULTS.find((s) => s === v.result);
  const wall = WALL_STYLES.find((w) => w.id === v.wall)?.id as WallStyleId | undefined;
  if (!id || name == null || venue == null || link == null || note == null || !climbedAt || attempts == null || !setting || !result || !wall) return null;
  const cleaned = cleanLink(link);
  if (cleaned === null) return null;
  const system = v.gradeSystem === null ? null : SYSTEMS.find((s) => s === v.gradeSystem) ?? undefined;
  const label = v.gradeLabel === null ? null : str(v.gradeLabel, 20);
  const grade = v.grade === null ? null : num(v.grade);
  if (system === undefined || label === undefined || grade === undefined || (grade !== null && (grade < 0 || grade > 40))) return null;
  const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === "string" && (STYLE_TAGS as readonly string[]).includes(t)) : [];
  return { id, setting, name, venue, link: cleaned, wall, gradeSystem: system, gradeLabel: label, grade, result, attempts: Math.max(1, Math.min(MAX_ATTEMPTS, Math.round(attempts))), tags, note, climbedAt };
}

function logOf(v: unknown): LogEntry | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 100), provider = str(v.provider, 50), climbUuid = str(v.climbUuid, 100), climbName = str(v.climbName, 300), comment = str(v.comment), climbedAt = stamp(v.climbedAt);
  const angle = num(v.angle), bidCount = num(v.bidCount), quality = num(v.quality), difficulty = num(v.difficulty);
  if (!id || !provider || !climbUuid || climbName == null || comment == null || !climbedAt || angle == null || bidCount == null || quality == null || difficulty == null) return null;
  if (typeof v.isMirror !== "boolean" || typeof v.isSend !== "boolean") return null;
  return { id, provider, climbUuid, climbName, angle, isMirror: v.isMirror, bidCount, quality, difficulty, comment, climbedAt, isSend: v.isSend };
}

function litOf(v: unknown): LitEntry | null {
  if (!isObj(v)) return null;
  const id = str(v.id, 100), provider = str(v.provider, 50), climbUuid = str(v.climbUuid, 100), climbName = str(v.climbName, 300), boardId = str(v.boardId, 100), boardName = str(v.boardName, 300);
  const angle = num(v.angle), litAt = stamp(v.litAt);
  if (!id || !provider || !climbUuid || climbName == null || !boardId || boardName == null || angle == null || !litAt) return null;
  return { id, provider, climbUuid, climbName, boardId, boardName, angle, litAt };
}

function circuitOf(v: unknown, fallbackStamp: string): LogicalCircuit | null {
  if (!isObj(v)) return null;
  // A circuit that was published somewhere comes back from that service, so only never-published ones are restored.
  if (!Array.isArray(v.publishedOn) || v.publishedOn.length > 0) return null;
  const uuid = str(v.uuid, 100), name = str(v.name, 300), description = str(v.description), color = str(v.color, 20);
  if (!uuid || name == null || description == null || color == null || !Array.isArray(v.items)) return null;
  const items = v.items.map((i) => (isObj(i) && str(i.provider, 50) && str(i.id, 100) ? { provider: i.provider as string, id: i.id as string } : null));
  if (items.some((i) => i === null)) return null;
  const list = items as { provider: string; id: string }[];
  return {
    uuid, name, description, color, userId: num(v.userId) ?? 0, isPublic: false, items: list, climbs: list.map((i) => i.id), projections: [],
    createdAt: stamp(v.createdAt) ?? fallbackStamp, updatedAt: stamp(v.updatedAt) ?? fallbackStamp,
  };
}

/** Checks a backup file's text. `isLocalProvider` says which providers keep their data only on the phone. */
export function parseBackup(text: string, isLocalProvider: (provider: string) => boolean): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a Slackboard backup." }; }
  if (!isObj(raw) || raw.app !== "slackboard") return { ok: false, error: "That file isn't a Slackboard backup." };
  if (typeof raw.version !== "number" || raw.version < 1) return { ok: false, error: "That backup has no version." };
  if (raw.version > BACKUP_VERSION) return { ok: false, error: "That backup was made by a newer version of Slackboard. Update the app and try again." };
  const exportedAt = str(raw.exportedAt, 40) ?? "";
  const fallback = exportedAt ? exportedAt.replace("T", " ").slice(0, 19) : "1970-01-01 00:00:00";
  let skipped = 0;
  const each = <T,>(list: unknown, parse: (v: unknown) => T | null): T[] => {
    if (!Array.isArray(list)) return [];
    const out: T[] = [];
    for (const item of list) { const r = parse(item); if (r) out.push(r); else skipped++; }
    return out;
  };
  const offBoard = each(raw.offBoard, outsideOf);
  const allLogs = each(raw.logbook, logOf);
  // Entries on services come back by syncing, so they are neither restored nor counted as damaged.
  const localLogs = allLogs.filter((e) => isLocalProvider(e.provider));
  const circuits = each(raw.circuits, (v) => circuitOf(v, fallback));
  const litHistory = each(raw.litHistory, litOf);
  const moon = parseMoon(raw.moon, () => { skipped++; });
  const spaces = parseSpaces(raw.spaces, () => { skipped++; });
  const preferences = parsePreferences(raw.preferences);
  return { ok: true, backup: { exportedAt, offBoard, localLogs, circuits, litHistory, moon, spaces, preferences, skipped } };
}

/**
 * Writes the backup's records into the local database. A record already there with the same id is replaced by the file's copy; a
 * circuit already there is left alone.
 */
/** A log entry as the input that saves it, so a restored MoonBoard log lands in the MoonBoard database with its ticks and stats. */
function sendInputOf(e: LogEntry): SaveSendInput {
  const input: SaveSendInput = { climbUuid: e.climbUuid, angle: e.angle, isMirror: e.isMirror, bidCount: e.bidCount, comment: e.comment, climbedAt: new Date(e.climbedAt.replace(" ", "T")) };
  return e.isSend ? { ...input, quality: e.quality, difficulty: e.difficulty } : input;
}

export async function restoreBackup(t: RestoreTargets, b: ParsedBackup): Promise<RestoreSummary> {
  for (const l of b.offBoard) await saveOutside(t.local, l);
  for (const e of b.litHistory) await saveLit(t.local, e);
  // Boards first, so the problems, logs and tags that belong to them have somewhere to go.
  if (hasMoon(b.moon)) await restoreMoon(await t.dbFor("moonboard"), b.moon);
  for (const e of b.localLogs) await saveLog(await t.dbFor(e.provider), sendInputOf(e), e.id);
  await restoreSpaces(t.local, b.spaces);
  const have = await loadLogicalCircuits(t.local);
  const known = new Set(have.map((c) => c.uuid));
  const added = b.circuits.filter((c) => !known.has(c.uuid));
  if (added.length) await saveLogicalCircuits(t.local, [...have, ...added], have);
  return {
    offBoard: b.offBoard.length, localLogs: b.localLogs.length, circuits: added.length, litHistory: b.litHistory.length, moonBoards: b.moon.boards.length,
    moonProblems: b.moon.problems.length, moonTags: b.moon.tags.length, places: b.spaces.places.length, preferences: hasPreferences(b.preferences), skipped: b.skipped,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a backup holds, in words, for the preview before restoring. */
export function describeBackup(b: ParsedBackup): string {
  const parts = [
    b.offBoard.length ? plural(b.offBoard.length, "off-board climb", "off-board climbs") : "",
    b.localLogs.length ? plural(b.localLogs.length, "MoonBoard log entry", "MoonBoard log entries") : "",
    b.moon.boards.length ? plural(b.moon.boards.length, "MoonBoard", "MoonBoards") : "",
    b.moon.problems.length ? plural(b.moon.problems.length, "problem you set", "problems you set") : "",
    b.moon.tags.length ? plural(b.moon.tags.length, "MoonBoard like or block", "MoonBoard likes and blocks") : "",
    b.circuits.length ? plural(b.circuits.length, "circuit", "circuits") : "",
    b.litHistory.length ? plural(b.litHistory.length, "lit climb", "lit climbs") : "",
    b.spaces.places.length ? plural(b.spaces.places.length, "board location", "board locations") : "",
    hasPreferences(b.preferences) ? "your settings" : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing this phone keeps on its own";
}

/** What a restore brought back, in words. */
export function describeRestored(s: RestoreSummary): string {
  const parts = [
    s.offBoard ? plural(s.offBoard, "off-board climb", "off-board climbs") : "",
    s.localLogs ? plural(s.localLogs, "MoonBoard log entry", "MoonBoard log entries") : "",
    s.moonBoards ? plural(s.moonBoards, "MoonBoard", "MoonBoards") : "",
    s.moonProblems ? plural(s.moonProblems, "problem you set", "problems you set") : "",
    s.moonTags ? plural(s.moonTags, "MoonBoard like or block", "MoonBoard likes and blocks") : "",
    s.circuits ? plural(s.circuits, "circuit", "circuits") : "",
    s.litHistory ? plural(s.litHistory, "lit climb", "lit climbs") : "",
    s.places ? plural(s.places, "board location", "board locations") : "",
    s.preferences ? "your settings" : "",
  ].filter(Boolean);
  const done = parts.length ? `Restored ${parts.join(", ")}.` : "Nothing needed restoring.";
  return s.skipped ? `${done} ${plural(s.skipped, "record was", "records were")} damaged and skipped.` : done;
}
