import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { openNodeDb } from "./nodeDb";
import { boardSpecFor, listBoards, loadBoardData, loadLogbook, loadStatsAt, loadTags } from "./repo";
import { ensureSchema } from "./schema";
import { applySync } from "./sync";

let db: Db;
beforeEach(async () => {
  db = openNodeDb();
  await ensureSchema(db);
  await applySync(db, {
    products: [{ id: 5, name: "TB2", is_listed: true }],
    layouts: [{ id: 10, product_id: 5, name: "TB2 Mirror", is_mirrored: true, is_listed: true, created_at: "t" }],
    product_sizes: [{ id: 6, product_id: 5, edge_left: -20, edge_right: 20, edge_bottom: 0, edge_top: 40, name: "Small", is_listed: true }],
    sets: [{ id: 12, name: "Wood", hsm: 1 }, { id: 13, name: "Plastic", hsm: 2 }, { id: 14, name: "Expansion", hsm: 4 }],
    products_angles: [{ product_id: 5, angle: 20 }, { product_id: 5, angle: 40 }],
    placement_roles: [{ id: 5, product_id: 5, position: 1, name: "start", full_name: "Start", led_color: "00FF00", screen_color: "00DD00" }],
    // Two mirrored holes (ids 1,2) with LEDs, plus one hole of a set the board doesn't have.
    holes: [{ id: 1, product_id: 5, name: "a", x: -8, y: 8, mirrored_hole_id: 2 }, { id: 2, product_id: 5, name: "b", x: 8, y: 8, mirrored_hole_id: 1 }, { id: 3, product_id: 5, name: "c", x: 0, y: 20, mirrored_hole_id: 3 }],
    leds: [{ id: 1, product_size_id: 6, hole_id: 1, position: 10 }, { id: 2, product_size_id: 6, hole_id: 2, position: 11 }, { id: 3, product_size_id: 6, hole_id: 3, position: 12 }],
    placements: [{ id: 100, layout_id: 10, hole_id: 1, set_id: 12 }, { id: 101, layout_id: 10, hole_id: 2, set_id: 12 }, { id: 102, layout_id: 10, hole_id: 3, set_id: 14 }],
    product_sizes_layouts_sets: [{ id: 1, product_size_id: 6, layout_id: 10, set_id: 12, image_filename: "a/1.png", is_listed: true }, { id: 2, product_size_id: 6, layout_id: 10, set_id: 14, image_filename: "a/2.png", is_listed: true }],
    climbs: [
      { uuid: "ok", layout_id: 10, setter_id: 1, setter_username: "s", name: "Fits", description: "", hsm: 1, edge_left: -8, edge_right: 8, edge_bottom: 4, edge_top: 30, frames_count: 1, frames_pace: 0, frames: "p100r5", is_draft: false, is_listed: true, created_at: "t", is_nomatch: false },
      { uuid: "needs-expansion", layout_id: 10, setter_id: 1, setter_username: "s", name: "Needs set C", description: "", hsm: 4, edge_left: -8, edge_right: 8, edge_bottom: 4, edge_top: 30, frames_count: 1, frames_pace: 0, frames: "p102r5", is_draft: false, is_listed: true, created_at: "t", is_nomatch: false },
      { uuid: "too-wide", layout_id: 10, setter_id: 1, setter_username: "s", name: "Too wide", description: "", hsm: 1, edge_left: -30, edge_right: 8, edge_bottom: 4, edge_top: 30, frames_count: 1, frames_pace: 0, frames: "p100r5", is_draft: false, is_listed: true, created_at: "t", is_nomatch: false },
      { uuid: "route", layout_id: 10, setter_id: 1, setter_username: "s", name: "Route", description: "", hsm: 1, edge_left: -8, edge_right: 8, edge_bottom: 4, edge_top: 30, frames_count: 5, frames_pace: 1000, frames: "p100r5", is_draft: false, is_listed: true, created_at: "t", is_nomatch: false },
    ],
    climb_stats: [
      { climb_uuid: "ok", angle: 40, ascensionist_count: 3, difficulty_average: 17, quality_average: 2, fa_username: "x", fa_at: "t", benchmark_difficulty: null },
      { climb_uuid: "ok", angle: 20, ascensionist_count: 1, difficulty_average: 15, quality_average: 3, fa_username: "x", fa_at: "t", benchmark_difficulty: null },
    ],
    walls: [{ uuid: "w1", user_id: 7, name: "Home", product_id: 5, is_adjustable: true, angle: 40, layout_id: 10, product_size_id: 6, hsm: 3, set_ids: [12, 13], is_listed: true }],
  });
});

