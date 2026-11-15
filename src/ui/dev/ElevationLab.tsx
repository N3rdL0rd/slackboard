import { useMemo, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { DEFAULT_DETECTOR, detectAttempts, labelledAttempts, type Interval } from "../../core/attemptDetector";
import { clockOffset, fixed } from "../../core/devFormat";
import { agreement, gainIn, pressureHeights, relativeElevation, smoothHeights, type Smoothing } from "../../core/elevationLab";
import type { LinkedAttempt, SessionData } from "../../core/watchData";
import { c, r } from "../../theme";
import { Chip, SectionLabel } from "../parts";
import { Stepper } from "../Stepper";
import { Text } from "../Text";
import { TimeChart } from "../TimeChart";
import { DevRow } from "./DevRow";
import { sessionRange } from "./SessionTimeline";

const SMOOTHINGS: { id: string; label: string; kind: Smoothing; sec: number }[] = [
  { id: "none", label: "None", kind: "none", sec: 0 },
  { id: "mean3", label: "Mean 3 s", kind: "mean", sec: 3 },
  { id: "mean9", label: "Mean 9 s", kind: "mean", sec: 9 },
  { id: "median3", label: "Median 3 s", kind: "median", sec: 3 },
  { id: "median9", label: "Median 9 s", kind: "median", sec: 9 },
];

type Source = "labelled" | "detected" | "logged";

/** Two sources of height side by side: the watch's elevation and a height worked out from air pressure. */
export function ElevationLab({ data, linked, onActive }: { data: SessionData; linked: LinkedAttempt[]; onActive: (active: boolean) => void }) {
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32;
  const [smooth, setSmooth] = useState("mean3");
  const [refSec, setRefSec] = useState(30);
  const [source, setSource] = useState<Source>("labelled");
  const [cursor, setCursor] = useState<number | null>(null);
  const full = useMemo(() => sessionRange(data), [data]);
  const start = data.session.startedAt;
  const sm = SMOOTHINGS.find((s) => s.id === smooth) ?? SMOOTHINGS[0];

  const hs = useMemo(() => smoothHeights(relativeElevation(data.elevation), sm.sec, sm.kind), [data.elevation, sm]);
  const baro = useMemo(() => smoothHeights(pressureHeights(data.motion, refSec), sm.sec, sm.kind), [data.motion, refSec, sm]);
  const ag = useMemo(() => agreement(hs, baro), [hs, baro]);
  const windows: Interval[] = useMemo(() => {
    if (source === "labelled") return labelledAttempts(data.labels);
    if (source === "logged") return linked.map((l) => ({ start: l.window.start, end: l.window.end }));
    return detectAttempts(data.motion, DEFAULT_DETECTOR);
  }, [source, data.labels, data.motion, linked]);

  const to = (pts: { at: number; m: number }[]) => pts.map((p) => ({ at: p.at, v: p.m }));
  const pct = (v: number | null) => (v === null ? "-" : v.toFixed(3));
  return (
    <View style={{ gap: 8 }}>
      <Text v="secondary">Both lines are relative to the start (the watch's absolute elevation means nothing on a wall). If they agree, the height gained in an attempt can be trusted; if one drifts, it can't.</Text>
      <SectionLabel>Smoothing</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SMOOTHINGS.map((s) => <Chip key={s.id} label={s.label} selected={smooth === s.id} onPress={() => setSmooth(s.id)} />)}
      </View>
      <Stepper label="Pressure reference" value={`${refSec} s`} onChange={(d) => setRefSec((v) => Math.min(300, Math.max(5, v + d * 5)))} min={refSec <= 5} max={refSec >= 300} />

      <TimeChart tracks={[{ id: "height", label: "Watch (blue) and pressure (green)", unit: "m", color: "#5AA9FF", points: to(hs), overlay: { color: "#34D17D", points: to(baro) } }]}
        from={full.from} to={full.to} width={width} trackHeight={150} cursor={cursor} onCursor={setCursor} onActive={onActive}
        bands={windows.map((w) => ({ start: w.start, end: w.end, color: "#E8C766" }))} />

      <SectionLabel>Agreement</SectionLabel>
      <DevRow label="Shared seconds" value={String(ag.seconds)} />
      <DevRow label="Correlation" value={pct(ag.correlation)} hint="1 is perfect" />
      <DevRow label="Typical difference" value={ag.rmsDiff === null ? "-" : `${fixed(ag.rmsDiff, 2)} m`} />
      <DevRow label="Drift" value={ag.drift === null ? "-" : `${fixed(ag.drift, 2)} m`} hint="watch minus pressure, end vs start" />

      <SectionLabel>Height in each attempt</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["labelled", "detected", "logged"] as Source[]).map((s) => <Chip key={s} label={s === "labelled" ? "Labelled" : s === "detected" ? "Detected" : "Logged"} selected={source === s} onPress={() => setSource(s)} />)}
      </View>
      {windows.length === 0 ? <Text v="secondary">No {source} attempts in this session.</Text> : null}
      {windows.map((w) => {
        const a = gainIn(hs, w.start, w.end);
        const b = gainIn(baro, w.start, w.end);
        return (
          <View key={w.start} style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 12, gap: 2 }}>
            <Text v="bodyStrong">{clockOffset(w.start, start)} to {clockOffset(w.end, start)}</Text>
            <Text v="secondary">Watch: net {fixed(a?.net, 2)} m, range {fixed(a?.range, 2)} m</Text>
            <Text v="secondary">Pressure: net {fixed(b?.net, 2)} m, range {fixed(b?.range, 2)} m</Text>
          </View>
        );
      })}
    </View>
  );
}
