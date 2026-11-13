import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { climbingDays } from "../core/activity";
import { dayOf } from "../core/days";
import { plan } from "../core/notifications";
import { streakInfo } from "../core/streak";
import { useDayNotes } from "./dayNotes";
import { useGoalLabels, useLogsReady } from "./goals";
import { useCurrentPlan } from "./planner";
import { reconcile } from "./notifications";
import { useStore } from "./store";
import { useActivities, useClosestMilestone, useToday, useWorkingGrades } from "./today";

/** Waits for a burst of logging to settle before rescheduling, so a flurry of edits is one reconcile. */
const SETTLE_MS = 1500;

/**
 * Keeps the phone's scheduled notifications true to the log and the settings: when the app opens or comes back to the foreground, after
 * any log, and after a settings change. It waits for the logs to be fully read, because a reminder must never be cancelled over a log
 * that is only half loaded. Mounted once, at the root.
 */
export function useNotificationSync(): void {
  const prefs = useStore((s) => s.settings.notifications);
  const activities = useActivities();
  const notes = useDayNotes();
  const labels = useGoalLabels();
  const working = useWorkingGrades();
  const milestone = useClosestMilestone();
  const today = useToday();
  const currentPlan = useCurrentPlan();
  const ready = useLogsReady();
  const [wake, setWake] = useState(0);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") setWake((n) => n + 1); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const now = new Date();
      const streak = streakInfo(climbingDays(activities), dayOf(now));
      void reconcile(plan({ now, prefs, activities, notes, streak, labels, working, milestone, plan: currentPlan }));
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, prefs, activities, notes, labels, working, milestone, today, wake, currentPlan]);
}
