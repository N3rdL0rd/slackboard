import { exportJson } from "../core/export";
import { EMPTY_MOON, exportMoon } from "../core/moonBackup";
import { preferencesOf } from "../core/prefsBackup";
import { exportSpaces } from "../core/spacesBackup";
import { grades } from "../data/grades";
import { getDb, getLocalDb } from "../data/sqlite";
import { useData } from "./data";
import { useDayNotesStore } from "./dayNotes";
import { useGoalsStore } from "./goals";
import { useLit } from "./litHistory";
import { MOON } from "./moonboard";
import { useOutside } from "./outside";
import { usePlannerStore } from "./planner";
import { useRoped } from "./roped";
import { useStore } from "./store";
import { useTrainingStore } from "./training";

const gradeOf = (e: { difficulty: number }) => ({ v: grades.vName(e.difficulty), font: grades.fontName(e.difficulty) });

/** Everything on the phone, as the full backup file, read straight from the stores so no screen has to be open. */
export async function buildBackupJson(now: Date): Promise<string> {
  // A store the app has not needed yet is read first, so a backup never misses data that has not been opened this run.
  await Promise.all([
    useOutside.getState().loaded ? null : useOutside.getState().load(),
    useRoped.getState().loaded ? null : useRoped.getState().load(),
    useTrainingStore.getState().loaded ? null : useTrainingStore.getState().load(),
    useGoalsStore.getState().loaded ? null : useGoalsStore.getState().load(),
    usePlannerStore.getState().loaded ? null : usePlannerStore.getState().load(),
    useDayNotesStore.getState().loaded ? null : useDayNotesStore.getState().load(),
    useLit.getState().loaded ? null : useLit.getState().load(),
  ]);
  const store = useStore.getState();
  const d = useData.getState();
  const planner = usePlannerStore.getState();
  const account = Object.values(store.accounts)[0];
  const moon = store.accounts[MOON] ? await exportMoon(await getDb(MOON)) : EMPTY_MOON;
  return exportJson({
    now, user: { id: account?.userId ?? null, username: account?.username ?? "" }, range: "all",
    logbook: d.logbook, circuits: d.circuits, offBoard: useOutside.getState().logs, roped: useRoped.getState().logs,
    training: useTrainingStore.getState().entries, goals: useGoalsStore.getState().goals, profile: planner.profile, tests: planner.tests, plans: planner.plans,
    dayNotes: useDayNotesStore.getState().notes, litHistory: useLit.getState().entries, moon, spaces: await exportSpaces(await getLocalDb()),
    preferences: preferencesOf(store), liked: d.liked, blocked: d.blocked, boards: d.boards, gradeOf,
  });
}
