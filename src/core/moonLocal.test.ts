import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { encodeFrames, parseFrames } from "./frames";
import {
  climbCount, createBoard, deleteBoard, deleteLog, deleteOwnClimb, ensureSeeded, esrSetups, importProblems, LOCAL_SETTER, LOCAL_USER_ID, readEsr, renameBoard, saveLog,
  saveOwnClimb, seedSetup, setTag,
} from "./moonLocal";
import { encodeLegacy, holeIdOf, layoutIdOf, MOON_RULES, placementIdOf, productOf, positionOfLed, problemFromRecord, setupByKey, type MoonProblem } from "./moonboard";
import { openNodeDb } from "./nodeDb";
import { listBoards, loadBoardData, loadLogbook, loadStatsAt, loadTags, productLimits } from "./repo";
import { ensureSchema } from "./schema";

const mini = setupByKey("mini2020")!;
const full = setupByKey("2016")!;
let db: Db;
beforeEach(async () => {
  db = openNodeDb();
  await ensureSchema(db);
});

const problem = (name: string, grade: string, holds: [string, "start" | "middle" | "finish"][], extra: Partial<MoonProblem> = {}): MoonProblem => ({
  name, grade, setter: "Setter", method: "Any marked holds", benchmark: false, holds: holds.map(([position, role]) => ({ position, role })), ...extra,
});

describe("board and geometry", () => {
  it("shows the app's own queries a complete mini board with LEDs for every hole", async () => {
    const id = await createBoard(db, { name: "Garage", setup: mini, angle: 40 });
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    expect(board).toMatchObject({ id, name: "Garage", angle: 40, isAdjustable: false, serial: null });
    expect(board.spec).toMatchObject({ layoutName: "MoonBoard Mini 2020 \u00b7 40\u00b0", sizeName: "12 high x 11 wide", isMirrored: false, images: ["bundled:moonboard/mini2020"] });
    const data = await loadBoardData(db, board.spec);
    expect(data.placements).toHaveLength(132);
    expect(new Set(data.placements.map((p) => p.led)).size).toBe(132);
    expect(data.roles.map((r) => [r.name, r.led_color])).toEqual([["start", "00FF00"], ["middle", "0000FF"], ["finish", "FF0000"]]);
    // A hole's x/y and its LED agree with the reference mapping.
    for (const p of data.placements.slice(0, 40)) expect(positionOfLed(p.led, 12)).toEqual({ col: p.x - 1, row: p.y });
  });

  it("keeps the full-size and mini products apart, and setups and angles in their own layouts", async () => {
    await createBoard(db, { name: "Big", setup: full, angle: 25 });
    await createBoard(db, { name: "Small", setup: mini, angle: 40 });
    const boards = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const [bigData, smallData] = await Promise.all(boards.map((b) => loadBoardData(db, b.spec)));
    expect(bigData.placements).toHaveLength(198);
    expect(smallData.placements).toHaveLength(132);
    expect(boards[0].spec.layoutId).not.toBe(boards[1].spec.layoutId);
  });

  it("seeding again, or adding a second board on the same setup, changes nothing", async () => {
    await seedSetup(db, mini, 40);
    await seedSetup(db, mini, 40);
    await createBoard(db, { name: "A", setup: mini, angle: 40 });
    await createBoard(db, { name: "B", setup: mini, angle: 40 });
    const [a, b] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    expect(a.spec.layoutId).toBe(b.spec.layoutId);
    expect((await loadBoardData(db, a.spec)).placements).toHaveLength(132);
  });

  it("renames and deletes a board without touching its problems", async () => {
    const id = await createBoard(db, { name: "Old", setup: mini, angle: 40 });
    await importProblems(db, mini, 40, [problem("P", "6A", [["A2", "start"]])]);
    await renameBoard(db, id, "New");
    expect((await listBoards(db, LOCAL_USER_ID, "moonboard"))[0].name).toBe("New");
    await deleteBoard(db, id);
    expect(await listBoards(db, LOCAL_USER_ID, "moonboard")).toEqual([]);
    expect(await climbCount(db, mini, 40)).toBe(1);
  });
});

