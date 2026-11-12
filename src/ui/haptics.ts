import * as Haptics from "expo-haptics";
import { useStore } from "../state/store";

/**
 * Haptic feedback. Every call is a no-op when the user turned haptics off, and never throws (some devices have no haptic engine).
 * Kinds: `selection` is the light detent tick (dial steps, swiping past a climb); `light`/`medium`/`heavy` are taps of rising
 * weight; `success`/`warning` are the system's own two-beat patterns; `done` is a longer cue for the end of a timer.
 */
const enabled = () => useStore.getState().settings.haptics !== false;
const run = (p: Promise<unknown>) => { p.catch(() => {}); };

export const haptic = {
  selection: () => { if (enabled()) run(Haptics.selectionAsync()); },
  light: () => { if (enabled()) run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); },
  medium: () => { if (enabled()) run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)); },
  heavy: () => { if (enabled()) run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)); },
  success: () => { if (enabled()) run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); },
  warning: () => { if (enabled()) run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)); },
  done: () => {
    if (!enabled()) return;
    run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    setTimeout(() => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 260);
    setTimeout(() => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 520);
  },
};
