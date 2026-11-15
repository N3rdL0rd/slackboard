import { useEffect } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import type { BoardScale } from "../core/boardScale";
import { loadBoardScales, saveBoardScale } from "../core/boardScaleLocal";

interface State {
  scales: BoardScale[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (s: BoardScale) => Promise<void>;
}

/** Each board's measured real-world scale. They live on the phone. */
export const useBoardScalesStore = create<State>((set) => ({
  scales: [],
  loaded: false,
  async load() {
    set({ scales: await loadBoardScales(await getLocalDb()), loaded: true });
  },
  async save(s) {
    const db = await getLocalDb();
    await saveBoardScale(db, s);
    set({ scales: await loadBoardScales(db), loaded: true });
  },
}));

/** The measured scale of a board (centimetres per board unit and how it was measured), or null when it has not been measured. */
export function useBoardScale(boardId: string): BoardScale | null {
  const scales = useBoardScalesStore((s) => s.scales);
  const loaded = useBoardScalesStore((s) => s.loaded);
  useEffect(() => { if (!loaded) void useBoardScalesStore.getState().load(); }, [loaded]);
  return scales.find((s) => s.board === boardId) ?? null;
}
