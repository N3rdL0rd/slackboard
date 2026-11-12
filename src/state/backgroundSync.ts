import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { useStore } from "./store";
import { useSync } from "./sync";

export const BACKGROUND_SYNC_TASK = "slackboard-background-sync";
/** Leave ample headroom inside WorkManager's execution window; committed pages remain usable next run. */
export const BACKGROUND_SYNC_DEADLINE_MS = 60_000;
const BACKGROUND_SYNC_INTERVAL_MINUTES = 15;

export async function runBackgroundSync(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    // A headless launch has no Root component: restore accounts, deferrals and keystore tokens here.
    await useSync.getState().boot();
    if (!Object.keys(useStore.getState().accounts).length) {
      await syncBackgroundTaskRegistration();
      return BackgroundTask.BackgroundTaskResult.Success;
    }
    await useSync.getState().syncNow(undefined, { deadlineMs: BACKGROUND_SYNC_DEADLINE_MS });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn("Background sync failed", e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, runBackgroundSync);
}

/** Keeps one OS registration while any account exists. Safe to repeat at every app start. */
export async function syncBackgroundTaskRegistration(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    if (Object.keys(useStore.getState().accounts).length) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: BACKGROUND_SYNC_INTERVAL_MINUTES });
    } else {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    }
  } catch (e) {
    // Foreground sync remains available in Expo Go, restricted devices and unsupported environments.
    console.warn("Background sync is unavailable", e);
  }
}

// completeSignIn/signOutProvider both change this store; this also covers the last-account transition.
useStore.subscribe((state, previous) => {
  if (Object.keys(state.accounts).length !== Object.keys(previous.accounts).length) void syncBackgroundTaskRegistration();
});
