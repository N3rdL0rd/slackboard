/**
 * A local record of the climbs lit up on a board over Bluetooth. It exists on the phone for every board, whether or not the board's
 * service keeps a "recently lit" history, so you can look back at what you climbed.
 */
import { addDays, dayOf, parseStamp } from "./days";
import type { ProviderId } from "./provider";

export interface LitEntry {
  id: string;
  provider: ProviderId;
  climbUuid: string;
  climbName: string;
  boardId: string;
  boardName: string;
  /** The angle the climb was viewed at when it was lit. */
  angle: number;
  /** `yyyy-MM-dd HH:mm:ss`, device local time. */
  litAt: string;
}

/** Lighting the same climb on the same board again within this long is one entry, not a new one. */
export const LIT_REPEAT_SECONDS = 120;
/** The history keeps this many entries, newest first. */
export const LIT_MAX_ENTRIES = 2000;

/** True when `next` is the same climb on the same board as `last`, lit again within `LIT_REPEAT_SECONDS`. */
export function isRepeatLit(last: LitEntry | undefined, next: { boardId: string; climbUuid: string; litAt: string }): boolean {
  if (!last || last.boardId !== next.boardId || last.climbUuid !== next.climbUuid) return false;
  return Math.abs(parseStamp(next.litAt).getTime() - parseStamp(last.litAt).getTime()) <= LIT_REPEAT_SECONDS * 1000;
}

export interface LitDay {
  /** `yyyy-MM-dd`. */
  key: string;
  label: string;
  entries: LitEntry[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Entries (newest first) grouped by local day, labelled "Today", "Yesterday" or "Tue 3 Nov". */
export function groupLitByDay(entries: LitEntry[], now: Date): LitDay[] {
  const today = dayOf(now);
  const yesterday = addDays(today, -1);
  const out: LitDay[] = [];
  for (const e of entries) {
    const d = parseStamp(e.litAt);
    const key = dayOf(e.litAt);
    let group = out[out.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: key === today ? "Today" : key === yesterday ? "Yesterday" : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`, entries: [] };
      out.push(group);
    }
    group.entries.push(e);
  }
  return out;
}

/** "9:41 AM" from a stored time. */
export function litTime(litAt: string): string {
  const d = parseStamp(litAt);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
