import { BACKUP_VERSION } from "./backup";
import type { LitEntry } from "./litHistory";
import type { MoonBackup } from "./moonBackup";
import type { Preferences } from "./prefsBackup";
import type { SpacesBackup } from "./spacesBackup";
import type { LogicalCircuit } from "./logicalCircuits";
import { RESULT_LABEL, wallStyle, type OutsideLog } from "./outside";
import { isSend, ropedTitle, type RopedLog } from "./roped";
import type { DayNote } from "./body";
import { ropedLabel } from "../data/ropedGrades";
import type { Goal } from "./goals";
import { doneSets, entryName, entryText, type TrainingEntry } from "./training";
import type { LogEntry } from "./types";

export type ExportFormat = "csv" | "json";
export type ExportRange = "all" | "year" | "month";

export const RANGE_LABELS: Record<ExportRange, string> = { all: "All time", year: "Past year", month: "Past 30 days" };

/** Entries inside the range, newest first as the app shows them. */
export function inRange<T extends { climbedAt: string }>(entries: T[], range: ExportRange, now: Date, at: (t: string) => Date): T[] {
  if (range === "all") return entries;
  const since = now.getTime() - (range === "year" ? 365 : 30) * 86_400_000;
  return entries.filter((e) => at(e.climbedAt).getTime() >= since);
}

/**
 * One CSV field. Quotes and line breaks are escaped per RFC 4180. A text field that starts with `= + - @` would be read as a
 * formula by a spreadsheet, so it gets a leading apostrophe.
 */
