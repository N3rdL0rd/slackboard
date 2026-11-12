import type { Db } from "./db";
import { distanceKm } from "./gyms";
import type { LogEntry } from "./types";

/** Boards belong together automatically only when some pair of members links them within 200 metres. */
export const SPACE_RADIUS_KM = 0.2;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BoardPlace {
  id: string;
  gymName: string | null;
  location: LatLon | null;
  /** First seen on this device; the oldest board anchors its Space's stable id. */
  addedAt: string;
  /** A user-chosen Space id. Null leaves grouping to location. */
  manualSpaceId: string | null;
}

export interface SpaceBoard extends BoardPlace {
  name: string;
}

export interface Space {
  id: string;
  name: string;
  /** True when `name` came from the user rather than the gym/Home default. */
  renamed: boolean;
  boards: SpaceBoard[];
  /** Automatic member that owns the stable id; manual guests cannot become anchors by sort order. */
  anchorId: string;
}

export interface LogSpace {
  entryId: string;
  spaceId: string;
  boardId: string;
  /** A fallback for history whose board and Space have since been removed. */
  spaceName: string;
}

export const spaceIdForBoard = (boardId: string): string => `space:${boardId}`;

const byAge = (a: SpaceBoard, b: SpaceBoard): number => a.addedAt.localeCompare(b.addedAt) || a.id.localeCompare(b.id);
const defaultName = (b: SpaceBoard): string => b.gymName?.trim() || "Home";

export interface SpaceReconciliation {
  spaces: Space[];
  /** Old -> current ids, following the remaining oldest automatic member. */
  lineage: Record<string, string>;
  /** Names keyed by the current ids after any lineage transfer. */
  names: Record<string, string>;
}

/**
 * Automatic groups are connected components of the graph whose edges are board pairs at most 200 m apart
 * (single-linkage). Thus a chain can be wider than 200 m, but boards with no located path to one another never
 * share a Space. Names play no part in joining boards. Manual moves are applied afterwards and do not form links.
 */
