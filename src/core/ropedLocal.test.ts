import { describe, expect, it } from "vitest";
import { clearLocalData, ensureLocalSchema } from "./logicalCircuits";
import { LOCAL_MIGRATIONS, LOCAL_SCHEMA_VERSION, localTables, migrateLocal, storedLocalVersion } from "./localMigrations";
import { openNodeDb } from "./nodeDb";
import type { RopedLog } from "./roped";
import { deleteRoped, loadRoped, saveRoped } from "./ropedLocal";

const log = (id: string, over: Partial<RopedLog> = {}): RopedLog => ({
  id, style: "sport", setting: "outdoor", name: "Slab Happy", venue: "Index", link: "https://thecrag.com/r", gradeSystem: "french", gradeLabel: "6a+", grade: 13,
  result: "redpoint", attempts: 3, lengthM: 24.5, pitches: 2, note: "good", climbedAt: "2026-11-04 18:00:00", ...over,
});

describe("roped storage", () => {
  it("saves, reads back exactly, replaces by id, and deletes", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    await saveRoped(db, log("a"));
    await saveRoped(db, log("b", { climbedAt: "2026-11-05 09:00:00", lengthM: null, name: "" }));
    expect((await loadRoped(db)).map((l) => l.id)).toEqual(["b", "a"]);
    expect((await loadRoped(db))[1]).toEqual(log("a"));
    await saveRoped(db, log("a", { result: "onsight", attempts: 1 }));
    expect(await loadRoped(db)).toHaveLength(2);
    expect((await loadRoped(db)).find((l) => l.id === "a")).toMatchObject({ result: "onsight", attempts: 1 });
    await deleteRoped(db, "a");
    expect((await loadRoped(db)).map((l) => l.id)).toEqual(["b"]);
    await deleteRoped(db, "missing");
  });

  it("is added to a phone that already has the first version, keeping what it holds", async () => {
    const db = openNodeDb();
    await migrateLocal(db, [LOCAL_MIGRATIONS[0]]);
    await db.run("INSERT INTO l_lit_history (id, provider, climb_id, climb_name, board_id, board_name, angle, lit_at) VALUES ('t1', 'tension', 'C', 'Pizza', 'b', 'Home', 40, '2026-11-01 10:00:00')");
    expect(await storedLocalVersion(db)).toBe(1);
    await ensureLocalSchema(db);
    expect(await storedLocalVersion(db)).toBe(LOCAL_SCHEMA_VERSION);
    await saveRoped(db, log("a"));
    expect(await loadRoped(db)).toHaveLength(1);
    expect((await db.all("SELECT * FROM l_lit_history")).length).toBe(1);
  });

  it("survives signing out: the roped log is the user's own, not an account's", async () => {
    const db = openNodeDb();
    await ensureLocalSchema(db);
    await saveRoped(db, log("a"));
    await clearLocalData(db);
    expect(await loadRoped(db)).toHaveLength(1);
    expect(localTables().find((t) => t.name === "l_roped_logs")).toMatchObject({ clearable: false, backup: "roped" });
  });
});
