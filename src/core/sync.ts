import { USER_AGENT, encodeForm, hostOf, type Session } from "./api";
import { one, type Db, type SqlValue } from "./db";

/** Tables requested on every sync, in the order the official app sends them. */
export const SHARED_TABLES = [
  "products", "product_sizes", "holes", "leds", "products_angles", "layouts", "product_sizes_layouts_sets", "placements",
  "sets", "placement_roles", "climbs", "climb_stats", "beta_links", "attempts", "kits",
] as const;
export const USER_TABLES = ["users", "walls", "draft_climbs", "ascents", "bids", "tags", "circuits"] as const;

export const EPOCH = "1970-01-01 00:00:00.000000";

type Row = Record<string, unknown>;
export type SyncResponse = Record<string, unknown> & { _complete?: boolean };

export class SyncError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const bool = (v: unknown): number => (v === true || v === 1 || v === "1" ? 1 : 0);
const num = (v: unknown): number | null => (v == null ? null : Number(v));
const str = (v: unknown): string | null => (v == null ? null : String(v));
/** Climb ids are upper-case hex everywhere; the bundled snapshot mixed cases, so normalise on write and on read. */
const uid = (v: unknown): string | null => (v == null ? null : String(v).toUpperCase());
const has = (row: Row, keys: string[]) => keys.every((k) => row[k] != null);
const rows = (r: SyncResponse, key: string): Row[] => (Array.isArray(r[key]) ? (r[key] as Row[]) : []);

