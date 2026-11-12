/**
 * The MoonBoard provider's local database. It uses the same tables as the Aurora mirror (see schema.ts), so boards, climbs,
 * filters and the logbook work unchanged; nothing here talks to a server. Everything is derived from the setup, so each
 * function is safe to run again.
 */
import { randomHex, serverTime, type SaveSendInput } from "./api";
import { parseFrames } from "./frames";
import type { Db } from "./db";
import {
  artName, COLS, edgesOf, holeIdOf, MOON_RULES, layoutIdOf, type MoonRole, type MoonSetup, placementIdOf, positionName, productOf, ROLE, ROLE_COLORS, ROLE_NAMES,
  roleIdOf, rowsOf, SET_ID, toClimb, ledIndex, type MoonProblem,
} from "./moonboard";

/** The only user a local provider has. Rows that need a user id (boards, logs, tags) carry this. */
export const LOCAL_USER_ID = 1;
export const LOCAL_USERNAME = "This phone";
/** Shown as the setter of problems the user set themselves. */
export const LOCAL_SETTER = "You";

const ANGLES = [25, 40];

/** Writes the geometry of one setup at one angle: product, size, every hole with its LED, layout, placements and roles. */
export async function seedSetup(db: Db, setup: MoonSetup, angle: number): Promise<void> {
  const product = productOf(setup);
  const rows = rowsOf(setup);
  const layout = layoutIdOf(setup, angle);
  const now = serverTime(new Date());
  await db.transaction(async () => {
    await db.run("INSERT OR REPLACE INTO products (id, name, is_listed, min_count_in_frame, max_count_in_frame) VALUES (?, ?, 1, ?, ?)", [product, setup.mini ? "MoonBoard Mini" : "MoonBoard", MOON_RULES.minHolds, MOON_RULES.maxHolds]);
    await db.run(
      "INSERT OR REPLACE INTO product_sizes (id, product_id, edge_left, edge_right, edge_bottom, edge_top, name, description, image_filename, position, is_listed) VALUES (?, ?, 0, ?, 0, ?, ?, '', '', 1, 1)",
      [product, product, COLS + 1, rows + 1, `${rows} high x ${COLS} wide`],
    );
    for (const a of ANGLES) await db.run("INSERT OR REPLACE INTO products_angles (product_id, angle) VALUES (?, ?)", [product, a]);
    await db.run("INSERT OR REPLACE INTO sets (id, name, hsm) VALUES (?, 'Board', 1)", [SET_ID]);
    await db.run(
      "INSERT OR REPLACE INTO layouts (id, product_id, name, instagram_caption, is_mirrored, is_listed, password, created_at) VALUES (?, ?, ?, '', 0, 1, NULL, ?)",
      [layout, product, `${setup.name} \u00b7 ${angle}\u00b0`, now],
    );
    await db.run("INSERT OR REPLACE INTO product_sizes_layouts_sets (id, product_size_id, layout_id, set_id, image_filename, is_listed) VALUES (?, ?, ?, ?, ?, 1)", [layout, product, layout, SET_ID, artName(setup)]);
    for (const role of Object.keys(ROLE) as MoonRole[]) {
      await db.run(
        "INSERT OR REPLACE INTO placement_roles (id, product_id, position, name, full_name, led_color, screen_color) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [roleIdOf(product, role), product, ROLE[role], role, ROLE_NAMES[role], ROLE_COLORS[role], ROLE_COLORS[role]],
      );
    }
    const holes: (string | number)[][] = [];
    const leds: number[][] = [];
    const placements: number[][] = [];
    for (let col = 0; col < COLS; col++) {
      for (let row = 1; row <= rows; row++) {
        const p = { col, row };
        const hole = holeIdOf(product, p);
        holes.push([hole, product, positionName(p), col + 1, row]);
        leds.push([hole, product, hole, ledIndex(p, rows)]);
        placements.push([placementIdOf(layout, hole), layout, hole, SET_ID]);
      }
    }
    await db.batch("INSERT OR REPLACE INTO holes (id, product_id, name, x, y, mirrored_hole_id, mirror_group) VALUES (?, ?, ?, ?, ?, NULL, 0)", holes);
    await db.batch("INSERT OR REPLACE INTO leds (id, product_size_id, hole_id, position) VALUES (?, ?, ?, ?)", leds);
    await db.batch("INSERT OR REPLACE INTO placements (id, layout_id, hole_id, set_id, default_placement_role_id) VALUES (?, ?, ?, ?, NULL)", placements);
  });
}

/**
 * Brings a setup's rows up to date when the app has learned something since the board was created (the hold art, the setting
 * limits). Cheap to call on every launch: it only reseeds when the stored rows differ.
 */
