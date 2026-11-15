/**
 * The hold survey: walking a connected board one hold at a time, lighting each and recording what the person at the board says it is.
 * A developer tool for authoring hold-type maps (see holdTypes.ts). A hold takes any number of tags from several groups (a wooden crimp
 * that is also a pinch is both), plus an optional direction its useful face points. The records live on the phone, travel in the
 * backup, and can be shared as the hold-types file format plus everything else. Pure: ordering, progress and the file; storage is
 * holdTagsLocal.ts and the screens are app/dev and app/dead-holds.
 */
import { HOLD_TYPES, HOLD_TYPE_INFO, type HoldType } from "./holdTypes";

/** How a hold is used when it is not simply pulled down: undercling is upside down, gaston and side pull are sideways. */
export const ORIENTATION_TAGS = ["undercling", "gaston", "sidepull"] as const;
export const MATERIAL_TAGS = ["wood", "plastic"] as const;
/** Surface texture, from fully textured to fully smooth. One per hold. */
export const TEXTURE_TAGS = ["textured", "mostlyTextured", "dualTexture", "mostlySmooth", "smooth"] as const;
/** How deep the useful edge is. One per hold. */
export const EDGE_TAGS = ["edgeTip", "edgeHalf", "edgePad", "edgeDeep"] as const;
/** How many fingers fit on the useful part. One per hold. */
export const FIT_TAGS = ["fit1", "fit2", "fit3", "fit4", "fitHand"] as const;
export const USE_TAGS = ["rest", "mostlyFoot"] as const;
/** Things wrong with the board rather than facts about the hold. "dead" hides climbs that use the hold; the others are for the board's owner. */
export const PROBLEM_TAGS = ["wrongLight", "noLight", "dead"] as const;
/** The tags in the order they are shown, stored and exported. */
export const SURVEY_TAGS = [...HOLD_TYPES, ...ORIENTATION_TAGS, ...MATERIAL_TAGS, ...TEXTURE_TAGS, ...EDGE_TAGS, ...FIT_TAGS, ...USE_TAGS, ...PROBLEM_TAGS, "unsure"] as const;
export type SurveyTag = (typeof SURVEY_TAGS)[number];

export interface TagGroup { title: string; tags: readonly SurveyTag[]; /** Picking one replaces the others in the group. */ exclusive?: boolean }

export const TAG_GROUPS: TagGroup[] = [
  { title: "Shape (pick all that apply)", tags: HOLD_TYPES },
  { title: "How it is pulled", tags: ORIENTATION_TAGS },
  { title: "Edge depth", tags: EDGE_TAGS, exclusive: true },
  { title: "Fingers that fit", tags: FIT_TAGS, exclusive: true },
  { title: "Texture", tags: TEXTURE_TAGS, exclusive: true },
  { title: "Use", tags: USE_TAGS },
  { title: "Material", tags: MATERIAL_TAGS },
  { title: "Problems with the board", tags: PROBLEM_TAGS },
];

