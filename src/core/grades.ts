export interface GradeRow {
  difficulty: number;
  /** e.g. "6a+/V3" */
  boulder_name: string;
  /** e.g. "6c/5.11b" */
  route_name: string;
}

export type GradeDisplay = "both" | "v" | "font";

export interface GradeBand {
  name: string;
  fill: string;
  text: string;
  border: string;
  borderWidth: number;
  /** For bars and underlines on a dark background, where a near-black chip fill would vanish: the band's visible colour. */
  bar: string;
}

const BANDS: Record<string, GradeBand> = {
  pink: { name: "pink", fill: "#F49AC2", text: "#101416", border: "#F49AC2", borderWidth: 0, bar: "#F49AC2" },
  blue: { name: "blue", fill: "#5AA9FF", text: "#101416", border: "#5AA9FF", borderWidth: 0, bar: "#5AA9FF" },
  green: { name: "green", fill: "#4FD08A", text: "#101416", border: "#4FD08A", borderWidth: 0, bar: "#4FD08A" },
  white: { name: "white", fill: "#F2F0EA", text: "#101416", border: "#F2F0EA", borderWidth: 0, bar: "#F2F0EA" },
  red: { name: "red", fill: "#F2554D", text: "#101416", border: "#F2554D", borderWidth: 0, bar: "#F2554D" },
  // From V9 the chip stays black (black is the hardest band) and the ring and number take the colour, so the scale keeps going.
  black: { name: "black", fill: "#050607", text: "#EDEBE4", border: "#EDEBE4", borderWidth: 1.5, bar: "#8E9795" },
  violet: { name: "violet", fill: "#050607", text: "#9A6BFF", border: "#9A6BFF", borderWidth: 1.5, bar: "#9A6BFF" },
  amber: { name: "amber", fill: "#050607", text: "#FFB020", border: "#FFB020", borderWidth: 1.5, bar: "#FFB020" },
  lime: { name: "lime", fill: "#050607", text: "#C4E04A", border: "#C4E04A", borderWidth: 1.5, bar: "#C4E04A" },
};

/** V number -> band: two grades per band, black for V9-V10, then violet, amber and lime. */
export function bandForV(v: number): GradeBand {
  if (v <= 0) return BANDS.pink;
  if (v <= 2) return BANDS.blue;
  if (v <= 4) return BANDS.green;
  if (v <= 6) return BANDS.white;
  if (v <= 8) return BANDS.red;
  if (v <= 10) return BANDS.black;
  if (v <= 12) return BANDS.violet;
  if (v <= 14) return BANDS.amber;
  return BANDS.lime;
}

/** The colour a grade shows in on a dark background: its band's visible colour, from a grade on the shared scale (V plus a fraction). */
export const gradeColor = (shared: number): string => bandForV(Math.max(0, Math.floor(shared))).bar;

export class GradeScale {
  private readonly byId = new Map<number, GradeRow>();
  readonly rows: GradeRow[];

  constructor(rows: GradeRow[]) {
    this.rows = [...rows].sort((a, b) => a.difficulty - b.difficulty);
    for (const r of this.rows) this.byId.set(r.difficulty, r);
  }

  /** Community difficulty is fractional; the app shows the nearest listed grade. */
  row(difficulty: number): GradeRow {
    const id = Math.round(difficulty);
    const hit = this.byId.get(id);
    if (hit) return hit;
    const first = this.rows[0];
    const last = this.rows[this.rows.length - 1];
    return id < first.difficulty ? first : last;
  }

  vName(difficulty: number): string {
    return this.row(difficulty).boulder_name.split("/")[1] ?? "";
  }
  fontName(difficulty: number): string {
    return this.row(difficulty).boulder_name.split("/")[0] ?? "";
  }
  vNumber(difficulty: number): number {
    return parseInt(this.vName(difficulty).replace(/\D/g, "") || "0", 10);
  }
  /**
   * The grade on the scale shared by every provider: the V number plus how far through that V grade the row sits (V3 and V3.5
   * for two rows in V3). Finer than a whole V so progression charts stay smooth, and comparable across providers.
   */
  toCommon(difficulty: number): number {
    const row = this.row(difficulty);
    const v = this.vNumber(row.difficulty);
    const same = this.rows.filter((r) => this.vNumber(r.difficulty) === v);
    return v + same.findIndex((r) => r.difficulty === row.difficulty) / same.length;
  }

  /** The row nearest a common grade, as a difficulty number (the inverse of `toCommon`). */
  fromCommon(grade: number): number {
    const vs = this.vNumbers();
    const v = vs.reduce((best, x) => (Math.abs(x - Math.floor(grade)) < Math.abs(best - Math.floor(grade)) ? x : best), vs[0]);
    const same = this.rows.filter((r) => this.vNumber(r.difficulty) === v);
    const k = Math.min(same.length - 1, Math.max(0, Math.round((grade - Math.floor(grade)) * same.length)));
    return same[k].difficulty;
  }

  band(difficulty: number): GradeBand {
    return bandForV(this.vNumber(difficulty));
  }

  /** Primary label plus the optional second-scale label for display. */
  label(difficulty: number, mode: GradeDisplay, route = false): { primary: string; secondary: string | null } {
    // Routes use the route scale ("5.11b" / "6c"); the colour band still follows the boulder grade of the same difficulty.
    const [rf, rv] = this.row(difficulty).route_name.split("/");
    const v = route ? (rv ?? "") : this.vName(difficulty);
    const f = route ? (rf ?? "") : this.fontName(difficulty);
    if (mode === "v") return { primary: v, secondary: null };
    if (mode === "font") return { primary: f, secondary: null };
    return { primary: v, secondary: f };
  }

  /** Distinct V numbers present in the scale, ascending (for the filter strip). */
  vNumbers(): number[] {
    return [...new Set(this.rows.map((r) => this.vNumber(r.difficulty)))].sort((a, b) => a - b);
  }

  /** Inclusive difficulty range covering V grades `minV`..`maxV`. */
  rangeForV(minV: number, maxV: number): [number, number] {
    const inRange = this.rows.filter((r) => {
      const v = this.vNumber(r.difficulty);
      return v >= minV && v <= maxV;
    });
    if (!inRange.length) return [Infinity, -Infinity];
    return [inRange[0].difficulty, inRange[inRange.length - 1].difficulty];
  }
}
