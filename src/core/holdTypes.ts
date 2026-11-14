/**
 * Hold types: what kind of hold each hold on a board is, and what that says about a climb. No board's own data records this, so the maps
 * are authored (see scripts/make-hold-tagger.py), one file per board: {"board": ..., "version": 1, "holds": {"<key>": "<type>"}}. The
 * key is the cell name ("H9") on a MoonBoard and the placement id on an Aurora board. Pure: reading a file, the profile of a climb, and
 * the filter; nothing here knows about screens or storage.
 */

export const HOLD_TYPES = ["jug", "incut", "crimp", "sloper", "pinch", "pocket", "volume", "foot"] as const;
export type HoldType = (typeof HOLD_TYPES)[number];

/** The name shown for each type, and a short plain definition for anyone tagging. */
export const HOLD_TYPE_INFO: Record<HoldType, { label: string; hint: string }> = {
  jug: { label: "Jug", hint: "Big and positive: the whole hand wraps it. You can rest on it." },
  incut: { label: "Incut edge", hint: "A ledge with a lip: fingers hook behind it, deeper than a fingertip pad." },
  crimp: { label: "Crimp", hint: "A thin edge, about one finger pad deep or less." },
  sloper: { label: "Sloper", hint: "Rounded, no lip: held by friction and body position." },
  pinch: { label: "Pinch", hint: "You squeeze it, thumb against fingers." },
  pocket: { label: "Pocket", hint: "A hole for one to three fingers." },
  volume: { label: "Volume or other", hint: "A large surface feature, or anything that does not fit above." },
  foot: { label: "Foot only", hint: "A chip or dot meant only for feet." },
};

export const isHoldType = (x: unknown): x is HoldType => typeof x === "string" && (HOLD_TYPES as readonly string[]).includes(x);

export type HoldMap = ReadonlyMap<string, HoldType>;

export type ParsedHoldMap = { ok: true; board: string; holds: Map<string, HoldType>; skipped: number } | { ok: false; error: string };

/**
 * Reads a hold-types file. The file is untrusted: an unknown type or an empty key is skipped and counted, never half-applied, and a
 * file that is not the right shape or a newer version is refused with a plain reason.
 */
export function parseHoldMap(raw: unknown): ParsedHoldMap {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "That is not a hold-types file." };
  const r = raw as { board?: unknown; version?: unknown; holds?: unknown };
  if (typeof r.board !== "string" || r.board === "") return { ok: false, error: "The file does not say which board it is for." };
  if (typeof r.version !== "number" || !Number.isInteger(r.version) || r.version < 1) return { ok: false, error: "The file has no version." };
  if (r.version > 1) return { ok: false, error: "That file is from a newer version of Slackboard." };
  if (typeof r.holds !== "object" || r.holds === null || Array.isArray(r.holds)) return { ok: false, error: "The file has no holds." };
  const holds = new Map<string, HoldType>();
  let skipped = 0;
  for (const [key, type] of Object.entries(r.holds)) {
    if (key.trim() === "" || !isHoldType(type)) skipped++;
    else holds.set(key, type);
  }
  return { ok: true, board: r.board, holds, skipped };
}

/** The keys in `all` that a map does not cover: what is left to tag, and what a bundled map's test checks is empty. */
export const untagged = (all: string[], map: HoldMap): string[] => all.filter((k) => !map.has(k));

/** The holds of a climb, and whether each is a foot hold in that climb. */
export interface ClimbHold { key: string; foot: boolean }

export interface HoldProfile {
  /** Hand holds of each type. Holds used as feet in the climb are left out: a profile describes what the hands do. */
  counts: Record<HoldType, number>;
  /** Hand holds in the climb, mapped or not. */
  handHolds: number;
  /** Hand holds that have a type. */
  mapped: number;
}

const zero = (): Record<HoldType, number> => ({ jug: 0, incut: 0, crimp: 0, sloper: 0, pinch: 0, pocket: 0, volume: 0, foot: 0 });

export function holdProfile(holds: ClimbHold[], map: HoldMap): HoldProfile {
  const counts = zero();
  let handHolds = 0;
  let mapped = 0;
  for (const h of holds) {
    if (h.foot) continue;
    handHolds++;
    const t = map.get(h.key);
    if (t) { counts[t]++; mapped++; }
  }
  return { counts, handHolds, mapped };
}

/** How much of the climb's hand holds have a type, 0 to 1, or null for a climb with no hand holds. */
export const mappedShare = (p: HoldProfile): number | null => (p.handHolds ? p.mapped / p.handHolds : null);

/** The share (0 to 1) of the climb's mapped hand holds that are `type`, or null when none is mapped. */
export const shareOf = (p: HoldProfile, type: HoldType): number | null => (p.mapped ? p.counts[type] / p.mapped : null);

/** The bar for a climb: each type that is present, biggest first, as a share of the mapped holds. Empty when none is mapped. */
export function profileBar(p: HoldProfile): { type: HoldType; share: number }[] {
  if (!p.mapped) return [];
  return HOLD_TYPES.filter((t) => p.counts[t] > 0).map((type) => ({ type, share: p.counts[type] / p.mapped })).sort((a, b) => b.share - a.share || HOLD_TYPES.indexOf(a.type) - HOLD_TYPES.indexOf(b.type));
}

export type HoldFilterRule = "mostly" | "has" | "none" | "atLeast";
export interface HoldFilter { type: HoldType; rule: HoldFilterRule; /** For "atLeast". */ count?: number }

/** A climb needs at least this share of its hand holds mapped before a filter judges it: a half-mapped climb says too little. */
export const MIN_MAPPED_SHARE = 0.8;
/** "Mostly" means at least this share of the mapped hand holds. */
export const MOSTLY_SHARE = 0.5;

/** Whether a climb passes a hold filter. A climb that is not mapped well enough passes nothing, so a filter never guesses. */
export function matchesHoldFilter(p: HoldProfile, f: HoldFilter): boolean {
  const covered = mappedShare(p);
  if (covered === null || covered < MIN_MAPPED_SHARE) return false;
  const n = p.counts[f.type];
  switch (f.rule) {
    case "mostly": return n / p.mapped >= MOSTLY_SHARE;
    case "has": return n > 0;
    case "none": return n === 0;
    case "atLeast": return n >= Math.max(1, f.count ?? 1);
  }
}
