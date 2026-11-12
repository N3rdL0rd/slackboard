import type { ProviderId } from "./provider";

export interface Role {
  id: number;
  position: number;
  name: string; // start | middle | finish | foot
  full_name: string;
  led_color: string;
}

export interface Placement {
  id: number;
  x: number;
  y: number;
  /** LED strip position for the board's product size. */
  led: number;
  /** Placement id of the mirrored hole, if the layout supports mirroring. */
  mirror: number | null;
}

/** Per-angle stats: [displayDifficulty, benchmarkDifficulty|null, ascensionistCount, qualityAverage]. */
export type AngleStat = [number, number | null, number, number];

/** Stats for every climb of a board at one angle. A climb missing from the map is a project at that angle. */
export type StatsAt = Map<string, AngleStat>;

export interface Climb {
  uuid: string;
  layoutId: number;
  name: string;
  setter: string;
  frames: string;
  /** More than one frame makes it a route; one frame is a boulder. */
  frameCount: number;
  /** Milliseconds each frame stays lit when played. */
  pace: number;
  noMatch: boolean;
  createdAt: string;
  /** Extent of the climb's holes in board units. */
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export const isRoute = (c: Pick<Climb, "frameCount">) => c.frameCount > 1;

export interface BoardSpec {
  /** The service this board and its climbs belong to. */
  provider: ProviderId;
  layoutId: number;
  layoutName: string;
  productId: number;
  productSizeId: number;
  sizeName: string;
  hsm: number;
  setIds: number[];
  setNames: string[];
  /** Hold-art layers (one transparent PNG per hold set), relative to the server's /img/ path. */
  images: string[];
  edges: { left: number; right: number; bottom: number; top: number };
  isMirrored: boolean;
  angles: number[];
}

/** A user's physical board (the official app's "wall"). */
export interface Board {
  id: string;
  name: string;
  spec: BoardSpec;
  /** The board's own angle; the viewed angle is a separate per-device preference. */
  angle: number;
  isAdjustable: boolean;
  serial: string | null;
}

/** One row of the user's logbook: a send (ascent) or an attempts-only record (bid). */
export interface LogEntry {
  id: string;
  /** Which service the climb belongs to. */
  provider: ProviderId;
  climbUuid: string;
  climbName: string;
  angle: number;
  isMirror: boolean;
  bidCount: number;
  quality: number;
  difficulty: number;
  comment: string;
  climbedAt: string;
  isSend: boolean;
  /** Saved on this device but not yet accepted by the server. */
  pending?: boolean;
}
