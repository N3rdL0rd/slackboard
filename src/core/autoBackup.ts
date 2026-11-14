/**
 * Automatic backups: one file per day in a folder the user chose, the newest few kept. Pure helpers; the folder and the writing
 * are in state/autoBackup.ts. The files are the same full backup the Export screen makes.
 */
import { dayOf, type Day } from "./days";

export const AUTO_PREFIX = "slackboard-auto-";
export const AUTO_SUFFIX = ".json";
/** How many daily files stay in the folder. */
export const DEFAULT_KEEP = 7;
export const MIN_KEEP = 1;
export const MAX_KEEP = 60;

export const autoBackupName = (day: Day): string => `${AUTO_PREFIX}${day}${AUTO_SUFFIX}`;

/** Only files this feature wrote are ever listed or deleted; anything else in the folder is left alone. */
export const isAutoBackupName = (name: string): boolean => /^slackboard-auto-\d{4}-\d{2}-\d{2}\.json$/.test(name);

/** A backup is due on the first run of each day, and when none has been made. */
export const backupDue = (lastDay: string, today: Day): boolean => lastDay === "" || lastDay < today;

/** The names to delete so that `keep` remain, oldest first. Names from other sources are never returned. */
export function staleBackups(names: string[], keep: number): string[] {
  const k = Math.min(MAX_KEEP, Math.max(MIN_KEEP, Math.floor(keep)));
  const ours = names.filter(isAutoBackupName).sort();
  return ours.slice(0, Math.max(0, ours.length - k));
}

export const clampKeep = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.min(MAX_KEEP, Math.max(MIN_KEEP, Math.round(n))) : DEFAULT_KEEP);

export const todayOf = (d: Date = new Date()): Day => dayOf(d);
