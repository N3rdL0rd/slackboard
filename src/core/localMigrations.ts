/**
 * The phone's own data (`slackboard-local.db`) lives in `l_*` tables. This is the one place the user's own records are kept, so it is
 * never dropped by a version change: a new table or column is added by appending a migration here, and each migration runs once, in order,
 * in its own transaction. Version 1 is the schema the app shipped with.
 */
import type { Db } from "./db";

/**
 * The key of the full backup file that carries a table's records, or `"none"` for a table that is not backed up (with the reason in a
 * comment next to it). A test checks every table names a section the backup really has, so a new table cannot be forgotten.
 */
export type BackupSection = "circuits" | "offBoard" | "roped" | "dayNotes" | "litHistory" | "spaces" | "none";

/** A table in the local database. `clearable` tables are emptied when the user removes their data (signs out everywhere). */
export interface LocalTable {
  name: string;
  clearable: boolean;
  backup: BackupSection;
}

export interface LocalMigration {
  version: number;
  /** Tables this migration creates, so the rest of the app can list them (clearing, backup checks) without a second copy. */
  tables: LocalTable[];
  up(db: Db): Promise<void>;
}

const V1 = `
CREATE TABLE IF NOT EXISTS l_meta (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_circuits (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, color TEXT NOT NULL, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_circuit_items (circuit_uuid TEXT NOT NULL, position INTEGER NOT NULL, provider TEXT NOT NULL, climb_id TEXT NOT NULL, PRIMARY KEY (circuit_uuid, provider, climb_id));
CREATE TABLE IF NOT EXISTS l_projections (circuit_uuid TEXT NOT NULL, provider TEXT NOT NULL, remote_uuid TEXT NOT NULL, is_public INTEGER NOT NULL, remote_hash TEXT NOT NULL, remote_items TEXT NOT NULL, PRIMARY KEY (circuit_uuid, provider));
CREATE TABLE IF NOT EXISTS l_local_logs (id TEXT PRIMARY KEY, provider TEXT NOT NULL, climb_id TEXT NOT NULL, climb_name TEXT NOT NULL, angle INTEGER NOT NULL, is_mirror INTEGER NOT NULL, bid_count INTEGER NOT NULL, quality INTEGER NOT NULL, difficulty REAL NOT NULL, comment TEXT NOT NULL, climbed_at TEXT NOT NULL, is_send INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS l_board_places (board_id TEXT PRIMARY KEY, gym_name TEXT, lat REAL, lon REAL, added_at TEXT NOT NULL, manual_space_id TEXT);
CREATE TABLE IF NOT EXISTS l_space_names (space_id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_space_lineage (old_space_id TEXT PRIMARY KEY, new_space_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_log_spaces (entry_id TEXT PRIMARY KEY, space_id TEXT NOT NULL, board_id TEXT NOT NULL, space_name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_outside_logs (id TEXT PRIMARY KEY, setting TEXT NOT NULL, name TEXT NOT NULL, venue TEXT NOT NULL, link TEXT NOT NULL, wall TEXT NOT NULL, grade_system TEXT, grade_label TEXT, grade REAL, result TEXT NOT NULL, attempts INTEGER NOT NULL, tags TEXT NOT NULL, note TEXT NOT NULL, climbed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_lit_history (id TEXT PRIMARY KEY, provider TEXT NOT NULL, climb_id TEXT NOT NULL, climb_name TEXT NOT NULL, board_id TEXT NOT NULL, board_name TEXT NOT NULL, angle INTEGER NOT NULL, lit_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS l_lit_history_at ON l_lit_history (lit_at);
`;

const V2 = `
CREATE TABLE IF NOT EXISTS l_roped_logs (id TEXT PRIMARY KEY, style TEXT NOT NULL, setting TEXT NOT NULL, name TEXT NOT NULL, venue TEXT NOT NULL, link TEXT NOT NULL, grade_system TEXT NOT NULL, grade_label TEXT NOT NULL, grade_value INTEGER NOT NULL, result TEXT NOT NULL, attempts INTEGER NOT NULL, length_m REAL, pitches INTEGER NOT NULL, note TEXT NOT NULL, climbed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS l_roped_logs_at ON l_roped_logs (climbed_at);
`;

