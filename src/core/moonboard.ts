/**
 * MoonBoard (legacy LED controller): grid geometry, setups, the text Bluetooth packet, and turning problems from the old
 * database dumps into climbs. No network code: MoonBoard here is a local-only provider.
 *
 * Bluetooth facts come from the community notes (e-sr/moonboard `ble/README.md`, FabianRig/ArduinoMoonBoardLED) and the
 * official app's own strings. Used on a 2016 MoonBoard.
 */
import { encodeFrames, type Frame } from "./frames";
import { GRADE_ROWS } from "./gradeTable";
import type { LitHold } from "./led";

// ---------------------------------------------------------------------------------------------------------------------
// Grid

export const COLS = 11;
export const COL_LETTERS = "ABCDEFGHIJK";
export const ROWS_FULL = 18;
export const ROWS_MINI = 12;

export interface GridPos { col: number; row: number }

/** "H9" -> column index 7, row 9; null when it is not a hole on a board with `rows` rows. */
export function parsePosition(description: string, rows: number): GridPos | null {
  const m = /^([A-K])(\d{1,2})$/i.exec(description.trim());
  if (!m) return null;
  const col = COL_LETTERS.indexOf(m[1].toUpperCase());
  const row = Number(m[2]);
  return row >= 1 && row <= rows ? { col, row } : null;
}

export const positionName = (p: GridPos): string => `${COL_LETTERS[p.col]}${p.row}`;

/**
 * The strip runs up column A, down column B, and so on. The controller lights pixel `index`, so this is all the "hold to LED"
 * mapping there is.
 */
export const ledIndex = (p: GridPos, rows: number): number => p.col * rows + (p.col % 2 === 0 ? p.row - 1 : rows - p.row);

export function positionOfLed(index: number, rows: number): GridPos {
  const col = Math.floor(index / rows);
  const r = index % rows;
  return { col, row: col % 2 === 0 ? r + 1 : rows - r };
}

// ---------------------------------------------------------------------------------------------------------------------
// Setups

export interface MoonSetup {
  key: string;
  name: string;
  mini: boolean;
  /** Angles the setup comes at; each is its own problem list. */
  angles: number[];
  /** What a dump's file name usually says. */
  match: RegExp;
}

/** Newest first, so the more specific patterns win when guessing from a file name. */
export const SETUPS: MoonSetup[] = [
  { key: "mini2025", name: "MoonBoard Mini 2025", mini: true, angles: [40], match: /mini.*2025/i },
  { key: "mini2020", name: "MoonBoard Mini 2020", mini: true, angles: [40], match: /mini.*2020/i },
  { key: "2024", name: "MoonBoard 2024", mini: false, angles: [25, 40], match: /2024/ },
  { key: "2019", name: "MoonBoard Masters 2019", mini: false, angles: [25, 40], match: /2019/ },
  { key: "2017", name: "MoonBoard Masters 2017", mini: false, angles: [25, 40], match: /2017/ },
  { key: "2016", name: "MoonBoard 2016", mini: false, angles: [25, 40], match: /2016/ },
];

export const setupByKey = (key: string): MoonSetup | undefined => SETUPS.find((s) => s.key === key);

/** A setup and angle guessed from a dump's file name ("Problems Moonboard 2019 40.json"), or nulls. */
export function guessFromFileName(name: string): { setup: string | null; angle: number | null } {
  const setup = SETUPS.find((s) => s.match.test(name))?.key ?? null;
  const angle = /(?:^|[^\d])(25|40)(?:\s*°|[^\d]|$)/.exec(name.replace(/20(?:16|17|19|20|24|25)/g, ""))?.[1];
  return { setup, angle: angle ? Number(angle) : null };
}

export const rowsOf = (setup: MoonSetup): number => (setup.mini ? ROWS_MINI : ROWS_FULL);

// ---------------------------------------------------------------------------------------------------------------------
// Ids. Every id is derived from the setup, so seeding twice is harmless and boards keep their ids across installs.

export const PRODUCT_FULL = 1;
export const PRODUCT_MINI = 2;
export const SET_ID = 1;
/** The name a setup's bundled hold art goes by in the database (the app maps it to the file). */
export const artName = (setup: MoonSetup): string => `bundled:moonboard/${setup.key}`;
export const productOf = (setup: MoonSetup): number => (setup.mini ? PRODUCT_MINI : PRODUCT_FULL);
export const layoutIdOf = (setup: MoonSetup, angle: number): number => (SETUPS.length - SETUPS.indexOf(setup)) * 10 + (angle === 25 ? 1 : 2);
export const holeIdOf = (product: number, p: GridPos): number => product * 10000 + p.col * 100 + p.row;
export const placementIdOf = (layoutId: number, hole: number): number => layoutId * 100000 + hole;

