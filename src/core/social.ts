import { parsePerson, type Person } from "./feed";

type Json = Record<string, any>;

export interface Profile extends Person {
  instagram: string | null;
  isPublic: boolean;
  email: string | null;
  createdAt: string;
  /** How the signed-in user relates to this person: whether they follow them. */
  followState: string | null;
  followers: number;
  following: number;
  followRequests: number;
  logbookCount: number;
  circuits: { uuid: string; name: string; color: string; count: number }[];
  gym: { address: string | null; city: string | null; province: string | null } | null;
}

/** `GET /users/{id}`. */
export function parseProfile(j: Json | null): Profile | null {
  const u: Json | undefined = j?.users?.[0];
  const base = parsePerson(u);
  if (!u || !base) return null;
  return {
    ...base,
    instagram: u.instagram_username ?? null, isPublic: u.is_public !== false, email: u.email_address ?? null, createdAt: u.created_at ?? "",
    followState: u.followee_state ?? null,
    followers: u.social?.followers_accepted ?? 0, following: u.social?.followees_accepted ?? 0, followRequests: u.social?.followers_pending ?? 0,
    logbookCount: u.logbook?.count ?? 0,
    circuits: ((u.circuits as Json[]) ?? []).map((c) => ({ uuid: String(c.uuid).toUpperCase(), name: c.name, color: c.color ?? "808080", count: c.count ?? 0 })),
    gym: u.gym ? { address: u.gym.address1 ?? null, city: u.gym.city ?? null, province: u.gym.province ?? null } : null,
  };
}

export type FollowButton = { label: string; action: "pending" | "unfollowed" | null };

/** The button a profile shows for the relationship: Follow, Follow back, Requested, Following. */
export function followButton(state: string | null, theyFollowMe: boolean): FollowButton {
  switch (state) {
    case "accepted": return { label: "Following", action: "unfollowed" };
    case "pending": return { label: "Requested", action: "unfollowed" };
    case "blocked": return { label: "Blocked", action: null };
    default: return { label: theyFollowMe ? "Follow back" : "Follow", action: "pending" };
  }
}

export interface ExploreClimb { kind: "climb"; uuid: string; name: string; type: string; layout: string | null; setter: Person | null }
export interface ExploreCircuit { kind: "circuit"; uuid: string; name: string; color: string; count: number; createdAt: string; owner: Person | null }
export interface ExploreUser { kind: "user"; person: Person }
export type ExploreResult = ExploreClimb | ExploreCircuit | ExploreUser;

/** `GET /explore`: mixed results; unknown or broken items are dropped. */
export function parseExplore(j: Json | null): ExploreResult[] {
  const out: ExploreResult[] = [];
  for (const r of (j?.results as Json[]) ?? []) {
    if (r._type === "climb" && r.uuid && r.name) out.push({ kind: "climb", uuid: String(r.uuid).toUpperCase(), name: r.name, type: r.type ?? "boulder", layout: r.layout?.name ?? null, setter: parsePerson(r.user) });
    else if (r._type === "circuit" && r.uuid && r.name) out.push({ kind: "circuit", uuid: String(r.uuid).toUpperCase(), name: r.name, color: r.color ?? "808080", count: r.count ?? 0, createdAt: r.created_at ?? "", owner: parsePerson(r.user) });
    else if (r._type === "user") { const p = parsePerson(r); if (p) out.push({ kind: "user", person: p }); }
  }
  return out;
}

export interface Leaderboard { id: number; name: string }
/** "Tension Board 2 Mirror, 12 high x 12 wide, All Time" -> layout, size, period. */
export interface LeaderboardKey { layout: string; size: string; period: string }
export function parseLeaderboardName(name: string): LeaderboardKey | null {
  const parts = name.split(", ");
  if (parts.length < 3) return null;
  return { period: parts[parts.length - 1], size: parts[parts.length - 2], layout: parts.slice(0, -2).join(", ") };
}

export interface LeaderboardChoice { id: number; key: LeaderboardKey }
export const leaderboardChoices = (list: Leaderboard[]): LeaderboardChoice[] => list.flatMap((l) => { const key = parseLeaderboardName(l.name); return key ? [{ id: l.id, key }] : []; });

