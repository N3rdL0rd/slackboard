/** Parsers for the server's people, activity events and climb info. */
import { DEFAULT_PROVIDER } from "../providers";

type Json = Record<string, any>;

export interface Person {
  id: number;
  username: string;
  name: string | null;
  /** Path under the image host, e.g. "avatars/75027-2022.jpg". */
  avatar: string | null;
  verified: boolean;
}

export const avatarUrl = (p: Pick<Person, "avatar"> | string | null | undefined, imgHost: string = DEFAULT_PROVIDER.imgHost) => {
  const path = typeof p === "string" ? p : p?.avatar;
  return path ? `${imgHost}/${path}` : null;
};

export function parsePerson(j: Json | null | undefined): Person | null {
  if (!j || j.id == null || !j.username) return null;
  return { id: j.id, username: j.username, name: j.name ?? null, avatar: j.avatar_image ?? null, verified: !!j.is_verified };
}

export interface ClimbRef {
  uuid: string;
  name: string;
  /** "boulder" or "route". */
  type: string;
}
const climbRef = (j: Json | null | undefined): ClimbRef | null => (j?.uuid && j?.name ? { uuid: String(j.uuid).toUpperCase(), name: j.name, type: j.type ?? "boulder" } : null);

export type FollowState = "none" | "pending" | "accepted" | "declined" | "blocked" | "unfollowed";

export type FeedEvent =
  | { kind: "ascent"; id: string; createdAt: string; user: Person; climb: ClimbRef; angle: number; quality: number; difficulty: number; gradeName: string; comment: string; isMirror: boolean; bidCount: number | null }
  | { kind: "bid"; id: string; createdAt: string; user: Person; climb: ClimbRef; angle: number; bidCount: number; comment: string; isMirror: boolean }
  | { kind: "like"; id: string; createdAt: string; user: Person; climb: ClimbRef }
  | { kind: "follow"; id: string; createdAt: string; state: FollowState | string; follower: Person; followee: Person }
  | { kind: "climb"; id: string; createdAt: string; user: Person | null; climb: ClimbRef }
  | { kind: "user"; id: string; createdAt: string; user: Person };

/** Drops events that are missing required parts (the official app does the same) and unknown event kinds. */
export function parseFeed(json: Json | null): FeedEvent[] {
  const out: FeedEvent[] = [];
  for (const e of (json?.notifications as Json[] | undefined) ?? []) {
    const createdAt: string = e.created_at ?? "";
    switch (e._type) {
      case "ascent": {
        const user = parsePerson(e.user), climb = climbRef(e.climb);
        if (user && climb && e.uuid) out.push({ kind: "ascent", id: e.uuid, createdAt, user, climb, angle: e.angle, quality: e.quality ?? 0, difficulty: e.difficulty ?? 0, gradeName: e.difficulty_name ?? "", comment: e.comment ?? "", isMirror: !!e.is_mirror, bidCount: e.bid_count ?? null });
        break;
      }
      case "bid": {
        const user = parsePerson(e.user), climb = climbRef(e.climb);
        if (user && climb && e.uuid) out.push({ kind: "bid", id: e.uuid, createdAt, user, climb, angle: e.angle, bidCount: e.bid_count ?? 1, comment: e.comment ?? "", isMirror: !!e.is_mirror });
        break;
      }
      case "like": {
        const user = parsePerson(e.user), climb = climbRef(e.climb);
        if (user && climb && e.uuid) out.push({ kind: "like", id: e.uuid, createdAt, user, climb });
        break;
      }
      case "follow": {
        const follower = parsePerson(e.follower), followee = parsePerson(e.followee);
        if (follower && followee && e.uuid) out.push({ kind: "follow", id: e.uuid, createdAt, state: e.state ?? "pending", follower, followee });
        break;
      }
      case "climb": {
        const climb = climbRef(e);
        if (climb) out.push({ kind: "climb", id: climb.uuid, createdAt, user: parsePerson(e.user), climb });
        break;
      }
      case "user": {
        const user = parsePerson(e);
        if (user) out.push({ kind: "user", id: String(user.id), createdAt, user });
        break;
      }
    }
  }
  return out;
}

/** `created_at` of the last event: the cursor for the next page (`before=`). */
export const nextCursor = (events: FeedEvent[]): string | null => (events.length ? events[events.length - 1].createdAt : null);

export interface Histogram { value: number; count: number }
export interface ClimbInfo {
  uuid: string;
  name: string;
  description: string;
  isNoMatch: boolean;
  setter: Person | null;
  firstAscent: { at: string; user: Person | null } | null;
  ascentCount: number;
  difficulty: Histogram[];
  quality: Histogram[];
}

/** `GET /climbs/{uuid}/info?angle=&_version=2`. */
export function parseClimbInfo(j: Json | null): ClimbInfo | null {
  if (!j?.uuid || !j?.name) return null;
  const hist = (list: Json[] | undefined, key: string): Histogram[] =>
    (list ?? []).filter((h) => h[key] != null && h.count != null).map((h) => ({ value: h[key], count: h.count })).sort((a, b) => a.value - b.value);
  return {
    uuid: String(j.uuid).toUpperCase(), name: j.name, description: j.description ?? "", isNoMatch: !!j.is_nomatch, setter: parsePerson(j.user),
    firstAscent: j.fa ? { at: j.fa.created_at, user: parsePerson(j.fa.user) } : null, ascentCount: j.ascent_count ?? 0,
    difficulty: hist(j.stats?.difficulty, "difficulty"), quality: hist(j.stats?.quality, "quality"),
  };
}

export interface BetaLink { link: string; username: string | null; angle: number | null; thumbnail: string | null }

export function relativeTime(iso: string, now = new Date()): string {
  const t = new Date(iso.replace(" ", "T") + "Z").getTime();
  const s = Math.max(0, (now.getTime() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: s > 86400 * 330 ? "numeric" : undefined });
}

export interface Exhibit {
  climbUuid: string;
  serial: string;
  createdAt: string;
}

/** `GET /exhibits?serial_number=`: the climbs most recently lit on a controller, newest first. */
export function parseExhibits(json: Json | null): Exhibit[] {
  return ((json?.exhibits as Json[] | undefined) ?? [])
    .filter((e) => e.climb_uuid && e.serial_number != null && e.created_at)
    .map((e) => ({ climbUuid: String(e.climb_uuid).toUpperCase(), serial: String(e.serial_number), createdAt: e.created_at }));
}
