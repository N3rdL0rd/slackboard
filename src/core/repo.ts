import { compareText } from "./collate";
import type { Db } from "./db";
import type { RemoteCircuit } from "./logicalCircuits";
import type { ProviderId } from "./provider";
import { listOutbox } from "./outbox";
import type { AngleStat, Board, BoardSpec, Climb, LogEntry, Placement, Role, StatsAt } from "./types";

type WallRow = {
  uuid: string; name: string; product_id: number; is_adjustable: number; angle: number; layout_id: number;
  product_size_id: number; hsm: number; serial_number: string | null;
};

export async function boardSpecFor(db: Db, w: { layout_id: number; product_size_id: number; product_id: number; hsm: number; uuid?: string; setIds?: number[] }, provider: ProviderId): Promise<BoardSpec | undefined> {
  const layout = (await db.all<{ name: string; is_mirrored: number }>("SELECT name, is_mirrored FROM layouts WHERE id = ?", [w.layout_id]))[0];
  const size = (await db.all<{ name: string; edge_left: number; edge_right: number; edge_bottom: number; edge_top: number }>("SELECT name, edge_left, edge_right, edge_bottom, edge_top FROM product_sizes WHERE id = ?", [w.product_size_id]))[0];
  if (!layout || !size) return undefined;
  const sets = w.setIds
    ? await db.all<{ id: number; name: string }>(`SELECT id, name FROM sets WHERE id IN (${w.setIds.map(() => "?").join(",") || "NULL"}) ORDER BY id`, w.setIds)
    : await db.all<{ id: number; name: string }>("SELECT s.id, s.name FROM walls_sets ws JOIN sets s ON s.id = ws.set_id WHERE ws.wall_uuid = ? ORDER BY s.id", [w.uuid ?? ""]);
  const angles = (await db.all<{ angle: number }>("SELECT angle FROM products_angles WHERE product_id = ? ORDER BY angle", [w.product_id])).map((a) => a.angle);
  const setIds = sets.map((s) => s.id);
  const images = (await db.all<{ f: string }>(
    `SELECT image_filename AS f FROM product_sizes_layouts_sets
      WHERE layout_id = ? AND product_size_id = ? AND set_id IN (${setIds.map(() => "?").join(",") || "NULL"}) AND image_filename != '' ORDER BY set_id`,
    [w.layout_id, w.product_size_id, ...setIds],
  )).map((r) => r.f);
  return {
    provider, layoutId: w.layout_id, layoutName: layout.name, productId: w.product_id, productSizeId: w.product_size_id, sizeName: size.name, hsm: w.hsm,
    setIds, setNames: sets.map((s) => s.name), images,
    edges: { left: size.edge_left, right: size.edge_right, bottom: size.edge_bottom, top: size.edge_top },
    isMirrored: !!layout.is_mirrored, angles,
  };
}

/** The signed-in user's boards, from the synced `walls` table. */
export async function listBoards(db: Db, userId: number, provider: ProviderId): Promise<Board[]> {
  const walls = await db.all<WallRow>("SELECT uuid, name, product_id, is_adjustable, angle, layout_id, product_size_id, hsm, serial_number FROM walls WHERE user_id = ? ORDER BY created_at, name", [userId]);
  const boards: Board[] = [];
  for (const w of walls) {
    const spec = await boardSpecFor(db, w, provider);
    if (spec) boards.push({ id: w.uuid, name: w.name, spec, angle: w.angle, isAdjustable: !!w.is_adjustable, serial: w.serial_number });
  }
  return boards;
}

const CLIMB_COLS = `uuid, layout_id AS layoutId, name, setter_username AS setter, frames, frames_count AS frameCount, frames_pace AS pace, is_nomatch AS noMatch, created_at AS createdAt,
  edge_left AS "left", edge_right AS "right", edge_bottom AS bottom, edge_top AS top`;
type ClimbRow = Omit<Climb, "noMatch"> & { noMatch: number };
const toClimb = (r: ClimbRow): Climb => ({ ...r, noMatch: !!r.noMatch, pace: r.pace > 0 ? r.pace : 1000 });

export interface BoardData {
  placements: Placement[];
  roles: Role[];
  climbs: Climb[];
  /** Climbs that have at least one beta video. */
  betaSet: Set<string>;
  /** Ids of `climbs`, to tell quickly whether a climb is on this board. */
  climbIds: Set<string>;
}