export function csvField(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface GradeText {
  v: string;
  font: string;
}

export const CSV_HEADER = [
  "date", "provider", "climb", "climb_uuid", "type", "angle", "mirrored", "attempts", "grade_v", "grade_font", "quality", "comment", "setting", "venue", "wall", "tags", "link",
  "kind", "style", "result", "grade_yds", "grade_french", "length_m", "pitches", "detail",
];

/**
 * The logbook as CSV, board entries, off-board climbs and roped climbs together, newest first. `kind` says which: board, offBoard or
 * roped. Off-board rows have no provider; their `setting` is gym or outdoor, and `angle` is the wall category's angle. Roped rows carry
 * their own columns (style, result, YDS and French grade, length and pitches), because roped grades are not V grades.
 */
export function logbookCsv(
  entries: LogEntry[], gradeOf: (e: LogEntry) => GradeText, offBoard: OutsideLog[] = [], offGradeOf: (l: OutsideLog) => GradeText = () => ({ v: "", font: "" }), roped: RopedLog[] = [], training: TrainingEntry[] = [],
): string {
  type Field = string | number | boolean | null;
  const rows: { at: string; fields: Field[] }[] = [];
  const none: Field[] = ["", "", "", "", "", "", ""];
  for (const e of entries) {
    const g = e.difficulty > 0 ? gradeOf(e) : { v: "", font: "" };
    rows.push({ at: e.climbedAt, fields: [e.climbedAt, e.provider, e.climbName, e.climbUuid, e.isSend ? "send" : "attempts", e.angle, e.isMirror, e.bidCount, g.v, g.font, e.isSend ? e.quality : "", e.comment, "", "", "", "", "", "board", ...none] });
  }
  for (const o of offBoard) {
    const g = o.gradeLabel ? offGradeOf(o) : { v: "", font: "" };
    const wall = wallStyle(o.wall);
    rows.push({ at: o.climbedAt, fields: [o.climbedAt, "", o.name || `${wall.label}`, o.id, o.result === "attempt" ? "attempts" : "send", wall.angle, false, o.attempts, g.v, g.font, "", o.note, o.setting, o.venue, wall.label, o.tags.join(";"), o.link, "offBoard", ...none] });
  }
  for (const l of roped) {
    rows.push({ at: l.climbedAt, fields: [
      l.climbedAt, "", ropedTitle(l), l.id, isSend(l.result) ? "send" : "attempts", "", "", l.attempts, "", "", "", l.note, l.setting, l.venue, "", "", l.link,
      "roped", l.style, l.result, ropedLabel(l.grade, "yds") ?? "", ropedLabel(l.grade, "french") ?? "", l.lengthM ?? "", l.pitches, "",
    ] });
  }
  // Training: `attempts` is the sets done, and `detail` the last set in kilograms (the CSV does not follow the unit setting).
  for (const t of training) {
    if (doneSets(t).length === 0) continue;
    rows.push({ at: t.performedAt, fields: [
      t.performedAt, "", entryName(t), t.id, "training", "", "", doneSets(t).length, "", "", "", t.note, "", "", "", "", "",
      "training", "", "", "", "", "", "", entryText(t, { weight: "kg", length: "m" }),
    ] });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  // CRLF line ends are what RFC 4180 and Excel expect.
  return [CSV_HEADER.join(","), ...rows.map((r) => r.fields.map(csvField).join(","))].join("\r\n") + "\r\n";
}

export interface ExportBundle {
  app: "slackboard";
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  user: { id: number | null; username: string };
  range: ExportRange;
  logbook: (LogEntry & { grade_v: string | null; grade_font: string | null })[];
  circuits: { uuid: string; name: string; description: string; color: string; userId: number; createdAt: string; updatedAt: string; isPublic: boolean; climbs: string[]; items: { provider: string; id: string }[]; publishedOn: { provider: string; uuid: string; isPublic: boolean }[] }[];
  /** Gym and outdoor climbs, which exist only on the phone. */
  offBoard: OutsideLog[];
  /** Roped climbs, which exist only on the phone. */
  roped: RopedLog[];
  /** Training entries and their sets, which exist only on the phone. */
  training: TrainingEntry[];
  /** Goals and their status. */
  goals: Goal[];
  /** Daily body check-ins, which exist only on the phone. */
  dayNotes: DayNote[];
  /** Climbs lit up on a board, newest first. */
  litHistory: LitEntry[];
  /** MoonBoard boards, the problems the user set, and their likes and blocks. */
  moon: MoonBackup;
  spaces: SpacesBackup;
  preferences: Preferences;
  liked: string[];
  blocked: string[];
  boards: { name: string; layout: string; size: string; angle: number; adjustable: boolean }[];
}

export function exportJson(input: {
  now: Date; user: { id: number | null; username: string }; range: ExportRange; logbook: LogEntry[]; circuits: LogicalCircuit[];
  offBoard: OutsideLog[]; roped: RopedLog[]; training: TrainingEntry[]; goals: Goal[]; dayNotes: DayNote[]; litHistory: LitEntry[]; moon: MoonBackup; spaces: SpacesBackup; preferences: Preferences; liked: Iterable<string>; blocked: Iterable<string>; boards: { name: string; spec: { layoutName: string; sizeName: string }; angle: number; isAdjustable: boolean }[];
  gradeOf: (e: LogEntry) => GradeText;
}): string {
  const bundle: ExportBundle = {
    app: "slackboard", version: BACKUP_VERSION, exportedAt: input.now.toISOString(), user: input.user, range: input.range,
    logbook: input.logbook.map(({ pending: _pending, ...e }) => {
      const g = e.difficulty > 0 ? input.gradeOf(e as LogEntry) : null;
      return { ...e, grade_v: g?.v ?? null, grade_font: g?.font ?? null };
    }),
    circuits: input.circuits.map((c) => ({ uuid: c.uuid, name: c.name, description: c.description, color: c.color, userId: c.userId, createdAt: c.createdAt, updatedAt: c.updatedAt, isPublic: c.isPublic, climbs: c.climbs, items: c.items, publishedOn: c.projections.map((p) => ({ provider: p.provider, uuid: p.remoteUuid, isPublic: p.isPublic })) })),
    offBoard: input.offBoard,
    roped: input.roped,
    training: input.training,
    goals: input.goals,
    dayNotes: input.dayNotes,
    litHistory: input.litHistory,
    moon: input.moon,
    spaces: input.spaces,
    preferences: input.preferences,
    liked: [...input.liked].sort(),
    blocked: [...input.blocked].sort(),
    boards: input.boards.map((b) => ({ name: b.name, layout: b.spec.layoutName, size: b.spec.sizeName, angle: b.angle, adjustable: b.isAdjustable })),
  };
  return JSON.stringify(bundle, null, 2);
}

export function exportFileName(format: ExportFormat, now: Date, username: string): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const who = username.replace(/[^A-Za-z0-9_-]/g, "") || "me";
  return `slackboard-${who}-${d}.${format}`;
}
