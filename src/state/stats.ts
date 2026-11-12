import { useMemo } from "react";
import type { GradeDisplay } from "../core/grades";
import { overview, WEEKS_SHOWN, type Overview } from "../core/stats";
import { grades } from "../data/grades";
import { OUTSIDE_PROVIDER, outsideAsEntries } from "../core/outside";
import { DEFAULT_PROVIDER, getProvider } from "../providers";
import { useData } from "./data";
import { useOutsideLogs } from "./outside";
import { useStore } from "./store";

/** A logged send's grade on the shared scale, through its own provider's table. An off-board entry already holds it. */
export const gradeOfEntry = (e: { provider: string; difficulty: number }): number => (e.provider === OUTSIDE_PROVIDER ? e.difficulty : getProvider(e.provider).commonGrade(e.difficulty));

/** The logbook summarised, across every provider and, unless turned off in the stats, gym and outdoor climbs. */
export function useOverview(weeksShown = WEEKS_SHOWN): Overview {
  const logbook = useData((d) => d.logbook);
  const outside = useOutsideLogs();
  const include = useStore((s) => s.settings.statsOffBoard !== false);
  return useMemo(() => overview(include ? [...logbook, ...outsideAsEntries(outside)] : logbook, new Date(), gradeOfEntry, weeksShown), [logbook, outside, include, weeksShown]);
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
