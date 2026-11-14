import * as Application from "expo-application";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect } from "react";
import { create } from "zustand";
import { addEntry, crashEntry, logText, parseLog, type CrashEntry } from "../core/crashLog";
import { useStore } from "./store";

declare const ErrorUtils: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void };

const logFile = () => new File(Paths.document, "crash-log.json");
const version = () => `${Application.nativeApplicationVersion ?? "?"} (${Application.nativeBuildVersion ?? "?"})`;

function read(): CrashEntry[] {
  try { const f = logFile(); return f.exists ? parseLog(f.textSync()) : []; } catch { return []; }
}
function write(log: CrashEntry[]): void {
  try { const f = logFile(); if (!f.exists) f.create(); f.write(JSON.stringify(log)); } catch { /* a log that can't be written must never cause another error */ }
}

interface CrashState { count: number; refresh: () => void; clear: () => void }
export const useCrashStore = create<CrashState>((set) => ({
  count: 0,
  refresh: () => set({ count: read().length }),
  clear: () => { write([]); set({ count: 0 }); },
}));

/** Shares the log as a plain text file. Returns false when sharing isn't available. */
export async function shareCrashLog(): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const f = new File(Paths.cache, "slackboard-crash-log.txt");
  f.create({ overwrite: true });
  f.write(logText(read()));
  await Sharing.shareAsync(f.uri, { mimeType: "text/plain", dialogTitle: "Slackboard crash log" });
  return true;
}

/** Records unhandled JavaScript errors while the setting is on, then lets the normal handler run. Mounted once at the root. */
export function useCrashLog(): void {
  useEffect(() => {
    const prev = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, fatal) => {
      try {
        if (useStore.getState().settings.crashLog) {
          write(addEntry(read(), crashEntry(error, fatal === true, new Date(), version())));
          useCrashStore.getState().refresh();
        }
      } catch { /* recording must not change how the error is handled */ }
      prev(error, fatal);
    });
    useCrashStore.getState().refresh();
    return () => ErrorUtils.setGlobalHandler(prev);
  }, []);
}
