/**
 * Update check for the nightly Android build. CI sets the app's version code to the GitHub Actions run number, so the newest
 * successful run is the newest build, and an install is out of date when its version code is lower. Pure; the request is in
 * state/updates.ts. The answer is untrusted: it is checked before use.
 */
import type { Day } from "./days";

export const REPO = "N3rdL0rd/slackboard";
export const RUNS_URL = `https://api.github.com/repos/${REPO}/actions/workflows/android.yml/runs?branch=main&status=success&per_page=1`;
export const DOWNLOAD_URL = `https://nightly.link/${REPO}/workflows/android/main/slackboard-android.zip`;

export interface LatestBuild { build: number; at: string }

/** The newest successful build from GitHub's run list, or null when the answer is not what was expected. */
export function parseLatestBuild(raw: unknown): LatestBuild | null {
  if (typeof raw !== "object" || raw === null) return null;
  const runs = (raw as { workflow_runs?: unknown }).workflow_runs;
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const run = runs[0] as { run_number?: unknown; updated_at?: unknown; conclusion?: unknown };
  if (typeof run !== "object" || run === null) return null;
  if (typeof run.run_number !== "number" || !Number.isInteger(run.run_number) || run.run_number < 1) return null;
  if (run.conclusion !== undefined && run.conclusion !== "success") return null;
  return { build: run.run_number, at: typeof run.updated_at === "string" ? run.updated_at.slice(0, 10) : "" };
}

/** The installed version code from the native build number, or null when it is not a number. */
export function installedBuild(native: string | null | undefined): number | null {
  const n = Number(native);
  return native && Number.isInteger(n) && n > 0 ? n : null;
}

export const updateAvailable = (installed: number | null, latest: LatestBuild | null): boolean => installed !== null && latest !== null && latest.build > installed;

/** An automatic check runs at most once a day. */
export const checkDue = (checkedDay: string, today: Day): boolean => checkedDay === "" || checkedDay < today;
