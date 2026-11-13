/**
 * The Log tab's one timeline: every kind of entry grouped into day cards, newest first, with a one-line summary per day ("6 routes,
 * hardest 5.10c · 8 boulder sends"). The kind filters pick which kinds are shown. Everything here is pure; the screen supplies the grade
 * labels (which depend on the user's notation) and where each entry happened.
 */
import { boardEntryOf, byDay, ropedLogOf, type Activity, type ActivityKind } from "./activity";
import { addDays, dayStart, type Day } from "./days";

export type KindFilter = "all" | "board" | "boulders" | "roped" | "training";

export const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" }, { value: "board", label: "Board" }, { value: "boulders", label: "Boulders" }, { value: "roped", label: "Roped" }, { value: "training", label: "Training" },
];

const KINDS: Record<KindFilter, ActivityKind[]> = {
  all: ["board", "offBoard", "roped", "training"], board: ["board"], boulders: ["offBoard"], roped: ["roped"], training: ["training"],
};

export const filterByKind = (list: Activity[], f: KindFilter): Activity[] => (f === "all" ? list : list.filter((a) => KINDS[f].includes(a.kind)));

/** How many routes an entry is: each autobelay lap counts, anything else is one. Zero for an entry that wasn't a send. */
export function routesOf(a: Activity): number {
  const l = ropedLogOf(a);
  if (!l || !a.facts.send) return 0;
  return l.style === "autobelay" ? l.attempts : 1;
}

/** The sends in an entry, for the header numbers: board and boulder sends are one each, a roped entry is its routes. */
export const sendsIn = (a: Activity): number => (a.kind === "roped" ? routesOf(a) : a.facts.send ? 1 : 0);

export interface CardLabels {
  /** A boulder grade on the shared V scale, as the user wants it written. */
  boulder: (shared: number) => string;
  /** A roped grade (an IRCRA number), as the user wants it written. */
  roped: (ircra: number) => string;
}

export interface DayCard {
  day: Day;
  entries: Activity[];
  /** Where it happened: gyms, crags and spaces, each once, in order. */
  places: string[];
  summary: string;
  /** The hardest boulder send that day on the shared scale, or null. */
  hardestBoulder: number | null;
  /** The hardest roped send that day (IRCRA), or null. */
  hardestRoped: number | null;
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const max = (nums: number[]): number | null => (nums.length ? Math.max(...nums) : null);

function summaryOf(entries: Activity[], labels: CardLabels, hardestRoped: number | null): string {
  const parts: string[] = [];
  const of = (k: ActivityKind) => entries.filter((a) => a.kind === k);
  const roped = of("roped");
  if (roped.length) {
    const routes = roped.reduce((n, a) => n + routesOf(a), 0);
    parts.push(routes > 0 ? `${count(routes, "route")}, hardest ${labels.roped(hardestRoped!)}` : count(roped.length, "roped try", "roped tries"));
  }
  for (const [kind, word] of [["board", "board"], ["offBoard", "boulder"]] as const) {
    const list = of(kind);
    if (!list.length) continue;
    const sends = list.filter((a) => a.facts.send).length;
    parts.push(sends > 0 ? count(sends, `${word} send`) : count(list.length, `${word} attempt`));
  }
  const training = of("training");
  if (training.length) parts.push(count(training.length, "exercise"));
  return parts.join(" \u00B7 ");
}

/** Day cards, newest day first. `placeOf` says where an entry happened, or null when unknown. */
export function dayCards(list: Activity[], labels: CardLabels, placeOf: (a: Activity) => string | null = () => null): DayCard[] {
  const groups = [...byDay(list)].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  return groups.map(([day, entries]) => {
    const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
    const places = [...new Set(sorted.map(placeOf).filter((p): p is string => !!p))];
    const hardestBoulder = max(sorted.filter((a) => a.facts.discipline === "boulder" && a.facts.send && a.facts.grade !== null).map((a) => a.facts.grade as number));
    const hardestRoped = max(sorted.filter((a) => a.facts.discipline === "roped" && a.facts.send && a.facts.grade !== null).map((a) => a.facts.grade as number));
    return { day, entries: sorted, places, summary: summaryOf(sorted, labels, hardestRoped), hardestBoulder, hardestRoped };
  });
}

export interface TimelineTotals {
  /** Days with something logged. */
  days: number;
  sends: number;
  /** Different climbs: a board climb once however often it was logged, every other entry on its own. */
  climbs: number;
}

export function timelineTotals(list: Activity[]): TimelineTotals {
  const climbs = new Set<string>();
  let sends = 0;
  for (const a of list) {
    const s = sendsIn(a);
    sends += s;
    const entry = boardEntryOf(a);
    if (s > 0) climbs.add(entry ? `board:${entry.provider}:${entry.climbUuid}` : a.id);
  }
  return { days: new Set(list.map((a) => a.day)).size, sends, climbs: climbs.size };
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today", "Yesterday", or "Tue 3 Nov" (with the year when it isn't this year). */
export function dayTitle(day: Day, today: Day): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  const d = dayStart(day);
  const base = `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  return day.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${day.slice(0, 4)}`;
}
