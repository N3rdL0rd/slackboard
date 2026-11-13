/**
 * The numbers the planner works from. Data, not code, so they can be corrected as advice improves. The percentages are the published
 * ones for how much of a 7-second maximum can be held for other times (López-Rivera and González-Badillo); everything marked as an
 * assumption is a conservative choice of this app, not a finding, and is stated as such wherever the user can see it.
 */

export type TestKind = "hang7" | "hangFail" | "pullups" | "legRaises";

export interface TestInfo {
  kind: TestKind;
  label: string;
  /** What the number is. */
  unit: string;
  measures: string;
  how: string;
  /** Whether a negative number makes sense (assisted). */
  signed: boolean;
}

export const TESTS: TestInfo[] = [
  { kind: "hang7", label: "7-second max hang", unit: "kg added", measures: "Finger strength", signed: true,
    how: "On a 20 mm edge in a half crimp, hang for 7 seconds with as much added weight as you can hold for exactly 7 seconds. Warm up well, rest about 5 minutes between tries, and record the added weight of your best clean hang. Use a negative number if you needed help from a pulley." },
  { kind: "hangFail", label: "Hang to failure", unit: "seconds", measures: "Finger endurance", signed: false,
    how: "On a 20 mm edge with no added weight, hang until your hands open. Record the seconds." },
  { kind: "pullups", label: "Maximum pull-ups", unit: "reps", measures: "Pulling strength", signed: false,
    how: "Full pull-ups from straight arms to chin over the bar, with no kipping. Record the most you can do in one set." },
  { kind: "legRaises", label: "Hanging leg raises", unit: "reps", measures: "Core", signed: false,
    how: "Hang from a bar and raise your knees or straight legs as high as you can without swinging. Record the reps." },
];

export const testInfo = (k: TestKind): TestInfo => TESTS.find((t) => t.kind === k)!;

/** Share of a 7-second maximum that can be held for other times, as published. */
export const HANG_PERCENT: { seconds: number; percent: number }[] = [
  { seconds: 5, percent: 1.02 }, { seconds: 7, percent: 1.0 }, { seconds: 10, percent: 0.96 }, { seconds: 12, percent: 0.94 }, { seconds: 15, percent: 0.9 },
];

/** The share of the 7-second maximum for a hang of `seconds`, interpolated between the published points and held at the ends. */
export function percentOfMax7(seconds: number): number {
  const t = HANG_PERCENT;
  if (seconds <= t[0].seconds) return t[0].percent;
  for (let i = 1; i < t.length; i++) {
    if (seconds <= t[i].seconds) {
      const a = t[i - 1];
      const b = t[i];
      return a.percent + ((b.percent - a.percent) * (seconds - a.seconds)) / (b.seconds - a.seconds);
    }
  }
  return t[t.length - 1].percent;
}

/** A margin of this many seconds before failure is aimed for on a 10-second hang. */
export const DEFAULT_MARGIN_S = 3;
/** Assumption: each second of margin costs this share of the load. Conservative, and it only ever lowers the load. */
export const MARGIN_PERCENT_PER_S = 0.02;
/** Assumption: the first week of a block is lighter, to settle in. */
export const FIRST_WEEK_FACTOR = 0.95;
/** Assumption: a deload week keeps the pattern but lowers load and volume. */
export const DELOAD_LOAD_FACTOR = 0.9;
export const DELOAD_SET_FACTOR = 0.7;
/** Ramp-up sets before the working sets, as shares of the working load. */
export const RAMP_SHARES = [0.5, 0.75];
/** Sets build across a cycle: 3, then 4, then 5. */
export const SET_BUILD = [3, 4, 5];
/** Edges in millimetres for the minimum-edge phase, week by week, then held. */
export const EDGE_STEPS_MM = [18, 17, 16, 15, 14];
/** Starter edges are bigger: a person new to finger training starts on a large edge. */
export const STARTER_EDGE_MM = { new: 30, some: 25, regular: 22 } as const;
/** Without a test, hangs are bodyweight on this edge. */
export const DEFAULT_EDGE_MM = 25;
