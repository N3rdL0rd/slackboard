/** Climb `frames` string codec. */

/** placementId -> roleId, in parse order (Map preserves insertion order). */
export type Frame = Map<number, number>;

const TOKEN = /x(\d+)|p(\d+)r(\d+)|a(-?\d+)/g;

export function parseFrames(frames: string): Frame[] {
  const out: Frame[] = [];
  for (const raw of frames.split(",")) {
    const ditto = raw.startsWith('"');
    const frame: Frame = ditto && out.length ? new Map(out[out.length - 1]) : new Map();
    TOKEN.lastIndex = 0;
    for (const m of (ditto ? raw.slice(1) : raw).matchAll(TOKEN)) {
      if (m[1] !== undefined) frame.delete(Number(m[1]));
      else if (m[2] !== undefined) frame.set(Number(m[2]), Number(m[3]));
      // a<n> (per-frame angle) is decoded by the official app but never used; ignored here too.
    }
    out.push(frame);
  }
  return out;
}

/** Encodes frames in the full (non-ditto) form. The server accepts it; ditto is only a size optimisation. */
export function encodeFrames(frames: Frame[]): string {
  return frames
    .map((f) =>
      [...f.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([p, r]) => `p${p}r${r}`)
        .join(""),
    )
    .join(",");
}

/** Returns at least `count` frames, preserving every parsed frame and padding missing trailing ones. */
export function framesForCount(frames: Frame[], count: number): Frame[] {
  const out = frames.map((f) => new Map(f));
  while (out.length < count) out.push(new Map());
  return out;
}

/** Inserts a copy of `index` immediately after it. The source and the copy can then be edited independently. */
export function duplicateFrame(frames: Frame[], index: number): Frame[] {
  if (index < 0 || index >= frames.length) return frames;
  return [...frames.slice(0, index + 1), new Map(frames[index]), ...frames.slice(index + 1)];
}

/** Removes one frame. Callers decide whether their editor permits deleting the last remaining frame. */
export function deleteFrame(frames: Frame[], index: number): Frame[] {
  if (index < 0 || index >= frames.length) return frames;
  return [...frames.slice(0, index), ...frames.slice(index + 1)];
}

/** Tapping a hold: the same role removes it, another role replaces it, an empty hold gets the selected role. */
export function setHold(frame: Frame, placementId: number, role: number, maxHolds: number): Frame | null {
  const next = new Map(frame);
  const current = next.get(placementId);
  if (current === role) next.delete(placementId);
  else if (current === undefined && next.size >= maxHolds) return null;
  else next.set(placementId, role);
  return next;
}

/** Applies the hold-tap rules to one frame without changing any other frame. */
export function setHoldInFrame(frames: Frame[], index: number, placementId: number, role: number, maxHolds: number): Frame[] | null {
  if (index < 0 || index >= frames.length) return null;
  const frame = setHold(frames[index], placementId, role, maxHolds);
  if (!frame) return null;
  return [...frames.slice(0, index), frame, ...frames.slice(index + 1)];
}