describe("importing problems", () => {
  it("makes climbs the board lists, with grades at the board's angle and drawable holds", async () => {
    await createBoard(db, { name: "Garage", setup: mini, angle: 40 });
    const counts = await importProblems(db, mini, 40, [
      problem("Easy", "6A+", [["A2", "start"], ["C6", "middle"], ["B12", "finish"]], { benchmark: true }),
      problem("Hard", "7B", [["K2", "start"], ["K12", "finish"]]),
      problem("Odd grade", "5+", [["D3", "start"]]),
      problem("Off grid", "6A", [["A18", "start"]]),
      problem("Empty", "6A", []),
    ]);
    expect(counts).toEqual({ added: 3, skipped: 2, ungraded: 1 });
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const data = await loadBoardData(db, board.spec);
    expect(data.climbs.map((c) => c.name).sort()).toEqual(["Easy", "Hard", "Odd grade"]);
    const easy = data.climbs.find((c) => c.name === "Easy")!;
    expect(easy).toMatchObject({ setter: "Setter", frameCount: 1, left: 1, right: 3, bottom: 2, top: 12, noMatch: false });
    const frame = parseFrames(easy.frames)[0];
    const ids = new Set(data.placements.map((p) => p.id));
    expect([...frame.keys()].every((id) => ids.has(id))).toBe(true);
    expect([...frame.values()].sort()).toEqual([21, 22, 23]);
    const stats = await loadStatsAt(db, board.spec.layoutId, 40);
    expect(stats.get(easy.uuid)).toEqual([17, 17, 0, 0]);
    expect(stats.get(data.climbs.find((c) => c.name === "Hard")!.uuid)![0]).toBe(24);
    expect(stats.has(data.climbs.find((c) => c.name === "Odd grade")!.uuid)).toBe(false);
  });

  it("replaces a problem it has already seen instead of duplicating it", async () => {
    await createBoard(db, { name: "G", setup: mini, angle: 40 });
    const p = problem("Same", "6A", [["A2", "start"], ["B3", "finish"]]);
    await importProblems(db, mini, 40, [p]);
    await importProblems(db, mini, 40, [{ ...p, grade: "6C" }]);
    expect(await climbCount(db, mini, 40)).toBe(1);
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    expect([...(await loadStatsAt(db, board.spec.layoutId, 40)).values()][0][0]).toBe(20);
  });

  it("keeps the 25 degree and 40 degree lists apart", async () => {
    await importProblems(db, full, 25, [problem("A", "6A", [["A2", "start"]])]);
    await importProblems(db, full, 40, [problem("A", "6A", [["A2", "start"]]), problem("B", "6A", [["A3", "start"]])]);
    expect(await climbCount(db, full, 25)).toBe(1);
    expect(await climbCount(db, full, 40)).toBe(2);
    expect(layoutIdOf(full, 25)).not.toBe(layoutIdOf(full, 40));
  });

  it("does not show a mini problem on a full-size board's list", async () => {
    await createBoard(db, { name: "Big", setup: full, angle: 40 });
    await importProblems(db, mini, 40, [problem("Mini only", "6A", [["A2", "start"]])]);
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    expect((await loadBoardData(db, board.spec)).climbs).toEqual([]);
  });

  it("reads community dump records end to end", async () => {
    const rec = { name: "Q", grade: "6B", userGrade: "6B+", setby: "Z", method: "m", moves: [{ description: "G4", isStart: true }, { description: "A12", isEnd: true }] };
    await createBoard(db, { name: "G", setup: mini, angle: 40 });
    await importProblems(db, mini, 40, [problemFromRecord(rec)!]);
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const [c] = (await loadBoardData(db, board.spec)).climbs;
    expect(c.name).toBe("Q");
    expect([...(await loadStatsAt(db, board.spec.layoutId, 40)).values()][0][0]).toBe(19);
  });

  it("lights exactly the LEDs of a climb's holds", async () => {
    await createBoard(db, { name: "G", setup: mini, angle: 40 });
    await importProblems(db, mini, 40, [problem("L", "6A", [["A1", "start"], ["B12", "middle"], ["K12", "finish"]])]);
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const data = await loadBoardData(db, board.spec);
    const colors = new Map(data.roles.map((r) => [r.id, r.led_color]));
    const byId = new Map(data.placements.map((p) => [p.id, p]));
    const holds = [...parseFrames(data.climbs[0].frames)[0]].map(([pid, rid]) => ({ position: byId.get(pid)!.led, color: colors.get(rid)! }));
    expect(String.fromCharCode(...encodeLegacy(holds))).toBe("l#S0,P12,E131#");
  });
});

