import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { activitiesOf, climbingDays, type Activity } from "../core/activity";
import { withDayEfforts, type DayNote } from "../core/body";
import { dayOf, type Day } from "../core/days";
import { milestoneCandidates, motivationLine, toastMilestone, type Milestone } from "../core/milestones";
import { restNudge, type Nudge } from "../core/nudge";
import { ropedWorking } from "../core/roped";
import { streakInfo, weekDots, type StreakInfo, type WeekDot } from "../core/streak";
import { useData } from "./data";
import { useDayNotes, useDayNotesStore } from "./dayNotes";
import { useOutsideLogs } from "./outside";
import { useRopedLogs } from "./roped";
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
  const notes = useDayNotes();
  return useMemo(() => withDayEfforts(activitiesOf({ board: logbook, offBoard, roped, gradeOf: gradeOfEntry }), notes), [logbook, offBoard, roped, notes]);
}

export interface TodayInfo {
  today: Day;
  streak: StreakInfo;
  dots: WeekDot[];
  climbingDays: Day[];
  /** The motivation line, or null when it is off, hidden for today, or there is nothing close and true to say. */
  motivation: Milestone | null;
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
  const overview = useOverview(8);
  const boulderWorking = overview.working;
  return useMemo(() => {
    const days = climbingDays(activities);
    const streak = streakInfo(days, today);
    const working = { boulder: boulderWorking, roped: ropedWorking(roped, new Date()) };
    const nudge = restNudge({ activities, notes, today, level, working, streakAlive: streak.current > 0, snoozedThrough: snoozes[NUDGE_KEY] ?? null });
    const hidden = (snoozes[MOTIVATION_KEY] ?? "") >= today;
    const motivation = motivationOn && !hidden ? motivationLine({ activities, today, streak }) : null;
    return { today, streak, dots: weekDots(days, today), climbingDays: days, motivation, nudge, notes };
  }, [activities, notes, roped, today, motivationOn, level, snoozes, boulderWorking]);
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
  return useMemo(() => {
    if (v === undefined || !on) return null;
    return toastMilestone({ activities, today, streak: streakInfo(climbingDays(activities), today) }, v);
  }, [activities, today, on, v]);
}
