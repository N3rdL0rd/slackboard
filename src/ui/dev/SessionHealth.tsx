import { View } from "react-native";
import { clockOffset, fixed, span } from "../../core/devFormat";
import { deliveryHealth, streamHealth, type SessionData, type StreamHealth } from "../../core/watchData";
import { SectionLabel } from "../parts";
import { Text } from "../Text";
import { DevRow } from "./DevRow";

function Stream({ title, h, start }: { title: string; h: StreamHealth; start: number }) {
  return (
    <View style={{ gap: 2 }}>
      <SectionLabel>{title}</SectionLabel>
      <DevRow label="Samples" value={String(h.count)} hint={h.dropped ? `${h.dropped} refused` : undefined} />
      <DevRow label="Span" value={h.firstAt !== null && h.lastAt !== null ? `${clockOffset(h.firstAt, start)} to ${clockOffset(h.lastAt, start)}` : "-"} />
      <DevRow label="Interval" value={`median ${span(h.medianMs)}`} hint={h.minMs !== null ? `min ${span(h.minMs)}, max ${span(h.maxMs)}` : undefined} />
      <DevRow label="Gaps" value={h.gaps.length ? `${h.gaps.length}, longest ${span(Math.max(...h.gaps.map((g) => g.ms)))}` : "none"} />
      {h.gaps.slice(0, 8).map((g) => <Text key={g.from} v="caption">  {clockOffset(g.from, start)} to {clockOffset(g.to, start)} ({span(g.ms)})</Text>)}
    </View>
  );
}

/** How each stream went, how the messages arrived, and how the watch's own totals compare with what the samples say. */
export function SessionHealth({ data }: { data: SessionData }) {
  const start = data.session.startedAt;
  const dropped = (k: string) => data.batches.filter((b) => b.kind === k).reduce((n, b) => n + b.dropped, 0);
  const d = deliveryHealth(data.batches);
  const missing = (f: (m: SessionData["motion"][number]) => number | null) => data.motion.filter((m) => f(m) === null).length;
  const hrBpms = data.hr.map((s) => s.bpm);
  const st = data.session.stats;
  return (
    <View style={{ gap: 6 }}>
      <Stream title="Heart rate" h={streamHealth(data.hr.map((s) => s.at), dropped("hr"))} start={start} />
      <Stream title="Elevation" h={streamHealth(data.elevation.map((s) => s.at), dropped("elevation"))} start={start} />
      <Stream title="Motion" h={streamHealth(data.motion.map((m) => m.at), dropped("motion"))} start={start} />
      <SectionLabel>Motion rows missing a value</SectionLabel>
      <DevRow label="Acceleration" value={String(missing((m) => m.accRms))} />
      <DevRow label="Rotation" value={String(missing((m) => m.gyroRms))} />
      <DevRow label="Gravity" value={String(missing((m) => m.gx))} />
      <DevRow label="Air pressure" value={String(missing((m) => m.pressure))} />

      <SectionLabel>Delivery</SectionLabel>
      <DevRow label="Messages" value={String(d.batches)} />
      <DevRow label="Delay" value={`median ${span(d.medianDelayMs)}, max ${span(d.maxDelayMs)}`} hint="sample to arrival" />
      <DevRow label="Late (over 30 s)" value={String(d.late)} />
      <DevRow label="Out of order" value={String(d.outOfOrder)} />
      <DevRow label="Refused values" value={String(d.dropped)} />
      {d.batches === 0 ? <Text v="caption">No delivery records: this session was restored from a backup, or recorded before they were kept.</Text> : null}

      <SectionLabel>Watch totals against the samples</SectionLabel>
      <DevRow label="Heart rate average" value={`${fixed(st.hrAvg, 1)} (watch)`} hint={hrBpms.length ? `${fixed(hrBpms.reduce((a, b) => a + b, 0) / hrBpms.length, 1)} from samples` : undefined} wide />
      <DevRow label="Heart rate min, max" value={`${fixed(st.hrMin, 0)}, ${fixed(st.hrMax, 0)} (watch)`} hint={hrBpms.length ? `${Math.min(...hrBpms)}, ${Math.max(...hrBpms)} from samples` : undefined} wide />
      <DevRow label="Calories" value={st.calories !== null ? `${fixed(st.calories, 1)} kcal` : "-"} wide />
      <DevRow label="Elevation gained" value={st.gain !== null ? `${fixed(st.gain, 2)} m` : "-"} wide />
    </View>
  );
}
