/**
 * The opt-in crash log: unhandled JavaScript errors kept on the phone, shared only when the user chooses. Pure helpers; the
 * handler and the file are in state/crashLog.ts. Only what the error itself says is kept, trimmed to a fixed size, with the
 * app version and the time. Native crashes (the app process dying) are not seen here.
 */
export interface CrashEntry { at: string; fatal: boolean; name: string; message: string; stack: string; version: string }

export const MAX_ENTRIES = 30;
const MAX_MESSAGE = 500;
const MAX_STACK = 3000;

const cut = (s: unknown, n: number): string => (typeof s === "string" ? s : "").slice(0, n);

/** One error as a log entry. Anything that is not an Error is kept as text. */
export function crashEntry(error: unknown, fatal: boolean, now: Date, version: string): CrashEntry {
  const e = typeof error === "object" && error !== null ? (error as { name?: unknown; message?: unknown; stack?: unknown }) : null;
  return {
    at: now.toISOString(),
    fatal,
    name: cut(e?.name ?? "Error", 80),
    message: cut(e ? e.message : String(error), MAX_MESSAGE),
    stack: cut(e?.stack, MAX_STACK),
    version: cut(version, 40),
  };
}

/** Newest first, capped, so the file cannot grow without bound. */
export const addEntry = (log: CrashEntry[], e: CrashEntry): CrashEntry[] => [e, ...log].slice(0, MAX_ENTRIES);

/** A stored file is untrusted: entries that are not the expected shape are dropped. */
export function parseLog(text: string): CrashEntry[] {
  try {
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((x): x is CrashEntry => typeof x === "object" && x !== null && typeof x.at === "string" && typeof x.message === "string")
      .map((x) => ({ at: cut(x.at, 40), fatal: x.fatal === true, name: cut(x.name, 80), message: cut(x.message, MAX_MESSAGE), stack: cut(x.stack, MAX_STACK), version: cut(x.version, 40) }))
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** The log as plain text for sharing. */
export function logText(log: CrashEntry[]): string {
  if (!log.length) return "No errors recorded.\n";
  return log.map((e) => `${e.at}  v${e.version || "?"}  ${e.fatal ? "FATAL" : "error"}\n${e.name}: ${e.message}\n${e.stack}\n`).join("\n---\n");
}