/**
 * Everything needed to draw and browse a board: its holes (with LED positions and mirror partners), the
 * hold roles, and the climbs it can show. A climb is shown when the board has every hold set the climb
 * needs and the climb fits inside the board's edges.
 */
export async function loadBoardData(db: Db, spec: BoardSpec): Promise<BoardData> {
  const placements = await db.all<Placement>(
    `SELECT p.id AS id, h.x AS x, h.y AS y, l.position AS led, mp.id AS mirror
       FROM placements p
       JOIN holes h ON h.id = p.hole_id
       JOIN leds l ON l.hole_id = h.id AND l.product_size_id = ?
       LEFT JOIN placements mp ON mp.hole_id = h.mirrored_hole_id AND mp.layout_id = p.layout_id
      WHERE p.layout_id = ? AND p.set_id IN (${spec.setIds.map(() => "?").join(",") || "NULL"})`,
    [spec.productSizeId, spec.layoutId, ...spec.setIds],
  );
  const roles = await db.all<Role>("SELECT id, position, name, full_name, led_color FROM placement_roles WHERE product_id = ? ORDER BY position", [spec.productId]);
  const climbs = (await db.all<ClimbRow>(
    `SELECT ${CLIMB_COLS}
       FROM climbs
      WHERE layout_id = ? AND is_listed = 1 AND is_draft = 0
        AND (hsm & ?) = hsm AND edge_left > ? AND edge_right < ? AND edge_bottom > ? AND edge_top < ?`,
    [spec.layoutId, spec.hsm, spec.edges.left, spec.edges.right, spec.edges.bottom, spec.edges.top],
  )).map(toClimb);
  const betaSet = new Set((await db.all<{ u: string }>("SELECT DISTINCT climb_uuid AS u FROM beta_links WHERE is_listed = 1")).map((r) => r.u));
  return { placements, roles, climbs, betaSet, climbIds: new Set(climbs.map((c) => c.uuid)) };
}

/** Stats at one angle for the board's layout. Changing angle only needs this small query again. */
export async function loadStatsAt(db: Db, layoutId: number, angle: number): Promise<StatsAt> {
  const rows = await db.all<{ u: string; d: number; b: number | null; c: number; q: number }>(
    `SELECT s.climb_uuid AS u, s.display_difficulty AS d, s.benchmark_difficulty AS b, s.ascensionist_count AS c, s.quality_average AS q
       FROM climb_stats s JOIN climbs c ON c.uuid = s.climb_uuid AND c.layout_id = ?
      WHERE s.angle = ?`,
    [layoutId, angle],
  );
  const m: StatsAt = new Map();
  for (const r of rows) m.set(r.u, [r.d, r.b, r.c, r.q]);
  return m;
}

export async function climbStatsAllAngles(db: Db, climbUuid: string): Promise<Record<number, AngleStat>> {
  const rows = await db.all<{ a: number; d: number; b: number | null; c: number; q: number }>(
    "SELECT angle AS a, display_difficulty AS d, benchmark_difficulty AS b, ascensionist_count AS c, quality_average AS q FROM climb_stats WHERE climb_uuid = ?",
    [climbUuid.toUpperCase()],
  );
  return Object.fromEntries(rows.map((r) => [r.a, [r.d, r.b, r.c, r.q] as AngleStat]));
}

export async function climbByUuid(db: Db, uuid: string): Promise<Climb | undefined> {
  const r = (await db.all<ClimbRow>(`SELECT ${CLIMB_COLS} FROM climbs WHERE uuid = ?`, [uuid.toUpperCase()]))[0];
  return r && toClimb(r);
}

/**
 * The user's sends and attempt records, newest first. Entries saved on this device but not yet accepted by
 * the server are included (marked pending), and entries with a delete waiting to go out are left out.
 */