export const ROLE = { start: 1, middle: 2, finish: 3 } as const;
export type MoonRole = keyof typeof ROLE;
export const roleIdOf = (product: number, role: MoonRole): number => product * 10 + ROLE[role];

/** The legacy controller has fixed colours: start green, moves blue, finish red. */
export const ROLE_COLORS: Record<MoonRole, string> = { start: "00FF00", middle: "0000FF", finish: "FF0000" };
export const ROLE_NAMES: Record<MoonRole, string> = { start: "Start", middle: "Hand", finish: "Finish" };

// ---------------------------------------------------------------------------------------------------------------------
// Setting problems

/**
 * What the official app lets you set (its own strings): a start and finish plus at least 1 move between them, at most 14 moves, so
 * 3 to 18 holds in all; 1 or 2 starts and 1 or 2 finishes (shared with the other providers, see core/setter.ts).
 */
export const MOON_RULES = { minHolds: 3, maxHolds: 18, maxMiddle: 14 } as const;

/** The feet rules problems are set under, as the dumps spell them. */
export const METHODS = ["Feet follow hands", "Any marked holds", "Screw-ons only", "Footless"] as const;
export const DEFAULT_METHOD = METHODS[0];

/** The Font grades a set problem can be given, as the shared scale's difficulty numbers: 6A (16) to 8B+ (31). */
export const SETTABLE_DIFFICULTIES: number[] = Array.from({ length: 16 }, (_, i) => 16 + i);

/** A placement id back to its hole on the grid: the inverse of `placementIdOf` and `holeIdOf`. */
export function positionOfPlacement(placementId: number): GridPos {
  const local = (placementId % 100000) % 10000;
  return { col: Math.floor(local / 100), row: local % 100 };
}

/** The extent of a frame's holes in board units (column + 1, row), as the climbs table stores it. Null for an empty frame. */
export function edgesOf(frame: Frame): { left: number; right: number; bottom: number; top: number } | null {
  if (frame.size === 0) return null;
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const id of frame.keys()) {
    const p = positionOfPlacement(id);
    left = Math.min(left, p.col + 1); right = Math.max(right, p.col + 1);
    bottom = Math.min(bottom, p.row); top = Math.max(top, p.row);
  }
  return { left, right, bottom, top };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bluetooth

/** The classic LED box advertises Nordic UART and the name "Moonboard A" (community notes). */
export const NAME_SUBSTRING = "Moonboard";

export function parseDeviceName(name: string): { displayName: string; serial: string | null; apiLevel: number } {
  return { displayName: name, serial: null, apiLevel: 0 };
}

const TYPE_BY_COLOR: Record<string, string> = { "00FF00": "S", "FF0000": "E" };

/**
 * `l#S3,P17,E40#`: a type letter and the LED index per hold, as ASCII. Colours are not on the wire; the box colours the types
 * itself. The role colour tells which type a lit hold is. An empty list clears the board (`l##`).
 */
export function encodeLegacy(holes: LitHold[]): number[] {
  const tokens = holes.map((h) => `${TYPE_BY_COLOR[h.color.toUpperCase()] ?? "P"}${h.position}`);
  return [...`l#${tokens.join(",")}#`].map((ch) => ch.charCodeAt(0));
}

// ---------------------------------------------------------------------------------------------------------------------
// Grades

const difficultyByFont = new Map(GRADE_ROWS.map((g) => [g.boulder_name.split("/")[0].toLowerCase(), g.difficulty]));

/** "6B+" -> the shared grade scale's difficulty number, or null for a grade outside the scale. */
export const difficultyOfFont = (grade: string): number | null => difficultyByFont.get(grade.trim().toLowerCase()) ?? null;

// ---------------------------------------------------------------------------------------------------------------------
// Problems

export interface MoonProblem {
  name: string;
  setter: string;
  /** Font grade as written in the dump. */
  grade: string;
  method: string;
  benchmark: boolean;
  /** Hold positions as grid coordinates such as "H9", with a role each. */
  holds: { position: string; role: MoonRole }[];
}

export interface ClimbInsert {
  uuid: string;
  name: string;
  setter: string;
  description: string;
  frames: string;
  left: number;
  right: number;
  bottom: number;
  top: number;
  difficulty: number | null;
  benchmark: boolean;
}

