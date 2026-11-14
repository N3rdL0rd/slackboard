import { Directory } from "expo-file-system";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { autoBackupName, backupDue, clampKeep, isAutoBackupName, staleBackups, todayOf } from "../core/autoBackup";
import { buildBackupJson } from "./backupNow";
import { useStore } from "./store";

let running = false;

const setState = (p: Parameters<ReturnType<typeof useStore.getState>["setAutoBackup"]>[0]) => useStore.getState().setAutoBackup(p);

/** Asks for a folder. The backup runs at once so a bad folder shows up now rather than days later. */
export async function chooseBackupFolder(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS !== "android") return { ok: false, message: "Automatic backup needs Android for now." };
  try {
    const dir = await Directory.pickDirectoryAsync();
    // Android names a folder "storage:Name"; only the name is shown.
    setState({ dir: dir.uri, folder: dir.name.replace(/^[^:]+:/, ""), error: "", lastDay: "" });
    return await runAutoBackup(true);
  } catch (e) {
    // Closing the picker throws; that is not an error worth showing.
    return { ok: false, message: e instanceof Error && /cancel/i.test(e.message) ? "" : "Couldn't use that folder." };
  }
}

export function turnOffAutoBackup(): void {
  setState({ dir: null, folder: "", error: "", lastDay: "" });
}

/** Writes today's backup when one is due (or when forced), then removes the oldest beyond the number to keep. Never throws. */
export async function runAutoBackup(force = false): Promise<{ ok: boolean; message: string }> {
  const s = useStore.getState().autoBackup;
  if (!s.dir) return { ok: false, message: "" };
  const today = todayOf();
  if (!force && !backupDue(s.lastDay, today)) return { ok: true, message: "" };
  if (running) return { ok: true, message: "" };
  running = true;
  try {
    const dir = new Directory(s.dir);
    const name = autoBackupName(today);
    const body = await buildBackupJson(new Date());
    // A second run on the same day replaces that day's file instead of failing on a name that exists.
    for (const f of dir.list()) if (f.name === name && "delete" in f) f.delete();
    const file = dir.createFile(name, "application/json");
    file.write(body);
    const names = dir.list().map((f) => f.name);
    for (const old of staleBackups(names, clampKeep(s.keep))) {
      const f = dir.list().find((x) => x.name === old && isAutoBackupName(x.name));
      if (f) f.delete();
    }
    setState({ lastDay: today, error: "" });
    return { ok: true, message: `Backed up to ${s.folder || "the folder"}.` };
  } catch (e) {
    const message = "Couldn't write to the backup folder. Choose it again.";
    setState({ error: message });
    return { ok: false, message };
  } finally {
    running = false;
  }
}

const START_DELAY_MS = 20_000;

/** Runs a due backup shortly after the app opens and each time it comes back to the front. Mounted once at the root. */
export function useAutoBackup(): void {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    // The wait lets the app finish loading its own data first, so the backup is not competing with it.
    const t = setTimeout(() => void runAutoBackup(), START_DELAY_MS);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") void runAutoBackup(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
}
