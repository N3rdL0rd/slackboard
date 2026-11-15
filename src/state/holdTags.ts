import { useEffect } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import { loadHoldTags, saveHoldTag } from "../core/holdTagsLocal";
import type { HoldTag } from "../core/holdSurvey";

interface State {
  tags: HoldTag[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (t: HoldTag) => Promise<void>;
}

/** The hold survey's tags. They live on the phone. */
export const useHoldTagsStore = create<State>((set) => ({
  tags: [],
  loaded: false,
  async load() {
    set({ tags: await loadHoldTags(await getLocalDb()), loaded: true });
  },
  async save(t) {
    const db = await getLocalDb();
    await saveHoldTag(db, t);
    set({ tags: await loadHoldTags(db), loaded: true });
  },
}));

/** Every hold tag, read from the phone the first time anything asks. */
export function useHoldTags(): HoldTag[] {
  const tags = useHoldTagsStore((s) => s.tags);
  const loaded = useHoldTagsStore((s) => s.loaded);
  useEffect(() => { if (!loaded) void useHoldTagsStore.getState().load(); }, [loaded]);
  return tags;
}
