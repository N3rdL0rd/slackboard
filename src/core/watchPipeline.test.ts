import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DETECTOR, compareToLabels, detectAttempts, labelledAttempts } from "./attemptDetector";
import type { Db } from "./db";
import { agreement, gainIn, pressureHeights, relativeElevation, smoothHeights } from "./elevationLab";
import { ensureLocalSchema } from "./logicalCircuits";
import { openNodeDb } from "./nodeDb";
import { deliveryHealth, hrIn, streamHealth, type SessionLabel } from "./watchData";
import { syntheticSession } from "./watchFixture";
import { ingestWatchMessages, loadSessionData, saveSessionLabel } from "./watchLocal";

const T0 = 1_700_000_000_000;
const ATTEMPTS = [{ startSec: 40, endSec: 75 }, { startSec: 130, endSec: 165 }, { startSec: 230, endSec: 262 }];

describe("a whole session through storage and the analysis", () => {
  let db: Db;
  beforeEach(async () => { db = openNodeDb(); await ensureLocalSchema(db); });

  it("finds the attempts, agrees with the labels, and measures the height, from stored data", async () => {
    await ingestWatchMessages(db, syntheticSession("demo", T0, 300, ATTEMPTS));
    const d = (await loadSessionData(db, "demo"))!;
    expect(d.hr).toHaveLength(300);
    expect(d.elevation).toHaveLength(150);
    expect(d.motion).toHaveLength(300);
    expect(d.session).toMatchObject({ mode: "workout", startedAt: T0, endedAt: T0 + 300_000 });

    const labels: SessionLabel[] = ATTEMPTS.flatMap((a, i) => [
      { id: `s${i}`, session: "demo", at: T0 + a.startSec * 1000, kind: "attempt-start" as const, note: "" },
      { id: `e${i}`, session: "demo", at: T0 + a.endSec * 1000, kind: "attempt-end" as const, note: "" },
    ]);
    for (const l of labels) await saveSessionLabel(db, l);
    const truth = labelledAttempts((await loadSessionData(db, "demo"))!.labels);
    expect(truth).toHaveLength(3);

    const found = detectAttempts(d.motion, DEFAULT_DETECTOR);
    expect(found).toHaveLength(3);
    expect(compareToLabels(found, truth)).toMatchObject({ matched: 3, missed: 0, extra: 0, recall: 1, precision: 1 });

    // The two height sources agree, and each attempt gains about three metres by either.
    const hs = smoothHeights(relativeElevation(d.elevation), 3, "mean");
    const baro = smoothHeights(pressureHeights(d.motion), 3, "mean");
    expect(agreement(hs, baro).correlation).toBeGreaterThan(0.95);
    for (const t of truth) {
      expect(gainIn(hs, t.start, t.end)!.net).toBeGreaterThan(2);
      expect(gainIn(baro, t.start, t.end)!.net).toBeGreaterThan(2);
    }
    // Heart rate is higher in an attempt than at rest.
    expect(hrIn(d.hr, truth[1].start, truth[1].end)!.avg).toBeGreaterThan(hrIn(d.hr, T0, T0 + 20_000)!.avg + 20);
  });

  it("reports healthy streams for a clean session, and a gap for a missing stretch", async () => {
    const msgs = syntheticSession("demo", T0, 300, ATTEMPTS);
    // Lose the heart rate from 100 to 160 seconds.
    const lost = msgs.map((m) => (m.message.kind === "hr" ? { ...m, message: { ...m.message, samples: m.message.samples.filter((s) => s.at < T0 + 100_000 || s.at >= T0 + 160_000) } } : m));
    await ingestWatchMessages(db, lost);
    const d = (await loadSessionData(db, "demo"))!;
    const h = streamHealth(d.hr.map((s) => s.at));
    expect(h.medianMs).toBe(1000);
    expect(h.gaps).toHaveLength(1);
    expect(h.gaps[0].ms).toBeGreaterThan(55_000);
    expect(streamHealth(d.motion.map((m) => m.at)).gaps).toEqual([]);
    expect(deliveryHealth(d.batches)).toMatchObject({ late: 0, outOfOrder: 0 });
  });
});
