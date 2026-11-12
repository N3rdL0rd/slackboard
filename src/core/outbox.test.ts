import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { openNodeDb } from "./nodeDb";
import { enqueue, flushOutbox, listOutbox, removeFromOutbox } from "./outbox";
import { ensureSchema } from "./schema";

let db: Db;
beforeEach(async () => { db = openNodeDb(); await ensureSchema(db); });
const session = { token: "t", userId: 7 };
const req = (n: number) => ({ path: `/x${n}`, fields: { n } });
const reply = (statuses: (number | "throw")[], seen: string[] = []) => {
  let i = 0;
  return (async (url: string) => {
    seen.push(url);
    const s = statuses[i++] ?? 200;
    if (s === "throw") throw new Error("offline");
    return new Response(JSON.stringify({}), { status: s });
  }) as unknown as typeof fetch;
};

describe("outbox", () => {
  it("keeps requests in order and removes ones that were sent", async () => {
    const a = await enqueue(db, req(1), "one");
    const b = await enqueue(db, req(2), "two");
    expect(b).toBeGreaterThan(a);
    const seen: string[] = [];
    const out = await flushOutbox(db, session, reply([200, 200], seen));
    expect(seen.map((u) => u.replace("https://tensionboardapp2.com", ""))).toEqual(["/x1", "/x2"]);
    expect(out.sent.map((s) => s.label)).toEqual(["one", "two"]);
    expect(out.remaining).toBe(0);
  });

  it("stops at a network failure and keeps the rest queued for next time", async () => {
    await enqueue(db, req(1), "one");
    await enqueue(db, req(2), "two");
    const first = await flushOutbox(db, session, reply([200, "throw"]));
    expect(first.sent).toHaveLength(1);
    expect(first.remaining).toBe(1);
    expect((await listOutbox(db)).map((r) => r.label)).toEqual(["two"]);
    expect((await flushOutbox(db, session, reply([200]))).remaining).toBe(0);
  });

  it("drops a request the server refuses and carries on with the next one", async () => {
    await enqueue(db, req(1), "bad");
    await enqueue(db, req(2), "good");
    const out = await flushOutbox(db, session, reply([422, 200]));
    expect(out.rejected.map((r) => [r.label, r.code])).toEqual([["bad", 422]]);
    expect(out.sent.map((s) => s.label)).toEqual(["good"]);
    expect(out.remaining).toBe(0);
  });

  it("treats server errors as retryable and can cancel a queued request", async () => {
    const id = await enqueue(db, req(1), "one");
    expect((await flushOutbox(db, session, reply([503]))).remaining).toBe(1);
    expect(await removeFromOutbox(db, id)).toBe(true);
    expect(await removeFromOutbox(db, id)).toBe(false);
  });

  it("applies the server's answer to the local database", async () => {
    await enqueue(db, { path: "/tags/save", fields: {} }, "tag");
    const f = (async () => new Response(JSON.stringify({ tags: [{ entity_uuid: "c1", user_id: 7, name: "~flag", is_listed: true }] }), { status: 200 })) as unknown as typeof fetch;
    await flushOutbox(db, session, f);
    expect(await db.all("SELECT entity_uuid FROM tags")).toEqual([{ entity_uuid: "C1" }]);
  });
});
