/**
 * What goes on a shareable climb image: the wording and numbers, kept free of UI so they can be tested.
 * Two kinds: a climb card (the board and everything worth knowing about the climb), and a send card (the same plus a hero
 * line, "Flashed!" or "Sent!", for something you just did). Both are landscape: the info on the left, the board on the right.
 */
import type { Frame } from "./frames";
import type { GradeDisplay } from "./grades";
import type { AngleStat, BoardSpec, Placement, Role } from "./types";

export type ShareKind = "climb" | "send";

/** The user's own record of a send, shown on a send card. */
export interface SendFacts {
  attempts: number;
  /** 0-3, the user's rating of the climb. */
  stars: number;
  comment: string;
  /** `yyyy-MM-dd HH:mm:ss` in the device's local time, as the logbook stores it. */
  climbedAt: string;
}

/** Everything a card draws. The climb view fills it in from what it already has on screen. */
export interface ShareFacts {
  kind: ShareKind;
  name: string;
  setter: string;
  boardName: string;
  angle: number;
  /** The grade to show (the user's own for a send, else the community's), or null for a project. */
  difficulty: number | null;
  gradeDisplay: GradeDisplay;
  isRoute: boolean;
  /** Community stats at this angle. */
  stat: AngleStat | undefined;
  classic: boolean;
  spec: BoardSpec;
  placements: Placement[];
  roles: Role[];
  frame: Frame | undefined;
  mirror: boolean;
  shapes: boolean;
  highContrast: boolean;
  send?: SendFacts;
}

/** A first-try send is a flash. */
export const isFlash = (attempts: number): boolean => attempts <= 1;

/** The hero line for a send, and a small line under it ("" for a flash, which needs none). */
export function sendHeadline(attempts: number): { text: string; sub: string } {
  if (isFlash(attempts)) return { text: "Flashed!", sub: "" };
  return { text: "Sent!", sub: `In ${attempts} attempts` };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `1 Nov 2026` from a logbook time; empty when it can't be read. */
export function shortDate(climbedAt: string): string {
  const d = new Date(climbedAt.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** A comment on one line-ish: whitespace collapsed, cut at `max` characters with an ellipsis. */
export function cardComment(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}\u2026`;
}

/** "17,410 sends · 4.2 stars" style line for the climb's community numbers at one angle, or null when it is a project. */
export function communityLine(stat: AngleStat | undefined): string | null {
  if (!stat || stat[2] <= 0) return null;
  const n = stat[2];
  return `${n.toLocaleString("en-US")} ${n === 1 ? "send" : "sends"} by climbers`;
}

/** A file name safe on every platform: `slackboard-send-masquerade`. */
export function cardFileName(kind: ShareKind, climbName: string): string {
  const slug = climbName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `slackboard-${kind}${slug ? `-${slug}` : ""}`;
}

/** `yyyy-MM-dd HH:mm:ss` in the device's local time, the form the logbook and `shortDate` use. */
export function localStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
