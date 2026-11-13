import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { getLocalDb } from "../data/sqlite";
import { deletePlan, deleteTest, loadPlans, loadProfile, loadTests, savePlan, saveProfile, saveTest } from "../core/planLocal";
import { completeSession, lighten, type PlanSession, moveSession, skipSession, swapExercise, updateSession, type MoveResult, type Plan, type Profile, type TestResult } from "../core/planner";
import { adaptSession, settleMissed, type Adapted } from "../core/adapt";
import { dayOf } from "../core/days";
import { angleSamples, outsideEvidence } from "../core/outside";
import { isSend, ropedWorking } from "../core/roped";
import { ropedAsV } from "../core/ropedEquivalence";
import { workingGrade } from "../core/suggest";
import { styleInsight, type StyleInsight } from "../core/styleProfile";
import { useData } from "./data";
import { useActivities, useWorkingGrades } from "./today";
import { useDayNotes } from "./dayNotes";
import { useTraining } from "./training";
import { useOutsideLogs } from "./outside";
import { useRopedLogs } from "./roped";
import { gradeOfEntry } from "./stats";
import { useStore } from "./store";

interface PlannerState {
  profile: Profile | null;
  tests: TestResult[];
  /** Newest first. */
  plans: Plan[];
  loaded: boolean;
  load: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  addTest: (t: TestResult) => Promise<void>;
  removeTest: (id: string) => Promise<void>;
  /** Saves a plan. A new plan ends any plan still running, so there is only ever one current plan. */
  startPlan: (plan: Plan) => Promise<void>;
  updatePlan: (plan: Plan) => Promise<void>;
  removePlan: (id: string) => Promise<void>;
}

/** The training profile, test results and plans. They live on the phone only. */
export const usePlannerStore = create<PlannerState>((set, get) => {
  const reload = async () => {
    const db = await getLocalDb();
    let plans = await loadPlans(db);
    // A planned day that has passed without being done is marked skipped; nothing is moved or crammed in.
    const today = dayOf(new Date());
    for (const p of plans) {
      if (p.status !== "active") continue;
      const settled = settleMissed(p, today);
      if (settled.changed) await savePlan(db, settled.plan);
    }
    plans = await loadPlans(db);
    set({ profile: await loadProfile(db), tests: await loadTests(db), plans, loaded: true });
  };
  return {
    profile: null, tests: [], plans: [], loaded: false,
    load: reload,
    async saveProfile(p) { await saveProfile(await getLocalDb(), p); set({ profile: p }); },
    async addTest(t) { const db = await getLocalDb(); await saveTest(db, t); set({ tests: await loadTests(db) }); },
    async removeTest(id) { const db = await getLocalDb(); await deleteTest(db, id); set({ tests: await loadTests(db) }); },
    async startPlan(plan) {
      const db = await getLocalDb();
      for (const old of get().plans) if (old.status !== "done") await savePlan(db, { ...old, status: "done" });
      await savePlan(db, plan);
      set({ plans: await loadPlans(db) });
    },
    async updatePlan(plan) { const db = await getLocalDb(); await savePlan(db, plan); set({ plans: await loadPlans(db) }); },
    async removePlan(id) { const db = await getLocalDb(); await deletePlan(db, id); set({ plans: await loadPlans(db) }); },
  };
});

/** The planner's data, read from the phone the first time anything asks. */
export function usePlanner(): { profile: Profile | null; tests: TestResult[]; plans: Plan[]; loaded: boolean } {
  const profile = usePlannerStore((s) => s.profile);
  const tests = usePlannerStore((s) => s.tests);
  const plans = usePlannerStore((s) => s.plans);
  const loaded = usePlannerStore((s) => s.loaded);
  useEffect(() => { if (!loaded) void usePlannerStore.getState().load(); }, [loaded]);
  return { profile, tests, plans, loaded };
}

/** The plan that is running or paused, if any. */
export function useCurrentPlan(): Plan | null {
  return usePlanner().plans.find((p) => p.status !== "done") ?? null;
}

/** What the logs say about where strength is the limiter. Recomputed when the logs change. */
export function useStyleInsight(): StyleInsight {
  const logbook = useData((d) => d.logbook);
  const outside = useOutsideLogs();
  const roped = useRopedLogs();
  const eq = useStore((s) => s.settings.ropedEquivalence);
  return useMemo(() => {
    const now = new Date();
    const evidence = outsideEvidence(outside);
    const ropedWork = ropedWorking(roped, now);
    const ropedSends = roped.filter((l) => isSend(l.result)).length;
    const boardSends = logbook.filter((e) => e.isSend && e.difficulty > 0).length;
    return styleInsight({
      samples: angleSamples(logbook, outside, gradeOfEntry),
      boardWorking: workingGrade(logbook, now, gradeOfEntry),
      outsideWorking: workingGrade([], now, gradeOfEntry, evidence),
      ropedV: ropedWork === null ? null : ropedAsV(ropedWork, eq),
      boulderV: workingGrade(logbook, now, gradeOfEntry, evidence),
      sends: { board: boardSends, outside: evidence.length, roped: ropedSends, boulder: boardSends + evidence.length },
      now,
    });
  }, [logbook, outside, roped, eq]);
}

/** Changes to the current plan, each saved at once. Skipping, moving, lightening and swapping are always one step and never count against the user. */
export function planActions() {
  const apply = async (f: (p: Plan) => Plan) => {
    const plan = usePlannerStore.getState().plans.find((p) => p.status !== "done");
    if (plan) await usePlannerStore.getState().updatePlan(f(plan));
  };
  return {
    skip: (id: string) => apply((p) => skipSession(p, id)),
    complete: (id: string) => apply((p) => completeSession(p, id)),
    lighten: (id: string) => apply((p) => updateSession(p, id, lighten)),
    swap: (id: string, from: string, to: string) => apply((p) => updateSession(p, id, (s) => swapExercise(s, from, to))),
    setStatus: (status: Plan["status"]) => apply((p) => ({ ...p, status })),
    /** Returns the result, so the screen can show why a move was refused. */
    async move(id: string, to: string, today: string): Promise<MoveResult> {
      const plan = usePlannerStore.getState().plans.find((p) => p.status !== "done");
      if (!plan) return { ok: false, reason: "There is no plan.", nearest: null };
      const r = moveSession(plan, id, to, today);
      if (r.ok) await usePlannerStore.getState().updatePlan(r.plan);
      return r;
    },
  };
}

/** A planned session as it should be done today: adjusted for how recent training felt, the body notes, energy and yesterday's climbing. */
export function useAdapted(session: PlanSession | null, blockKind: Plan["block"]["kind"] | undefined): Adapted | null {
  const entries = useTraining();
  const notes = useDayNotes();
  const activities = useActivities();
  const working = useWorkingGrades();
  return useMemo(() => {
    if (!session) return null;
    return adaptSession(session, { today: dayOf(new Date()), entries, notes, activities, working, blockKind: blockKind ?? "balanced" });
  }, [session, entries, notes, activities, working, blockKind]);
}
