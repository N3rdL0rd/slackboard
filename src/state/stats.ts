import { useMemo } from "react";
import type { GradeDisplay } from "../core/grades";
import { overview, WEEKS_SHOWN, type Overview } from "../core/stats";
import { grades } from "../data/grades";
import { OUTSIDE_PROVIDER, outsideAsEntries } from "../core/outside";
import { DEFAULT_PROVIDER, getProvider } from "../providers";
import { useData } from "./data";
import { useOutsideLogs } from "./outside";
import { useRopedLogs } from "./roped";
import { ropedAsEntries, ropedEvidence, type RopedEquivalence } from "../core/ropedEquivalence";
import type { GradeEvidence } from "../core/outside";
import type { LogEntry } from "../core/types";
import type { OutsideLog } from "../core/outside";
import type { RopedLog } from "../core/roped";
import { useStore } from "./store";
import { memoLast } from "./sharedMemo";

/** A logged send's grade on the shared scale, through its own provider's table. An off-board entry already holds it. */
export const gradeOfEntry = (e: { provider: string; difficulty: number }): number => (e.provider === OUTSIDE_PROVIDER ? e.difficulty : getProvider(e.provider).commonGrade(e.difficulty));

const NO_ROPED: RopedForWorking = { entries: [], evidence: [] };

export interface RopedForWorking { entries: LogEntry[]; evidence: GradeEvidence[] }

const ropedForWorking = memoLast((on: boolean, eq: RopedEquivalence, roped: RopedLog[]): RopedForWorking => (on ? { entries: ropedAsEntries(roped, eq), evidence: ropedEvidence(roped, eq) } : NO_ROPED));

/** Roped sends placed on the boulder scale, for the working grade, when the user has turned that on. Nothing otherwise. */
export function useRopedForWorking(): RopedForWorking {
  const on = useStore((s) => s.settings.ropedWorking);
  const eq = useStore((s) => s.settings.ropedEquivalence);
  const roped = useRopedLogs();
  return ropedForWorking(on, eq, roped);
}

// One memo per range: the screens ask for a few (8, 16, the stats range), and each is computed once for all the components that use it.
const overviews = new Map<number, (lb: LogEntry[], out: OutsideLog[], inc: boolean, rp: RopedForWorking) => Overview>();

/** The logbook summarised, across every provider and, unless turned off in the stats, gym and outdoor climbs. */
export function useOverview(weeksShown = WEEKS_SHOWN): Overview {
  const logbook = useData((d) => d.logbook);
  const outside = useOutsideLogs();
  const include = useStore((s) => s.settings.statsOffBoard !== false);
  const roped = useRopedForWorking();
  let f = overviews.get(weeksShown);
  if (!f) {
    f = memoLast((lb, out, inc, rp) => overview([...lb, ...(inc ? outsideAsEntries(out) : []), ...rp.entries], new Date(), gradeOfEntry, weeksShown));
    overviews.set(weeksShown, f);
  }
  return f(logbook, outside, include, roped);
}

/** A shared-scale grade in the user's notation (V, Font or both), through the default provider's table. */
export const commonLabel = (grade: number, display: GradeDisplay): string => grades.label(DEFAULT_PROVIDER.fromCommonGrade(grade), display).primary;

/** "+2 V in 8 weeks" style change in working grade, or null when it did not move a whole grade. */
export function trendLabel(o: Overview): string | null {
  if (o.working == null || o.trend == null) return null;
  const dv = Math.floor(o.working) - Math.floor(o.working - o.trend);
  if (dv === 0) return null;
  return `${dv > 0 ? "+" : "-"}${Math.abs(dv)} V in 8 weeks`;
}