describe("your own stats", () => {
  const send = (uuid: string, quality: number, at = new Date(2026, 0, 2)) =>
    ({ climbUuid: uuid, angle: 40, isMirror: false, bidCount: 1, comment: "", climbedAt: at, quality, difficulty: 17 });

  async function setup() {
    await createBoard(db, { name: "G", setup: mini, angle: 40 });
    await importProblems(db, mini, 40, [problem("A", "6A", [["A2", "start"]]), problem("B", "6A", [["B3", "start"]]), problem("Odd", "5+", [["C4", "start"]])]);
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const climbs = (await loadBoardData(db, board.spec)).climbs;
    const id = (n: string) => climbs.find((c) => c.name === n)!.uuid;
    const stat = async (n: string) => (await loadStatsAt(db, board.spec.layoutId, 40)).get(id(n));
    return { id, stat };
  }

  it("counts your sends and averages your stars, and follows edits and deletes", async () => {
    const { id, stat } = await setup();
    expect((await stat("A"))!.slice(2)).toEqual([0, 0]);
    const first = await saveLog(db, send(id("A"), 3));
    await saveLog(db, send(id("A"), 1));
    expect((await stat("A"))!.slice(2)).toEqual([2, 2]);
    await saveLog(db, { ...send(id("A"), 3), quality: undefined, difficulty: undefined }); // attempts only: not a send
    expect((await stat("A"))![2]).toBe(2);
    await saveLog(db, send(id("A"), 2), first.uuid); // the same entry edited: replaced, not added
    expect((await stat("A"))!.slice(2)).toEqual([2, 1.5]);
    await deleteLog(db, first.uuid, "ascent");
    expect((await stat("A"))!.slice(2)).toEqual([1, 1]);
  });

  it("keeps your counts when the problem list is imported again", async () => {
    const { id, stat } = await setup();
    await saveLog(db, send(id("B"), 3));
    await importProblems(db, mini, 40, [problem("B", "6C", [["B3", "start"]])]);
    expect((await stat("B"))!.slice(0, 4)).toEqual([20, null, 1, 3]);
  });

  it("gives a problem the dump could not grade your own grade once you send it", async () => {
    const { id, stat } = await setup();
    expect(await stat("Odd")).toBeUndefined();
    await saveLog(db, send(id("Odd"), 2));
    expect((await stat("Odd"))!.slice(0, 4)).toEqual([17, null, 1, 2]);
  });

  it("ranks Best by your rating, then how often you sent it", async () => {
    const { id } = await setup();
    await saveLog(db, send(id("A"), 3));
    await saveLog(db, send(id("B"), 1));
    await saveLog(db, send(id("B"), 1));
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const { applyFilter, DEFAULT_FILTER } = await import("./filters");
    const stats = await loadStatsAt(db, board.spec.layoutId, 40);
    const { climbs } = await loadBoardData(db, board.spec);
    const ctx = { stats, grades: { vNumber: () => 0 } as never, done: () => undefined, liked: () => false, blocked: () => false, isDraft: () => false, hasBeta: () => false, circuits: new Map(), board: board.spec.edges, seed: 1 };
    expect(applyFilter(climbs, { ...DEFAULT_FILTER, sort: "best" }, ctx).map((c) => c.name).slice(0, 2)).toEqual(["A", "B"]);
  });
});

describe("logbook and tags", () => {
  it("saves, lists and deletes a send and an attempt record with no server", async () => {
    await createBoard(db, { name: "G", setup: mini, angle: 40 });
    await importProblems(db, mini, 40, [problem("Climb", "6A", [["A2", "start"]])]);
    const [board] = await listBoards(db, LOCAL_USER_ID, "moonboard");
    const uuid = (await loadBoardData(db, board.spec)).climbs[0].uuid;
    const at = new Date(2026, 0, 2, 3, 4, 5);
    const send = await saveLog(db, { climbUuid: uuid, angle: 40, isMirror: false, bidCount: 3, comment: "nice", climbedAt: at, quality: 2, difficulty: 17 });
    const tries = await saveLog(db, { climbUuid: uuid, angle: 40, isMirror: false, bidCount: 5, comment: "", climbedAt: at });
    expect([send.kind, tries.kind]).toEqual(["ascent", "bid"]);
    const book = await loadLogbook(db, LOCAL_USER_ID, "moonboard");
    expect(book.map((e) => [e.climbName, e.isSend, e.bidCount, e.difficulty]).sort()).toEqual([["Climb", false, 5, 0], ["Climb", true, 3, 17]]);
    await deleteLog(db, send.uuid, "ascent");
    await deleteLog(db, tries.uuid, "bid");
    expect(await loadLogbook(db, LOCAL_USER_ID, "moonboard")).toEqual([]);
  });

  it("likes and blocks a climb, and undoes it", async () => {
    await setTag(db, "abc", "~flag", true);
    await setTag(db, "abc", "~block", true);
    expect(await loadTags(db, LOCAL_USER_ID)).toEqual({ liked: new Set(["ABC"]), blocked: new Set(["ABC"]) });
    await setTag(db, "ABC", "~flag", false);
    expect((await loadTags(db, LOCAL_USER_ID)).liked.size).toBe(0);
  });
});

