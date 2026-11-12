import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "./db";
import { openNodeDb } from "./nodeDb";
import { ensureSchema } from "./schema";
import { applySync, buildSyncBody, EPOCH, syncAll, SyncError } from "./sync";

let db: Db;
beforeEach(async () => {
  db = openNodeDb();
  await ensureSchema(db);
});

const climb = (over: Record<string, unknown> = {}) => ({
  uuid: "abc123", layout_id: 10, setter_id: 1, setter_username: "s", name: "N", description: "", hsm: 3, edge_left: -8, edge_right: 8,
  edge_bottom: 4, edge_top: 40, angle: null, frames_count: 1, frames_pace: 0, frames: "p1r5", is_draft: false, is_listed: true, created_at: "2022", is_nomatch: false, ...over,
});

describe("applySync", () => {
  it("stores climbs with upper-cased ids and skips incomplete rows", async () => {
    await applySync(db, { climbs: [climb(), climb({ uuid: "bad", name: null })] });
    expect(await db.all("SELECT uuid, is_nomatch FROM climbs")).toEqual([{ uuid: "ABC123", is_nomatch: 0 }]);
  });

  it("computes display difficulty from benchmark, else average, and deletes tombstoned stats", async () => {
    const stat = (over = {}) => ({ climb_uuid: "abc123", angle: 40, ascensionist_count: 5, difficulty_average: 16.2, quality_average: 2.5, fa_username: "x", fa_at: "2020", benchmark_difficulty: null, ...over });
    await applySync(db, { climb_stats: [stat(), stat({ angle: 45, benchmark_difficulty: 17 })] });
    expect(await db.all("SELECT angle, display_difficulty FROM climb_stats ORDER BY angle")).toEqual([
      { angle: 40, display_difficulty: 16.2 }, { angle: 45, display_difficulty: 17 },
    ]);
    await applySync(db, { climb_stats: [{ climb_uuid: "ABC123", angle: 40, ascensionist_count: null, difficulty_average: null, quality_average: null, fa_username: null, fa_at: null }] });
    expect(await db.all("SELECT angle FROM climb_stats")).toEqual([{ angle: 45 }]);
  });

  it("removes ascents, bids and walls marked unlisted", async () => {
    const ascent = { uuid: "a1", climb_uuid: "c", angle: 40, is_mirror: false, user_id: 1, attempt_id: 0, bid_count: 1, quality: 3, difficulty: 17, comment: "", climbed_at: "2026-01-01 00:00:00", created_at: "x", is_listed: true };
    await applySync(db, { ascents: [ascent], bids: [{ uuid: "b1", user_id: 1, climb_uuid: "c", angle: 40, is_mirror: false, climbed_at: "t", created_at: "t" }] });
    expect(await db.all("SELECT uuid FROM ascents")).toHaveLength(1);
    await applySync(db, { ascents: [{ ...ascent, is_listed: false }], bids: [{ uuid: "b1", is_listed: false }] });
    expect(await db.all("SELECT uuid FROM ascents")).toHaveLength(0);
    expect(await db.all("SELECT uuid FROM bids")).toHaveLength(0);

    const wall = { uuid: "w1", user_id: 1, name: "Home", product_id: 5, is_adjustable: true, angle: 40, layout_id: 10, product_size_id: 6, hsm: 3, set_ids: [12, 13], is_listed: true };
    await applySync(db, { walls: [wall] });
    expect(await db.all("SELECT set_id FROM walls_sets ORDER BY set_id")).toEqual([{ set_id: 12 }, { set_id: 13 }]);
    await applySync(db, { walls: [{ ...wall, is_listed: false }] });
    expect(await db.all("SELECT uuid FROM walls")).toHaveLength(0);
    expect(await db.all("SELECT set_id FROM walls_sets")).toHaveLength(0);
  });

  it("applies circuit events", async () => {
    await applySync(db, { circuits: [{ uuid: "c1", name: "n", description: "", color: "FF0000", user_id: 1, is_public: true, created_at: "t", updated_at: "t", climbs: [{ uuid: "x", position: 0 }] }] });
    await applySync(db, { events: [{ _type: "climb_added_to_circuit", circuit_uuid: "c1", climb_uuid: "y", position: 1 }, { _type: "climb_removed_from_circuit", circuit_uuid: "c1", climb_uuid: "x" }] });
    expect(await db.all("SELECT climb_uuid FROM circuits_climbs")).toEqual([{ climb_uuid: "Y" }]);
  });

  it("moves cursors only when the whole page applied", async () => {
    await expect(applySync(db, {
      products: [{ id: 1, name: "P", is_listed: true }],
      holes: [{ id: 1, product_id: 1, name: null, x: 0, y: 0 }], // violates NOT NULL, so the page must roll back
      shared_syncs: [{ table_name: "products", last_synchronized_at: "T1" }],
    })).rejects.toThrow();
    expect(await db.all("SELECT * FROM products")).toEqual([]);
    expect(await db.all("SELECT * FROM shared_syncs")).toEqual([]);
  });
});