/** 128 bits from four seeded 32-bit hashes; stable, so importing the same problem again replaces it. */
export function stableId(text: string): string {
  const out: string[] = [];
  for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b1, 0x85ebca6b]) {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 15;
    }
    out.push((h >>> 0).toString(16).padStart(8, "0"));
  }
  return out.join("").toUpperCase();
}

/** Turns a dump's problem into a climb for the setup, or null when it has no usable holds (off the grid, or none). */
export function toClimb(problem: MoonProblem, setup: MoonSetup, angle: number): ClimbInsert | null {
  const rows = rowsOf(setup);
  const layout = layoutIdOf(setup, angle);
  const product = productOf(setup);
  const frame: Frame = new Map();
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const h of problem.holds) {
    const p = parsePosition(h.position, rows);
    if (!p) return null;
    frame.set(placementIdOf(layout, holeIdOf(product, p)), roleIdOf(product, h.role));
    left = Math.min(left, p.col + 1); right = Math.max(right, p.col + 1);
    bottom = Math.min(bottom, p.row); top = Math.max(top, p.row);
  }
  if (frame.size === 0 || !problem.name.trim()) return null;
  const frames = encodeFrames([frame]);
  return {
    uuid: stableId(`${setup.key}|${angle}|${problem.name.trim()}|${frames}`),
    name: problem.name.trim(), setter: problem.setter.trim() || "Unknown", description: problem.method.trim(), frames,
    left, right, bottom, top, difficulty: difficultyOfFont(problem.grade), benchmark: problem.benchmark,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Dump formats

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Case-insensitive field read: the old site's JSON capitalised names, the community dumps did not. */
function field(o: Obj, ...names: string[]): unknown {
  for (const k of Object.keys(o)) if (names.includes(k.toLowerCase())) return o[k];
  return undefined;
}
const text = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/**
 * One problem from a dump record. Both shapes are understood:
 * the community dump `{name, grade, userGrade, setby, method, isBenchmark, moves:[{description, isStart, isEnd}]}`, and the
 * old site's `{Name, Grade, UserGrade, Setter:{Nickname}, Method, IsBenchmark, Moves:[{Description, IsStart, IsEnd}]}`.
 */
export function problemFromRecord(raw: unknown): MoonProblem | null {
  if (!isObj(raw)) return null;
  const moves = field(raw, "moves");
  if (!Array.isArray(moves)) return null;
  const setterField = field(raw, "setby", "setter", "setterfirstname");
  const setter = isObj(setterField) ? text(field(setterField, "nickname", "firstname")) : text(setterField);
  const holds: MoonProblem["holds"] = [];
  for (const m of moves) {
    if (!isObj(m)) return null;
    const position = text(field(m, "description", "position"));
    if (!position) return null;
    holds.push({ position, role: field(m, "isstart") ? "start" : field(m, "isend") ? "finish" : "middle" });
  }
  return {
    name: text(field(raw, "name")),
    setter,
    // The community grade is the one climbers argue about; the setter's own is the fallback.
    grade: text(field(raw, "usergrade")) || text(field(raw, "grade")),
    method: text(field(raw, "method")),
    benchmark: !!field(raw, "isbenchmark"),
    holds,
  };
}

/**
 * Pulls the records out of a very large JSON file without parsing it as one tree: feed it text in pieces and it returns each
 * complete record's source as soon as it has seen it. The records are the elements of the first array it meets at the top
 * level (`[...]`, or `{"data":[...]}`). Braces inside strings are ignored.
 */
export class RecordSplitter {
  private depth = 0;
  private recordDepth = -1;
  private inString = false;
  private escaped = false;
  private open: string | null = null;

  push(chunk: string): string[] {
    const out: string[] = [];
    let start = this.open !== null ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === 92) this.escaped = true;
        else if (c === 34) this.inString = false;
        continue;
      }
      if (c === 34) { this.inString = true; continue; }
      if (c === 123 || c === 91) { // { [
        this.depth++;
        if (c === 91 && this.recordDepth < 0 && this.depth <= 2) this.recordDepth = this.depth;
        else if (c === 123 && this.depth === this.recordDepth + 1 && this.open === null) { start = i; this.open = ""; }
      } else if (c === 125 || c === 93) { // } ]
        if (c === 125 && this.open !== null && this.depth === this.recordDepth + 1) {
          out.push(this.open + chunk.slice(Math.max(start, 0), i + 1));
          this.open = null; start = -1;
        }
        this.depth--;
      }
    }
    if (this.open !== null) this.open += chunk.slice(Math.max(start, 0));
    return out;
  }
}