export async function loadLogbook(db: Db, userId: number, provider: ProviderId): Promise<LogEntry[]> {
  const sends = await db.all<Omit<LogEntry, "isSend" | "isMirror" | "provider"> & { isMirror: number }>(
    `SELECT a.uuid AS id, a.climb_uuid AS climbUuid, COALESCE(c.name, 'Unknown climb') AS climbName, a.angle, a.is_mirror AS isMirror,
            a.bid_count AS bidCount, a.quality, a.difficulty, a.comment, a.climbed_at AS climbedAt
       FROM ascents a LEFT JOIN climbs c ON c.uuid = a.climb_uuid WHERE a.user_id = ?`, [userId]);
  const tries = await db.all<Omit<LogEntry, "isSend" | "isMirror" | "quality" | "difficulty" | "provider"> & { isMirror: number }>(
    `SELECT b.uuid AS id, b.climb_uuid AS climbUuid, COALESCE(c.name, 'Unknown climb') AS climbName, b.angle, b.is_mirror AS isMirror,
            b.bid_count AS bidCount, b.comment, b.climbed_at AS climbedAt
       FROM bids b LEFT JOIN climbs c ON c.uuid = b.climb_uuid WHERE b.user_id = ?`, [userId]);
  const queued = await listOutbox(db);
  const deleting = new Set(queued.filter((q) => q.req.path === "/ascents/delete" || q.req.path === "/bids/delete").map((q) => String(q.req.fields.uuid)));
  const pending: LogEntry[] = [];
  for (const q of queued) {
    const isSend = q.req.path === "/ascents/save";
    if (!isSend && q.req.path !== "/bids/save") continue;
    const f = q.req.fields;
    const uuid = String(f.climb_uuid).toUpperCase();
    const name = (await db.all<{ name: string }>("SELECT name FROM climbs WHERE uuid = ?", [uuid]))[0]?.name ?? "Unknown climb";
    pending.push({
      id: `pending:${q.id}`, provider, climbUuid: uuid, climbName: name, angle: Number(f.angle), isMirror: f.is_mirror === true || f.is_mirror === 1,
      bidCount: Number(f.bid_count), quality: isSend ? Number(f.quality) : 0, difficulty: isSend ? Number(f.difficulty) : 0,
      comment: String(f.comment ?? ""), climbedAt: String(f.climbed_at).slice(0, 19), isSend, pending: true,
    });
  }
  // A queued edit carries the id of the entry it changes; show the edited version, not both.
  const edited = new Set(queued.filter((q) => q.req.fields.uuid && (q.req.path === "/ascents/save" || q.req.path === "/bids/save")).map((q) => String(q.req.fields.uuid)));
  return [
    ...sends.map((s) => ({ ...s, provider, isMirror: !!s.isMirror, isSend: true })),
    ...tries.map((t) => ({ ...t, provider, isMirror: !!t.isMirror, quality: 0, difficulty: 0, isSend: false })),
  ].filter((e) => !deleting.has(e.id) && !edited.has(e.id)).concat(pending).sort((a, b) => compareText(b.climbedAt, a.climbedAt));
}

/** The user's "~flag" (liked) and "~block" tags. */
export async function loadTags(db: Db, userId: number): Promise<{ liked: Set<string>; blocked: Set<string> }> {
  const rows = await db.all<{ entity_uuid: string; name: string }>("SELECT entity_uuid, name FROM tags WHERE user_id = ? AND is_listed = 1 AND name IN ('~flag', '~block')", [userId]);
  return {
    liked: new Set(rows.filter((r) => r.name === "~flag").map((r) => r.entity_uuid)),
    blocked: new Set(rows.filter((r) => r.name === "~block").map((r) => r.entity_uuid)),
  };
}

export async function loadPermissions(db: Db, userId: number): Promise<Set<string>> {
  return new Set((await db.all<{ name: string }>("SELECT name FROM user_permissions WHERE user_id = ?", [userId])).map((r) => r.name));
}

// Add-a-board wizard data (valid layout / size / hold-set combinations come from product_sizes_layouts_sets).
export interface LayoutOption { id: number; productId: number; name: string; locked: boolean }
export interface SizeOption { id: number; name: string; description: string; position: number }
export interface SetOption { id: number; name: string; hsm: number }

export async function listLayouts(db: Db): Promise<LayoutOption[]> {
  return (await db.all<{ id: number; productId: number; name: string; password: string | null }>(
    "SELECT id, product_id AS productId, name, password FROM layouts WHERE is_listed = 1 ORDER BY product_id DESC, id", [])).map((l) => ({ id: l.id, productId: l.productId, name: l.name, locked: l.password != null }));
}
export async function listSizes(db: Db, layoutId: number): Promise<SizeOption[]> {
  return db.all<SizeOption>(
    `SELECT DISTINCT s.id, s.name, s.description, s.position FROM product_sizes s
       JOIN product_sizes_layouts_sets p ON p.product_size_id = s.id
      WHERE p.layout_id = ? AND p.is_listed = 1 AND s.is_listed = 1 ORDER BY s.position DESC`, [layoutId]);
}
export async function listSets(db: Db, layoutId: number, sizeId: number): Promise<SetOption[]> {
  return db.all<SetOption>(
    `SELECT DISTINCT st.id, st.name, st.hsm FROM sets st JOIN product_sizes_layouts_sets p ON p.set_id = st.id
      WHERE p.layout_id = ? AND p.product_size_id = ? AND p.is_listed = 1 ORDER BY st.id`, [layoutId, sizeId]);
}
export async function listAngles(db: Db, productId: number): Promise<number[]> {
  return (await db.all<{ angle: number }>("SELECT angle FROM products_angles WHERE product_id = ? ORDER BY angle", [productId])).map((a) => a.angle);
}

