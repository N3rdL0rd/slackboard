/**
 * Aurora-platform API client (Tension Board is the first provider; the host defaults to it). Verified live against a real account: sign-in, profile, logbook,
 * ascent/bid save and delete, tags, boards, sync.
 *
 * Mutations are described as plain requests (`Req`) so they can be sent now or queued in the outbox
 * and sent later: see outbox.ts.
 */
import { DEFAULT_PROVIDER, getProvider } from "../providers";

/**
 * The server ignores sessions created from generic HTTP-library user agents (a curl login returned a
 * token that every request then answered 401 to), so always identify as the app. Tokens from a login
 * with a proper agent work with any later agent.
 */
export const USER_AGENT = "slackboard/0.1 (+https://github.com/N3rdL0rd/slackboard)";

export interface Session {
  token: string;
  userId: number;
  /** The service this session is for. Absent means the default provider (older callers and tests). */
  provider?: string;
}

/** The JSON API host a session talks to. */
export const hostOf = (s: Pick<Session, "provider">): string => getProvider(s.provider).host;

type Scalar = string | number | boolean;
/** An array value is sent as repeated `key[]=value` fields (hold sets, circuit climbs). */
export type Fields = Record<string, Scalar | Scalar[]>;

/** A POST the server understands, independent of when it is sent. */
export interface Req {
  path: string;
  fields: Fields;
}

const enc = (v: Scalar) => encodeURIComponent(typeof v === "boolean" ? (v ? "1" : "0") : String(v));

export const encodeForm = (fields: Fields) =>
  Object.entries(fields)
    .flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => `${encodeURIComponent(`${k}[]`)}=${enc(x)}`) : [`${encodeURIComponent(k)}=${enc(v)}`]))
    .join("&");

/** 32 hex chars, the shape of the official app's record ids. The server replaces it with its own. */
export const randomHex = (n = 32) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");

/** `yyyy-MM-dd HH:mm:ss.SSSSSS` in device local time, as the official app sends it. */
export function serverTime(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}000`;
}

// On Android, React Native's cookie jar replaces a hand-written Cookie header with the jar's own cookies,
// which silently drops our token. credentials "omit" turns the jar off for the request.

export type SignInResult =
  | { ok: true; token: string; userId: number }
  | { ok: false; reason: "invalid" | "rate_limited" | "network" | "server"; fieldErrors?: Record<string, string[]> };

export async function signIn(username: string, password: string, fetchImpl: typeof fetch = fetch, host = DEFAULT_PROVIDER.host): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${host}/sessions`, {
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
        // The official build sends an empty App Check token.
        Cookie: "appcheck=",
      },
      body: encodeForm({ username, password, tou: "accepted", pp: "accepted", ua: "app" }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 422) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, reason: "invalid", fieldErrors: body.errors };
  }
  if (res.status !== 200 && res.status !== 201) return { ok: false, reason: "server" };
  const body = await res.json();
  return { ok: true, token: body.session.token, userId: body.session.user_id };
}

const authHeaders = (session: Session) => ({ Accept: "application/json", "User-Agent": USER_AGENT, Cookie: `token=${session.token}; appcheck=` });

export type SubmitResult =
  | { status: "ok"; body: Record<string, unknown> }
  /** Network failure or a server error: worth trying again later. */
  | { status: "retry" }
  /** The server understood and said no (validation, permission, gone): trying again won't help. */
  | { status: "rejected"; code: number; errors?: Record<string, string[]> };

