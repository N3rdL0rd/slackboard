import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import { ropedLabel } from "../data/ropedGrades";
import type { Goal, GoalLabels, Resolution } from "../core/goals";
import { resolveGoals } from "../core/goals";
import { deleteGoal, loadGoals, saveGoal } from "../core/goalsLocal";
import { useData } from "./data";
import { useRoped, useRopedLogs } from "./roped";
import { useOutside } from "./outside";
import { commonLabel } from "./stats";
import { useStore } from "./store";
import { useToday, useActivities } from "./today";
import { useTrainingStore } from "./training";

interface GoalsState {
  goals: Goal[];
  loaded: boolean;
  /** Goals that were just reached and not yet celebrated, oldest first. In memory only: a celebration happens once. */
  celebrating: Goal[];
  load: () => Promise<void>;
  save: (g: Goal) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Saves what a pass of the rules changed, and queues the newly reached goals for the celebration. */
  apply: (r: Resolution) => Promise<void>;
  /** The celebration for this goal has been shown. */
  celebrated: (id: string) => void;
}

/** The user's goals. They live on the phone only. */
export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: [],
  loaded: false,
  celebrating: [],
  async load() {
    set({ goals: await loadGoals(await getLocalDb()), loaded: true });
  },
  async save(g) {
    const db = await getLocalDb();
    await saveGoal(db, g);
    set({ goals: await loadGoals(db), loaded: true });
  },
  async remove(id) {
    const db = await getLocalDb();
    await deleteGoal(db, id);
    set({ goals: await loadGoals(db), loaded: true, celebrating: get().celebrating.filter((g) => g.id !== id) });
  },
  async apply(r) {
    const db = await getLocalDb();
    for (const g of r.changed) await saveGoal(db, g);
    set({ goals: await loadGoals(db), celebrating: [...get().celebrating, ...r.achieved] });
  },
  celebrated(id) {
    set({ celebrating: get().celebrating.filter((g) => g.id !== id) });
  },
}));

/** The goals, newest first, read from the phone the first time anything asks. */
export function useGoals(): Goal[] {
  const goals = useGoalsStore((s) => s.goals);
  const loaded = useGoalsStore((s) => s.loaded);
  useEffect(() => { if (!loaded) void useGoalsStore.getState().load(); }, [loaded]);
  return goals;
}

/** Grades written in the user's own notation: V, Font or both, and YDS or French for roped (whichever they log in). */
export function useGoalLabels(): GoalLabels {
  const display = useStore((s) => s.settings.gradeDisplay);
  const system = useRopedLogs()[0]?.gradeSystem ?? "yds";
  return useMemo(() => ({ boulder: (v) => commonLabel(v, display), roped: (n) => ropedLabel(n, system) ?? `${n}` }), [display, system]);
}

/**
 * Keeps goal statuses true: whenever the entries or the goals change, reached goals become achieved and goals whose window passed
 * become ended. It waits until every source of entries has been read, because a goal must never be judged against a log that is
 * only half loaded. Mounted once, at the root.
 */
export function useGoalSync(): void {
  const activities = useActivities();
  const labels = useGoalLabels();
  const today = useToday();
  const goals = useGoals();
  const goalsLoaded = useGoalsStore((s) => s.loaded);
  const boards = useData((d) => d.boardsLoaded);
  const roped = useRoped((s) => s.loaded);
  const outside = useOutside((s) => s.loaded);
  const training = useTrainingStore((s) => s.loaded);
  const ready = goalsLoaded && boards && roped && outside && training;
  useEffect(() => {
    if (!ready) return;
    const r = resolveGoals(goals, { activities, today, labels }, new Date());
    if (r.changed.length) void useGoalsStore.getState().apply(r);
  }, [ready, goals, activities, today, labels]);
}