/** The server only accepts controller serial numbers it knows (its `kits` table); anything else is refused with a 422. */
export async function isKnownSerial(db: Db, serial: string): Promise<boolean> {
  return (await db.all("SELECT 1 FROM kits WHERE serial_number = ? AND is_listed = 1", [serial])).length > 0;
}


/** The user's own circuits with their climbs in order. */
export async function loadRemoteCircuits(db: Db, userId: number): Promise<RemoteCircuit[]> {
  const rows = await db.all<{ uuid: string; name: string; description: string; color: string; isPublic: number; createdAt: string; updatedAt: string }>(
    "SELECT uuid, name, description, color, is_public AS isPublic, created_at AS createdAt, updated_at AS updatedAt FROM circuits WHERE user_id = ? ORDER BY created_at", [userId]);
  const members = await db.all<{ c: string; u: string }>(
    "SELECT circuit_uuid AS c, climb_uuid AS u FROM circuits_climbs WHERE circuit_uuid IN (SELECT uuid FROM circuits WHERE user_id = ?) ORDER BY circuit_uuid, position", [userId]);
  const by = new Map<string, string[]>();
  for (const m of members) (by.get(m.c) ?? by.set(m.c, []).get(m.c)!).push(m.u);
  return rows.map((r) => ({ ...r, isPublic: !!r.isPublic, climbs: by.get(r.uuid) ?? [] }));
}

