import { describe, expect, it } from "vitest";
import type { AttemptWindow } from "./attempts";
import { deliveryHealth, hrIn, linkAttempts, sessionCsv, sessionJson, sessionOverview, streamHealth, type BatchRecord, type SessionData } from "./watchData";

const batch = (over: Partial<BatchRecord> = {}): BatchRecord => ({ session: "s", kind: "hr", receivedAt: 10_000, firstAt: 7000, lastAt: 9000, count: 3, dropped: 0, ...over });
const session = (over: Partial<SessionData["session"]> = {}) => ({ id: "s", startedAt: 0, endedAt: null, mode: "workout" as const, stats: { calories: null, gain: null, hrAvg: null, hrMin: null, hrMax: null }, ...over });

describe("stream health", () => {
  it("finds the usual interval and the stretches where nothing arrived, whatever order the samples come in", () => {
    const t = [0, 1000, 2000, 3000, 20_000, 21_000, 22_000];
    const h = streamHealth([...t].reverse());
    expect(h).toMatchObject({ count: 7, firstAt: 0, lastAt: 22_000, medianMs: 1000, minMs: 1000, maxMs: 17_000 });
    expect(h.gaps).toEqual([{ from: 3000, to: 20_000, ms: 17_000 }]);
  });

  it("does not call a few slow seconds a gap, and handles one sample, none, and the dropped count", () => {
    expect(streamHealth([0, 1000, 2000, 6000]).gaps).toEqual([]);
    expect(streamHealth([5]).medianMs).toBeNull();
    expect(streamHealth([], 4)).toMatchObject({ count: 0, firstAt: null, dropped: 4 });
  });
});

describe("delivery health", () => {
  it("measures how long batches took to arrive, and counts late and out-of-order ones", () => {
    const h = deliveryHealth([
      batch({ receivedAt: 10_000, lastAt: 9000 }),
      batch({ receivedAt: 70_000, lastAt: 20_000 }),
      batch({ receivedAt: 71_000, lastAt: 15_000, dropped: 2 }),
      batch({ kind: "motion", receivedAt: 11_000, lastAt: 10_500 }),
    ]);
    // Delays are 1000, 50000, 56000 and 500 ms.
    expect(h).toMatchObject({ batches: 4, maxDelayMs: 56_000, medianDelayMs: 25_500, late: 2, outOfOrder: 1, dropped: 2 });
    expect(deliveryHealth([])).toMatchObject({ batches: 0, medianDelayMs: null });
  });
});

describe("heart rate in a stretch", () => {
  const hr = [60, 70, 80, 120, 110, 90].map((bpm, i) => ({ at: i * 2000, bpm }));

  it("gives the average, peak and how far it climbed over the first five seconds", () => {
    const w = hrIn(hr, 0, 10_000)!;
    expect(w).toMatchObject({ count: 6, min: 60, peak: 120, first: 60, last: 90 });
    expect(w.avg).toBeCloseTo(88.33, 1);
    // The first five seconds are 60, 70 and 80 (mean 70), so the peak of 120 is 50 above it.
    expect(w.rise).toBeCloseTo(50);
  });

  it("is null when nothing was read in the stretch, and includes both ends", () => {
    expect(hrIn(hr, 100_000, 200_000)).toBeNull();
    expect(hrIn(hr, 2000, 4000)!.count).toBe(2);
  });
});

describe("linking logged attempts", () => {
  const win = (start: number, end: number, id = "a"): AttemptWindow => ({ id, provider: "tension", climbUuid: "c", start, end, tries: 1, isSend: true, quality: "bounded" });
  const hr = Array.from({ length: 60 }, (_, i) => ({ at: i * 1000, bpm: 80 + i }));

  it("keeps the windows that overlap the session and gives each one's heart rate", () => {
    const linked = linkAttempts([win(10_000, 20_000, "in"), win(500_000, 600_000, "after"), win(-50_000, -40_000, "before")], { startedAt: 0, endedAt: 59_000 }, hr);
    expect(linked.map((l) => l.window.id)).toEqual(["in"]);
    expect(linked[0].hr).toMatchObject({ count: 11, min: 90, peak: 100 });
  });

  it("uses the last sample as the end of a session that has not finished", () => {
    expect(linkAttempts([win(58_000, 70_000)], { startedAt: 0, endedAt: null }, hr)).toHaveLength(1);
    expect(linkAttempts([win(70_000, 80_000)], { startedAt: 0, endedAt: null }, hr)).toHaveLength(0);
  });
});

describe("session overview and export", () => {
  const data: SessionData = {
    session: session({ startedAt: 1000, endedAt: 31_000 }),
    hr: [{ at: 1000, bpm: 90 }, { at: 2000, bpm: 100 }],
    elevation: [{ at: 1000, metres: 100 }, { at: 5000, metres: 104.5 }, { at: 9000, metres: 102 }],
    motion: [{ at: 2000, accRms: 1.5, accMax: 4, gyroRms: 0.5, gyroMax: 2, pressure: 1010.1, gx: 0.1, gy: -9.7, gz: 1 }],
    labels: [{ id: "l1", session: "s", at: 2000, kind: "attempt-start", note: "slab, left" }],
    batches: [],
  };

  it("sums up the duration, heart rate and height change", () => {
    const o = sessionOverview(data);
    expect(o.durationMs).toBe(30_000);
    expect(o.hr).toMatchObject({ count: 2, peak: 100 });
    expect(o.elevationNet).toBeCloseTo(2);
    expect(o.elevationRange).toBeCloseTo(4.5);
  });

  it("writes one CSV row per second with the streams joined, and quotes a label that has a comma", () => {
    const rows = sessionCsv(data).trim().split("\r\n");
    expect(rows[0]).toBe("time_ms,heart_rate,elevation_m,acc_rms,acc_max,gyro_rms,gyro_max,pressure_hpa,gravity_x,gravity_y,gravity_z,label");
    expect(rows[1]).toBe("1000,90,100,,,,,,,,,");
    expect(rows[2]).toBe('2000,100,,1.5,4,0.5,2,1010.1,0.1,-9.7,1,"attempt-start (slab, left)"');
    expect(rows[3]).toBe("5000,,104.5,,,,,,,,,");
    expect(rows).toHaveLength(5);
  });

  it("writes the whole session as JSON", () => {
    const j = JSON.parse(sessionJson(data));
    expect(j).toMatchObject({ app: "slackboard-watch-session", version: 1, session: { id: "s" } });
    expect(j.heartRate).toHaveLength(2);
    expect(j.labels[0].kind).toBe("attempt-start");
  });
});