describe("e-sr community database", () => {
  async function esrDb(): Promise<Db> {
    const e = openNodeDb();
    await e.exec(`
      CREATE TABLE problems (Id INTEGER PRIMARY KEY, Name TEXT, Grade TEXT, IsBenchmark INTEGER, IsAssessmentProblem INTEGER, Method TEXT, Firstname TEXT, Lastname TEXT);
      CREATE TABLE problemMoves (Problem INTEGER, Position TEXT, Setup TEXT, IsStart INTEGER, IsEnd INTEGER);
    `);
    await e.run("INSERT INTO problems VALUES (1, 'One', '6B+', 1, 0, 'Feet follow hands', 'Ben', 'Moon')");
    await e.run("INSERT INTO problems VALUES (2, 'Two', '7A', 0, 0, 'Any', NULL, NULL)");
    for (const [p, pos, s, a, b] of [[1, "A2", "2016", 1, 0], [1, "C5", "2016", 0, 0], [1, "K18", "2016", 0, 1], [2, "B3", "2016", 1, 0], [2, "B9", "2016", 0, 1]] as const) {
      await e.run("INSERT INTO problemMoves VALUES (?, ?, ?, ?, ?)", [p, pos, s, a, b]);
    }
    return e;
  }

  it("lists its setups and reads problems in batches", async () => {
    const e = await esrDb();
    expect(await esrSetups(e)).toEqual([{ setup: "2016", problems: 2 }]);
    const batches: MoonProblem[][] = [];
    for await (const b of readEsr(e, "2016", 1)) batches.push(b);
    expect(batches.map((b) => b.length)).toEqual([1, 1]);
    expect(batches[0][0]).toMatchObject({ name: "One", setter: "Ben Moon", grade: "6B+", benchmark: true });
    expect(batches[0][0].holds).toEqual([{ position: "A2", role: "start" }, { position: "C5", role: "middle" }, { position: "K18", role: "finish" }]);
    expect(batches[1][0].setter).toBe("");
  });

  it("imports into a 2016 board", async () => {
    const e = await esrDb();
    await createBoard(db, { name: "Home", setup: full, angle: 40 });
    for await (const b of readEsr(e, "2016")) await importProblems(db, full, 40, b);
    expect(await climbCount(db, full, 40)).toBe(2);
  });
});

