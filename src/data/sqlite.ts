import * as SQLite from "expo-sqlite";
import type { Db, SqlValue } from "../core/db";
import { dbName } from "../core/accounts";
import { ensureLocalSchema } from "../core/logicalCircuits";
import { ensureSchema } from "../core/schema";
import { DEFAULT_PROVIDER } from "../providers";

/** expo-sqlite behind the core's Db interface. */
export function wrap(raw: SQLite.SQLiteDatabase): Db {
  return {
    exec: (sql) => raw.execAsync(sql),
    run: async (sql, params = []) => { await raw.runAsync(sql, params); },
    all: <T,>(sql: string, params: SqlValue[] = []) => raw.getAllAsync<T & object>(sql, params) as Promise<T[]>,
    async batch(sql, rows) {
      const st = await raw.prepareAsync(sql);
      try {
        for (const r of rows) await st.executeAsync(r);
      } finally {
        await st.finalizeAsync();
      }
    },
    transaction: async <T,>(fn: () => Promise<T>) => {
      let out!: T;
      await raw.withTransactionAsync(async () => { out = await fn(); });
      return out;
    },
  };
}

const opening = new Map<string, Promise<Db>>();
let resolveProvider: () => string = () => DEFAULT_PROVIDER.id;
/** The app registers how to find the active provider (state/active.ts); this layer does not import state. */
export function setProviderResolver(fn: () => string): void { resolveProvider = fn; }

/**
 * A provider's synced mirror, opened once and kept. Each provider has its own file because ids (products, layouts, hold sets)
 * are only unique within a provider. Without an argument it is the active provider's.
 */
export function getDb(provider: string = resolveProvider()): Promise<Db> {
  const name = dbName(provider, DEFAULT_PROVIDER.id);
  if (!opening.has(name)) {
    opening.set(name, (async () => {
      const raw = await SQLite.openDatabaseAsync(name);
      await raw.execAsync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
      const db = wrap(raw);
      await ensureSchema(db);
      return db;
    })());
  }
  return opening.get(name)!;
}

/** Forgets everything tied to the signed-in user; the shared climb database stays. */
export async function clearUserData(db: Db) {
  for (const t of ["users", "user_permissions", "user_syncs", "walls", "walls_sets", "ascents", "bids", "tags", "circuits", "circuits_climbs"]) {
    await db.exec(`DELETE FROM ${t}`);
  }
}

let openingLocal: Promise<Db> | null = null;

/**
 * The device's own data: circuits that span providers, and anything no provider's server holds. A separate file from the
 * synced mirror because the mirror is rebuilt freely (schema changes, re-syncs) and this must never be.
 */
export function getLocalDb(): Promise<Db> {
  openingLocal ??= (async () => {
    const raw = await SQLite.openDatabaseAsync("slackboard-local.db");
    await raw.execAsync("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    const db = wrap(raw);
    await ensureLocalSchema(db);
    return db;
  })();
  return openingLocal;
}
