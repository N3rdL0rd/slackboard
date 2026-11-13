import { useEffect } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import type { TrainingEntry } from "../core/training";
import { deleteTraining, loadTraining, saveTraining } from "../core/trainingLocal";

interface TrainingState {
  entries: TrainingEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Saves entries together (one session), then reloads. */
  saveAll: (list: TrainingEntry[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** The training the user logged, newest first. It lives on the phone only. */
export const useTrainingStore = create<TrainingState>((set) => ({
  entries: [],
  loaded: false,
  async load() {
    set({ entries: await loadTraining(await getLocalDb()), loaded: true });
  },
  async saveAll(list) {
    const db = await getLocalDb();
    for (const e of list) await saveTraining(db, e);
    set({ entries: await loadTraining(db), loaded: true });
  },
  async remove(id) {
    const db = await getLocalDb();
    await deleteTraining(db, id);
    set({ entries: await loadTraining(db), loaded: true });
  },
}));

/** Training entries, newest first, read from the phone the first time anything asks. */
export function useTraining(): TrainingEntry[] {
  const entries = useTrainingStore((s) => s.entries);
  const loaded = useTrainingStore((s) => s.loaded);
  useEffect(() => { if (!loaded) void useTrainingStore.getState().load(); }, [loaded]);
  return entries;
}
