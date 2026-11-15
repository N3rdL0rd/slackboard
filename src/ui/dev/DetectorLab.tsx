import { useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import {
  DEFAULT_DETECTOR, DETECTOR_LIMITS, activityScores, compareToLabels, detectAttempts, labelledAttempts, smoothScores, type DetectorParams,
} from "../../core/attemptDetector";
import { clockOffset, fixed } from "../../core/devFormat";
import { gainIn, pressureHeights, relativeElevation } from "../../core/elevationLab";
import { hrIn, type LinkedAttempt, type SessionData } from "../../core/watchData";
import { c, r } from "../../theme";
import { Button, SectionLabel } from "../parts";
import { Stepper } from "../Stepper";
import { Text } from "../Text";
import { TimeChart, type Band } from "../TimeChart";
import { DevRow } from "./DevRow";
import { sessionRange } from "./SessionTimeline";

const PARAMS: { key: keyof DetectorParams; label: string; unit: string; places: number }[] = [
  { key: "threshold", label: "Threshold", unit: "", places: 1 },
  { key: "smoothSec", label: "Smoothing", unit: " s", places: 0 },
  { key: "minSec", label: "Shortest", unit: " s", places: 0 },
  { key: "mergeGapSec", label: "Merge gap", unit: " s", places: 0 },
  { key: "gyroWeight", label: "Rotation weight", unit: "", places: 1 },
];

/** Turn the knobs and see which attempts the motion alone would find, against the ones you labelled and the ones you logged. */
export function DetectorLab({ data, linked, onActive }: { data: SessionData; linked: LinkedAttempt[]; onActive: (active: boolean) => void }) {
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32;
  const [p, setP] = useState<DetectorParams>(DEFAULT_DETECTOR);
  const [cursor, setCursor] = useState<number | null>(null);
  const full = useMemo(() => sessionRange(data), [data]);
  const start = data.session.startedAt;

  const detected = useMemo(() => detectAttempts(data.motion, p), [data.motion, p]);
  const truth = useMemo(() => labelledAttempts(data.labels), [data.labels]);
  const logged = linked.map((l) => ({ start: l.window.start, end: l.window.end }));
  const vsLabels = compareToLabels(detected, truth);
  const vsLogged = compareToLabels(detected, logged);
  const hs = useMemo(() => relativeElevation(data.elevation).map((x) => ({ at: x.at, m: x.m })), [data.elevation]);
  const baro = useMemo(() => pressureHeights(data.motion), [data.motion]);
  const scores = useMemo(() => smoothScores(activityScores(data.motion, p.gyroWeight), p.smoothSec).map((s) => ({ at: s.at, v: s.score })), [data.motion, p.gyroWeight, p.smoothSec]);
  const bands: Band[] = [
    ...detected.map((d) => ({ start: d.start, end: d.end, color: "#5AA9FF" })),
    ...truth.map((t) => ({ start: t.start, end: t.end, color: "#34D17D" })),
    ...logged.map((t) => ({ start: t.start, end: t.end, color: "#E8C766" })),
  ];

  const step = (k: keyof DetectorParams, dir: 1 | -1) => setP((q) => {
    const lim = DETECTOR_LIMITS[k];
    const v = Math.round((q[k] + dir * lim.step) * 100) / 100;
    return { ...q, [k]: Math.min(lim.max, Math.max(lim.min, v)) };
  });

  const pct = (v: number | null) => (v === null ? "-" : `${Math.round(v * 100)}%`);
  return (
    <View style={{ gap: 8 }}>
      <Text v="secondary">Finds attempts from motion alone: a one-second score (acceleration plus weighted rotation) is smoothed; stretches above the threshold that last long enough are attempts, and close ones merge. Blue are detected, green are labelled by hand, gold are logged in your Log.</Text>
      {PARAMS.map((q) => (
        <Stepper key={q.key} label={q.label} value={`${fixed(p[q.key], q.places)}${q.unit}`} onChange={(dir) => step(q.key, dir)}
          min={p[q.key] <= DETECTOR_LIMITS[q.key].min} max={p[q.key] >= DETECTOR_LIMITS[q.key].max} />
      ))}
      <Button variant="secondary" label="Reset the knobs" onPress={() => setP(DEFAULT_DETECTOR)} />

      <TimeChart tracks={[
        { id: "score", label: "Activity score (smoothed)", unit: "", color: "#E8C766", points: scores },
        { id: "hr", label: "Heart rate", unit: "bpm", color: "#F2554D", points: data.hr.map((s) => ({ at: s.at, v: s.bpm })) },
      ]} from={full.from} to={full.to} width={width} bands={bands} cursor={cursor} onCursor={setCursor} onActive={onActive} />

      <SectionLabel>Scored</SectionLabel>
      <DevRow label="Detected" value={String(detected.length)} />
      <DevRow label="Against labels" value={truth.length ? `${vsLabels.matched} matched, ${vsLabels.missed} missed, ${vsLabels.extra} extra` : "no labelled attempts"} hint={truth.length ? `recall ${pct(vsLabels.recall)}, precision ${pct(vsLabels.precision)}` : undefined} wide />
      <DevRow label="Against logged" value={logged.length ? `${vsLogged.matched} matched, ${vsLogged.missed} missed, ${vsLogged.extra} extra` : "no logged attempts"} hint={logged.length ? `recall ${pct(vsLogged.recall)}, precision ${pct(vsLogged.precision)}` : undefined} wide />

      <SectionLabel>Detected attempts</SectionLabel>
      {detected.length === 0 ? <Text v="secondary">Nothing found. Lower the threshold or the shortest length.</Text> : null}
      {detected.map((d) => {
        const h = hrIn(data.hr, d.start, d.end);
        const gHs = gainIn(hs, d.start, d.end);
        const gBa = gainIn(baro, d.start, d.end);
        return (
          <View key={d.start} style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 12, gap: 2 }}>
            <Text v="bodyStrong">{clockOffset(d.start, start)} to {clockOffset(d.end, start)} · {Math.round(d.seconds)} s</Text>
            <Text v="secondary">Score mean {fixed(d.mean, 1)}, peak {fixed(d.peak, 1)}</Text>
            <Text v="caption">{h ? `Heart rate avg ${fixed(h.avg, 0)}, peak ${h.peak}` : "No heart rate"} · height watch {gHs ? `${fixed(gHs.net, 1)} m` : "-"}, pressure {gBa ? `${fixed(gBa.net, 1)} m` : "-"}</Text>
          </View>
        );
      })}
    </View>
  );
}