describe("repo", () => {
  it("builds a board from a synced wall, with its sets, angles and hold art", async () => {
    const [b] = await listBoards(db, 7, "tension");
    expect(b).toMatchObject({ id: "w1", name: "Home", angle: 40, isAdjustable: true });
    expect(b.spec.setNames).toEqual(["Wood", "Plastic"]);
    expect(b.spec.angles).toEqual([20, 40]);
    expect(b.spec.images).toEqual(["a/1.png"]);
    expect(await listBoards(db, 8, "tension")).toEqual([]);
  });

  it("shows only holes of the board's sets, with LED positions and mirror partners", async () => {
    const spec = (await boardSpecFor(db, { layout_id: 10, product_size_id: 6, product_id: 5, hsm: 3, setIds: [12, 13] }, "tension"))!;
    const { placements } = await loadBoardData(db, spec);
    expect(placements.map((p) => [p.id, p.led, p.mirror]).sort()).toEqual([[100, 10, 101], [101, 11, 100]]);
  });

  it("lists climbs the board has the sets for and that fit its edges, boulders and routes, not drafts", async () => {
    const spec = (await boardSpecFor(db, { layout_id: 10, product_size_id: 6, product_id: 5, hsm: 3, setIds: [12, 13] }, "tension"))!;
    expect((await loadBoardData(db, spec)).climbs.map((c) => c.name).sort()).toEqual(["Fits", "Route"]);
    const withExpansion = (await boardSpecFor(db, { layout_id: 10, product_size_id: 6, product_id: 5, hsm: 7, setIds: [12, 13, 14] }, "tension"))!;
    expect((await loadBoardData(db, withExpansion)).climbs.map((c) => c.name).sort()).toEqual(["Fits", "Needs set C", "Route"]);
  });

  it("loads stats per angle", async () => {
    expect([...(await loadStatsAt(db, 10, 40)).entries()]).toEqual([["OK", [17, null, 3, 2]]]);
    expect((await loadStatsAt(db, 10, 30)).size).toBe(0);
  });

  it("merges sends and attempts into one newest-first logbook, and reads like/block tags", async () => {
    await applySync(db, {
      ascents: [{ uuid: "a", climb_uuid: "ok", angle: 40, is_mirror: false, user_id: 7, attempt_id: 0, bid_count: 1, quality: 3, difficulty: 17, comment: "", climbed_at: "2026-01-02 10:00:00", created_at: "t" }],
      bids: [{ uuid: "b", user_id: 7, climb_uuid: "ok", angle: 40, is_mirror: true, bid_count: 3, climbed_at: "2026-01-03 10:00:00", created_at: "t" }],
      tags: [{ entity_uuid: "ok", user_id: 7, name: "~flag", is_listed: true }, { entity_uuid: "x", user_id: 7, name: "~block", is_listed: false }],
    });
    const log = await loadLogbook(db, 7, "tension");
    expect(log.map((e) => [e.id, e.isSend, e.climbName])).toEqual([["b", false, "Fits"], ["a", true, "Fits"]]);
    const tags = await loadTags(db, 7);
    expect([...tags.liked]).toEqual(["OK"]);
    expect(tags.blocked.size).toBe(0);
  });
});

describe("pending changes", () => {
  it("shows queued logs as pending and hides entries with a delete waiting", async () => {
    const { enqueue } = await import("./outbox");
    await applySync(db, { ascents: [{ uuid: "a", climb_uuid: "ok", angle: 40, is_mirror: false, user_id: 7, attempt_id: 0, bid_count: 1, quality: 3, difficulty: 17, comment: "", climbed_at: "2026-01-02 10:00:00", created_at: "t" }] });
    await enqueue(db, { path: "/ascents/save", fields: { climb_uuid: "ok", angle: 30, is_mirror: true, bid_count: 2, quality: 2, difficulty: 16, comment: "later", climbed_at: "2026-01-05 09:00:00.000000" } }, "send");
    let log = await loadLogbook(db, 7, "tension");
    expect(log.map((e) => [e.climbName, e.angle, e.pending ?? false])).toEqual([["Fits", 30, true], ["Fits", 40, false]]);
    await enqueue(db, { path: "/ascents/delete", fields: { uuid: "a" } }, "delete");
    log = await loadLogbook(db, 7, "tension");
    expect(log.map((e) => e.angle)).toEqual([30]);
  });
});

describe("climbs from other layouts", () => {
  it("builds a drawable view of a layout (all holes, largest size, all sets, its product's angles)", async () => {
    const { loadLayoutView, statsFor } = await import("./repo");
    const v = (await loadLayoutView(db, 10, "tension"))!;
    expect(v.placements.map((p) => p.id).sort()).toEqual([100, 101, 102]); // every set, not just the board's
    expect(v.spec).toMatchObject({ layoutName: "TB2 Mirror", sizeName: "Small", hsm: 1 | 4, isMirrored: true, angles: [20, 40] });
    expect(v.spec.images).toEqual(["a/1.png", "a/2.png"]);
    expect(v.roles.map((r) => r.name)).toEqual(["start"]);
    expect(await loadLayoutView(db, 999, "tension")).toBeNull();
    expect([...(await statsFor(db, ["ok", "missing"], 40)).keys()]).toEqual(["OK"]);
  });
});