/** Sends a request and classifies the outcome. Never throws. */
export async function submit(session: Session, req: Req, fetchImpl: typeof fetch = fetch, host = hostOf(session)): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${host}${req.path}`, {
      method: "POST",
      credentials: "omit",
      headers: { ...authHeaders(session), "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeForm(req.fields),
    });
  } catch {
    return { status: "retry" };
  }
  if (res.ok) return { status: "ok", body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  if (res.status >= 500 || res.status === 429 || res.status === 408) return { status: "retry" };
  const errors = (await res.json().catch(() => null))?.errors as Record<string, string[]> | undefined;
  return { status: "rejected", code: res.status, errors };
}

export async function get(session: Session, path: string, fetchImpl: typeof fetch = fetch, host = hostOf(session)): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(`${host}${path}`, { credentials: "omit", headers: authHeaders(session) });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Multipart POST (profile with avatar). `parts` are text parts; `file` is optional. */
export async function submitMultipart(
  session: Session,
  path: string,
  parts: Record<string, string>,
  file?: { name: string; uri: string; type: string },
  fetchImpl: typeof fetch = fetch,
  host = hostOf(session),
): Promise<SubmitResult> {
  const form = new FormData();
  for (const [k, v] of Object.entries(parts)) form.append(k, v);
  // React Native's FormData takes a { uri, name, type } object for files.
  if (file) form.append("avatar", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  let res: Response;
  try {
    // No Content-Type header: fetch adds the multipart boundary itself.
    res = await fetchImpl(`${host}${path}`, { method: "POST", credentials: "omit", headers: authHeaders(session), body: form });
  } catch {
    return { status: "retry" };
  }
  if (res.ok) return { status: "ok", body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  if (res.status >= 500) return { status: "retry" };
  const errors = (await res.json().catch(() => null))?.errors as Record<string, string[]> | undefined;
  return { status: "rejected", code: res.status, errors };
}

// ---- request builders -------------------------------------------------------------------------

export interface SaveSendInput {
  climbUuid: string;
  angle: number;
  isMirror: boolean;
  bidCount: number;
  comment: string;
  climbedAt: Date;
  /** Present for a send, absent for attempts only. */
  quality?: number;
  difficulty?: number;
  isBenchmark?: boolean;
}

/** A send (ascent) when quality and difficulty are given, otherwise an attempts record (bid). The server assigns the record id. */
export function sendReq(session: Session, input: SaveSendInput): Req {
  const isSend = input.quality !== undefined && input.difficulty !== undefined;
  const common = {
    uuid: randomHex(), user_id: session.userId, climb_uuid: input.climbUuid, angle: input.angle, is_mirror: input.isMirror,
    bid_count: input.bidCount, comment: input.comment, climbed_at: serverTime(input.climbedAt),
  };
  return isSend
    ? { path: "/ascents/save", fields: { ...common, quality: input.quality!, difficulty: input.difficulty!, is_benchmark: input.isBenchmark ?? false } }
    : { path: "/bids/save", fields: common };
}

export const deleteSendReq = (kind: "ascent" | "bid", uuid: string): Req => ({ path: kind === "ascent" ? "/ascents/delete" : "/bids/delete", fields: { uuid } });

/** Likes/unlikes (`~flag`) or blocks/unblocks (`~block`) a climb. */
export const tagReq = (session: Session, entityUuid: string, name: "~flag" | "~block", listed: boolean): Req => ({
  path: "/tags/save", fields: { entity_uuid: entityUuid, user_id: session.userId, name, is_listed: listed },
});

export interface SaveWallInput {
  /** Present when editing an existing board. */
  uuid?: string;
  name: string;
  isAdjustable: boolean;
  angle: number;
  layoutId: number;
  productSizeId: number;
  setIds: number[];
  serial?: string;
}

/** Creates or updates a board. Product and hold-set bitmask are derived by the server. */
export const wallReq = (session: Session, input: SaveWallInput): Req => ({
  path: "/walls/save",
  fields: {
    uuid: input.uuid ?? randomHex(), user_id: session.userId, name: input.name, is_adjustable: input.isAdjustable, angle: input.angle,
    layout_id: input.layoutId, product_size_id: input.productSizeId, set_ids: input.setIds,
    ...(input.serial ? { serial_number: input.serial } : {}),
  },
});

export const deleteWallReq = (uuid: string): Req => ({ path: "/walls/delete", fields: { uuid } });

export interface SaveCircuitInput {
  uuid?: string;
  name: string;
  description: string;
  /** `RRGGBB`, no `#`. */
  color: string;
  isPublic: boolean;
}

export const circuitReq = (session: Session, i: SaveCircuitInput): Req => ({
  path: "/circuits/save",
  fields: { uuid: i.uuid ?? randomHex(), user_id: session.userId, name: i.name, description: i.description, color: i.color, is_public: i.isPublic },
});
export const deleteCircuitReq = (uuid: string): Req => ({ path: "/circuits/delete", fields: { uuid } });
/** Replaces a circuit's climbs; the order of `climbUuids` is the circuit's order. */
export const circuitClimbsReq = (circuitUuid: string, climbUuids: string[]): Req => ({ path: "/circuit_climbs/save", fields: { circuit_uuid: circuitUuid, climb_uuids: climbUuids } });
/** Sets which of the user's circuits a climb is in. */
export const climbCircuitsReq = (climbUuid: string, circuitUuids: string[]): Req => ({ path: "/climb_circuits/save", fields: { climb_uuid: climbUuid, circuit_uuids: circuitUuids } });

