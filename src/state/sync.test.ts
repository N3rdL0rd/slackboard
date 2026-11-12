import { describe, expect, it, vi } from "vitest";

vi.mock("expo", () => ({}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-sqlite", () => ({}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("@react-native-async-storage/async-storage", () => ({}));

// Native module-loading boundary: the persisted store must be evaluated only after Expo mocks exist.
const { useStore } = await import("./store");
const core = await import("../core/sync");
const { useSync } = await import("./sync");

describe("deferred first sync", () => {
  it("clears a provider's deferral when forgotten", () => {
    useSync.setState({ deferred: {} });
    useSync.getState().defer("tension");
    expect(useSync.getState().deferred).toEqual({ tension: true });
    useSync.getState().forget("tension");
    expect(useSync.getState().deferred).toEqual({});
    expect(useSync.getState().by.tension).toBeUndefined();
  });

  it("keeps an unfinished deadline-paused download deferred and incomplete", async () => {
    useStore.setState({ accounts: { tension: { username: "u", userId: 7 } } });
    useSync.setState({ deferred: { tension: true }, by: {} });
    vi.spyOn(core, "syncAll").mockResolvedValue({ page: 1, totals: { climbs: 100 }, more: true });
    vi.spyOn(core, "setMeta").mockResolvedValue();
    const meta = await import("../data/sqlite");
    vi.spyOn(meta, "getDb").mockResolvedValue({} as never);
    const outbox = await import("./outbox");
    vi.spyOn(outbox, "flushNow").mockResolvedValue(null);
    vi.spyOn(outbox, "refreshOutboxCount").mockResolvedValue();
    const session = await import("./session");
    vi.spyOn(session, "sessionFor").mockReturnValue({ provider: "tension", userId: 7, token: "t" });
    await useSync.getState().syncNow("tension", { deadlineMs: 100 });
    expect(useSync.getState().by.tension).toMatchObject({ initialDone: false, running: false });
    expect(useSync.getState().deferred.tension).toBe(true);
    expect(core.setMeta).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("clears deferral and records completion only after the last page", async () => {
    useStore.setState({ accounts: { tension: { username: "u", userId: 7 } } });
    useSync.setState({ deferred: { tension: true }, by: {} });
    vi.spyOn(core, "syncAll").mockResolvedValue({ page: 3, totals: { climbs: 200 }, more: false });
    vi.spyOn(core, "setMeta").mockResolvedValue();
    const meta = await import("../data/sqlite");
    vi.spyOn(meta, "getDb").mockResolvedValue({} as never);
    const outbox = await import("./outbox");
    vi.spyOn(outbox, "flushNow").mockResolvedValue(null);
    vi.spyOn(outbox, "refreshOutboxCount").mockResolvedValue();
    const session = await import("./session");
    vi.spyOn(session, "sessionFor").mockReturnValue({ provider: "tension", userId: 7, token: "t" });
    await useSync.getState().syncNow("tension");
    expect(useSync.getState().by.tension).toMatchObject({ initialDone: true, running: false });
    expect(useSync.getState().deferred).toEqual({});
    expect(core.setMeta).toHaveBeenCalledWith(expect.anything(), "initial_sync_complete", "1");
    vi.restoreAllMocks();
  });

  it("cancels the active run when a provider is forgotten", async () => {
    useStore.setState({ accounts: { tension: { username: "u", userId: 7 } } });
    useSync.setState({ deferred: { tension: true }, by: {} });
    const waiting = Promise.withResolvers<void>();
    vi.spyOn(core, "syncAll").mockImplementation(async (_db, _session, opts) => {
      expect(opts?.signal?.aborted).toBe(false);
      await waiting.promise;
      expect(opts?.signal?.aborted).toBe(true);
      throw new core.SyncError("Sync cancelled");
    });
    const meta = await import("../data/sqlite");
    vi.spyOn(meta, "getDb").mockResolvedValue({} as never);
    const outbox = await import("./outbox");
    vi.spyOn(outbox, "flushNow").mockResolvedValue(null);
    const session = await import("./session");
    vi.spyOn(session, "sessionFor").mockReturnValue({ provider: "tension", userId: 7, token: "t" });
    const running = useSync.getState().syncNow("tension");
    await Promise.resolve();
    useSync.getState().forget("tension");
    waiting.resolve();
    await running;
    expect(useSync.getState().by.tension).toBeUndefined();
    vi.restoreAllMocks();
  });
});