describe("setting problems", () => {
  const layout = layoutIdOf(mini, 40);
  const product = productOf(mini);
  const pid = (col: number, row: number) => placementIdOf(layout, holeIdOf(product, { col, row }));
  const frames = (holds: [number, number, number][]) => encodeFrames([new Map(holds.map(([c, r, role]) => [pid(c, r), product * 10 + role]))]);
  const START = 1, MIDDLE = 2, FINISH = 3;
  const base = { layoutId: layout, name: "Mine", method: "Feet follow hands", angle: 40, difficulty: 19 };

  async function board() {
    await createBoard(db, { name: "G", setup: mini, angle: 40 });
    return (await listBoards(db, LOCAL_USER_ID, "moonboard"))[0];
  }

  it("seeds the setting limits the editor reads", async () => {
    await board();
    expect(await productLimits(db, product)).toEqual({ minHolds: MOON_RULES.minHolds, maxHolds: MOON_RULES.maxHolds });
  });

  it("saves a problem that appears on the board, graded, with the right extent and you as setter", async () => {
    const b = await board();
    const uuid = await saveOwnClimb(db, { ...base, frames: frames([[0, 2, START], [3, 7, MIDDLE], [5, 12, FINISH]]) });
    const mine = (await loadBoardData(db, b.spec)).climbs.find((c) => c.uuid === uuid)!;
    expect(mine).toMatchObject({ name: "Mine", setter: LOCAL_SETTER, frameCount: 1, left: 1, right: 6, bottom: 2, top: 12 });
    expect((await loadStatsAt(db, b.spec.layoutId, 40)).get(uuid)).toEqual([19, null, 0, 0]);
  });

  it("changes only your own problems, keeping its id and your sends when edited", async () => {
    const b = await board();
    const uuid = await saveOwnClimb(db, { ...base, frames: frames([[0, 2, START], [3, 7, MIDDLE], [5, 12, FINISH]]) });
    await saveLog(db, { climbUuid: uuid, angle: 40, isMirror: false, bidCount: 1, comment: "", climbedAt: new Date(2026, 0, 1), quality: 3, difficulty: 19 });
    await saveOwnClimb(db, { ...base, uuid, name: "Renamed", difficulty: 21, frames: frames([[1, 3, START], [2, 5, MIDDLE], [4, 9, FINISH]]) });
    const c = (await loadBoardData(db, b.spec)).climbs.find((x) => x.uuid === uuid)!;
    expect(c).toMatchObject({ name: "Renamed", left: 2, right: 5, bottom: 3, top: 9 });
    expect((await loadStatsAt(db, b.spec.layoutId, 40)).get(uuid)).toEqual([21, null, 1, 3]);
    await importProblems(db, mini, 40, [problem("From dump", "6A", [["A2", "start"]])]);
    const dumped = (await loadBoardData(db, b.spec)).climbs.find((x) => x.name === "From dump")!;
    await expect(saveOwnClimb(db, { ...base, uuid: dumped.uuid, frames: frames([[0, 2, START]]) })).rejects.toThrow(/only change problems you set/);
  });

  it("refuses a problem with no holds", async () => {
    await board();
    await expect(saveOwnClimb(db, { ...base, frames: "" })).rejects.toThrow(/needs holds/);
  });

  it("deletes your own problem and its stats, keeps your log of it, and leaves dumped problems alone", async () => {
    const b = await board();
    const uuid = await saveOwnClimb(db, { ...base, frames: frames([[0, 2, START], [3, 7, MIDDLE], [5, 12, FINISH]]) });
    await saveLog(db, { climbUuid: uuid, angle: 40, isMirror: false, bidCount: 1, comment: "", climbedAt: new Date(2026, 0, 1), quality: 2, difficulty: 19 });
    await importProblems(db, mini, 40, [problem("From dump", "6A", [["A2", "start"]])]);
    const dumped = (await loadBoardData(db, b.spec)).climbs.find((x) => x.name === "From dump")!;
    expect(await deleteOwnClimb(db, dumped.uuid)).toBe(false);
    expect(await deleteOwnClimb(db, uuid)).toBe(true);
    expect(await deleteOwnClimb(db, uuid)).toBe(false);
    const after = await loadBoardData(db, b.spec);
    expect(after.climbs.map((c) => c.name)).toEqual(["From dump"]);
    expect((await loadStatsAt(db, b.spec.layoutId, 40)).has(uuid)).toBe(false);
    expect((await loadLogbook(db, LOCAL_USER_ID, "moonboard")).map((e) => e.climbUuid)).toEqual([uuid]);
  });

  it("repairs a board created before the limits and the art were seeded, and leaves a current one alone", async () => {
    const b = await board();
    await db.run("UPDATE products SET max_count_in_frame = 1, min_count_in_frame = 1");
    await db.run("UPDATE product_sizes_layouts_sets SET image_filename = ''");
    expect(await productLimits(db, product)).toEqual({ minHolds: 1, maxHolds: 1 });
    expect(await ensureSeeded(db, mini, 40)).toBe(true);
    expect(await productLimits(db, product)).toEqual({ minHolds: MOON_RULES.minHolds, maxHolds: MOON_RULES.maxHolds });
    expect((await listBoards(db, LOCAL_USER_ID, "moonboard"))[0].spec.images).toEqual(["bundled:moonboard/mini2020"]);
    await db.run("UPDATE holes SET name = 'marker' WHERE id = ?", [holeIdOf(product, { col: 0, row: 1 })]);
    expect(await ensureSeeded(db, mini, 40)).toBe(false);
    expect((await db.all<{ name: string }>("SELECT name FROM holes WHERE id = ?", [holeIdOf(product, { col: 0, row: 1 })]))[0].name).toBe("marker");
    expect(b.id).toBeTruthy();
  });
});
