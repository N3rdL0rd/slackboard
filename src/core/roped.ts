/**
 * Roped climbs: sport, trad, top rope and autobelay, in a gym or outdoors, graded in YDS or French. They are logged on the phone only.
 * Roped grades have their own scale (the IRCRA number, see data/ropedGrades.ts) and their own stats: they are never converted to V
 * grades and never mixed into the boulder pyramid. Everything here is pure; storage is in ropedLocal.ts.
 */
import { addDays, dayOf, weekStartDay, type Day } from "./days";
import { cleanLink } from "./outside";
import type { LengthUnit } from "./settings";
import { findRopedGrade, otherSystem, ropedLabel, ropedValue, type RopedSystem } from "../data/ropedGrades";

export type RopedStyle = "sport" | "trad" | "toprope" | "autobelay";
export type RopedSetting = "indoor" | "outdoor";
/** Onsight: first try, no beta. Flash: first try, with beta. Redpoint: sent after earlier tries. Fell and hung: a try that ended in a fall or on the rope. Project: a route you are working. */
export type RopedResult = "onsight" | "flash" | "redpoint" | "fell" | "hung" | "project";

export const STYLE_LABEL: Record<RopedStyle, string> = { sport: "Sport", trad: "Trad", toprope: "Top rope", autobelay: "Autobelay" };
export const SETTING_LABEL: Record<RopedSetting, string> = { indoor: "Indoor", outdoor: "Outdoor" };
export const RESULT_LABEL: Record<RopedResult, string> = { onsight: "Onsight", flash: "Flash", redpoint: "Redpoint", fell: "Fell", hung: "Hung", project: "Project" };
export const STYLES: RopedStyle[] = ["sport", "trad", "toprope", "autobelay"];
export const RESULTS: RopedResult[] = ["onsight", "flash", "redpoint", "fell", "hung", "project"];

/** The results that count as a send. */
export const SEND_RESULTS: readonly RopedResult[] = ["onsight", "flash", "redpoint"];
export const isSend = (r: RopedResult): boolean => SEND_RESULTS.includes(r);

/** The most tries, or autobelay laps, one entry can hold. */
export const MAX_TRIES = 99;
export const MAX_PITCHES = 30;
/** Longest route an entry can hold, in metres (big-wall pitches add up, but nothing real is longer than this). */
export const MAX_LENGTH_M = 3000;

export interface RopedLog {
  id: string;
  style: RopedStyle;
  setting: RopedSetting;
  /** The route's name. Optional. */
  name: string;
  /** The gym, or the crag and area outdoors. Optional. */
  venue: string;
  /** A listing for the route (Mountain Project, theCrag). Empty or an http(s) address. */
  link: string;
  /** The notation the grade was picked in; the other is shown beside it. */
  gradeSystem: RopedSystem;
  gradeLabel: string;
  /** The grade's IRCRA number. */
  grade: number;
  result: RopedResult;
  /** Tries on the route; for autobelay, the number of laps. At least 1. */
  attempts: number;
  /** Route length in metres, or null when not given. */
  lengthM: number | null;
  pitches: number;
  note: string;
  /** `yyyy-MM-dd HH:mm:ss`, device local time. */
  climbedAt: string;
}

/** What the form holds while it is being filled in. Length is in the user's own unit. */
export interface RopedDraft {
  style: RopedStyle;
  setting: RopedSetting;
  name: string;
  venue: string;
  link: string;
  gradeSystem: RopedSystem;
  gradeLabel: string | null;
  result: RopedResult;
  attempts: number;
  /** As typed, in the user's length unit; empty for none. */
  length: string;
  pitches: number;
  note: string;
}

export const newDraft = (over: Partial<RopedDraft> = {}): RopedDraft => ({
  style: "sport", setting: "indoor", name: "", venue: "", link: "", gradeSystem: "yds", gradeLabel: null, result: "redpoint", attempts: 1, length: "", pitches: 1, note: "", ...over,
});

/**
 * The result and tries that go together. An onsight or flash is one try. Autobelay has no result of its own (every lap is a send), so
 * it is stored as a redpoint with the laps as the count. A send that took one try can't be a redpoint without being a flash or onsight,
 * but the user knows best (a redpoint on try 1 happens after working it on top rope), so a redpoint keeps what was chosen.
 */
