/**
 * Local copy of the server's sync tables (columns match the official app's database, minus its
 * triggers and foreign keys: rows arrive in server order and a partial window must not fail on references).
 * Bump SCHEMA_VERSION when a table changes; the app then rebuilds the database and re-syncs.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shared_syncs (table_name TEXT NOT NULL PRIMARY KEY, last_synchronized_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_syncs (user_id INTEGER NOT NULL, table_name TEXT NOT NULL, last_synchronized_at TEXT NOT NULL, PRIMARY KEY (user_id, table_name));
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, is_listed INTEGER NOT NULL, min_count_in_frame INTEGER, max_count_in_frame INTEGER);
CREATE TABLE IF NOT EXISTS product_sizes (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, edge_left INTEGER NOT NULL, edge_right INTEGER NOT NULL, edge_bottom INTEGER NOT NULL, edge_top INTEGER NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, image_filename TEXT NOT NULL, position INTEGER NOT NULL, is_listed INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS holes (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, name TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, mirrored_hole_id INTEGER, mirror_group INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS leds (id INTEGER PRIMARY KEY, product_size_id INTEGER NOT NULL, hole_id INTEGER NOT NULL, position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products_angles (product_id INTEGER NOT NULL, angle INTEGER NOT NULL, PRIMARY KEY (product_id, angle));
CREATE TABLE IF NOT EXISTS layouts (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, name TEXT NOT NULL, instagram_caption TEXT NOT NULL, is_mirrored INTEGER NOT NULL, is_listed INTEGER NOT NULL, password TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, hsm INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS product_sizes_layouts_sets (id INTEGER PRIMARY KEY, product_size_id INTEGER NOT NULL, layout_id INTEGER NOT NULL, set_id INTEGER NOT NULL, image_filename TEXT NOT NULL, is_listed INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS placements (id INTEGER PRIMARY KEY, layout_id INTEGER NOT NULL, hole_id INTEGER NOT NULL, set_id INTEGER NOT NULL, default_placement_role_id INTEGER);
CREATE TABLE IF NOT EXISTS placement_roles (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, position INTEGER NOT NULL, name TEXT NOT NULL, full_name TEXT NOT NULL, led_color TEXT NOT NULL, screen_color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, position INTEGER NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kits (serial_number TEXT PRIMARY KEY, name TEXT, is_autoconnect INTEGER NOT NULL, is_listed INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS climbs (uuid TEXT PRIMARY KEY, layout_id INTEGER NOT NULL, setter_id INTEGER NOT NULL, setter_username TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', hsm INTEGER NOT NULL, edge_left INTEGER NOT NULL, edge_right INTEGER NOT NULL, edge_bottom INTEGER NOT NULL, edge_top INTEGER NOT NULL, angle INTEGER, frames_count INTEGER NOT NULL DEFAULT 1, frames_pace INTEGER NOT NULL DEFAULT 0, frames TEXT NOT NULL, is_draft INTEGER NOT NULL DEFAULT 0, is_listed INTEGER NOT NULL, created_at TEXT NOT NULL, is_nomatch INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS climbs_layout ON climbs (layout_id, is_listed, is_draft);
CREATE TABLE IF NOT EXISTS climb_stats (climb_uuid TEXT NOT NULL, angle INTEGER NOT NULL, display_difficulty REAL NOT NULL, benchmark_difficulty REAL, ascensionist_count INTEGER NOT NULL, difficulty_average REAL NOT NULL, quality_average REAL NOT NULL, fa_username TEXT NOT NULL, fa_at TEXT NOT NULL, PRIMARY KEY (climb_uuid, angle));
CREATE INDEX IF NOT EXISTS climb_stats_angle ON climb_stats (angle);
CREATE TABLE IF NOT EXISTS beta_links (climb_uuid TEXT NOT NULL, link TEXT NOT NULL, foreign_username TEXT, angle INTEGER, thumbnail TEXT, is_listed INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (climb_uuid, link));
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS user_permissions (user_id INTEGER NOT NULL, name TEXT NOT NULL, PRIMARY KEY (user_id, name));
CREATE TABLE IF NOT EXISTS walls (uuid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, name TEXT NOT NULL, product_id INTEGER NOT NULL, is_adjustable INTEGER NOT NULL, angle INTEGER NOT NULL, layout_id INTEGER NOT NULL, product_size_id INTEGER NOT NULL, hsm INTEGER NOT NULL, serial_number TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS walls_sets (wall_uuid TEXT NOT NULL, set_id INTEGER NOT NULL, PRIMARY KEY (wall_uuid, set_id));
CREATE TABLE IF NOT EXISTS ascents (uuid TEXT PRIMARY KEY, climb_uuid TEXT NOT NULL, angle INTEGER NOT NULL, is_mirror INTEGER NOT NULL, user_id INTEGER NOT NULL, attempt_id INTEGER NOT NULL, bid_count INTEGER NOT NULL DEFAULT 1, quality INTEGER NOT NULL, difficulty INTEGER NOT NULL, is_benchmark INTEGER NOT NULL DEFAULT 0, comment TEXT NOT NULL DEFAULT '', climbed_at TEXT NOT NULL, created_at TEXT);
CREATE INDEX IF NOT EXISTS ascents_user ON ascents (user_id, climbed_at);
CREATE TABLE IF NOT EXISTS bids (uuid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, climb_uuid TEXT NOT NULL, angle INTEGER NOT NULL, is_mirror INTEGER NOT NULL, bid_count INTEGER NOT NULL DEFAULT 1, comment TEXT NOT NULL DEFAULT '', climbed_at TEXT NOT NULL, created_at TEXT);
CREATE INDEX IF NOT EXISTS bids_user ON bids (user_id, climbed_at);
CREATE TABLE IF NOT EXISTS tags (entity_uuid TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT NOT NULL, is_listed INTEGER NOT NULL, PRIMARY KEY (entity_uuid, user_id, name));
CREATE TABLE IF NOT EXISTS circuits (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, color TEXT NOT NULL, user_id INTEGER NOT NULL, is_public INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS circuits_climbs (circuit_uuid TEXT NOT NULL, climb_uuid TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (circuit_uuid, climb_uuid));
-- Changes made on this device that the server has not accepted yet, sent in order (see outbox.ts). Added without a
-- schema bump: IF NOT EXISTS creates it on existing installs without dropping the synced data.
CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, req TEXT NOT NULL, label TEXT NOT NULL, created_at TEXT NOT NULL);
`;

/** Creates missing tables. If the stored schema version differs, drops everything first so the next sync refills it. */
export async function ensureSchema(db: import("./db").Db): Promise<{ rebuilt: boolean }> {
  let rebuilt = false;
  try {
    const rows = await db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
    if (rows.length && Number(rows[0].value) !== SCHEMA_VERSION) {
      const tables = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
      for (const t of tables) await db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
      rebuilt = true;
    }
  } catch {
    // No meta table yet: a fresh database.
  }
  await db.exec(SCHEMA);
  await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)", [String(SCHEMA_VERSION)]);
  return { rebuilt };
}
