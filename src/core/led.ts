/**
 * Aurora LED controller packets (Nordic UART, write-only). Used on a Tension Board 2.
 */

export interface LitHold {
  /** LED strip position from the `leds` table for the board's product size. */
  position: number;
  /** Role colour as `RRGGBB`. */
  color: string;
}

export const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const AURORA_ADVERTISED_SERVICE = "4488b571-7806-4df6-bcff-a2897e4953ff";
export const BLE_CHUNK = 20;

const MAX_BODY = 255;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function wrap(body: number[]): number[] {
  const sum = body.reduce((a, b) => a + b, 0);
  return [1, body.length, ~sum & 255, 2, ...body, 3];
}

/** Message commands: [middle, first, last, only] */
const V2_CMDS = [77, 78, 79, 80] as const;
const V3_CMDS = [81, 82, 83, 84] as const;

function assemble(bodies: number[][], cmds: readonly [number, number, number, number]): number[] {
  if (bodies.length === 1) bodies[0][0] = cmds[3];
  else {
    bodies[0][0] = cmds[1];
    bodies[bodies.length - 1][0] = cmds[2];
  }
  return bodies.flatMap(wrap);
}

/** API level 3+ boards: 3 bytes per LED, colour packed as RRRGGGBB. */
export function encodeV3(holes: LitHold[]): number[] {
  const bodies: number[][] = [[V3_CMDS[0]]];
  for (const h of holes) {
    if (h.position > 0xffff) continue;
    if (bodies[bodies.length - 1].length + 3 > MAX_BODY) bodies.push([V3_CMDS[0]]);
    const [r, g, b] = rgb(h.color);
    bodies[bodies.length - 1].push(
      h.position & 255,
      (h.position & 0xff00) >> 8,
      ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6),
    );
  }
  return assemble(bodies, V3_CMDS);
}

const V2_SCALES = [1.0, 0.8, 0.6, 0.4, 0.2, 0.1, 0.05];
const MAX_WATTS = 18;
const q2 = (v: number, s: number) => Math.trunc(s * v) >> 6;

export function v2Scale(holes: LitHold[], ledsPerHold = 1): number {
  for (const s of V2_SCALES) {
    let watts = 0;
    for (const h of holes) {
      const [r, g, b] = rgb(h.color);
      watts += (q2(r, s) + q2(g, s) + q2(b, s)) / 30;
    }
    if (ledsPerHold * watts <= MAX_WATTS) return s;
  }
  return 0;
}

/** API level <3 boards: 2 bytes per LED, 10-bit position, 2 bits per channel, power-limited. */
export function encodeV2(holes: LitHold[], ledsPerHold = 1): number[] {
  const s = v2Scale(holes, ledsPerHold);
  const bodies: number[][] = [[V2_CMDS[0]]];
  for (const h of holes) {
    if (h.position > 1023) continue;
    if (bodies[bodies.length - 1].length + 2 > MAX_BODY) bodies.push([V2_CMDS[0]]);
    const [r, g, b] = rgb(h.color);
    bodies[bodies.length - 1].push(
      h.position & 255,
      (q2(r, s) << 6) | ((h.position & 0x300) >> 8) | (q2(g, s) << 4) | (q2(b, s) << 2),
    );
  }
  return assemble(bodies, V2_CMDS);
}

/** Splits a packet stream into BLE write-sized chunks. */
export function chunk(bytes: number[], size = BLE_CHUNK): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(Uint8Array.from(bytes.slice(i, i + size)));
  return out;
}

/**
 * The LEDs to light for one frame of a climb. `frame` maps placement id to role id. A mirrored climb lights each hold's mirror
 * placement. Placements with no LED on this product size, and roles with no colour, are skipped (unknown roles light white,
 * as the official app does).
 */
export function holesFor(
  frame: ReadonlyMap<number, number> | undefined,
  placements: ReadonlyMap<number, { led: number; mirror: number | null }>,
  roles: ReadonlyMap<number, { led_color: string }>,
  mirror: boolean,
): LitHold[] {
  const out: LitHold[] = [];
  frame?.forEach((roleId, pid) => {
    const src = placements.get(pid);
    const p = mirror && src?.mirror != null ? placements.get(src.mirror) : src;
    if (p) out.push({ position: p.led, color: roles.get(roleId)?.led_color ?? "FFFFFF" });
  });
  return out;
}
