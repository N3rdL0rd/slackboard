import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { ACTIVITY_KINDS } from "../core/activity";
import { leadGoal, type Goal, type GoalContext } from "../core/goals";
import { buildSnapshot, type SnapshotGoal } from "../core/widgetData";
import { renderNamed, WIDGET_KEY, WIDGET_NAMES } from "../widgets/taskHandler";
import { useGoalLabels, useGoals, useLogsReady } from "./goals";
import { useCurrentPlan } from "./planner";
import { useActivities, useToday } from "./today";

const DEBOUNCE_MS = 1500;

/** The goal to show on the Goal widget: the same one the Climb tab leads with. */
function pickGoal(goals: Goal[], ctx: GoalContext): SnapshotGoal | null {
  const lead = leadGoal(goals, ctx);
  return lead ? { title: lead.goal.title, progress: lead.progress.progress, summary: lead.progress.summary } : null;
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
