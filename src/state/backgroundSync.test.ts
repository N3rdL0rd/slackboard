import { beforeEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => { Object.assign(globalThis, { __DEV__: false }); });

vi.mock("expo", () => ({}));
vi.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: vi.fn(() => Promise.resolve()),
  unregisterTaskAsync: vi.fn(() => Promise.resolve()),
}));
vi.mock("expo-task-manager", () => ({ defineTask: vi.fn(), isTaskDefined: vi.fn(() => true) }));
vi.mock("expo-sqlite", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({}));
// Test module-loading boundary: app stores must not evaluate native Expo modules until mocks are installed.
const { BACKGROUND_SYNC_DEADLINE_MS, BACKGROUND_SYNC_TASK, runBackgroundSync, syncBackgroundTaskRegistration } = await import("./backgroundSync");
const { useStore } = await import("./store");
const { useSync } = await import("./sync");
const BackgroundTask = await import("expo-background-task");

describe("background sync task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ accounts: { tension: { username: "u", userId: 7 } } });
    vi.spyOn(useSync.getState(), "boot").mockResolvedValue();
    vi.spyOn(useSync.getState(), "syncNow").mockResolvedValue();
  });

  it("boots persisted stores before syncing with a deadline", async () => {
    await expect(runBackgroundSync()).resolves.toBe(1);
    expect(useSync.getState().boot).toHaveBeenCalledOnce();
    expect(useSync.getState().syncNow).toHaveBeenCalledWith(undefined, { deadlineMs: BACKGROUND_SYNC_DEADLINE_MS });
  });

  it("registers while signed in and unregisters after the last sign-out", async () => {
    await syncBackgroundTaskRegistration();
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
    useStore.setState({ accounts: {} });
    await syncBackgroundTaskRegistration();
    expect(BackgroundTask.unregisterTaskAsync).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK);
    await expect(runBackgroundSync()).resolves.toBe(1);
    expect(useSync.getState().syncNow).not.toHaveBeenCalled();
  });

  it("reports a failed headless boot to the task manager", async () => {
    vi.mocked(useSync.getState().boot).mockRejectedValueOnce(new Error("storage unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(runBackgroundSync()).resolves.toBe(2);
    expect(useSync.getState().syncNow).not.toHaveBeenCalled();
  });
});