async function replace(db: Db, table: string, cols: string[], data: SqlValue[][]) {
  if (!data.length) return;
  await db.batch(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`, data);
}

const CLIMB_COLS = [
  "uuid", "layout_id", "setter_id", "setter_username", "name", "description", "hsm", "edge_left", "edge_right",
  "edge_bottom", "edge_top", "angle", "frames_count", "frames_pace", "frames", "is_draft", "is_listed", "created_at", "is_nomatch",
];
const CLIMB_REQUIRED = CLIMB_COLS.filter((c) => c !== "angle");

async function applyClimbs(db: Db, list: Row[], draft: boolean) {
  const data: SqlValue[][] = [];
  for (const r of list) {
    const row = draft ? { ...r, is_draft: true } : r;
    if (!has(row, CLIMB_REQUIRED)) continue; // the official app skips incomplete climb rows too
    data.push([
      uid(row.uuid), num(row.layout_id), num(row.setter_id), str(row.setter_username), str(row.name), str(row.description),
      num(row.hsm), num(row.edge_left), num(row.edge_right), num(row.edge_bottom), num(row.edge_top), num(row.angle),
      num(row.frames_count), num(row.frames_pace), str(row.frames), bool(row.is_draft), bool(row.is_listed), str(row.created_at), bool(row.is_nomatch),
    ]);
  }
  await replace(db, "climbs", CLIMB_COLS, data);
}

async function applyClimbStats(db: Db, list: Row[]) {
  const put: SqlValue[][] = [];
  const del: SqlValue[][] = [];
  for (const r of list) {
    const tomb = [r.ascensionist_count, r.difficulty_average, r.quality_average, r.fa_username, r.fa_at].some((v) => v == null);
    if (tomb) del.push([uid(r.climb_uuid), num(r.angle)]);
    else {
      const bench = num(r.benchmark_difficulty);
      put.push([
        uid(r.climb_uuid), num(r.angle), bench ?? num(r.difficulty_average), bench, num(r.ascensionist_count),
        num(r.difficulty_average), num(r.quality_average), str(r.fa_username), str(r.fa_at),
      ]);
    }
  }
  await replace(db, "climb_stats", ["climb_uuid", "angle", "display_difficulty", "benchmark_difficulty", "ascensionist_count", "difficulty_average", "quality_average", "fa_username", "fa_at"], put);
  if (del.length) await db.batch("DELETE FROM climb_stats WHERE climb_uuid = ? AND angle = ?", del);
}

async function applyUsers(db: Db, list: Row[]) {
  for (const r of list) {
    if (r.id == null) continue;
    await db.run("INSERT OR REPLACE INTO users (id, username, created_at) VALUES (?, ?, ?)", [num(r.id), str(r.username), str(r.created_at) ?? ""]);
    if (Array.isArray(r.permissions)) {
      await db.run("DELETE FROM user_permissions WHERE user_id = ?", [num(r.id)]);
      await db.batch("INSERT OR REPLACE INTO user_permissions (user_id, name) VALUES (?, ?)", (r.permissions as unknown[]).map((p) => [num(r.id), String(p)]));
    }
  }
}

async function applyWalls(db: Db, list: Row[]) {
  for (const r of list) {
    if (r.uuid == null) continue;
    await db.run("DELETE FROM walls_sets WHERE wall_uuid = ?", [str(r.uuid)]);
    if (r.is_listed === false) {
      await db.run("DELETE FROM walls WHERE uuid = ?", [str(r.uuid)]);
      continue;
    }
    await replace(db, "walls", ["uuid", "user_id", "name", "product_id", "is_adjustable", "angle", "layout_id", "product_size_id", "hsm", "serial_number", "created_at"], [[
      str(r.uuid), num(r.user_id), str(r.name), num(r.product_id), bool(r.is_adjustable), num(r.angle), num(r.layout_id), num(r.product_size_id),
      num(r.hsm), str(r.serial_number), str(r.created_at),
    ]]);
    await replace(db, "walls_sets", ["wall_uuid", "set_id"], (Array.isArray(r.set_ids) ? (r.set_ids as unknown[]) : []).map((s) => [str(r.uuid), num(s)]));
  }
}

async function applyAscents(db: Db, list: Row[]) {
  const put: SqlValue[][] = [];
  const del: SqlValue[][] = [];
  for (const r of list) {
    if (r.uuid == null) continue;
    if (r.is_listed === false) del.push([str(r.uuid)]);
    else if (has(r, ["climb_uuid", "angle", "is_mirror", "user_id", "attempt_id", "bid_count", "quality", "difficulty", "comment", "climbed_at"]))
      put.push([str(r.uuid), uid(r.climb_uuid), num(r.angle), bool(r.is_mirror), num(r.user_id), num(r.attempt_id), num(r.bid_count), num(r.quality), num(r.difficulty), bool(r.is_benchmark), str(r.comment), str(r.climbed_at), str(r.created_at)]);
  }
  await replace(db, "ascents", ["uuid", "climb_uuid", "angle", "is_mirror", "user_id", "attempt_id", "bid_count", "quality", "difficulty", "is_benchmark", "comment", "climbed_at", "created_at"], put);
  if (del.length) await db.batch("DELETE FROM ascents WHERE uuid = ?", del);
}

async function applyBids(db: Db, list: Row[]) {
  const put: SqlValue[][] = [];
  const del: SqlValue[][] = [];
  for (const r of list) {
    if (r.uuid == null) continue;
    if (r.is_listed === false) del.push([str(r.uuid)]);
    else if (has(r, ["user_id", "climb_uuid", "angle", "is_mirror", "climbed_at"]))
      put.push([str(r.uuid), num(r.user_id), uid(r.climb_uuid), num(r.angle), bool(r.is_mirror), num(r.bid_count) ?? 1, str(r.comment) ?? "", str(r.climbed_at), str(r.created_at)]);
  }
  await replace(db, "bids", ["uuid", "user_id", "climb_uuid", "angle", "is_mirror", "bid_count", "comment", "climbed_at", "created_at"], put);
  if (del.length) await db.batch("DELETE FROM bids WHERE uuid = ?", del);
}

async function applyCircuits(db: Db, list: Row[]) {
  for (const r of list) {
    if (r.uuid == null) continue;
    if (r.is_listed === false) {
      await db.run("DELETE FROM circuits WHERE uuid = ?", [str(r.uuid)]);
      await db.run("DELETE FROM circuits_climbs WHERE circuit_uuid = ?", [str(r.uuid)]);
      continue;
    }
    await replace(db, "circuits", ["uuid", "name", "description", "color", "user_id", "is_public", "created_at", "updated_at"], [[
      str(r.uuid), str(r.name), str(r.description) ?? "", str(r.color) ?? "808080", num(r.user_id), bool(r.is_public), str(r.created_at) ?? "", str(r.updated_at) ?? "",
    ]]);
    if (Array.isArray(r.climbs)) {
      await db.run("DELETE FROM circuits_climbs WHERE circuit_uuid = ?", [str(r.uuid)]);
      await replace(db, "circuits_climbs", ["circuit_uuid", "climb_uuid", "position"], (r.climbs as Row[]).map((c) => [str(r.uuid), uid(c.uuid), num(c.position)]));
    }
  }
}

async function applyEvents(db: Db, list: Row[]) {
  for (const e of list) {
    const circuit = str(e.circuit_uuid);
    if (e._type === "circuit_climbs_saved") {
      await db.run("DELETE FROM circuits_climbs WHERE circuit_uuid = ?", [circuit]);
      await replace(db, "circuits_climbs", ["circuit_uuid", "climb_uuid", "position"], ((e.climbs as Row[]) ?? []).map((c) => [circuit, uid(c.uuid), num(c.position)]));
    } else if (e._type === "climb_added_to_circuit") {
      await db.run("INSERT OR IGNORE INTO circuits_climbs (circuit_uuid, climb_uuid, position) VALUES (?, ?, ?)", [circuit, uid(e.climb_uuid), num(e.position)]);
    } else if (e._type === "climb_removed_from_circuit") {
      await db.run("DELETE FROM circuits_climbs WHERE circuit_uuid = ? AND climb_uuid = ?", [circuit, uid(e.climb_uuid)]);
    }
  }
}

/**
 * Applies one /sync-shaped response (a sync page, or the response of any save/delete call) in a single
 * transaction, in the order the official app uses. Returns rows seen per table.
 */
export async function applySync(db: Db, r: SyncResponse): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const seen = (k: string) => {
    const n = rows(r, k).length;
    if (n) counts[k] = n;
    return rows(r, k);
  };
  await db.transaction(async () => {
    await replace(db, "products", ["id", "name", "is_listed", "min_count_in_frame", "max_count_in_frame"],
      seen("products").map((p) => [num(p.id), str(p.name), bool(p.is_listed), num(p.min_count_in_frame), num(p.max_count_in_frame)]));
    await replace(db, "holes", ["id", "product_id", "name", "x", "y", "mirrored_hole_id", "mirror_group"],
      seen("holes").map((h) => [num(h.id), num(h.product_id), str(h.name), num(h.x), num(h.y), num(h.mirrored_hole_id), num(h.mirror_group) ?? 0]));
    await replace(db, "products_angles", ["product_id", "angle"], seen("products_angles").map((p) => [num(p.product_id), num(p.angle)]));
    await replace(db, "placement_roles", ["id", "product_id", "position", "name", "full_name", "led_color", "screen_color"],
      seen("placement_roles").map((p) => [num(p.id), num(p.product_id), num(p.position), str(p.name), str(p.full_name), str(p.led_color), str(p.screen_color)]));
    await replace(db, "product_sizes", ["id", "product_id", "edge_left", "edge_right", "edge_bottom", "edge_top", "name", "description", "image_filename", "position", "is_listed"],
      seen("product_sizes").map((p) => [num(p.id), num(p.product_id), num(p.edge_left), num(p.edge_right), num(p.edge_bottom), num(p.edge_top), str(p.name), str(p.description) ?? "", str(p.image_filename) ?? "", num(p.position) ?? 0, bool(p.is_listed)]));
    await replace(db, "leds", ["id", "product_size_id", "hole_id", "position"], seen("leds").map((l) => [num(l.id), num(l.product_size_id), num(l.hole_id), num(l.position)]));
    await replace(db, "layouts", ["id", "product_id", "name", "instagram_caption", "is_mirrored", "is_listed", "password", "created_at"],
      seen("layouts").map((l) => [num(l.id), num(l.product_id), str(l.name), str(l.instagram_caption) ?? "", bool(l.is_mirrored), bool(l.is_listed), str(l.password), str(l.created_at) ?? ""]));
    await replace(db, "sets", ["id", "name", "hsm"], seen("sets").map((s) => [num(s.id), str(s.name), num(s.hsm)]));
    await replace(db, "product_sizes_layouts_sets", ["id", "product_size_id", "layout_id", "set_id", "image_filename", "is_listed"],
      seen("product_sizes_layouts_sets").map((p) => [num(p.id), num(p.product_size_id), num(p.layout_id), num(p.set_id), str(p.image_filename) ?? "", bool(p.is_listed)]));
    await replace(db, "placements", ["id", "layout_id", "hole_id", "set_id", "default_placement_role_id"],
      seen("placements").map((p) => [num(p.id), num(p.layout_id), num(p.hole_id), num(p.set_id), num(p.default_placement_role_id)]));
    await replace(db, "attempts", ["id", "position", "name"], seen("attempts").map((a) => [num(a.id), num(a.position), str(a.name)]));
    await replace(db, "kits", ["serial_number", "name", "is_autoconnect", "is_listed", "created_at", "updated_at"],
      seen("kits").map((k) => [str(k.serial_number), str(k.name), bool(k.is_autoconnect), bool(k.is_listed), str(k.created_at) ?? "", str(k.updated_at) ?? ""]));
    await applyUsers(db, seen("users"));
    await applyClimbs(db, seen("climbs"), false);
    await applyClimbs(db, seen("draft_climbs"), true);
    await applyClimbStats(db, seen("climb_stats"));
    await replace(db, "beta_links", ["climb_uuid", "link", "foreign_username", "angle", "thumbnail", "is_listed", "created_at"],
      seen("beta_links").map((b) => [uid(b.climb_uuid), str(b.link), str(b.foreign_username), num(b.angle), str(b.thumbnail), bool(b.is_listed), str(b.created_at) ?? ""]));
    await applyBids(db, seen("bids"));
    await applyAscents(db, seen("ascents"));
    await applyCircuits(db, seen("circuits"));
    await applyWalls(db, seen("walls"));
    await replace(db, "tags", ["entity_uuid", "user_id", "name", "is_listed"],
      seen("tags").map((t) => [uid(t.entity_uuid), num(t.user_id), str(t.name), t.is_listed == null ? 1 : bool(t.is_listed)]));
    await applyEvents(db, seen("events"));
    // Cursors last: if anything above throws, they do not move and the window is fetched again.
    await replace(db, "shared_syncs", ["table_name", "last_synchronized_at"],
      rows(r, "shared_syncs").filter((s) => s.table_name && s.last_synchronized_at).map((s) => [str(s.table_name), str(s.last_synchronized_at)]));
    await replace(db, "user_syncs", ["user_id", "table_name", "last_synchronized_at"],
      rows(r, "user_syncs").filter((s) => s.table_name && s.last_synchronized_at).map((s) => [num(s.user_id), str(s.table_name), str(s.last_synchronized_at)]));
  });
  return counts;
}

/** The form body for the next /sync request: every table with the cursor the server last gave us. */
export async function buildSyncBody(db: Db, userId: number): Promise<string> {
  const shared = new Map((await db.all<{ table_name: string; last_synchronized_at: string }>("SELECT table_name, last_synchronized_at FROM shared_syncs")).map((r) => [r.table_name, r.last_synchronized_at]));
  const user = new Map((await db.all<{ table_name: string; last_synchronized_at: string }>("SELECT table_name, last_synchronized_at FROM user_syncs WHERE user_id = ?", [userId])).map((r) => [r.table_name, r.last_synchronized_at]));
  const fields: Record<string, string> = {};
  for (const t of SHARED_TABLES) fields[t] = shared.get(t) ?? EPOCH;
  for (const t of USER_TABLES) fields[t] = user.get(t) ?? EPOCH;
  return encodeForm(fields);
}

export interface SyncProgress {
  page: number;
  /** Rows applied so far, by table. */
  totals: Record<string, number>;
  /** Tables the server has nothing more for are not listed; this is true until the last page. */
  more: boolean;
}

export interface SyncOptions {
  fetch?: typeof fetch;
  host?: string;
  maxPages?: number;
  onProgress?: (p: SyncProgress) => void;
  signal?: { aborted: boolean };
  /** Maximum duration of this invocation. Expiry aborts in-flight work or returns with `more: true` between pages. */
  deadlineMs?: number;
}

/** Pulls pages until the server reports `_complete`, applying each page as it arrives. */
export async function syncAll(db: Db, session: Session, opts: SyncOptions = {}): Promise<SyncProgress> {
  const f = opts.fetch ?? fetch;
  const host = opts.host ?? hostOf(session);
  const deadline = opts.deadlineMs == null ? null : Date.now() + Math.max(0, opts.deadlineMs);
  const controller = deadline == null ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), opts.deadlineMs) : undefined;
  const totals: Record<string, number> = {};
  let page = 0;
  try {
    for (;;) {
      if (opts.signal?.aborted) throw new SyncError("Sync cancelled");
      if (deadline != null && Date.now() >= deadline) return { page, totals, more: true };
      if (page >= (opts.maxPages ?? 5000)) throw new SyncError("Sync did not finish");
      let res: Response;
      try {
        res = await f(`${host}/sync`, {
          method: "POST",
          credentials: "omit", // React Native's cookie jar would replace our Cookie header (see signIn in api.ts)
          signal: controller?.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
            Cookie: `token=${session.token}`,
          },
          body: await buildSyncBody(db, session.userId),
        });
      } catch (e) {
        if (controller?.signal.aborted) return { page, totals, more: true };
        throw new SyncError(`Network error: ${(e as Error).message}`);
      }
      // Anonymous or expired sessions get 404 here, not 401.
      if (res.status === 401 || res.status === 404) throw new SyncError("Session expired", res.status);
      if (!res.ok) throw new SyncError(`Sync failed (${res.status})`, res.status);
      const body = (await res.json()) as SyncResponse;
      const counts = await applySync(db, body);
      for (const [k, n] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + n;
      page++;
      const more = body._complete === false;
      opts.onProgress?.({ page, totals: { ...totals }, more });
      if (!more) return { page, totals, more };
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function setMeta(db: Db, key: string, value: string) {
  await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, value]);
}
export async function getMeta(db: Db, key: string): Promise<string | undefined> {
  return (await one<{ value: string }>(db, "SELECT value FROM meta WHERE key = ?", [key]))?.value;
}
