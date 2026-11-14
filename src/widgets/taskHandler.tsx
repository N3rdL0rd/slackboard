import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { dayOf } from "../core/days";
import { parseSnapshot, widgetView } from "../core/widgetData";
import { GoalWidget, QuickLogWidget, StreakWidget, TodayWidget, WeekWidget } from "./widgets";

export const WIDGET_KEY = "slackboard-widget";
export const WIDGET_NAMES = ["Streak", "Today", "Week", "QuickLog", "Goal"] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** A widget drawn for today from the last snapshot the app wrote. A snapshot from yesterday still reads correctly today. */
export async function renderNamed(name: string) {
  const v = widgetView(parseSnapshot(await AsyncStorage.getItem(WIDGET_KEY)), dayOf(new Date()));
  switch (name as WidgetName) {
    case "Streak": return <StreakWidget v={v} />;
    case "Today": return <TodayWidget v={v} />;
    case "Week": return <WeekWidget v={v} />;
    case "QuickLog": return <QuickLogWidget />;
    case "Goal": return <GoalWidget v={v} />;
    default: return null;
  }
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === "WIDGET_DELETED") return;
  try {
    const el = await renderNamed(props.widgetInfo.widgetName);
    if (el) props.renderWidget(el);
  } catch (e) {
    console.warn("Widget draw failed", e);
  }
}