/** Distinct setters on a board's climbs, most climbs first (for the setter picker). */
export function settersOf(climbs: Climb[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of climbs) m.set(c.setter, (m.get(c.setter) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || compareText(a.name, b.name));
}

export interface BetaRow { link: string; username: string | null; angle: number | null; thumbnail: string | null }

/** Beta videos (Instagram posts) for a climb, from the synced table. */
export async function betaLinks(db: Db, climbUuid: string): Promise<BetaRow[]> {
  return db.all<BetaRow>(
    "SELECT link, foreign_username AS username, angle, thumbnail FROM beta_links WHERE climb_uuid = ? AND is_listed = 1 ORDER BY created_at DESC", [climbUuid.toUpperCase()]);
}

/** Climbs by id, in the order asked for (a circuit's order). Ids not on this device are skipped. */
export async function climbsByUuids(db: Db, uuids: string[]): Promise<Climb[]> {
  if (!uuids.length) return [];
  const rows = await db.all<ClimbRow>(`SELECT ${CLIMB_COLS} FROM climbs WHERE uuid IN (${uuids.map(() => "?").join(",")})`, uuids.map((u) => u.toUpperCase()));
  const by = new Map(rows.map((r) => [r.uuid, toClimb(r)]));
  return uuids.map((u) => by.get(u.toUpperCase())).filter((c): c is Climb => !!c);
}

/** The user's unpublished drafts, newest first. */
export async function draftsOf(db: Db, userId: number): Promise<Climb[]> {
  const rows = await db.all<ClimbRow>(
    `SELECT ${CLIMB_COLS} FROM climbs WHERE setter_id = ? AND is_draft = 1 AND is_listed = 1 ORDER BY created_at DESC`, [userId]);
  return rows.map(toClimb);
}

/** True when another listed climb on the layout already has this name (case-insensitive). */
export async function nameTaken(db: Db, layoutId: number, name: string, exceptUuid?: string): Promise<boolean> {
  return (await db.all("SELECT 1 FROM climbs WHERE layout_id = ? AND is_listed = 1 AND lower(name) = lower(?) AND uuid != ? LIMIT 1", [layoutId, name.trim(), (exceptUuid ?? "").toUpperCase()])).length > 0;
}

export async function productLimits(db: Db, productId: number): Promise<{ minHolds: number; maxHolds: number }> {
  const r = (await db.all<{ a: number | null; b: number | null }>("SELECT min_count_in_frame AS a, max_count_in_frame AS b FROM products WHERE id = ?", [productId]))[0];
  return { minHolds: r?.a ?? 2, maxHolds: r?.b ?? 35 };
}


export interface LayoutView {
  spec: BoardSpec;
  placements: Placement[];
  roles: Role[];
}

/**
 * How to draw any climb of a layout, whether or not the user has such a board: every hole of the layout on its
 * largest size, with all hold sets. Used for climbs that aren't on the open board (from circuits, search, workouts).
 */
export async function loadLayoutView(db: Db, layoutId: number, provider: ProviderId): Promise<LayoutView | null> {
  const layout = (await db.all<{ name: string; productId: number; isMirrored: number }>("SELECT name, product_id AS productId, is_mirrored AS isMirrored FROM layouts WHERE id = ?", [layoutId]))[0];
  if (!layout) return null;
  const size = (await db.all<{ id: number; name: string; l: number; r: number; b: number; t: number }>(
    `SELECT s.id, s.name, s.edge_left AS l, s.edge_right AS r, s.edge_bottom AS b, s.edge_top AS t FROM product_sizes s
       WHERE s.id IN (SELECT product_size_id FROM product_sizes_layouts_sets WHERE layout_id = ? AND is_listed = 1)
       ORDER BY (s.edge_right - s.edge_left) * (s.edge_top - s.edge_bottom) DESC LIMIT 1`, [layoutId]))[0];
  if (!size) return null;
  const sets = await db.all<{ id: number; name: string; hsm: number; image: string }>(
    `SELECT st.id, st.name, st.hsm, p.image_filename AS image FROM product_sizes_layouts_sets p JOIN sets st ON st.id = p.set_id
      WHERE p.layout_id = ? AND p.product_size_id = ? AND p.is_listed = 1 ORDER BY st.id`, [layoutId, size.id]);
  const placements = await db.all<Placement>(
    `SELECT p.id AS id, h.x AS x, h.y AS y, 0 AS led, mp.id AS mirror FROM placements p
       JOIN holes h ON h.id = p.hole_id LEFT JOIN placements mp ON mp.hole_id = h.mirrored_hole_id AND mp.layout_id = p.layout_id
      WHERE p.layout_id = ?`, [layoutId]);
  const roles = await db.all<Role>("SELECT id, position, name, full_name, led_color FROM placement_roles WHERE product_id = ? ORDER BY position", [layout.productId]);
  const angles = (await db.all<{ angle: number }>("SELECT angle FROM products_angles WHERE product_id = ? ORDER BY angle", [layout.productId])).map((a) => a.angle);
  return {
    placements, roles,
    spec: {
      provider, layoutId, layoutName: layout.name, productId: layout.productId, productSizeId: size.id, sizeName: size.name, hsm: sets.reduce((a, x) => a | x.hsm, 0),
      setIds: sets.map((x) => x.id), setNames: sets.map((x) => x.name), images: sets.map((x) => x.image).filter(Boolean),
      edges: { left: size.l, right: size.r, bottom: size.b, top: size.t }, isMirrored: !!layout.isMirrored, angles,
    },
  };
}

/** Stats at one angle for specific climbs (a circuit, a workout), whatever their layout. */
export async function statsFor(db: Db, uuids: string[], angle: number): Promise<StatsAt> {
  const m: StatsAt = new Map();
  for (let i = 0; i < uuids.length; i += 400) {
    const chunk = uuids.slice(i, i + 400).map((u) => u.toUpperCase());
    const rows = await db.all<{ u: string; d: number; b: number | null; c: number; q: number }>(
      `SELECT climb_uuid AS u, display_difficulty AS d, benchmark_difficulty AS b, ascensionist_count AS c, quality_average AS q FROM climb_stats
        WHERE angle = ? AND climb_uuid IN (${chunk.map(() => "?").join(",")})`, [angle, ...chunk]);
    for (const r of rows) m.set(r.u, [r.d, r.b, r.c, r.q]);
  }
  return m;
}

/** Controllers the server knows about for this account. Auto connect is a per-kit setting kept on the server. */
export async function loadKits(db: Db): Promise<{ serial: string; name: string | null; isAutoconnect: boolean }[]> {
  const rows = await db.all<{ serial_number: string; name: string | null; is_autoconnect: number }>("SELECT serial_number, name, is_autoconnect FROM kits WHERE is_listed = 1");
  return rows.map((r) => ({ serial: r.serial_number, name: r.name, isAutoconnect: !!r.is_autoconnect }));
}
