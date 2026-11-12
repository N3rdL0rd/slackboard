import { create } from "zustand";
import {
  deleteSpaceLineage, loadBoardPlaces, loadLogSpaces, loadSpaceLineage, loadSpaceNames, reconcileSpaces,
  saveBoardPlace, saveLogSpace, saveSpaceLineage, saveSpaceName,
  type BoardPlace, type LatLon, type LogSpace, type Space,
} from "../core/spaces";
import type { Board } from "../core/types";
import { getLocalDb } from "../data/sqlite";
import { useData } from "./data";

interface SpacesState {
  spaces: Space[];
  places: Record<string, BoardPlace>;
  logSpaces: Record<string, LogSpace>;
  ready: boolean;
  renameSpace: (spaceId: string, name: string) => Promise<void>;
  moveBoard: (boardId: string, spaceId: string | null) => Promise<void>;
  recordLog: (entryId: string, boardId: string, alsoId?: string) => Promise<void>;
  forgetLog: (entryId: string) => Promise<void>;
}

let boards: Board[] = [];
let places: Record<string, BoardPlace> = {};
let names: Record<string, string> = {};
let lineage: Record<string, string> = {};
let logs: Record<string, LogSpace> = {};
const pendingPlaces = new Map<string, { gymName?: string | null; location: LatLon | null }>();
let queue = Promise.resolve();

/** Serialises disk reads and writes. A failed local write is surfaced to its caller but does not poison the queue. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

function derive(): Space[] {
  const input = boards.map((board) => ({ ...board, ...(places[board.id] ?? {
    id: board.id, gymName: null, location: null, addedAt: "", manualSpaceId: null,
  }), name: board.name }));
  const result = reconcileSpaces(input, names, useSpaces.getState().spaces, lineage);
  names = result.names;
  lineage = result.lineage;
  places = Object.fromEntries(result.spaces.flatMap((s) => s.boards.map((b) => [b.id, {
    id: b.id, gymName: b.gymName, location: b.location, addedAt: b.addedAt, manualSpaceId: b.manualSpaceId,
  }])));
  return result.spaces;
}

async function writeGroups(): Promise<void> {
  const db = await getLocalDb();
  await db.transaction(async () => {
    for (const place of Object.values(places)) await saveBoardPlace(db, place);
    for (const [id, name] of Object.entries(names)) await saveSpaceName(db, id, name);
    const oldIds = Object.keys(await loadSpaceLineage(db));
    for (const [oldId, newId] of Object.entries(lineage)) {
      if (oldId !== newId) await saveSpaceLineage(db, oldId, newId);
    }
    for (const oldId of oldIds) if (!lineage[oldId]) await deleteSpaceLineage(db, oldId);
    for (const log of Object.values(logs)) await saveLogSpace(db, log);
  });
}

export const useSpaces = create<SpacesState>((set, get) => ({
  spaces: [], places: {}, logSpaces: {}, ready: false,

  renameSpace: (spaceId, input) => serial(async () => {
    const name = input.trim();
    if (!name || !get().spaces.some((s) => s.id === spaceId)) return;
    names = { ...names, [spaceId]: name };
    const spaces = derive();
    set({ spaces, places });
    await saveSpaceName(await getLocalDb(), spaceId, name);
  }),

  moveBoard: (boardId, spaceId) => serial(async () => {
    const old = places[boardId];
    if (!old || (spaceId != null && !get().spaces.some((s) => s.id === spaceId))) return;
    places = { ...places, [boardId]: { ...old, manualSpaceId: spaceId } };
    const spaces = derive();
    // Historical sessions retain their original Space. Only lineage (anchor succession) rebases them.
    set({ spaces, places });
    await writeGroups();
  }),

  recordLog: (entryId, boardId, alsoId) => serial(async () => {
    if (!get().ready) await reconcile(useData.getState().boards); // inside serial: must not queue again
    const space = get().spaces.find((s) => s.boards.some((b) => b.id === boardId));
    if (!space) return;
    logs = { ...logs, [entryId]: { entryId, spaceId: space.id, boardId, spaceName: space.name } };
    if (alsoId) logs[alsoId] = { entryId: alsoId, spaceId: space.id, boardId, spaceName: space.name };
    set({ logSpaces: logs });
    const db = await getLocalDb();
    await saveLogSpace(db, logs[entryId]);
    if (alsoId) await saveLogSpace(db, logs[alsoId]);
  }),

  forgetLog: (entryId) => serial(async () => {
    const next = { ...logs };
    delete next[entryId];
    logs = next;
    set({ logSpaces: logs });
    await (await getLocalDb()).run("DELETE FROM l_log_spaces WHERE entry_id = ?", [entryId]);
  }),
}));

/** Reconciles local board history with the synced board list on first load and every provider refresh. */
/** Queues a reconcile behind the work already in the queue. */
export function refreshSpaces(nextBoards: Board[]): Promise<void> {
  return serial(() => reconcile(nextBoards));
}