const V3 = `
CREATE TABLE IF NOT EXISTS l_day_notes (day TEXT PRIMARY KEY, effort INTEGER, energy INTEGER, fingers TEXT NOT NULL, elbows TEXT NOT NULL, shoulders TEXT NOT NULL, other TEXT NOT NULL, note TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS l_nudge_state (key TEXT PRIMARY KEY, shown_at TEXT, snoozed_until TEXT, dismissed INTEGER NOT NULL DEFAULT 0);
`;

export const LOCAL_MIGRATIONS: LocalMigration[] = [
  {
    version: 1,
    tables: [
      { name: "l_circuits", clearable: true, backup: "circuits" },
      { name: "l_circuit_items", clearable: true, backup: "circuits" },
      { name: "l_projections", clearable: true, backup: "circuits" },
      // Nothing writes this any more: logs of a MoonBoard now live in its own database and travel in the backup's logbook.
      { name: "l_local_logs", clearable: true, backup: "none" },
      { name: "l_board_places", clearable: true, backup: "spaces" },
      { name: "l_space_names", clearable: true, backup: "spaces" },
      { name: "l_space_lineage", clearable: true, backup: "spaces" },
      { name: "l_log_spaces", clearable: true, backup: "spaces" },
      { name: "l_outside_logs", clearable: false, backup: "offBoard" },
      { name: "l_lit_history", clearable: false, backup: "litHistory" },
    ],
    up: (db) => db.exec(V1),
  },
  {
    version: 2,
    tables: [
      // Roped climbs are the user's own record, kept like off-board climbs: not tied to an account, so signing out keeps them.
      { name: "l_roped_logs", clearable: false, backup: "roped" },
    ],
    up: (db) => db.exec(V2),
  },
  {
    version: 3,
    tables: [
      // A day's body check-in is the user's own record, like the logs: kept when signing out and carried in the backup.
      { name: "l_day_notes", clearable: false, backup: "dayNotes" },
      // Which line was snoozed or hidden today. It only means something for a day or two, so it is not worth carrying in a backup.
      { name: "l_nudge_state", clearable: true, backup: "none" },
    ],
    up: (db) => db.exec(V3),
  },
];

export const LOCAL_SCHEMA_VERSION = LOCAL_MIGRATIONS[LOCAL_MIGRATIONS.length - 1].version;

/** Every table the migrations create (not counting the `l_meta` bookkeeping table), in creation order. */
export const localTables = (migrations: LocalMigration[] = LOCAL_MIGRATIONS): LocalTable[] => migrations.flatMap((m) => m.tables);

export async function storedLocalVersion(db: Db): Promise<number> {
  const row = (await db.all<{ value: string }>("SELECT value FROM l_meta WHERE key = 'schema_version'"))[0];
  const n = row ? Number(row.value) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * Brings the database up to the newest version. A fresh install runs every migration; an existing one runs only what it has not seen.
 * Each migration and its version number are saved together, so a migration that fails changes nothing and is tried again next time.
 * A database that is already newer than this build (an older app installed over a newer one) is left exactly as it is: migrations only
 * ever add, so the newer data stays and the older code ignores it.
 */
export async function migrateLocal(db: Db, migrations: LocalMigration[] = LOCAL_MIGRATIONS): Promise<number> {
  await db.exec("CREATE TABLE IF NOT EXISTS l_meta (key TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL)");
  let version = await storedLocalVersion(db);
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= version) continue;
    await db.transaction(async () => {
      await m.up(db);
      await db.run("INSERT OR REPLACE INTO l_meta (key, value) VALUES ('schema_version', ?)", [String(m.version)]);
    });
    version = m.version;
  }
  return version;
}
