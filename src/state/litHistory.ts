import { useEffect } from "react";
import { create } from "zustand";
import { randomHex } from "../core/api";
import { isRepeatLit, LIT_MAX_ENTRIES, type LitEntry } from "../core/litHistory";
import { clearLit, loadLit, saveLit } from "../core/litLocal";
import * as repo from "../core/repo";
import { localStamp } from "../core/shareCard";
import type { Board } from "../core/types";
import { getDb, getLocalDb } from "../data/sqlite";
import { useStore } from "./store";

interface LitState {
  entries: LitEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (e: LitEntry) => Promise<void>;
  clear: () => Promise<void>;
}

/** What has been lit on the user's boards, newest first. It lives on the phone. */
export const useLit = create<LitState>((set, get) => ({
  entries: [],
  loaded: false,
  async load() {
    set({ entries: await loadLit(await getLocalDb()), loaded: true });
  },
  async add(e) {
    if (!get().loaded) await get().load();
    // A climb lit again straight away is the same entry; the stored one just keeps its first time.
    if (isRepeatLit(get().entries[0], e)) return;
    await saveLit(await getLocalDb(), e);
    set((s) => ({ entries: [e, ...s.entries].slice(0, LIT_MAX_ENTRIES) }));
  },
  async clear() {
    await clearLit(await getLocalDb());
    set({ entries: [], loaded: true });
  },
}));

/** The history, read from the phone the first time anything asks. */
export function useLitHistory(): LitEntry[] {
  const entries = useLit((s) => s.entries);
  const loaded = useLit((s) => s.loaded);
  useEffect(() => { if (!loaded) void useLit.getState().load(); }, [loaded]);
  return entries;
}

const SETTLE_MS = 3000;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Records a climb that was just lit on a board, once it has stayed lit for a few seconds (flicking past climbs records only where you
 * stop, and a newer call replaces one still waiting). The Bluetooth link calls this on every successful climb it sends.
 */
export function recordLitLocal(board: Board, climbUuid: string): void {
  const litAt = localStamp(new Date());
  clearTimeout(timer);
  timer = setTimeout(() => {
    void (async () => {
      try {
        const climb = await repo.climbByUuid(await getDb(board.spec.provider), climbUuid);
        await useLit.getState().add({
          id: randomHex(), provider: board.spec.provider, climbUuid: climbUuid.toUpperCase(), climbName: climb?.name ?? "Unknown climb",
          boardId: board.id, boardName: board.name, angle: useStore.getState().angles[board.id] ?? board.angle, litAt,
        });
      } catch {
        // The history is a convenience: failing to write it must never get in the way of lighting a climb.
      }
    })();
  }, SETTLE_MS);
}
