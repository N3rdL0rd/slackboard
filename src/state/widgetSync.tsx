import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { ACTIVITY_KINDS } from "../core/activity";
import { measure, type Goal, type GoalContext } from "../core/goals";
import { buildSnapshot, type SnapshotGoal } from "../core/widgetData";
import { renderNamed, WIDGET_KEY, WIDGET_NAMES } from "../widgets/taskHandler";
import { useGoalLabels, useGoals, useLogsReady } from "./goals";
import { useCurrentPlan } from "./planner";
import { useActivities, useToday } from "./today";

const DEBOUNCE_MS = 1500;

/** The active goal furthest along that is not yet reached, for the Goal widget. */
function pickGoal(goals: Goal[], ctx: GoalContext): SnapshotGoal | null {
  let best: { goal: Goal; p: ReturnType<typeof measure> } | null = null;
  for (const goal of goals) {
    if (goal.status !== "active") continue;
    const p = measure(goal, ctx);
    if (p.done) continue;
    if (!best || p.progress > best.p.progress) best = { goal, p };
  }
  return best ? { title: best.goal.title, progress: best.p.progress, summary: best.p.summary } : null;
}

/**
 * Keeps the home-screen widgets current: writes a small snapshot of the streak, the week, today's plan and a goal when they
 * change, then asks Android to redraw each widget that is on a home screen. Android only. Mounted once at the root.
 */
export function useWidgetSync(): void {
  const activities = useActivities();
  const plan = useCurrentPlan();
  const goals = useGoals();
  const labels = useGoalLabels();
  const today = useToday();
  const ready = useLogsReady();
  const snapshot = useMemo(() => {
    if (!ready) return null;
    return buildSnapshot({
      today, now: new Date(),
      entries: activities.map((a) => ({ day: a.day, send: a.facts.send && a.kind !== "training", counts: ACTIVITY_KINDS[a.kind].countsTowardStreak })),
      plan: plan && plan.status === "active" ? plan.sessions.map((s) => ({ id: s.id, day: s.day, title: s.title, minutes: s.minutes, status: s.status })) : [],
      goal: pickGoal(goals, { activities, today, labels }),
    });
  }, [ready, activities, plan, goals, labels, today]);
  useEffect(() => {
    if (Platform.OS !== "android" || !snapshot) return;
    const t = setTimeout(() => {
      void (async () => {
        try {
          await AsyncStorage.setItem(WIDGET_KEY, JSON.stringify(snapshot));
          for (const widgetName of WIDGET_NAMES) await requestWidgetUpdate({ widgetName, renderWidget: async () => (await renderNamed(widgetName)) ?? <></> });
        } catch (e) {
          console.warn("Widget update failed", e);
        }
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [snapshot]);
}
