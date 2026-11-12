/**
 * Minimal async SQLite surface the core needs. The app implements it with expo-sqlite; tests and the
 * live-sync script implement it with node:sqlite. Keeping it this small keeps core free of native modules.
 */
export type SqlValue = string | number | null;

export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs one statement once per parameter row, inside the current transaction, with a single prepared statement. */
  batch(sql: string, rows: SqlValue[][]): Promise<void>;
  /** All-or-nothing: if fn throws, nothing it did is kept. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

export async function one<T>(db: Db, sql: string, params: SqlValue[] = []): Promise<T | undefined> {
  return (await db.all<T>(sql, params))[0];
}