describe("syncAll", () => {
  const session = { token: "tok", userId: 7 };
  const page = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("requests the epoch first, then the cursors the server returned, until complete", async () => {
    const bodies: string[] = [];
    let n = 0;
    const f = (async (_u: string, init: RequestInit) => {
      bodies.push(String(init.body));
      expect((init.headers as Record<string, string>).Cookie).toBe("token=tok");
      return n++ === 0
        ? page({ climbs: [climb()], shared_syncs: [{ table_name: "climbs", last_synchronized_at: "C1" }], user_syncs: [{ user_id: 7, table_name: "ascents", last_synchronized_at: "A1" }], _complete: false })
        : page({ _complete: true });
    }) as unknown as typeof fetch;
    const progress: number[] = [];
    const out = await syncAll(db, session, { fetch: f, onProgress: (p) => progress.push(p.page) });
    expect(out.totals.climbs).toBe(1);
    expect(progress).toEqual([1, 2]);
    const second = new URLSearchParams(bodies[1]);
    expect(second.get("climbs")).toBe("C1");
    expect(second.get("ascents")).toBe("A1");
    expect(second.get("holes")).toBe(EPOCH);
    expect(new URLSearchParams(bodies[0]).get("climbs")).toBe(EPOCH);
  });

  it("treats a missing _complete as complete, and 404/401 as an expired session", async () => {
    expect((await syncAll(db, session, { fetch: (async () => page({})) as unknown as typeof fetch })).page).toBe(1);
    for (const status of [404, 401]) {
      await expect(syncAll(db, session, { fetch: (async () => page({}, status)) as unknown as typeof fetch })).rejects.toMatchObject({ message: "Session expired", status });
    }
    await expect(syncAll(db, session, { fetch: (async () => { throw new Error("offline"); }) as unknown as typeof fetch })).rejects.toBeInstanceOf(SyncError);
  });

  it("scopes user cursors to the signed-in user", async () => {
    await applySync(db, { user_syncs: [{ user_id: 1, table_name: "ascents", last_synchronized_at: "other" }, { user_id: 7, table_name: "ascents", last_synchronized_at: "mine" }] });
    expect(new URLSearchParams(await buildSyncBody(db, 7)).get("ascents")).toBe("mine");
    expect(new URLSearchParams(await buildSyncBody(db, 2)).get("ascents")).toBe(EPOCH);
  });

  it("resumes an aborted first sync with the same final totals and database", async () => {
    const uninterrupted = openNodeDb();
    await ensureSchema(uninterrupted);
    const stat = { climb_uuid: "abc123", angle: 40, ascensionist_count: 5, difficulty_average: 16.2, quality_average: 2.5, fa_username: "x", fa_at: "2020", benchmark_difficulty: null };
    const pages = [
      { climbs: [climb()], shared_syncs: [{ table_name: "climbs", last_synchronized_at: "C1" }], _complete: false },
      { climb_stats: [stat], shared_syncs: [{ table_name: "climb_stats", last_synchronized_at: "C2" }], _complete: false },
      { _complete: true },
    ];
    const fetching = () => {
      let next = 0;
      return (async () => page(pages[next++])) as unknown as typeof fetch;
    };
    const signal = { aborted: false };
    let firstBody = "";
    await expect(syncAll(db, session, {
      fetch: (async (_url: string, init: RequestInit) => { firstBody = String(init.body); return page(pages[0]); }) as unknown as typeof fetch,
      signal, onProgress: () => { signal.aborted = true; },
    })).rejects.toThrow("Sync cancelled");

    const resumedBodies: string[] = [];
    let next = 1;
    const resumed = await syncAll(db, session, {
      fetch: (async (_url: string, init: RequestInit) => {
        resumedBodies.push(String(init.body));
        return page(pages[next++]);
      }) as unknown as typeof fetch,
    });
    const complete = await syncAll(uninterrupted, session, { fetch: fetching() });
    expect(resumed.totals).toEqual({ climb_stats: 1 });
    expect({ climbs: 1, ...resumed.totals }).toEqual(complete.totals);
    expect(resumed.page + 1).toBe(complete.page);
    expect(new URLSearchParams(resumedBodies[0]).get("climbs")).toBe("C1");
    expect(new URLSearchParams(firstBody).get("climbs")).toBe(EPOCH);
    for (const table of ["climbs", "climb_stats", "shared_syncs", "user_syncs"]) {
      expect(await db.all(`SELECT * FROM ${table}`)).toEqual(await uninterrupted.all(`SELECT * FROM ${table}`));
    }
  });

  it("returns cleanly at the deadline without starting another request", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1000).mockReturnValue(1100);
    try {
      let calls = 0;
      const out = await syncAll(db, session, {
        deadlineMs: 100,
        fetch: (async () => {
          calls++;
          return page({ climbs: [climb()], shared_syncs: [{ table_name: "climbs", last_synchronized_at: "C1" }], _complete: false });
        }) as unknown as typeof fetch,
      });
      expect(out).toEqual({ page: 1, totals: { climbs: 1 }, more: true });
      expect(calls).toBe(1);
      expect(await db.all("SELECT last_synchronized_at FROM shared_syncs WHERE table_name = 'climbs'")).toEqual([{ last_synchronized_at: "C1" }]);
    } finally {
      clock.mockRestore();
    }
  });

  it("can stop at the deadline before the first request", async () => {
    const f = vi.fn();
    await expect(syncAll(db, session, { deadlineMs: 0, fetch: f })).resolves.toEqual({ page: 0, totals: {}, more: true });
    expect(f).not.toHaveBeenCalled();
  });

  it("aborts an in-flight request at the deadline and leaves it resumable", async () => {
    let calls = 0;
    const f = ((_url: string, init: RequestInit) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      calls++;
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      return promise;
    }) as unknown as typeof fetch;
    await expect(syncAll(db, session, { fetch: f, deadlineMs: 5 })).resolves.toEqual({ page: 0, totals: {}, more: true });
    expect(calls).toBe(1);
    await expect(syncAll(db, session, { fetch: (async () => page({})) as unknown as typeof fetch })).resolves.toMatchObject({ more: false });
  });
});