/**
 * The reconcile itself, not queued. Code already running inside `serial` has to call this: `refreshSpaces` would queue behind
 * the very job that is waiting for it, and neither would ever finish (adding a board hung on exactly that).
 */
async function reconcile(nextBoards: Board[]): Promise<void> {
    const db = await getLocalDb();
    const [storedPlaces, storedNames, storedLineage, storedLogs] = await Promise.all([
      loadBoardPlaces(db), loadSpaceNames(db), loadSpaceLineage(db), loadLogSpaces(db),
    ]);
    places = storedPlaces;
    boards = nextBoards;
    names = storedNames;
    lineage = storedLineage;
    logs = storedLogs;
    for (const [boardId, pending] of pendingPlaces) {
      if (!boards.some((b) => b.id === boardId)) continue;
      places[boardId] = {
        ...(places[boardId] ?? { id: boardId, addedAt: new Date().toISOString(), manualSpaceId: null }),
        gymName: pending.gymName ?? places[boardId]?.gymName ?? null, location: pending.location,
      };
      pendingPlaces.delete(boardId);
    }
    for (let i = 0; i < boards.length; i++) {
      if (!places[boards[i].id]) places[boards[i].id] = {
        id: boards[i].id, gymName: null, location: null,
        // Existing installs get a deterministic order; newly added boards receive their actual creation time.
        addedAt: `0000-00-00T00:00:${String(i).padStart(2, "0")}.000Z`, manualSpaceId: null,
      };
    }
    const liveIds = new Set(boards.map((b) => b.id));
    places = Object.fromEntries(Object.entries(places).filter(([id]) => liveIds.has(id)));
    const spaces = derive();
    // Use persisted succession when a cold start has no previous in-memory groups.
    const aliases = new Map(Object.entries(lineage));
    logs = Object.fromEntries(Object.entries(logs).map(([id, log]) => {
      let rebased = log.spaceId;
      const seen = new Set<string>();
      while (aliases.has(rebased) && !seen.has(rebased)) {
        seen.add(rebased);
        rebased = aliases.get(rebased)!;
      }
      return [id, { ...log, spaceId: rebased }];
    }));
    // Remove pending-id aliases once the pending entry has disappeared (uploaded, edited or deleted).
    const pendingEntries = useData.getState().logbook.filter((e) => e.id.startsWith("pending:"));
    for (const id of Object.keys(logs)) if (id.startsWith("pending:") && !pendingEntries.some((e) => e.id === id)) delete logs[id];
    useSpaces.setState({ spaces, places, logSpaces: logs, ready: true });
    await writeGroups();
}

export function useSpaceFor(boardId: string | undefined): Space | null {
  return useSpaces((s) => s.spaces.find((space) => space.boards.some((b) => b.id === boardId)) ?? null);
}

/** Fills a home board's missing location; a failed or unlocated read never overwrites a pin. */
export function setBoardPlace(boardId: string, place: { gymName: string | null; location: LatLon | null }): Promise<void> {
  return serial(async () => {
    const old = places[boardId];
    if (!old) return;
    places = { ...places, [boardId]: { ...old, ...place, location: place.location ?? old.location } };
    useSpaces.setState({ spaces: derive(), places });
    await writeGroups();
  });
}

/** Saves a gym pin or the first permitted phone reading as soon as board creation succeeds. */
export function placeNewBoard(boardId: string, place: { gymName?: string | null; location: LatLon | null }): Promise<void> {
  pendingPlaces.set(boardId, place);
  return serial(async () => {
    await saveBoardPlace(await getLocalDb(), {
      id: boardId, gymName: place.gymName ?? places[boardId]?.gymName ?? null, location: place.location ?? places[boardId]?.location ?? null,
      addedAt: new Date().toISOString(), manualSpaceId: places[boardId]?.manualSpaceId ?? null,
    });
    await reconcile(useData.getState().boards); // inside serial: must not queue again
    if (useData.getState().boards.some((b) => b.id === boardId)) pendingPlaces.delete(boardId);
  });
}

let lastBoards: Board[] = useData.getState().boards;
useData.subscribe((state) => {
  if (state.boards === lastBoards) return;
  lastBoards = state.boards;
  // The first non-empty board list also starts the grouping: nothing else loads it until a board is added or a log is written.
  if (useSpaces.getState().ready || state.boards.length) void refreshSpaces(state.boards);
});
if (lastBoards.length) void refreshSpaces(lastBoards);
