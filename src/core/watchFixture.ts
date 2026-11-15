/**
 * A made-up watch session, as the messages the watch would send, for tests and for trying the developer screens without a watch. The
 * arm is quiet between attempts and moves hard during them; heart rate follows with a lag; height rises through an attempt and comes
 * back down after it; air pressure is worked out from that height. Deterministic: the same arguments give the same session.
 */
import type { Received } from "./watchLocal";
import type { MotionRow } from "./wear";

export interface FixtureAttempt { startSec: number; endSec: number }

const noise = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5 + Math.cos(i * 4.1414 + k) * 0.5;

export function syntheticSession(session: string, startMs: number, seconds: number, attempts: FixtureAttempt[]): Received[] {
  const inAttempt = (s: number) => attempts.some((a) => s >= a.startSec && s <= a.endSec);
  const height = (s: number) => {
    let h = 0;
    for (const a of attempts) {
      if (s < a.startSec) continue;
      const len = a.endSec - a.startSec;
      if (s <= a.endSec) h = Math.max(h, (3 * (s - a.startSec)) / len);
      else if (s <= a.endSec + 8) h = Math.max(h, 3 * (1 - (s - a.endSec) / 8));
    }
    return h;
  };
  const hr: { at: number; bpm: number }[] = [];
  const elev: { at: number; metres: number }[] = [];
  const motion: MotionRow[] = [];
  let bpm = 72;
  for (let s = 0; s < seconds; s++) {
    const at = startMs + s * 1000;
    bpm += ((inAttempt(s) ? 150 : 85) - bpm) * 0.08;
    hr.push({ at, bpm: Math.round(bpm + noise(s, 1) * 2) });
    if (s % 2 === 0) elev.push({ at, metres: Math.round((100 + height(s) + noise(s, 2) * 0.2) * 100) / 100 });
    const active = inAttempt(s);
    const p = 1013.25 * Math.pow(1 - (100 + height(s)) / 44330, 5.255);
    motion.push({
      at, accRms: Math.abs(active ? 3.5 + noise(s, 3) * 1.5 : 0.2 + noise(s, 3) * 0.1), accMax: active ? 8 : 0.6,
      gyroRms: Math.abs(active ? 1.2 + noise(s, 4) * 0.5 : 0.1), gyroMax: active ? 3 : 0.3,
      pressure: Math.round((p + noise(s, 5) * 0.02) * 1000) / 1000, gx: 0.2, gy: -9.7, gz: 1.1,
    });
  }
  const out: Received[] = [{ receivedAt: startMs + 500, message: { kind: "state", pong: false, state: "running", mode: "workout", session, startedAt: startMs, bpm: null, error: null } }];
  for (let s = 0; s < seconds; s += 3) {
    const t = (xs: { at: number }[]) => xs.filter((x) => x.at >= startMs + s * 1000 && x.at < startMs + (s + 3) * 1000);
    const received = startMs + (s + 3) * 1000 + 400;
    out.push({ receivedAt: received, message: { kind: "hr", session, samples: t(hr) as { at: number; bpm: number }[], dropped: 0 } });
    out.push({ receivedAt: received, message: { kind: "elevation", session, samples: t(elev) as { at: number; metres: number }[], dropped: 0 } });
    out.push({ receivedAt: received, message: { kind: "motion", session, rows: t(motion) as MotionRow[], dropped: 0 } });
  }
  const endedAt = startMs + seconds * 1000;
  out.push({ receivedAt: endedAt + 500, message: { kind: "summary", session, startedAt: startMs, endedAt, calories: Math.round(seconds * 0.12 * 10) / 10, gain: attempts.length * 3, hrAvg: 110, hrMin: 70, hrMax: 150 } });
  return out;
}
