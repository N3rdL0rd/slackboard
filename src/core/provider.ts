import type { LitHold } from "./led";

/** Which backend a board, climb, log or circuit belongs to. One value per service the app can talk to. */
export type ProviderId = string;

/** A climb on any provider. Climb ids are only unique within a provider, so the pair is the identity. */
export interface ClimbRef {
  provider: ProviderId;
  /** The provider's id for the climb, upper-case. */
  id: string;
}

export const refKey = (r: ClimbRef): string => `${r.provider}:${r.id}`;
export const makeRef = (provider: ProviderId, id: string): ClimbRef => ({ provider, id: id.toUpperCase() });

/** What a provider's service can do. The UI hides what it cannot. */
export interface ProviderCapabilities {
  /** Circuits are kept on the server. */
  circuits: boolean;
  /** Circuits can be made public for others to find and follow. */
  publicCircuits: boolean;
  follow: boolean;
  leaderboards: boolean;
  explore: boolean;
  setClimbs: boolean;
  workouts: boolean;
  /** Sends and attempts are kept on the server. */
  logbook: boolean;
  /** The server keeps a "recently lit" history per controller. */
  litHistory: boolean;
}

/** Bluetooth side of a board family: how to find its controller and what to write to it. */
export interface ProviderBle {
  /** Advertised service the scan filters on. */
  scanService: string;
  /** Substring a board's advertised name must contain. */
  nameSubstring: string;
  /** Match the substring regardless of case. The Aurora apps match exactly; the MoonBoard box's casing is only known from community notes. */
  ignoreCase?: boolean;
  /** Write-only UART service and characteristic. */
  uartService: string;
  uartRx: string;
  /** Pulls a serial number and API level out of an advertised name. */
  parseName: (name: string) => { displayName: string; serial: string | null; apiLevel: number };
  /** The byte stream that shows these holes. An empty list clears the board. */
  encode: (holes: LitHold[], apiLevel: number) => number[];
}

export interface Provider {
  id: ProviderId;
  /**
   * `remote`: a service with accounts and a server mirror (sync, sign-in, uploads). `local`: no account and no server; the
   * database lives on the phone, is filled by importing files, and everything is saved straight away.
   */
  kind: "remote" | "local";
  /** Full name for sentences: "Tension Board". */
  name: string;
  host: string;
  /** Where avatars, hold art and board photos are served from. */
  imgHost: string;
  links: {
    climb: (uuid: string) => string;
    circuit: (uuid: string) => string;
    forgotPassword: string;
    terms: string;
    privacy: string;
    workoutImage: (template: string) => string;
  };
  capabilities: ProviderCapabilities;
  ble: ProviderBle | null;
  /** The provider's difficulty number to the shared V-scale grade (V plus a fraction) used wherever grades are compared across providers. */
  commonGrade: (difficulty: number) => number;
  /** The inverse: the provider's difficulty number nearest a shared grade, for showing it in the provider's own notation. */
  fromCommonGrade: (grade: number) => number;
}
