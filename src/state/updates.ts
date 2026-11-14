import * as Application from "expo-application";
import { useEffect } from "react";
import { Platform } from "react-native";
import { create } from "zustand";
import { checkDue, installedBuild, parseLatestBuild, RUNS_URL, updateAvailable, type LatestBuild } from "../core/updates";
import { todayOf } from "../core/autoBackup";
import { useStore } from "./store";

const TIMEOUT_MS = 10_000;

interface UpdateState {
  /** What the last check found in this run, or null before any check. */
  latest: LatestBuild | null;
  checking: boolean;
  /** Set when the last check could not be done, so the screen can say so. */
  failed: boolean;
}
export const useUpdateStore = create<UpdateState>(() => ({ latest: null, checking: false, failed: false }));

/** The installed build number (Android), or null elsewhere. */
export const installedVersion = (): number | null => (Platform.OS === "android" ? installedBuild(Application.nativeBuildVersion) : null);

/** Asks GitHub for the newest successful Android build. One small request, no account and no identifier. Never throws. */
export async function checkForUpdate(): Promise<LatestBuild | null> {
  if (Platform.OS !== "android" || useUpdateStore.getState().checking) return useUpdateStore.getState().latest;
  useUpdateStore.setState({ checking: true, failed: false });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RUNS_URL, { signal: ctl.signal, headers: { Accept: "application/vnd.github+json" } });
    const latest = res.ok ? parseLatestBuild(await res.json()) : null;
    if (!latest) { useUpdateStore.setState({ checking: false, failed: true }); return null; }
    useStore.getState().setUpdates({ checkedDay: todayOf(), latest: latest.build });
    useUpdateStore.setState({ latest, checking: false });
    return latest;
  } catch {
    useUpdateStore.setState({ checking: false, failed: true });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Checks once a day while the setting is on. Mounted once at the root. */
export function useUpdateCheck(): void {
  const on = useStore((s) => s.settings.updateCheck);
  useEffect(() => {
    if (!on || Platform.OS !== "android") return;
    const t = setTimeout(() => { if (checkDue(useStore.getState().updates.checkedDay, todayOf())) void checkForUpdate(); }, 30_000);
    return () => clearTimeout(t);
  }, [on]);
}

/** The newer build known now (from this run's check, or the last stored one), or null. */
export function useNewerBuild(): LatestBuild | null {
  const latest = useUpdateStore((s) => s.latest);
  const stored = useStore((s) => s.updates.latest);
  const found = latest ?? (stored > 0 ? { build: stored, at: "" } : null);
  return updateAvailable(installedVersion(), found) ? found : null;
}
