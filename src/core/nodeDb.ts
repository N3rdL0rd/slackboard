/** node:sqlite adapter for tests and the live-sync script. Never imported by the app bundle. */
import { DatabaseSync } from "node:sqlite";
import type { Db, SqlValue } from "./db";

export function openNodeDb(path = ":memory:"): Db {
  const raw = new DatabaseSync(path);
  let depth = 0;
  return {
    async exec(sql) { raw.exec(sql); },
    async run(sql, params = []) { raw.prepare(sql).run(...params); },
    async all<T>(sql: string, params: SqlValue[] = []) { return raw.prepare(sql).all(...params) as T[]; },
    async batch(sql, rows) {
      const st = raw.prepare(sql);
      for (const r of rows) st.run(...r);
    },
    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      if (depth++ > 0) return fn().finally(() => { depth--; });
      raw.exec("BEGIN");
      try {
        const out = await fn();
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      } finally {
        depth--;
      }
    },
  };
}
