import type { Day } from "../core/days";
import { dayOf } from "../core/days";
import { attemptWindows, timedSessions, type TimedSession } from "../core/attempts";
import type { LitEntry } from "../core/litHistory";
import type { LogEntry } from "../core/types";
import { useData } from "./data";
import { useLitHistory } from "./litHistory";
import { memoLast } from "./sharedMemo";

export interface Timing {
  /** Sessions with at least two logged entries, by the local day each one ended. */
  byDay: Map<Day, TimedSession[]>;
  /** A climb's name by its id, for naming the one that took the most time. */
  nameOf: (climbUuid: string) => string | null;
}

const build = memoLast((logbook: LogEntry[], lit: LitEntry[]): Timing => {
  const windows = attemptWindows(logbook, lit);
  const byDay = new Map<Day, TimedSession[]>();
  // One entry is a climb, not a session: it has no span worth showing.
  for (const s of timedSessions(windows)) {
    if (s.windows.length < 2) continue;
    const day = dayOf(new Date(s.end));
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const names = new Map(logbook.map((e) => [e.climbUuid, e.climbName]));
  return { byDay, nameOf: (id) => names.get(id) ?? null };
});

/** Attempt windows and sessions worked out from the board logbook and what was lit. Built once per change to either. */
export function useTiming(): Timing {
  const logbook = useData((d) => d.logbook);
  const lit = useLitHistory();
  return build(logbook, lit);
}
