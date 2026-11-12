import { describe, expect, it } from "vitest";
import type { Db } from "./db";
import { clearLocalData, ensureLocalSchema } from "./logicalCircuits";
import { LOCAL_MIGRATIONS, LOCAL_SCHEMA_VERSION, localTables, migrateLocal, storedLocalVersion, type LocalMigration } from "./localMigrations";
import { openNodeDb } from "./nodeDb";

const tableNames = async (db: Db) => (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'l_%' ORDER BY name")).map((r) => r.name);
const count = async (db: Db, table: string) => (await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;

describe("local migrations", () => {
  it("builds every table on a fresh install and records the newest version", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    expect(await storedLocalVersion(db)).toBe(LOCAL_SCHEMA_VERSION);
    expect(await tableNames(db)).toEqual(expect.arrayContaining(localTables().map((t) => t.name)));
  });

  it("brings an existing database up to date without touching what it holds", async () => {
    const db = openNodeDb();
    // A phone that has been using the app since version 1, with a few records and the old unversioned bookkeeping row.
    await migrateLocal(db, [LOCAL_MIGRATIONS[0]]);
    await db.run("INSERT INTO l_outside_logs (id, setting, name, venue, link, wall, grade_system, grade_label, grade, result, attempts, tags, note, climbed_at) VALUES ('o1', 'gym', 'Warm up', '', '', 'vertical', 'v', 'V1', 1, 'send', 1, '', '', '2026-11-01 10:00:00')");
    await db.run("INSERT INTO l_lit_history (id, provider, climb_id, climb_name, board_id, board_name, angle, lit_at) VALUES ('t1', 'tension', 'C', 'Pizza', 'b', 'Home', 40, '2026-11-01 11:00:00')");

    const later: LocalMigration = {
      version: 2, tables: [{ name: "l_example", clearable: true, backup: "none" }],
      up: (d) => d.exec("CREATE TABLE l_example (id TEXT PRIMARY KEY, note TEXT NOT NULL)"),
    };
    expect(await migrateLocal(db, [LOCAL_MIGRATIONS[0], later])).toBe(2);
    expect(await count(db, "l_outside_logs")).toBe(1);
    expect(await count(db, "l_lit_history")).toBe(1);
    expect(await tableNames(db)).toContain("l_example");
    expect(await storedLocalVersion(db)).toBe(2);
  });

  it("runs each migration once: running again changes nothing", async () => {
    const db = openNodeDb();
    let runs = 0;
    const counting: LocalMigration = { version: 2, tables: [], up: async (d) => { runs++; await d.exec("CREATE TABLE l_counted (id TEXT)"); } };
    await migrateLocal(db, [LOCAL_MIGRATIONS[0], counting]);
    await migrateLocal(db, [LOCAL_MIGRATIONS[0], counting]);
    expect(runs).toBe(1);
  });

  it("runs migrations in version order whatever order they are listed in", async () => {
    const db = openNodeDb();
    const seen: number[] = [];
    const m = (version: number): LocalMigration => ({ version, tables: [], up: async () => { seen.push(version); } });
    await migrateLocal(db, [m(3), m(1), m(2)]);
    expect(seen).toEqual([1, 2, 3]);
  });

  it("keeps the old version and the old data when a migration fails, and tries it again next time", async () => {
    const db = openNodeDb();
    await migrateLocal(db, [LOCAL_MIGRATIONS[0]]);
    let fail = true;
    const flaky: LocalMigration = {
      version: 2, tables: [],
      up: async (d) => { await d.exec("CREATE TABLE l_half_done (id TEXT)"); if (fail) throw new Error("boom"); },
    };
    await expect(migrateLocal(db, [LOCAL_MIGRATIONS[0], flaky])).rejects.toThrow("boom");
    expect(await storedLocalVersion(db)).toBe(1);
    expect(await tableNames(db)).not.toContain("l_half_done");
    fail = false;
    expect(await migrateLocal(db, [LOCAL_MIGRATIONS[0], flaky])).toBe(2);
    expect(await tableNames(db)).toContain("l_half_done");
  });

  it("leaves a database that is newer than this build exactly as it is", async () => {
    const db = openNodeDb();
    await migrateLocal(db, [LOCAL_MIGRATIONS[0]]);
    await db.run("INSERT OR REPLACE INTO l_meta (key, value) VALUES ('schema_version', '9')");
    expect(await migrateLocal(db)).toBe(9);
    expect(await storedLocalVersion(db)).toBe(9);
  });
});

describe("removing the user's data", () => {
  it("empties the tables marked clearable and keeps the rest", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    await db.run("INSERT INTO l_circuits (uuid, name, description, color, user_id, created_at, updated_at) VALUES ('c', 'n', '', '00FF00', 1, 't', 't')");
    await db.run("INSERT INTO l_outside_logs (id, setting, name, venue, link, wall, grade_system, grade_label, grade, result, attempts, tags, note, climbed_at) VALUES ('o1', 'gym', 'x', '', '', 'vertical', 'v', 'V1', 1, 'send', 1, '', '', '2026-11-01 10:00:00')");
    await clearLocalData(db);
    expect(await count(db, "l_circuits")).toBe(0);
    expect(await count(db, "l_outside_logs")).toBe(1);
  });
});
