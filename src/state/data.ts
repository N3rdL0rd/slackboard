import type { Accounts } from "../core/accounts";
import { useStore } from "./store";
import { create } from "zustand";
import type { DoneState } from "../core/filters";
import * as repo from "../core/repo";
import type { Board, BoardSpec, Climb, LogEntry, StatsAt } from "../core/types";
import { doneMap, loadLocalLogs, mergeLogs } from "../core/mergedLog";
import { getMeta } from "../core/sync";
import { loadLogicalCircuits, syncLogicalCircuits, type LogicalCircuit } from "../core/logicalCircuits";
import { getDb, getLocalDb } from "../data/sqlite";

interface DataState {
  boards: Board[];
  boardsLoaded: boolean;
  /** Holes, roles and climbs of the open board, keyed by what they were loaded for. */
  boardData: (repo.BoardData & { key: string }) | null;
  stats: StatsAt | null;
  statsKey: string;
  logbook: LogEntry[];
  /** `provider:CLIMBUUID:angle` -> sent / tried (see `doneKey`). */
  done: Map<string, DoneState>;
  liked: Set<string>;
  blocked: Set<string>;
  /** What the account may do, per provider (set climbs, and so on). */
  permissionsBy: Record<string, Set<string>>;
  /** The user's circuits, each possibly spanning providers (see core/logicalCircuits.ts). */
  circuits: LogicalCircuit[];
  /** The user's unpublished climbs per provider, shown in the list when the My drafts filter is on. */
  draftsBy: Record<string, Climb[]>;
  loadAll: (accounts: Accounts) => Promise<void>;
  loadBoard: (spec: BoardSpec) => Promise<void>;
  loadStats: (provider: string, layoutId: number, angle: number) => Promise<void>;
}

/** Only the most recent request may write its result, so a slow load for a board/angle the user left can't overwrite a newer one. */
let latestBoard = "";
let latestStats = "";

/** Layout and set ids repeat between providers, so every cache key starts with the provider. */
export const statsKeyOf = (provider: string, layoutId: number, angle: number) => `${provider}:${layoutId}:${angle}`;
const boardKey = (s: BoardSpec) => `${s.provider}:${s.layoutId}:${s.productSizeId}:${s.hsm}:${s.setIds.join(",")}`;

export const useData = create<DataState>((set, get) => ({
  boards: [],
  boardsLoaded: false,
  boardData: null,
  stats: null,
  statsKey: "",
  logbook: [],
  done: new Map(),
  liked: new Set(),
  blocked: new Set(),
  permissionsBy: {},
  circuits: [],
  draftsBy: {},

  /** Reads every signed-in account's mirror and merges them: boards, logbook, tags and circuits span providers. */
  async loadAll(accounts) {
    const local = await getLocalDb();
    const boards: Board[] = [];
    const logs: LogEntry[][] = [];
    const liked = new Set<string>();
    const blocked = new Set<string>();
    const permissionsBy: Record<string, Set<string>> = {};
    const draftsBy: Record<string, Climb[]> = {};
    let circuits: LogicalCircuit[] = await loadLogicalCircuits(local);
    for (const [provider, { userId }] of Object.entries(accounts)) {
      const db = await getDb(provider);
      const [b, log, tags, perms, remote, drafts] = await Promise.all([
        repo.listBoards(db, userId, provider), repo.loadLogbook(db, userId, provider), repo.loadTags(db, userId), repo.loadPermissions(db, userId),
        repo.loadRemoteCircuits(db, userId), repo.draftsOf(db, userId),
      ]);
      boards.push(...b); logs.push(log);
      tags.liked.forEach((u) => liked.add(u)); tags.blocked.forEach((u) => blocked.add(u));
      permissionsBy[provider] = perms; draftsBy[provider] = drafts;
      // Local circuits follow this provider's: new ones are imported, changed ones updated, a first sync still running counts as partial.
      circuits = await syncLogicalCircuits(local, provider, remote, {
        userId, now: new Date().toISOString().slice(0, 19).replace("T", " "), complete: (await getMeta(db, "initial_sync_complete")) === "1",
      });
    }
    // One logbook for every provider, plus entries only kept on the device; what has been done follows from it.
    const logbook = mergeLogs(...logs, await loadLocalLogs(local));
    set({ boards, boardsLoaded: true, logbook, done: doneMap(logbook), liked, blocked, permissionsBy, draftsBy, circuits });
  },

  async loadBoard(spec) {
    const key = (latestBoard = boardKey(spec));
    // A different board: drop the old one's climbs now, so its list is never shown under the new board's name while this loads.
    if (get().boardData?.key !== key) set({ boardData: null });
    const db = await getDb(spec.provider);
    const data = await repo.loadBoardData(db, spec);
    if (latestBoard === key) set({ boardData: { ...data, key } });
  },

  async loadStats(provider, layoutId, angle) {
    const key = (latestStats = statsKeyOf(provider, layoutId, angle));
    if (get().statsKey !== key) set({ stats: null });
    const db = await getDb(provider);
    const stats = await repo.loadStatsAt(db, layoutId, angle);
    if (latestStats === key) set({ stats, statsKey: key });
  },
}));

export { boardKey };

/** Reloads the open board's climbs after one was added, changed or deleted. Resolves the board the way `useBoard` does. */
export async function reloadOpenBoard(): Promise<void> {
  const { boardId } = useStore.getState();
  const boards = useData.getState().boards;
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  if (board) await useData.getState().loadBoard(board.spec);
}