export function normaliseTries(style: RopedStyle, result: RopedResult, attempts: number): { result: RopedResult; attempts: number } {
  const n = Math.max(1, Math.min(MAX_TRIES, Math.round(Number.isFinite(attempts) ? attempts : 1)));
  if (style === "autobelay") return { result: "redpoint", attempts: n };
  if (result === "onsight" || result === "flash") return { result, attempts: 1 };
  return { result, attempts: n };
}

export const toMetres = (value: number, unit: LengthUnit): number => Math.round((unit === "ft" ? value * 0.3048 : value) * 10) / 10;
export const fromMetres = (metres: number, unit: LengthUnit): number => Math.round(unit === "ft" ? metres / 0.3048 : metres);

/** The typed length in metres: `null` for nothing typed, `undefined` for something that isn't a usable length. */
export function parseLength(text: string, unit: LengthUnit): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+([.,]\d+)?$/.test(t)) return undefined;
  const m = toMetres(Number(t.replace(",", ".")), unit);
  return m > 0 && m <= MAX_LENGTH_M ? m : undefined;
}

/** What is wrong with a draft, or null when it can be saved. */
export function draftProblem(d: RopedDraft, unit: LengthUnit): string | null {
  if (!d.gradeLabel || !findRopedGrade(d.gradeSystem, d.gradeLabel)) return "Pick the grade.";
  if (cleanLink(d.link) === null) return "That link doesn't look like a web address.";
  if (parseLength(d.length, unit) === undefined) return "The length should be a number.";
  return null;
}

/** Builds the stored log from a form draft. Throws when the draft has a problem, so callers check `draftProblem` first. */
export function makeRopedLog(d: RopedDraft, unit: LengthUnit, id: string, climbedAt: string): RopedLog {
  const problem = draftProblem(d, unit);
  if (problem) throw new Error(problem);
  const { result, attempts } = normaliseTries(d.style, d.result, d.attempts);
  return {
    id, style: d.style, setting: d.setting, name: d.name.trim(), venue: d.venue.trim(), link: cleanLink(d.link) ?? "",
    gradeSystem: d.gradeSystem, gradeLabel: d.gradeLabel!, grade: ropedValue(d.gradeSystem, d.gradeLabel!)!,
    result, attempts, lengthM: parseLength(d.length, unit) ?? null, pitches: Math.max(1, Math.min(MAX_PITCHES, Math.round(d.pitches))), note: d.note.trim(), climbedAt,
  };
}

/** The form's draft for a stored log, with its length in the user's unit. */
export const draftOf = (l: RopedLog, unit: LengthUnit): RopedDraft => ({
  style: l.style, setting: l.setting, name: l.name, venue: l.venue, link: l.link, gradeSystem: l.gradeSystem, gradeLabel: l.gradeLabel, result: l.result,
  attempts: l.attempts, length: l.lengthM == null ? "" : String(fromMetres(l.lengthM, unit)), pitches: l.pitches, note: l.note,
});

/**
 * "Another at the same grade": the same style, setting, place and grade as a past climb, with a clean result and no name, link or
 * note, since those belong to the one route.
 */
export const repeatDraft = (l: RopedLog): RopedDraft => newDraft({
  style: l.style, setting: l.setting, venue: l.venue, gradeSystem: l.gradeSystem, gradeLabel: l.gradeLabel, pitches: 1,
});

/** After saving with "Save and another": the same form with only the result and tries reset, so laps are a tap each. */
export const afterSave = (d: RopedDraft): RopedDraft => ({ ...d, result: "redpoint", attempts: 1, name: "", note: "" });

/** The distinct style, setting, place and grade combinations used lately, newest first, for one-tap repeats. */
export function recentCombos(logs: RopedLog[], limit = 4): RopedLog[] {
  const seen = new Set<string>();
  const out: RopedLog[] = [];
  for (const l of [...logs].sort((a, b) => b.climbedAt.localeCompare(a.climbedAt))) {
    const key = [l.style, l.setting, l.venue, l.grade].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length === limit) break;
  }
  return out;
}

/** "5.10c, 6a+" in the chosen notation first. */
export function gradeText(l: Pick<RopedLog, "grade" | "gradeSystem">, system: RopedSystem = l.gradeSystem): string {
  const a = ropedLabel(l.grade, system) ?? "";
  const b = ropedLabel(l.grade, otherSystem(system)) ?? "";
  return b ? `${a}, ${b}` : a;
}