export function reconcileSpaces(input: SpaceBoard[], names: Record<string, string> = {}, previous: Space[] = [], lineage: Record<string, string> = {}): SpaceReconciliation {
  const boards = input.map((b) => ({ ...b, location: b.location ? { ...b.location } : null }));
  const automatic = boards.filter((b) => !b.manualSpaceId);
  const parent = new Map(automatic.map((b) => [b.id, b.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(id) !== id) {
      const next = parent.get(id)!;
      parent.set(id, root);
      id = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (let i = 0; i < automatic.length; i++) {
    const a = automatic[i];
    if (!a.location) continue;
    for (let j = i + 1; j < automatic.length; j++) {
      const b = automatic[j];
      if (b.location && distanceKm(a.location, b.location) <= SPACE_RADIUS_KM) union(a.id, b.id);
    }
  }

  const components = new Map<string, SpaceBoard[]>();
  for (const b of automatic) {
    const root = find(b.id);
    const members = components.get(root) ?? [];
    members.push(b);
    components.set(root, members);
  }
  const spaces: Space[] = [...components.values()].map((members) => {
    members.sort(byAge);
    return { id: spaceIdForBoard(members[0].id), name: defaultName(members[0]), renamed: false, boards: members, anchorId: members[0].id };
  });
  const membership = new Map<string, Space>();
  for (const s of spaces) for (const b of s.boards) membership.set(b.id, s);
  const resolveAlias = (id: string): string => {
    const seen = new Set<string>();
    let current = id;
    while (lineage[current] && !seen.has(current)) {
      seen.add(current);
      current = lineage[current];
    }
    return current;
  };
  // A manually departed board cannot take its old Space's identity with it. Deleted boards fall out naturally.
  const inheritance = new Map<string, { from: Space; anchor: SpaceBoard }[]>();
  const aliases = new Map<string, string>();
  for (const from of previous) {
    const oldAnchorId = from.anchorId ?? from.boards.find((b) => !b.manualSpaceId)?.id;
    const oldAnchor = from.boards.find((b) => b.id === oldAnchorId);
    const anchorStillAutomatic = !!oldAnchor && !!boards.find((b) => b.id === oldAnchor.id && !b.manualSpaceId);
    const candidates = from.boards.filter((old) => {
      const now = boards.find((b) => b.id === old.id);
      return now && !now.manualSpaceId && !old.manualSpaceId && membership.has(now.id) && (!anchorStillAutomatic || old.id === oldAnchorId);
    }).sort(byAge);
    const anchor = candidates[0];
    if (!anchor) continue;
    const to = membership.get(anchor.id)!;
    aliases.set(from.id, to.id);
    const inherited = inheritance.get(to.id) ?? [];
    inherited.push({ from, anchor });
    inheritance.set(to.id, inherited);
  }

  for (const s of spaces) {
    const direct = names[s.id]?.trim();
    const inherited = (inheritance.get(s.id) ?? [])
      .sort((a, b) => byAge(a.anchor, b.anchor))
      .map((x) => names[x.from.id]?.trim() ?? names[resolveAlias(x.from.id)]?.trim())
      .find((name) => !!name);
    const persisted = names[resolveAlias(s.id)]?.trim();
    const custom = direct || inherited || persisted;
    if (custom) {
      s.name = custom;
      s.renamed = true;
    }
  }

  for (const original of boards.filter((b) => !!b.manualSpaceId)) {
    const wanted = original.manualSpaceId!;
    const targetId = spaces.some((s) => s.id === wanted) ? wanted : aliases.get(wanted) ?? resolveAlias(wanted);
    const target = spaces.find((s) => s.id === targetId);
    if (target) {
      target.boards.push({ ...original, manualSpaceId: target.id });
      target.boards.sort(byAge);
    } else {
      // A destination that no longer exists cannot hold an override; the board becomes its own Space.
      spaces.push({ id: spaceIdForBoard(original.id), name: names[spaceIdForBoard(original.id)]?.trim() || defaultName(original), renamed: !!names[spaceIdForBoard(original.id)]?.trim(), boards: [{ ...original, manualSpaceId: null }], anchorId: original.id });
    }
  }
  const nextNames = { ...names };
  const nextLineage = { ...lineage };
  for (const s of spaces) {
    if (s.renamed) nextNames[s.id] = s.name;
    for (const inherited of inheritance.get(s.id) ?? []) {
      if (inherited.from.id === s.id) continue;
      nextLineage[inherited.from.id] = s.id;
      const oldName = names[inherited.from.id] ?? names[resolveAlias(inherited.from.id)];
      if (oldName) nextNames[s.id] = oldName;
    }
  }
  return { spaces: spaces.sort((a, b) => byAge(a.boards[0], b.boards[0]) || a.id.localeCompare(b.id)), lineage: nextLineage, names: nextNames };
}

export function groupSpaces(input: SpaceBoard[], names: Record<string, string> = {}, previous: Space[] = []): Space[] {
  return reconcileSpaces(input, names, previous).spaces;
}

export interface SpaceDetection {
  space: Space;
  boardId: string;
  distanceKm: number;
}

/** The closest located board within the radius, optionally ignoring the Space already open. */
export function nearestSpace(spaces: Space[], here: LatLon, radiusKm = SPACE_RADIUS_KM, exceptSpaceId?: string): SpaceDetection | null {
  let best: SpaceDetection | null = null;
  for (const space of spaces) {
    if (space.id === exceptSpaceId) continue;
    for (const board of space.boards) {
      if (!board.location) continue;
      const km = distanceKm(here, board.location);
      if (km > radiusKm) continue;
      if (!best || km < best.distanceKm || (km === best.distanceKm && (space.name.localeCompare(best.space.name) || board.id.localeCompare(best.boardId)) < 0)) {
        best = { space, boardId: board.id, distanceKm: km };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// Log sessions

export interface LogSession {
  key: string;
  /** Null only for the un-attributed Earlier group. */
  dayKey: string | null;
  spaceId: string | null;
  title: string;
  spaceName: string;
  entries: LogEntry[];
  sendCount: number;
  boardCount: number;
  hardest: number | null;
  earlier: boolean;
}

const localDate = (value: string): Date => new Date(value.replace(" ", "T"));
const localDayKey = (value: string): string => {
  const d = localDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** One session per local calendar day and Space. Entries logged before Spaces existed form one Earlier group. */
export function groupLogSessions(
  entries: LogEntry[],
  spaces: Space[],
  attributions: Record<string, LogSpace>,
  gradeOf: (entry: LogEntry) => number,
): LogSession[] {
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const sessions = new Map<string, LogSession>();
  const earlier: LogSession = { key: "earlier", dayKey: null, spaceId: null, title: "Earlier", spaceName: "Earlier", entries: [], sendCount: 0, boardCount: 0, hardest: null, earlier: true };
  for (const entry of entries) {
    const attribution = attributions[entry.id];
    if (!attribution) {
      earlier.entries.push(entry);
      continue;
    }
    const spaceId = attribution.spaceId;
    const day = localDayKey(entry.climbedAt);
    const key = `${day}:${spaceId}`;
    let session = sessions.get(key);
    if (!session) {
      session = {
        key, dayKey: day, spaceId,
        title: localDate(entry.climbedAt).toLocaleDateString("en-US", { weekday: "long" }),
        spaceName: spaceById.get(spaceId)?.name ?? attribution.spaceName,
        entries: [], sendCount: 0, boardCount: 0, hardest: null, earlier: false,
      };
      sessions.set(key, session);
    }
    session.entries.push(entry);
  }

  const out = [...sessions.values()];
  if (earlier.entries.length) out.push(earlier);
  for (const session of out) {
    session.entries.sort((a, b) => b.climbedAt.localeCompare(a.climbedAt));
    session.sendCount = session.entries.filter((e) => e.isSend).length;
    session.boardCount = new Set(session.entries.map((e) => attributions[e.id]?.boardId).filter((id): id is string => !!id)).size;
    const grades = session.entries.filter((e) => e.isSend).map(gradeOf).filter(Number.isFinite);
    session.hardest = grades.length ? Math.max(...grades) : null;
  }
  return out.sort((a, b) => a.earlier ? 1 : b.earlier ? -1 : (b.dayKey ?? "").localeCompare(a.dayKey ?? "") || a.spaceName.localeCompare(b.spaceName));
}

/** "14 sends on 2 boards, hardest V5"; attempts stay visible without being counted as sends. */
export function sessionSummary(session: LogSession, gradeLabel: (grade: number) => string): string {
  if (session.earlier) return `${session.entries.length} ${session.entries.length === 1 ? "entry" : "entries"} from before Spaces`;
  const sends = `${session.sendCount} ${session.sendCount === 1 ? "send" : "sends"}`;
  const boards = `${session.boardCount} ${session.boardCount === 1 ? "board" : "boards"}`;
  const attempts = session.entries.length - session.sendCount;
  return `${sends} on ${boards}${session.hardest == null ? "" : `, hardest ${gradeLabel(session.hardest)}`}${attempts ? ` · ${attempts} ${attempts === 1 ? "attempt entry" : "attempt entries"}` : ""}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Local, cross-provider storage

export async function loadBoardPlaces(db: Db): Promise<Record<string, BoardPlace>> {
  const rows = await db.all<{ board_id: string; gym_name: string | null; lat: number | null; lon: number | null; added_at: string; manual_space_id: string | null }>(
    "SELECT board_id, gym_name, lat, lon, added_at, manual_space_id FROM l_board_places");
  return Object.fromEntries(rows.map((r) => [r.board_id, {
    id: r.board_id, gymName: r.gym_name,
    location: r.lat == null || r.lon == null ? null : { lat: r.lat, lon: r.lon },
    addedAt: r.added_at, manualSpaceId: r.manual_space_id,
  }]));
}

export async function saveBoardPlace(db: Db, place: BoardPlace): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_board_places (board_id, gym_name, lat, lon, added_at, manual_space_id) VALUES (?, ?, ?, ?, ?, ?)", [
    place.id, place.gymName, place.location?.lat ?? null, place.location?.lon ?? null, place.addedAt, place.manualSpaceId,
  ]);
}

export async function loadSpaceNames(db: Db): Promise<Record<string, string>> {
  const rows = await db.all<{ space_id: string; name: string }>("SELECT space_id, name FROM l_space_names");
  return Object.fromEntries(rows.map((r) => [r.space_id, r.name]));
}

export async function saveSpaceName(db: Db, spaceId: string, name: string): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_space_names (space_id, name) VALUES (?, ?)", [spaceId, name]);
}

export async function loadSpaceLineage(db: Db): Promise<Record<string, string>> {
  const rows = await db.all<{ old_space_id: string; new_space_id: string }>("SELECT old_space_id, new_space_id FROM l_space_lineage");
  return Object.fromEntries(rows.map((r) => [r.old_space_id, r.new_space_id]));
}

export async function saveSpaceLineage(db: Db, oldSpaceId: string, newSpaceId: string): Promise<void> {
  await db.run("INSERT OR REPLACE INTO l_space_lineage (old_space_id, new_space_id) VALUES (?, ?)", [oldSpaceId, newSpaceId]);
}

export async function deleteSpaceLineage(db: Db, oldSpaceId: string): Promise<void> {
  await db.run("DELETE FROM l_space_lineage WHERE old_space_id = ?", [oldSpaceId]);
}

export async function loadLogSpaces(db: Db): Promise<Record<string, LogSpace>> {
  const rows = await db.all<{ entry_id: string; space_id: string; board_id: string; space_name: string }>(
    "SELECT entry_id, space_id, board_id, space_name FROM l_log_spaces");
  return Object.fromEntries(rows.map((r) => [r.entry_id, { entryId: r.entry_id, spaceId: r.space_id, boardId: r.board_id, spaceName: r.space_name }]));
}

/** Records an entry's Space, optionally replacing its temporary pending-outbox id with its server id. */
export async function saveLogSpace(db: Db, attribution: LogSpace, previousEntryId?: string): Promise<void> {
  if (previousEntryId && previousEntryId !== attribution.entryId) await db.run("DELETE FROM l_log_spaces WHERE entry_id = ?", [previousEntryId]);
  await db.run("INSERT OR REPLACE INTO l_log_spaces (entry_id, space_id, board_id, space_name) VALUES (?, ?, ?, ?)", [
    attribution.entryId, attribution.spaceId, attribution.boardId, attribution.spaceName,
  ]);
}
