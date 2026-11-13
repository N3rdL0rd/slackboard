import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { activitiesOf, climbingDays, type Activity } from "../core/activity";
import { withDayEfforts, type DayNote } from "../core/body";
import { dayOf, type Day } from "../core/days";
import { milestoneCandidates, motivationLine, toastMilestone, type Milestone } from "../core/milestones";
import { restNudge, type Nudge } from "../core/nudge";
import { ropedWorking } from "../core/roped";
import type { WorkingGrades } from "../core/load";
import { streakInfo, weekDots, type StreakInfo, type WeekDot } from "../core/streak";
import { useData } from "./data";
import { useDayNotes, useDayNotesStore } from "./dayNotes";
import { closestGoal, goalMilestone, measure, type Goal } from "../core/goals";
import { useGoalLabels, useGoals } from "./goals";
import { useOutsideLogs } from "./outside";
import { useRopedLogs } from "./roped";
import { useTraining } from "./training";
import { gradeOfEntry, useOverview } from "./stats";
import { useStore } from "./store";

/** Snooze keys for the two lines that can be hidden for the day. */
export const NUDGE_KEY = "nudge";
export const MOTIVATION_KEY = "motivation";

/** The local day, kept current: it moves on at midnight and when the app comes back to the foreground. */
export function useToday(): Day {
  const [today, setToday] = useState(() => dayOf(new Date()));
  useEffect(() => {
    const refresh = () => setToday((t) => { const now = dayOf(new Date()); return now === t ? t : now; });
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") refresh(); });
    const timer = setInterval(refresh, 60_000);
    return () => { sub.remove(); clearInterval(timer); };
  }, []);
  return today;
}

/** Every kind of entry as one list, newest first, with each day's effort rating on its entries. */
export function useActivities(): Activity[] {
  const logbook = useData((d) => d.logbook);
  const offBoard = useOutsideLogs();
  const roped = useRopedLogs();
  const training = useTraining();
  const notes = useDayNotes();
  return useMemo(() => withDayEfforts(activitiesOf({ board: logbook, offBoard, roped, training, gradeOf: gradeOfEntry }), notes), [logbook, offBoard, roped, training, notes]);
}

export interface TodayInfo {
  today: Day;
  streak: StreakInfo;
  dots: WeekDot[];
  climbingDays: Day[];
  /** The motivation line, or null when it is off, hidden for today, or there is nothing close and true to say. */
  motivation: Milestone | null;
  /** A ring for an active weekly or monthly volume goal, or null. Shown whatever the motivation setting says: it is the user's own goal. */
  ring: { progress: number; label: string; text: string } | null;
  /** The rest nudge, or null when it is off, snoozed, or the log doesn't call for it. */
  nudge: Nudge | null;
  /** Every milestone, close or not, for the sheet that explains the line. */
  notes: DayNote[];
}

/** What the Climb tab's Today row shows: the streak, the week dots, and the one line to say today (the nudge first, then the motivation). */
export function useTodayInfo(): TodayInfo {
  const activities = useActivities();
  const notes = useDayNotes();
  const roped = useRopedLogs();
  const today = useToday();
  const motivationOn = useStore((s) => s.settings.motivation);
  const level = useStore((s) => s.settings.nudges);
  const snoozes = useDayNotesStore((s) => s.snoozes);
  const goals = useGoals();
  const labels = useGoalLabels();
  const overview = useOverview(8);
  const boulderWorking = overview.working;
  return useMemo(() => {
    const days = climbingDays(activities);
    const streak = streakInfo(days, today);
    const working = { boulder: boulderWorking, roped: ropedWorking(roped, new Date()) };
    const nudge = restNudge({ activities, notes, today, level, working, streakAlive: streak.current > 0, snoozedThrough: snoozes[NUDGE_KEY] ?? null });
    const hidden = (snoozes[MOTIVATION_KEY] ?? "") >= today;
    const goalCtx = { activities, today, labels };
    // A goal that is close takes the place of the usual line.
    const close = closestGoal(goals, goalCtx);
    const motivation = motivationOn && !hidden ? (close ? goalMilestone(close.goal, close.progress) : motivationLine({ activities, today, streak })) : null;
    return { today, streak, dots: weekDots(days, today), climbingDays: days, motivation, ring: ringFor(goals, goalCtx), nudge, notes };
  }, [activities, notes, roped, today, motivationOn, level, snoozes, boulderWorking, goals, labels]);
}

/** The ring for the first active volume goal that runs over a week or a month. */
function ringFor(goals: Goal[], ctx: Parameters<typeof measure>[1]): TodayInfo["ring"] {
  const g = goals.find((x) => x.status === "active" && x.spec.type === "volume" && (x.window.kind === "week" || x.window.kind === "month"));
  if (!g) return null;
  const p = measure(g, ctx);
  return { progress: p.progress, label: String(p.current), text: `${g.title}. ${p.summary}` };
}

/** The grades a rest nudge and the notifications judge a hard day against: the boulder working grade and the roped one. */
export function useWorkingGrades(): WorkingGrades {
  const roped = useRopedLogs();
  const overview = useOverview(8);
  const boulder = overview.working;
  return useMemo(() => ({ boulder, roped: ropedWorking(roped, new Date()) }), [boulder, roped]);
}

/** The one thing worth saying about progress right now: a close goal, else the closest milestone. Null when there is nothing close and true. */
export function useClosestMilestone(): Milestone | null {
  const activities = useActivities();
  const today = useToday();
  const goals = useGoals();
  const labels = useGoalLabels();
  return useMemo(() => {
    const close = closestGoal(goals, { activities, today, labels });
    return close ? goalMilestone(close.goal, close.progress) : motivationLine({ activities, today, streak: streakInfo(climbingDays(activities), today) });
  }, [activities, today, goals, labels]);
}

/** All the milestones that can be said, for the sheet that shows how the line was chosen. */
export function useMilestones(): Milestone[] {
  const activities = useActivities();
  const today = useToday();
  return useMemo(() => milestoneCandidates({ activities, today, streak: streakInfo(climbingDays(activities), today) }), [activities, today]);
}

/** The milestone about the board grade just logged (a V number), when it has come close and motivation lines are on. */
export function useToastMilestone(v: number | undefined): Milestone | null {
  const activities = useActivities();
  const today = useToday();
  const on = useStore((s) => s.settings.motivation);
  const goals = useGoals();
  const labels = useGoalLabels();
  return useMemo(() => {
    if (v === undefined || !on) return null;
    const m = toastMilestone({ activities, today, streak: streakInfo(climbingDays(activities), today) }, v);
    if (m) return m;
    // No milestone about this grade: a goal that is close can be said instead.
    const close = closestGoal(goals, { activities, today, labels });
    return close ? goalMilestone(close.goal, close.progress) : null;
  }, [activities, today, on, v, goals, labels]);
}