export async function ensureSeeded(db: Db, setup: MoonSetup, angle: number): Promise<boolean> {
  const row = (await db.all<{ maxc: number | null; img: string | null }>(
    "SELECT p.max_count_in_frame AS maxc, (SELECT image_filename FROM product_sizes_layouts_sets WHERE layout_id = ? LIMIT 1) AS img FROM products p WHERE p.id = ?",
    [layoutIdOf(setup, angle), productOf(setup)],
  ))[0];
  if (row && row.maxc === MOON_RULES.maxHolds && row.img === artName(setup)) return false;
  await seedSetup(db, setup, angle);
  return true;
}

/** Adds a board for the setup and angle. Returns its id. The board's own angle is fixed; MoonBoards do not adjust. */
export async function createBoard(db: Db, input: { name: string; setup: MoonSetup; angle: number }): Promise<string> {
  await seedSetup(db, input.setup, input.angle);
  const uuid = randomHex(32).toUpperCase();
  const product = productOf(input.setup);
  const now = serverTime(new Date());
  await db.run("INSERT OR IGNORE INTO users (id, username, created_at) VALUES (?, ?, ?)", [LOCAL_USER_ID, LOCAL_USERNAME, now]);
  await db.run(
    "INSERT INTO walls (uuid, user_id, name, product_id, is_adjustable, angle, layout_id, product_size_id, hsm, serial_number, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 1, NULL, ?)",
    [uuid, LOCAL_USER_ID, input.name, product, input.angle, layoutIdOf(input.setup, input.angle), product, now],
  );
  await db.run("INSERT INTO walls_sets (wall_uuid, set_id) VALUES (?, ?)", [uuid, SET_ID]);
  return uuid;
}

export async function renameBoard(db: Db, uuid: string, name: string): Promise<void> {
  await db.run("UPDATE walls SET name = ? WHERE uuid = ? AND user_id = ?", [name, uuid, LOCAL_USER_ID]);
}

export async function deleteBoard(db: Db, uuid: string): Promise<void> {
  await db.run("DELETE FROM walls_sets WHERE wall_uuid = ?", [uuid]);
  await db.run("DELETE FROM walls WHERE uuid = ?", [uuid]);
}

export interface ImportCounts {
  added: number;
  /** Problems with no holes, a hole off the grid, or no name. */
  skipped: number;
  /** Problems whose grade is outside the scale; they are kept and shown as projects. */
  ungraded: number;
}

/** Adds a batch of problems to the setup's climb list. Problems already there (same name and holds) are replaced. */
export async function importProblems(db: Db, setup: MoonSetup, angle: number, problems: MoonProblem[]): Promise<ImportCounts> {
  const layout = layoutIdOf(setup, angle);
  const now = serverTime(new Date());
  const climbs: (string | number | null)[][] = [];
  const stats: (string | number | null)[][] = [];
  let skipped = 0, ungraded = 0;
  for (const p of problems) {
    const c = toClimb(p, setup, angle);
    if (!c) { skipped++; continue; }
    climbs.push([c.uuid, layout, 0, c.setter, c.name, c.description, 1, c.left, c.right, c.bottom, c.top, angle, c.frames, now]);
    if (c.difficulty === null) { ungraded++; continue; }
    stats.push([c.uuid, angle, c.difficulty, c.benchmark ? c.difficulty : null, 0, c.difficulty, 0, c.setter, now]);
  }
  await db.transaction(async () => {
    await db.batch(
      "INSERT OR REPLACE INTO climbs (uuid, layout_id, setter_id, setter_username, name, description, hsm, edge_left, edge_right, edge_bottom, edge_top, angle, frames_count, frames_pace, frames, is_draft, is_listed, created_at, is_nomatch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 0, 1, ?, 0)",
      climbs,
    );
    // Counts and ratings are the user's own (see refreshStats), so a re-import updates the grade and keeps them.
    await db.batch(
      `INSERT INTO climb_stats (climb_uuid, angle, display_difficulty, benchmark_difficulty, ascensionist_count, difficulty_average, quality_average, fa_username, fa_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (climb_uuid, angle) DO UPDATE SET display_difficulty = excluded.display_difficulty, benchmark_difficulty = excluded.benchmark_difficulty,
         difficulty_average = excluded.difficulty_average, fa_username = excluded.fa_username, fa_at = excluded.fa_at`,
      stats,
    );
  });
  return { added: climbs.length, skipped, ungraded };
}

/** Forgets every board, problem and log. The schema and its version stay. */
export async function wipe(db: Db): Promise<void> {
  const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'meta'");
  for (const t of tables) await db.exec(`DELETE FROM "${t.name}"`);
}

