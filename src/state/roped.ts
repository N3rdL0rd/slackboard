import { useEffect } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import type { RopedLog } from "../core/roped";
import { deleteRoped, loadRoped, saveRoped } from "../core/ropedLocal";

interface RopedState {
  logs: RopedLog[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (l: RopedLog) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** The roped climbs the user logged. They live on the phone only. */
export const useRoped = create<RopedState>((set) => ({
  logs: [],
  loaded: false,
  async load() {
    set({ logs: await loadRoped(await getLocalDb()), loaded: true });
  },
  async save(l) {
    await saveRoped(await getLocalDb(), l);
    set({ logs: await loadRoped(await getLocalDb()), loaded: true });
  },
  async remove(id) {
    await deleteRoped(await getLocalDb(), id);
    set({ logs: await loadRoped(await getLocalDb()), loaded: true });
  },
}));

/** The roped logs, newest first, read from the phone the first time anything asks. */
export function useRopedLogs(): RopedLog[] {
  const logs = useRoped((s) => s.logs);
  const loaded = useRoped((s) => s.loaded);
  useEffect(() => { if (!loaded) void useRoped.getState().load(); }, [loaded]);
  return logs;
}
