/**
 * The hold survey: walking a connected board one hold at a time, lighting each and recording what the person at the board says it is.
 * A developer tool for authoring hold-type maps (see holdTypes.ts). A hold takes any number of tags (a wooden crimp that is also a pinch
 * is both), from four groups: shape, how it is pulled, material, and "unsure". The records live on the phone, travel in the backup, and
 * can be shared as the hold-types file format plus the full tags. Pure: ordering, progress and the file; storage is holdTagsLocal.ts and
 * the screen is app/dev.
 */
import { HOLD_TYPES, HOLD_TYPE_INFO, type HoldType } from "./holdTypes";

/** How a hold is used when it is not simply pulled down: undercling is upside down, gaston and side pull are sideways. */
export const ORIENTATION_TAGS = ["undercling", "gaston", "sidepull"] as const;
export const MATERIAL_TAGS = ["wood", "plastic"] as const;
/** The tags in the order they are shown, stored and exported. */
export const SURVEY_TAGS = [...HOLD_TYPES, ...ORIENTATION_TAGS, ...MATERIAL_TAGS, "unsure"] as const;
export type SurveyTag = (typeof SURVEY_TAGS)[number];

export const TAG_GROUPS: { title: string; tags: readonly SurveyTag[] }[] = [
  { title: "Shape (pick all that apply)", tags: HOLD_TYPES },
  { title: "How it is pulled", tags: ORIENTATION_TAGS },
  { title: "Material", tags: MATERIAL_TAGS },
];

export const TAG_INFO: Record<SurveyTag, { label: string; hint: string }> = {
  ...HOLD_TYPE_INFO,
  undercling: { label: "Undercling", hint: "Upside down: the useful edge faces down and you pull up on it from underneath." },
  gaston: { label: "Gaston", hint: "Sideways, with the useful edge facing away from you: you push it out to the side, thumb down, like opening a door." },
  sidepull: { label: "Side pull", hint: "Sideways, with the useful edge facing you: you pull across your body." },
  wood: { label: "Wood", hint: "A wooden hold." },
  plastic: { label: "Plastic", hint: "A plastic (resin) hold." },
  unsure: { label: "Unsure", hint: "Come back to this one. It is left out of the exported types." },
};

export const MAX_NOTE = 200;

export interface HoldTag {
  /** `surveyBoardId`: which board and size the key belongs to. */
  board: string;
  /** The cell name on a MoonBoard, the placement id on an Aurora board: the same keys the hold-type files use. */
  key: string;
  /** At least one, in `SURVEY_TAGS` order, no repeats. */
  tags: SurveyTag[];
  note: string;
  /** Local `yyyy-MM-dd HH:mm:ss`. */
  taggedAt: string;
}

export const surveyBoardId = (provider: string, layoutId: number, productSizeId: number): string => `${provider}-${layoutId}-${productSizeId}`;

export const isSurveyTag = (x: unknown): x is SurveyTag => typeof x === "string" && (SURVEY_TAGS as readonly string[]).includes(x);

/** The tags without repeats, in the fixed order. */
export const canonicalTags = (tags: Iterable<SurveyTag>): SurveyTag[] => {
  const have = new Set(tags);
  return SURVEY_TAGS.filter((t) => have.has(t));
};

/** The first shape tag, which is the single type the hold-types file format can carry. Null when the hold has no shape tag. */
export const primaryType = (tags: SurveyTag[]): HoldType | null => HOLD_TYPES.find((t) => tags.includes(t)) ?? null;

/** One hold to visit. */
export interface SurveyHold {
  key: string;
  /** LED strip position to light. */
  led: number;
  x: number;
  y: number;
}

/**
 * The holds in the order they are visited: along the LED strip, which is the order the controller wires the board, so the lit hold
 * moves to a neighbour each time rather than jumping around. A key that appears twice is visited once.
 */
export function surveyOrder(placements: { id: number; x: number; y: number; led: number }[], keyOf: (placementId: number) => string): SurveyHold[] {
  const seen = new Set<string>();
  const out: SurveyHold[] = [];
  for (const p of [...placements].sort((a, b) => a.led - b.led || a.id - b.id)) {
    const key = keyOf(p.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, led: p.led, x: p.x, y: p.y });
  }
  return out;
}

/** The index of the first hold at or after `from` with no tags, wrapping round; null when every hold has some. */
export function nextUntagged(order: SurveyHold[], tags: ReadonlyMap<string, HoldTag>, from: number): number | null {
  const n = order.length;
  for (let i = 0; i < n; i++) {
    const at = (from + i) % n;
    if (!tags.has(order[at].key)) return at;
  }
  return null;
}

/** The index of the first hold marked unsure at or after `from`, wrapping; null when there are none. */
export function nextUnsure(order: SurveyHold[], tags: ReadonlyMap<string, HoldTag>, from: number): number | null {
  const n = order.length;
  for (let i = 0; i < n; i++) {
    const at = (from + i) % n;
    if (tags.get(order[at].key)?.tags.includes("unsure")) return at;
  }
  return null;
}

export interface SurveyProgress { total: number; tagged: number; unsure: number; left: number }

export function surveyProgress(order: SurveyHold[], tags: ReadonlyMap<string, HoldTag>): SurveyProgress {
  let tagged = 0;
  let unsure = 0;
  for (const h of order) {
    const t = tags.get(h.key);
    if (!t) continue;
    if (t.tags.includes("unsure")) unsure++;
    else tagged++;
  }
  return { total: order.length, tagged, unsure, left: order.length - tagged - unsure };
}

/**
 * The file for one board: the hold-types format (`holds`: one type per hold, the first shape tag) plus everything else the survey knows.
 * `tags` has every tag of every hold; `unsure` lists holds to come back to. Holds with only non-shape tags are in `tags` alone.
 */
export function toSurveyFile(board: string, rows: HoldTag[]): { board: string; version: 1; holds: Record<string, HoldType>; tags: Record<string, SurveyTag[]>; unsure: string[]; notes: Record<string, string> } {
  const holds: Record<string, HoldType> = {};
  const tags: Record<string, SurveyTag[]> = {};
  const notes: Record<string, string> = {};
  const unsure: string[] = [];
  for (const t of rows.filter((x) => x.board === board).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))) {
    const type = primaryType(t.tags);
    if (type) holds[t.key] = type;
    tags[t.key] = t.tags;
    if (t.note) notes[t.key] = t.note;
    if (t.tags.includes("unsure")) unsure.push(t.key);
  }
  return { board, version: 1, holds, tags, unsure, notes };
}

/** A hold tag from a backup file or a database row (whose tags are a comma list). Untrusted: anything that does not read back whole is refused. */
export function parseHoldTag(v: unknown): HoldTag | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  const board = typeof r.board === "string" && r.board.length > 0 && r.board.length <= 100 ? r.board : null;
  const key = typeof r.key === "string" && r.key.length > 0 && r.key.length <= 20 ? r.key : null;
  const list = typeof r.tags === "string" ? r.tags.split(",") : Array.isArray(r.tags) ? r.tags : null;
  if (!board || !key || !list || list.length > SURVEY_TAGS.length) return null;
  if (!list.every(isSurveyTag)) return null;
  const tags = canonicalTags(list as SurveyTag[]);
  if (tags.length === 0) return null;
  const taggedAt = typeof r.taggedAt === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.taggedAt) ? r.taggedAt : null;
  if (!taggedAt) return null;
  return { board, key, tags, note: typeof r.note === "string" ? r.note.slice(0, MAX_NOTE) : "", taggedAt };
}