/** How many climbs the setup's list holds, per angle. */
export async function climbCount(db: Db, setup: MoonSetup, angle: number): Promise<number> {
  return (await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM climbs WHERE layout_id = ?", [layoutIdOf(setup, angle)]))[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Logbook and tags. The same rows a synced account has, written straight away; there is no server to wait for.

export interface LocalLog { uuid: string; kind: "ascent" | "bid" }

/**
 * A MoonBoard problem has no community numbers (the dumps carry none), so its stats are the user's own: the send count is how
 * many times they sent it at that angle, and the stars are the average rating they gave. That is what the list shows and what
 * the "Best" and repeats sorts use.
 */
export async function refreshStats(db: Db, climbUuid: string, angle: number): Promise<void> {
  const climb = climbUuid.toUpperCase();
  await db.run(
    `UPDATE climb_stats SET
       ascensionist_count = (SELECT COUNT(*) FROM ascents WHERE climb_uuid = ? AND angle = ? AND user_id = ?),
       quality_average = COALESCE((SELECT AVG(quality) FROM ascents WHERE climb_uuid = ? AND angle = ? AND user_id = ?), 0)
     WHERE climb_uuid = ? AND angle = ?`,
    [climb, angle, LOCAL_USER_ID, climb, angle, LOCAL_USER_ID, climb, angle],
  );
}

export async function saveLog(db: Db, input: SaveSendInput, uuid = randomHex(32)): Promise<LocalLog> {
  const at = serverTime(input.climbedAt);
  const now = serverTime(new Date());
  const climb = input.climbUuid.toUpperCase();
  if (input.quality !== undefined && input.difficulty !== undefined) {
    await db.run(
      "INSERT OR REPLACE INTO ascents (uuid, climb_uuid, angle, is_mirror, user_id, attempt_id, bid_count, quality, difficulty, is_benchmark, comment, climbed_at, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)",
      [uuid, climb, input.angle, input.isMirror ? 1 : 0, LOCAL_USER_ID, input.bidCount, input.quality, input.difficulty, input.isBenchmark ? 1 : 0, input.comment, at, now],
    );
    // A problem the dump could not grade has no stats row; the user's own grade gives it one.
    await db.run(
      "INSERT OR IGNORE INTO climb_stats (climb_uuid, angle, display_difficulty, benchmark_difficulty, ascensionist_count, difficulty_average, quality_average, fa_username, fa_at) VALUES (?, ?, ?, NULL, 0, ?, 0, ?, ?)",
      [climb, input.angle, input.difficulty, input.difficulty, LOCAL_USERNAME, now],
    );
    await refreshStats(db, climb, input.angle);
    return { uuid, kind: "ascent" };
  }
  await db.run(
    "INSERT OR REPLACE INTO bids (uuid, user_id, climb_uuid, angle, is_mirror, bid_count, comment, climbed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [uuid, LOCAL_USER_ID, climb, input.angle, input.isMirror ? 1 : 0, input.bidCount, input.comment, at, now],
  );
  return { uuid, kind: "bid" };
}

export async function deleteLog(db: Db, uuid: string, kind: "ascent" | "bid"): Promise<void> {
  const gone = kind === "ascent" ? (await db.all<{ c: string; a: number }>("SELECT climb_uuid AS c, angle AS a FROM ascents WHERE uuid = ?", [uuid]))[0] : undefined;
  await db.run(`DELETE FROM ${kind === "ascent" ? "ascents" : "bids"} WHERE uuid = ?`, [uuid]);
  if (gone) await refreshStats(db, gone.c, gone.a);
}

/** Like (`~flag`) or block (`~block`) a climb, or undo it. */
export async function setTag(db: Db, climbUuid: string, name: "~flag" | "~block", listed: boolean): Promise<void> {
  await db.run("INSERT OR REPLACE INTO tags (entity_uuid, user_id, name, is_listed) VALUES (?, ?, ?, ?)", [climbUuid.toUpperCase(), LOCAL_USER_ID, name, listed ? 1 : 0]);
}

// ---------------------------------------------------------------------------------------------------------------------
// The community database (e-sr/moonboard `problems/moon_problems.db`): the other dump format.

/** The distinct setup names in an e-sr database, with how many problems each has. */
export async function esrSetups(db: Db): Promise<{ setup: string; problems: number }[]> {
  return db.all<{ setup: string; problems: number }>("SELECT Setup AS setup, COUNT(DISTINCT Problem) AS problems FROM problemMoves GROUP BY Setup");
}

/** Reads one setup's problems in batches, so a very large file never has to be in memory at once. */
export async function* readEsr(db: Db, setupText: string, batch = 500): AsyncGenerator<MoonProblem[]> {
  const ids = (await db.all<{ Problem: number }>("SELECT DISTINCT Problem FROM problemMoves WHERE Setup = ? ORDER BY Problem", [setupText])).map((r) => r.Problem);
  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch);
    const marks = slice.map(() => "?").join(",");
    const heads = await db.all<{ Id: number; Name: string; Grade: string; IsBenchmark: number; Method: string; Firstname: string | null; Lastname: string | null }>(
      `SELECT Id, Name, Grade, IsBenchmark, Method, Firstname, Lastname FROM problems WHERE Id IN (${marks})`, slice);
    const moves = await db.all<{ Problem: number; Position: string; IsStart: number; IsEnd: number }>(
      `SELECT Problem, Position, IsStart, IsEnd FROM problemMoves WHERE Setup = ? AND Problem IN (${marks})`, [setupText, ...slice]);
    const byProblem = new Map<number, MoonProblem["holds"]>();
    for (const m of moves) {
      const list = byProblem.get(m.Problem) ?? [];
      list.push({ position: m.Position, role: m.IsStart ? "start" : m.IsEnd ? "finish" : "middle" });
      byProblem.set(m.Problem, list);
    }
    yield heads.map((h) => ({
      name: h.Name ?? "", grade: h.Grade ?? "", method: h.Method ?? "", benchmark: !!h.IsBenchmark,
      setter: [h.Firstname, h.Lastname].filter(Boolean).join(" "), holds: byProblem.get(h.Id) ?? [],
    }));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Problems the user sets themselves

export interface OwnClimbInput {
  /** Present when editing one of the user's own problems. */
  uuid?: string;
  layoutId: number;
  name: string;
  /** The feet rule, stored where the dumps keep theirs. */
  method: string;
  /** Climb `frames` string: one frame. */
  frames: string;
  angle: number;
  /** The grade the user gave it, as the shared scale's difficulty number. */
  difficulty: number;
}

/** Saves a problem the user set: a new one, or an edit of one of their own. Returns its uuid. */
export async function saveOwnClimb(db: Db, i: OwnClimbInput): Promise<string> {
  const frame = parseFrames(i.frames)[0] ?? new Map();
  const edges = edgesOf(frame);
  if (!edges) throw new Error("A problem needs holds.");
  const now = serverTime(new Date());
  const uuid = (i.uuid ?? randomHex(32)).toUpperCase();
  await db.transaction(async () => {
    if (i.uuid) {
      const n = (await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM climbs WHERE uuid = ? AND setter_id = ?", [uuid, LOCAL_USER_ID]))[0]?.n ?? 0;
      if (!n) throw new Error("You can only change problems you set.");
      await db.run(
        "UPDATE climbs SET name = ?, description = ?, edge_left = ?, edge_right = ?, edge_bottom = ?, edge_top = ?, frames = ?, angle = ? WHERE uuid = ?",
        [i.name, i.method, edges.left, edges.right, edges.bottom, edges.top, i.frames, i.angle, uuid],
      );
    } else {
      await db.run(
        "INSERT INTO climbs (uuid, layout_id, setter_id, setter_username, name, description, hsm, edge_left, edge_right, edge_bottom, edge_top, angle, frames_count, frames_pace, frames, is_draft, is_listed, created_at, is_nomatch) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 1, 0, ?, 0, 1, ?, 0)",
        [uuid, i.layoutId, LOCAL_USER_ID, LOCAL_SETTER, i.name, i.method, edges.left, edges.right, edges.bottom, edges.top, i.angle, i.frames, now],
      );
    }
    // The grade is the setter's; counts and ratings stay the user's own tallies (see refreshStats).
    await db.run(
      `INSERT INTO climb_stats (climb_uuid, angle, display_difficulty, benchmark_difficulty, ascensionist_count, difficulty_average, quality_average, fa_username, fa_at)
       VALUES (?, ?, ?, NULL, 0, ?, 0, ?, ?)
       ON CONFLICT (climb_uuid, angle) DO UPDATE SET display_difficulty = excluded.display_difficulty, difficulty_average = excluded.difficulty_average`,
      [uuid, i.angle, i.difficulty, i.difficulty, LOCAL_SETTER, now],
    );
    await refreshStats(db, uuid, i.angle);
  });
  return uuid;
}

/** Deletes a problem the user set. Their logs of it stay. Returns false when it is not theirs (or does not exist). */
export async function deleteOwnClimb(db: Db, uuid: string): Promise<boolean> {
  const id = uuid.toUpperCase();
  const n = (await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM climbs WHERE uuid = ? AND setter_id = ?", [id, LOCAL_USER_ID]))[0]?.n ?? 0;
  if (!n) return false;
  await db.transaction(async () => {
    await db.run("DELETE FROM climbs WHERE uuid = ?", [id]);
    await db.run("DELETE FROM climb_stats WHERE climb_uuid = ?", [id]);
    await db.run("DELETE FROM circuits_climbs WHERE climb_uuid = ?", [id]);
  });
  return true;
}
