import { useEffect } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import type { DayNote } from "../core/body";
import type { Day } from "../core/days";
import { deleteDayNote, loadDayNotes, loadSnoozes, saveDayNote, saveSnooze, type SnoozeMap } from "../core/dayNotesLocal";

interface DayNotesState {
  notes: DayNote[];
  /** The last day each hideable line (the rest nudge, the motivation line) is hidden through. */
  snoozes: SnoozeMap;
  loaded: boolean;
  load: () => Promise<void>;
  save: (n: DayNote) => Promise<void>;
  remove: (day: Day) => Promise<void>;
  snooze: (key: string, through: Day) => Promise<void>;
}

/** The body check-ins and the hidden-for-today lines. They live on the phone only. */
export const useDayNotesStore = create<DayNotesState>((set) => ({
  notes: [],
  snoozes: {},
  loaded: false,
  async load() {
    const db = await getLocalDb();
    set({ notes: await loadDayNotes(db), snoozes: await loadSnoozes(db), loaded: true });
  },
  async save(n) {
    const db = await getLocalDb();
    await saveDayNote(db, n);
    set({ notes: await loadDayNotes(db), loaded: true });
  },
  async remove(day) {
    const db = await getLocalDb();
    await deleteDayNote(db, day);
    set({ notes: await loadDayNotes(db), loaded: true });
  },
  async snooze(key, through) {
    // Show it as hidden at once; the write follows.
    set((s) => ({ snoozes: { ...s.snoozes, [key]: through } }));
    await saveSnooze(await getLocalDb(), key, through);
  },
}));

/** The day notes, newest first, read from the phone the first time anything asks. */
export function useDayNotes(): DayNote[] {
  const notes = useDayNotesStore((s) => s.notes);
  const loaded = useDayNotesStore((s) => s.loaded);
  useEffect(() => { if (!loaded) void useDayNotesStore.getState().load(); }, [loaded]);
  return notes;
}
