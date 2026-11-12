import { useEffect } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import type { OutsideLog } from "../core/outside";
import { deleteOutside, loadOutside, saveOutside } from "../core/outsideLocal";

interface OutsideState {
  logs: OutsideLog[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (l: OutsideLog) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** The climbs the user logged off the boards. They live on the phone only. */
export const useOutside = create<OutsideState>((set) => ({
  logs: [],
  loaded: false,
  async load() {
    set({ logs: await loadOutside(await getLocalDb()), loaded: true });
  },
  async save(l) {
    await saveOutside(await getLocalDb(), l);
    set({ logs: await loadOutside(await getLocalDb()), loaded: true });
  },
  async remove(id) {
    await deleteOutside(await getLocalDb(), id);
    set({ logs: await loadOutside(await getLocalDb()), loaded: true });
  },
}));

/** The off-board logs, newest first, read from the phone the first time anything asks. */
export function useOutsideLogs(): OutsideLog[] {
  const logs = useOutside((s) => s.logs);
  const loaded = useOutside((s) => s.loaded);
  useEffect(() => { if (!loaded) void useOutside.getState().load(); }, [loaded]);
  return logs;
}