/** The leaderboard for a layout, size and period, falling back to the closest available choice. */
export function pickLeaderboard(choices: LeaderboardChoice[], want: Partial<LeaderboardKey>): LeaderboardChoice | undefined {
  const score = (c: LeaderboardChoice) => (c.key.layout === want.layout ? 4 : 0) + (c.key.size === want.size ? 2 : 0) + (c.key.period === want.period ? 1 : 0);
  return [...choices].sort((a, b) => score(b) - score(a))[0];
}

export interface Score { rank: number; person: Person; score: number; ascents: number }

export const parseLeaderboards = (j: Json | null): Leaderboard[] => ((j?.leaderboards as Json[]) ?? []).filter((l) => l.id != null && l.name).map((l) => ({ id: l.id, name: l.name }));

export function parseScores(j: Json | null): Score[] {
  return ((j?.scores as Json[]) ?? []).flatMap((s) => {
    const person = parsePerson({ id: s.user_id, username: s.username, avatar_image: s.avatar_image, is_verified: s.is_verified });
    return person ? [{ rank: s.rank, person, score: s.total_score ?? 0, ascents: s.ascent_count ?? 0 }] : [];
  });
}

export type Knob =
  | { type: "integer"; name: string; title: string; description: string; default: number; min: number | null; max: number | null }
  | { type: "boolean"; name: string; title: string; description: string; default: boolean }
  | { type: "select"; name: string; title: string; description: string; default: number; options: { value: number; title: string }[] };
export interface WorkoutTemplate { name: string; title: string; description: string; knobs: Knob[] }

export function parseWorkoutTemplates(j: Json | null): WorkoutTemplate[] {
  return ((j?.templates as Json[]) ?? []).filter((t) => t.name).map((t) => ({
    name: t.name, title: t.title ?? t.name, description: t.description ?? "",
    knobs: ((t.knobs as Json[]) ?? []).flatMap((k): Knob[] => {
      const base = { name: k.name, title: k.title ?? k.name, description: k.description ?? "" };
      // The notes say "int"; the live server says "integer". Accept both.
      if (k.type === "integer" || k.type === "int") return [{ ...base, type: "integer", default: Number(k.default ?? 0), min: k.min ?? null, max: k.max ?? null }];
      if (k.type === "boolean") return [{ ...base, type: "boolean", default: !!Number(k.default ?? 0) }];
      if (k.type === "select") return [{ ...base, type: "select", default: Number(k.default ?? 0), options: ((k.options as Json[]) ?? []).map((o) => ({ value: o.value, title: o.title })) }];
      return [];
    }),
  }));
}

export interface WorkoutClimb { uuid: string; difficulty: number; section: string }
export const parseWorkout = (j: Json | null): WorkoutClimb[] | null =>
  Array.isArray(j?.climbs) ? (j!.climbs as Json[]).filter((c) => c.uuid).map((c) => ({ uuid: String(c.uuid).toUpperCase(), difficulty: c.difficulty ?? 0, section: c.section ?? "" })) : null;

/** Default value of every knob, for the first generation. */
export const defaultKnobs = (t: WorkoutTemplate): Record<string, number | boolean> => Object.fromEntries(t.knobs.map((k) => [k.name, k.default]));

export type CircuitSort = "featured" | "newest" | "most" | "name";
export interface CircuitFilter {
  /** Colour hex values to show; empty = any. */
  colors: string[];
  /** Fewest climbs a circuit may have. */
  minClimbs: number;
  sort: CircuitSort;
}
export const DEFAULT_CIRCUIT_FILTER: CircuitFilter = { colors: [], minClimbs: 0, sort: "featured" };

/** Filters and sorts browsable circuits. "featured" keeps the server's order. */
export function filterCircuits(list: ExploreCircuit[], f: CircuitFilter, query: string): ExploreCircuit[] {
  const q = query.trim().toLowerCase();
  const wanted = new Set(f.colors.map((c) => c.toUpperCase()));
  const out = list.filter((c) =>
    (!q || c.name.toLowerCase().includes(q) || (c.owner?.username ?? "").toLowerCase().includes(q)) &&
    (wanted.size === 0 || wanted.has(c.color.toUpperCase())) && c.count >= f.minClimbs);
  if (f.sort === "newest") out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (f.sort === "most") out.sort((a, b) => b.count - a.count);
  else if (f.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** How many of the circuit filter's settings differ from the default (sort is not counted). */
export const circuitFilterCount = (f: CircuitFilter) => (f.colors.length ? 1 : 0) + (f.minClimbs > 0 ? 1 : 0);