export const TAG_INFO: Record<SurveyTag, { label: string; hint: string }> = {
  ...HOLD_TYPE_INFO,
  undercling: { label: "Undercling", hint: "Upside down: the useful edge faces down and you pull up on it from underneath." },
  gaston: { label: "Gaston", hint: "Sideways, with the useful edge facing away from you: you push it out to the side, thumb down, like opening a door." },
  sidepull: { label: "Side pull", hint: "Sideways, with the useful edge facing you: you pull across your body." },
  wood: { label: "Wood", hint: "A wooden hold." },
  plastic: { label: "Plastic", hint: "A plastic (resin) hold." },
  textured: { label: "Textured", hint: "Textured all over." },
  mostlyTextured: { label: "Mostly textured", hint: "Textured, apart from a smooth patch or two." },
  dualTexture: { label: "Dual texture", hint: "Part textured and part smooth, about half each." },
  mostlySmooth: { label: "Mostly smooth", hint: "Smooth, with a little texture." },
  smooth: { label: "No texture", hint: "Smooth all over." },
  edgeTip: { label: "Fingertip edge", hint: "The edge is about a fingertip deep, or less." },
  edgeHalf: { label: "Half-pad edge", hint: "About half a finger pad fits on the edge." },
  edgePad: { label: "Full-pad edge", hint: "A full finger pad fits on the edge." },
  edgeDeep: { label: "Deep edge", hint: "Deeper than a finger pad: the first joint rests on it too." },
  fit1: { label: "One finger", hint: "One finger fits on the useful part." },
  fit2: { label: "Two fingers", hint: "Two fingers fit." },
  fit3: { label: "Three fingers", hint: "Three fingers fit." },
  fit4: { label: "Four fingers", hint: "Four fingers fit." },
  fitHand: { label: "Whole hand", hint: "The whole hand wraps or lies on it." },
  rest: { label: "Rest hold", hint: "You can hang from it with a relaxed arm and shake out." },
  mostlyFoot: { label: "Mostly a foothold", hint: "Better as a foot than a hand hold, such as a small chip or a big rounded bump." },
  wrongLight: { label: "Wrong light", hint: "When this hold is lit, a different hold lights up as well or instead. Say which in the note." },
  noLight: { label: "No light", hint: "Nothing lights up for this hold." },
  dead: { label: "Dead hold", hint: "Missing, broken or spinning. Climbs that use it can be hidden (Edit board > Dead holds)." },
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
  /** The direction the useful face points, in whole degrees clockwise from straight up (90 is right, 180 is down). Null when not given. */
  face: number | null;
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

/** The tags after tapping `tag`: toggled, and for a one-per-hold group, replacing the group's other tag. */
export function toggleTag(current: ReadonlySet<SurveyTag>, tag: SurveyTag): Set<SurveyTag> {
  const next = new Set(current);
  if (next.has(tag)) {
    next.delete(tag);
    return next;
  }
  const group = TAG_GROUPS.find((g) => g.tags.includes(tag));
  if (group?.exclusive) for (const t of group.tags) next.delete(t);
  next.add(tag);
  return next;
}

/** Tags where a face direction means something: how the hold is pulled. */
export const hasDirection = (tags: Iterable<SurveyTag>): boolean => [...tags].some((t) => (ORIENTATION_TAGS as readonly string[]).includes(t));

/** A direction snapped to the nearest step (default 15 degrees), 0 to 359. */
export const snapFace = (deg: number, step = 15): number => ((Math.round(deg / step) * step) % 360 + 360) % 360;

const COMPASS = ["up", "up and right", "right", "down and right", "down", "down and left", "left", "up and left"];
/** "right" or "down and left", for a face direction. */
export const faceWords = (deg: number): string => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** The first shape tag, which is the single type the hold-types file format can carry. Null when the hold has no shape tag. */
export const primaryType = (tags: SurveyTag[]): HoldType | null => HOLD_TYPES.find((t) => tags.includes(t)) ?? null;

/** Whether a hold's tags say anything about the hold itself. A hold with only light problems (wrong or no light) is still to do. */
export const isDone = (tags: SurveyTag[]): boolean => tags.some((t) => t !== "wrongLight" && t !== "noLight");

/** One hold to visit. */
export interface SurveyHold {
  key: string;
  /** The placement id of the hold on the board, which climbs refer to. */
  id: number;
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
    out.push({ key, id: p.id, led: p.led, x: p.x, y: p.y });
  }
  return out;
}

const done = (tags: ReadonlyMap<string, HoldTag>, key: string): boolean => {
  const t = tags.get(key);
  return !!t && isDone(t.tags);
};

/** The index of the first hold at or after `from` still to do, wrapping round; null when every hold is done. */
export function nextUntagged(order: SurveyHold[], tags: ReadonlyMap<string, HoldTag>, from: number): number | null {
  const n = order.length;
  for (let i = 0; i < n; i++) {
    const at = (from + i) % n;
    if (!done(tags, order[at].key)) return at;
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
    if (!t || !isDone(t.tags)) continue;
    if (t.tags.includes("unsure")) unsure++;
    else tagged++;
  }
  return { total: order.length, tagged, unsure, left: order.length - tagged - unsure };
}

/**
 * The file for one board: the hold-types format (`holds`: one type per hold, the first shape tag) plus everything else the survey knows.
 * `tags` has every tag of every hold; `faces` the directions; `unsure` lists holds to come back to. Holds with only non-shape tags are
 * in `tags` alone.
 */
export function toSurveyFile(board: string, rows: HoldTag[]): {
  board: string; version: 1; holds: Record<string, HoldType>; tags: Record<string, SurveyTag[]>; faces: Record<string, number>; unsure: string[]; notes: Record<string, string>;
} {
  const holds: Record<string, HoldType> = {};
  const tags: Record<string, SurveyTag[]> = {};
  const faces: Record<string, number> = {};
  const notes: Record<string, string> = {};
  const unsure: string[] = [];
  for (const t of rows.filter((x) => x.board === board).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))) {
    const type = primaryType(t.tags);
    if (type) holds[t.key] = type;
    tags[t.key] = t.tags;
    if (t.face !== null) faces[t.key] = t.face;
    if (t.note) notes[t.key] = t.note;
    if (t.tags.includes("unsure")) unsure.push(t.key);
  }
  return { board, version: 1, holds, tags, faces, unsure, notes };
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
  // A direction that is not a whole number of degrees is dropped, not the whole tag.
  const face = typeof r.face === "number" && Number.isInteger(r.face) && r.face >= 0 && r.face < 360 ? r.face : null;
  return { board, key, tags, face, note: typeof r.note === "string" ? r.note.slice(0, MAX_NOTE) : "", taggedAt };
}

/** The placement ids of the holds marked dead on a board. */
export const deadPlacementIds = (order: SurveyHold[], rows: HoldTag[], board: string): number[] => {
  const dead = new Set(rows.filter((t) => t.board === board && t.tags.includes("dead")).map((t) => t.key));
  return order.filter((h) => dead.has(h.key)).map((h) => h.id);
};

/** A test for a climb's `frames` string: whether it uses any of these placements. Null when there are none. */
export const deadPattern = (ids: number[]): RegExp | null => (ids.length ? new RegExp(`p(?:${[...new Set(ids)].join("|")})r`) : null);
