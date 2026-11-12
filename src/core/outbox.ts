import { submit, type Req, type Session } from "./api";
import type { Db } from "./db";
import { applySync } from "./sync";

/**
 * Changes made on the device are written here first and sent in order. If the network is down, or the
 * server answers with an error worth retrying, they stay queued and go out on the next sync or when the
 * app comes back to the foreground. A request the server rejects outright is dropped and reported.
 */
export interface OutboxRow {
  id: number;
  req: Req;
  label: string;
  createdAt: string;
}

export async function enqueue(db: Db, req: Req, label: string): Promise<number> {
  await db.run("INSERT INTO outbox (req, label, created_at) VALUES (?, ?, ?)", [JSON.stringify(req), label, new Date().toISOString()]);
  return (await db.all<{ id: number }>("SELECT last_insert_rowid() AS id"))[0].id;
}

export async function listOutbox(db: Db): Promise<OutboxRow[]> {
  return (await db.all<{ id: number; req: string; label: string; created_at: string }>("SELECT id, req, label, created_at FROM outbox ORDER BY id")).map((r) => ({
    id: r.id, req: JSON.parse(r.req) as Req, label: r.label, createdAt: r.created_at,
  }));
}

export async function removeFromOutbox(db: Db, id: number): Promise<boolean> {
  const before = (await db.all("SELECT 1 FROM outbox WHERE id = ?", [id])).length;
  await db.run("DELETE FROM outbox WHERE id = ?", [id]);
  return before > 0;
}

export interface FlushResult {
  /** Requests the server accepted, with its answer. */
  sent: { id: number; label: string; req: Req; body: Record<string, unknown> }[];
  /** Requests the server refused; they are dropped from the queue. */
  rejected: { id: number; label: string; code: number; errors?: Record<string, string[]> }[];
  /** Still queued. */
  remaining: number;
}

let running: Promise<FlushResult> | null = null;

/** Sends everything queued, oldest first, stopping at the first failure that is worth retrying. One flush at a time. */
export function flushOutbox(db: Db, session: Session, fetchImpl: typeof fetch = fetch, host?: string): Promise<FlushResult> {
  running ??= (async () => {
    const result: FlushResult = { sent: [], rejected: [], remaining: 0 };
    try {
      for (const row of await listOutbox(db)) {
        const res = await submit(session, row.req, fetchImpl, host);
        if (res.status === "retry") break;
        if (res.status === "ok") {
          await applySync(db, res.body);
          result.sent.push({ id: row.id, label: row.label, req: row.req, body: res.body });
        } else {
          result.rejected.push({ id: row.id, label: row.label, code: res.code, errors: res.errors });
        }
        await removeFromOutbox(db, row.id);
      }
      result.remaining = (await listOutbox(db)).length;
      return result;
    } finally {
      running = null;
    }
  })();
  return running;
}
