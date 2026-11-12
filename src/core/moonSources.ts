/**
 * Where each MoonBoard setup's problems come from: public copies of the old problem lists, one file per setup and angle. The
 * app downloads the one a board needs the first time the board is added; nothing is bundled. Every URL names an exact revision
 * (a gist revision or a commit), so a file cannot change underneath the importer.
 *
 * The problems are Moon Climbing's data; these are third-party copies of it.
 */
import { layoutIdOf, SETUPS, setupByKey, type MoonSetup } from "./moonboard";

export interface MoonSource {
  setup: string;
  angle: number;
  url: string;
  format: "json" | "sqlite";
  /** Download size, for a progress hint and the "on mobile data" warning. */
  bytes: number;
  /** Anything about the source the user or maintainer should know. */
  note?: string;
}

const GIST = "https://gist.githubusercontent.com/fallaciousreasoning";

export const SOURCES: MoonSource[] = [
  { setup: "mini2025", angle: 40, format: "json", bytes: 4_166_968, url: `${GIST}/e39fd062b7fe59f586318543e40a68a4/raw/d7467f80ff952ce90d18ffbe0f733312ba2dd704/Problems%20Moonboard%20Mini%202025%2040.json` },
  { setup: "mini2020", angle: 40, format: "json", bytes: 3_586_890, url: `${GIST}/f18a56a47487124d52fb1b2e929e7f99/raw/71700697d36950f1ba578f07e8774a574273a4b7/Problems%20Moonboard%20Mini%202020%2040.json` },
  { setup: "2024", angle: 40, format: "json", bytes: 36_029_819, url: `${GIST}/9f1db3459bf9e5c0f558f35e56adcc9a/raw/0c6d3633d68dfa8cd242cdc66bfc1fa55fd28b9b/Problems%20Moonboard%202024%2040.json` },
  { setup: "2019", angle: 40, format: "json", bytes: 51_762_386, url: `${GIST}/29e1b1662ba868d896dbee3c11767b08/raw/7a33b9d0638613ee2cc28873f516065175c1bb0e/Problems%20Moonboard%202019%2040.json` },
  {
    setup: "2016", angle: 40, format: "sqlite", bytes: 19_894_272,
    url: "https://raw.githubusercontent.com/e-sr/moonboard/fddb26798c22880b9981593f11711b321e13dcc8/problems/moon_problems.db",
    note: "A May 2019 scrape of the 2016 setup. The file does not record the angle; 40\u00b0 is assumed.",
  },
];

/** The setups a board can be added for, i.e. the ones that have problems available. Newest first. */
export const AVAILABLE_SETUPS: MoonSetup[] = SETUPS.filter((s) => SOURCES.some((x) => x.setup === s.key));

export const sourceFor = (setupKey: string, angle: number): MoonSource | undefined => SOURCES.find((s) => s.setup === setupKey && s.angle === angle);

/** The angles a setup has problems for. */
export const anglesOf = (setupKey: string): number[] => SOURCES.filter((s) => s.setup === setupKey).map((s) => s.angle);

/** Which setup and angle a layout id stands for; null for an id that is not a MoonBoard layout. */
export function targetOfLayout(layoutId: number): { setup: MoonSetup; angle: number } | null {
  for (const setup of SETUPS) for (const angle of [25, 40]) if (layoutIdOf(setup, angle) === layoutId) return { setup, angle };
  return null;
}

export const setupName = (key: string): string => setupByKey(key)?.name ?? key;