/** One line for a log: "Sport, indoor, redpoint" or "Autobelay, indoor, 6 laps". */
export function describeRoped(l: RopedLog): string {
  const where = l.setting === "indoor" ? "indoor" : "outdoor";
  if (l.style === "autobelay") return `${STYLE_LABEL[l.style]}, ${where}, ${l.attempts} ${l.attempts === 1 ? "lap" : "laps"}`;
  const tries = l.result === "redpoint" && l.attempts > 1 ? `redpoint in ${l.attempts}` : RESULT_LABEL[l.result].toLowerCase();
  return `${STYLE_LABEL[l.style]}, ${where}, ${tries}`;
}

/** A title for lists: the route's name, or its grade and style. */
export const ropedTitle = (l: RopedLog): string => l.name || `${l.gradeLabel} ${STYLE_LABEL[l.style].toLowerCase()}`;

// ---------------------------------------------------------------------------------------------------------------------
// Stats

export interface PyramidRow {
  grade: number;
  onsight: number;
  flash: number;
  redpoint: number;
}

export interface RopedWeek {
  /** Monday of the week. */
  start: Day;
  routes: number;
  pitches: number;
  metres: number;
  /** The hardest send that week, as an IRCRA number, or null. */
  hardest: number | null;
}

export interface RopedStats {
  /** Entries that are sends. */
  sends: number;
  /** Routes climbed: sends, with each autobelay lap counted. */
  routes: number;
  /** Entries that are not sends (fell, hung, project). */
  tries: number;
  pitches: number;
  metres: number;
  onsights: number;
  flashes: number;
  /** The hardest send ever, or null. */
  hardest: { grade: number; result: RopedResult } | null;
  /** Sends per grade by result, easiest first. */
  pyramid: PyramidRow[];
  /** The last weeks, oldest first, ending with the week of `now`. */
  weeks: RopedWeek[];
}

export const ROPED_WEEKS_SHOWN = 12;

/** What the roped log says about the user. Sends count by result; autobelay laps each count as a route. Nothing here touches the boulder stats. */
export function ropedStats(logs: RopedLog[], now: Date, weeksShown = ROPED_WEEKS_SHOWN): RopedStats {
  const lastStart = weekStartDay(dayOf(now));
  const starts = Array.from({ length: weeksShown }, (_, i) => addDays(lastStart, -7 * (weeksShown - 1 - i)));
  const weeks = new Map<Day, RopedWeek>(starts.map((s) => [s, { start: s, routes: 0, pitches: 0, metres: 0, hardest: null }]));
  const pyramid = new Map<number, PyramidRow>();
  const out: RopedStats = { sends: 0, routes: 0, tries: 0, pitches: 0, metres: 0, onsights: 0, flashes: 0, hardest: null, pyramid: [], weeks: [] };
  for (const l of logs) {
    if (!isSend(l.result)) { out.tries++; continue; }
    // Each lap of an autobelay is a route; every other entry is one route.
    const laps = l.style === "autobelay" ? l.attempts : 1;
    out.sends++;
    out.routes += laps;
    out.pitches += l.pitches * laps;
    out.metres += (l.lengthM ?? 0) * laps;
    if (l.result === "onsight") out.onsights += laps;
    if (l.result === "flash") out.flashes += laps;
    const row = pyramid.get(l.grade) ?? pyramid.set(l.grade, { grade: l.grade, onsight: 0, flash: 0, redpoint: 0 }).get(l.grade)!;
    row[l.result as "onsight" | "flash" | "redpoint"] += laps;
    if (!out.hardest || l.grade > out.hardest.grade) out.hardest = { grade: l.grade, result: l.result };
    const w = weeks.get(weekStartDay(dayOf(l.climbedAt)));
    if (w) {
      w.routes += laps;
      w.pitches += l.pitches * laps;
      w.metres += (l.lengthM ?? 0) * laps;
      if (w.hardest == null || l.grade > w.hardest) w.hardest = l.grade;
    }
  }
  out.metres = Math.round(out.metres);
  out.pyramid = [...pyramid.values()].sort((a, b) => a.grade - b.grade);
  out.weeks = starts.map((s) => { const w = weeks.get(s)!; return { ...w, metres: Math.round(w.metres) }; });
  return out;
}