export interface SaveClimbInput {
  /** Present when editing or publishing an existing climb. */
  uuid?: string;
  layoutId: number;
  name: string;
  description: string;
  isNoMatch: boolean;
  isDraft: boolean;
  frames: string;
  frameCount?: number;
  /** Milliseconds per frame; 0 for a single-frame boulder. */
  framesPace?: number;
  /** The angle it was set at; stored with the climb. */
  angle?: number;
}

/** Hold-set mask and edges are not sent: the server works them out from the holds. */
export const climbReq = (session: Session, i: SaveClimbInput): Req => ({
  path: "/climbs/save",
  fields: {
    uuid: i.uuid ?? randomHex(), layout_id: i.layoutId, setter_id: session.userId, name: i.name, description: i.description, is_nomatch: i.isNoMatch,
    is_draft: i.isDraft, frames_count: i.frameCount ?? 1, frames_pace: i.framesPace ?? 0, frames: i.frames,
    ...(i.angle != null ? { angle: i.angle } : {}),
  },
});
export const deleteClimbReq = (uuid: string): Req => ({ path: "/climbs/delete", fields: { uuid } });

export type FollowAction = "pending" | "accepted" | "declined" | "unfollowed" | "blocked";

/** Follow, unfollow, accept or decline. `followerId` follows `followeeId`; the server decides if a public account accepts at once. */
export const followReq = (followeeId: number, followerId: number, state: FollowAction): Req => ({
  path: "/follows/save", fields: { followee_id: followeeId, follower_id: followerId, state },
});

export interface ProfileInput {
  name: string;
  email: string;
  instagram: string;
  isPublic: boolean;
}

/** Text parts of the profile form. The mailing list is never part of it. */
export function profileParts(userId: number, p: ProfileInput): Record<string, string> {
  return {
    id: String(userId), name: p.name.trim(), email_address: p.email.trim(),
    ...(p.instagram.trim() ? { instagram_username: p.instagram.trim().replace(/^@/, "") } : {}),
    is_public: p.isPublic ? "true" : "false",
  };
}

export interface SignUpInput {
  username: string;
  password: string;
  email: string;
}

/** Creates an account. The mailing-list flag (`ml`) is always sent as off: Slackboard never offers it. */
export const signUpFields = (i: SignUpInput): Fields => ({ username: i.username, password: i.password, email_address: i.email, tou: "accepted", pp: "accepted", ua: "app", ml: false });

export const deleteUserReq = (userId: number, password: string): Req => ({ path: "/users/delete", fields: { user_id: userId, password } });

export const climbReportReq = (userId: number, climbUuid: string, message: string): Req => ({ path: "/climb_reports", fields: { user_id: userId, climb_uuid: climbUuid, message } });

export interface WorkoutRequest {
  layoutId: number;
  edges: { left: number; right: number; bottom: number; top: number };
  hsm: number;
  angle: number;
}

const wallFields = (w: WorkoutRequest) => ({
  wall_layout_id: w.layoutId, wall_edge_left: w.edges.left, wall_edge_right: w.edges.right, wall_edge_bottom: w.edges.bottom, wall_edge_top: w.edges.top, wall_hsm: w.hsm, wall_angle: w.angle,
});

export const workoutTemplatesPath = (w: WorkoutRequest) => `/workouts/templates?${encodeForm(wallFields(w))}`;
export const workoutReq = (w: WorkoutRequest, template: string, knobs: Record<string, number | boolean>, regen: boolean): Req => ({
  // Each knob is sent as `template_knob_<name>` (a bare `<name>` is silently ignored).
  path: "/workouts", fields: { ...wallFields(w), template_name: template, ...Object.fromEntries(Object.entries(knobs).map(([k, v]) => [`template_knob_${k}`, v])), regen },
});

/** Creates an account. Returns the session, or the server's field errors. */
export async function signUp(
  i: SignUpInput,
  fetchImpl: typeof fetch = fetch,
  host = DEFAULT_PROVIDER.host,
): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${host}/users?session=1`, {
      method: "POST",
      credentials: "omit",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT, Cookie: "appcheck=" },
      body: encodeForm(signUpFields(i)),
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 422) return { ok: false, reason: "invalid", fieldErrors: (await res.json().catch(() => ({}))).errors };
  if (res.status !== 200 && res.status !== 201) return { ok: false, reason: "server" };
  const body = await res.json();
  return { ok: true, token: body.session.token, userId: body.session.user_id };
}
