import { useMemo, useState } from "react";
import { TextInput, View, useWindowDimensions } from "react-native";
import { randomHex } from "../../core/api";
import { nearestPoint, panRange, zoomRange, type Pt, type Range } from "../../core/chartData";
import { clockOffset, fixed } from "../../core/devFormat";
import { relativeElevation } from "../../core/elevationLab";
import { deleteSessionLabel, saveSessionLabel } from "../../core/watchLocal";
import { LABEL_KINDS, LABEL_WORDS, type LinkedAttempt, type SessionData } from "../../core/watchData";
import { getLocalDb } from "../../data/sqlite";
import { c, r } from "../../theme";
import { Button, Chip, LinkButton, SectionLabel } from "../parts";
import { Text } from "../Text";
import { TimeChart, type Band, type Mark, type Track } from "../TimeChart";

const LABEL_COLOR: Record<string, string> = { "attempt-start": "#34D17D", "attempt-end": "#F49AC2", fall: "#F2554D", rest: "#5AA9FF" };

/** The whole session on one time axis, a cursor to read values, hand-made labels, and the logged attempts shaded behind it. */
export function sessionRange(data: SessionData): Range {
  const times = [data.session.startedAt, ...data.hr.map((s) => s.at), ...data.elevation.map((s) => s.at), ...data.motion.map((m) => m.at)];
  const from = Math.min(...times);
  const to = Math.max(data.session.endedAt ?? 0, ...times);
  return { from, to: Math.max(to, from + 10_000) };
}

export function SessionTimeline({ data, linked, onChanged, onActive }: { data: SessionData; linked: LinkedAttempt[]; onChanged: () => void; onActive: (active: boolean) => void }) {
  const { width: screenW } = useWindowDimensions();
  const width = screenW - 32;
  const full = useMemo(() => sessionRange(data), [data]);
  const [view, setView] = useState<Range>(full);
  const [cursor, setCursor] = useState<number | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set(["hr", "elevation", "acc", "gyro"]));
  const [note, setNote] = useState("");

  const all: Track[] = useMemo(() => {
    const motion = (f: (m: SessionData["motion"][number]) => number | null): Pt[] => data.motion.flatMap((m) => { const v = f(m); return v === null ? [] : [{ at: m.at, v }]; });
    return [
      { id: "hr", label: "Heart rate", unit: "bpm", color: "#F2554D", points: data.hr.map((s) => ({ at: s.at, v: s.bpm })) },
      { id: "elevation", label: "Elevation (watch, relative)", unit: "m", color: "#5AA9FF", points: relativeElevation(data.elevation).map((p) => ({ at: p.at, v: p.m })) },
      { id: "acc", label: "Acceleration", unit: "m/s²", color: "#E8C766", points: motion((m) => m.accRms) },
      { id: "gyro", label: "Rotation", unit: "rad/s", color: "#34D17D", points: motion((m) => m.gyroRms) },
      { id: "pressure", label: "Air pressure", unit: "hPa", color: "#C4E04A", points: motion((m) => m.pressure) },
      { id: "gravity", label: "Gravity y", unit: "m/s²", color: "#F49AC2", points: motion((m) => m.gy) },
    ];
  }, [data]);
  const tracks = all.filter((t) => shown.has(t.id));
  const bands: Band[] = linked.map((l) => ({ start: l.window.start, end: l.window.end, color: "#E8C766" }));
  const marks: Mark[] = data.labels.map((l) => ({ at: l.at, color: LABEL_COLOR[l.kind] ?? "#FFFFFF" }));
  const toggle = (id: string) => setShown((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const addLabel = async (kind: (typeof LABEL_KINDS)[number]) => {
    if (cursor === null) return;
    await saveSessionLabel(await getLocalDb(), { id: randomHex(12), session: data.session.id, at: cursor, kind, note: note.trim() });
    setNote("");
    onChanged();
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {all.map((t) => <Chip key={t.id} label={t.label.replace(" (watch, relative)", "")} selected={shown.has(t.id)} onPress={() => toggle(t.id)} />)}
      </View>
      <TimeChart tracks={tracks} from={view.from} to={view.to} width={width} bands={bands} marks={marks} cursor={cursor} onCursor={setCursor} onActive={onActive} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <LinkButton label="Zoom in" onPress={() => setView((v) => zoomRange(v, full, 0.5, cursor ?? undefined))} />
        <LinkButton label="Zoom out" onPress={() => setView((v) => zoomRange(v, full, 2, cursor ?? undefined))} />
        <LinkButton label="Earlier" onPress={() => setView((v) => panRange(v, full, -0.5))} />
        <LinkButton label="Later" onPress={() => setView((v) => panRange(v, full, 0.5))} />
        <LinkButton label="Whole session" onPress={() => setView(full)} />
      </View>
      <Text v="caption">{clockOffset(view.from, data.session.startedAt)} to {clockOffset(view.to, data.session.startedAt)} of {clockOffset(full.to, data.session.startedAt)}. Touch or drag the chart to put the cursor on a moment. Gold bands are your logged attempts; dashed lines are labels.</Text>

      <View style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 12, gap: 2 }}>
        <Text v="bodyStrong">{cursor === null ? "No cursor yet" : `Cursor at ${clockOffset(cursor, data.session.startedAt)}`}</Text>
        {cursor !== null ? tracks.map((t) => {
          const p = nearestPoint(t.points, cursor);
          const off = p ? Math.round((p.at - cursor) / 1000) : null;
          return <Text key={t.id} v="secondary">{t.label.replace(" (watch, relative)", "")}: {p ? `${fixed(p.v, 2)} ${t.unit}${off !== null && Math.abs(off) > 1 ? ` (${off > 0 ? "+" : ""}${off} s)` : ""}` : "no reading"}</Text>;
        }) : null}
      </View>

      <SectionLabel>Label this moment</SectionLabel>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {LABEL_KINDS.map((k) => <Chip key={k} label={LABEL_WORDS[k]} onPress={() => void addLabel(k)} />)}
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={c.placeholder} maxLength={200}
        style={{ minHeight: 44, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontFamily: "Barlow_400Regular", fontSize: 16 }} />
      {cursor === null ? <Text v="caption">Put the cursor on a moment first.</Text> : null}
      {data.labels.length ? (
        <View style={{ gap: 4 }}>
          {data.labels.map((l) => (
            <View key={l.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: LABEL_COLOR[l.kind] }} />
              <Text v="body" style={{ flex: 1 }}>{clockOffset(l.at, data.session.startedAt)} · {LABEL_WORDS[l.kind]}{l.note ? ` · ${l.note}` : ""}</Text>
              <LinkButton label="Go" onPress={() => setCursor(l.at)} />
              <LinkButton label="Delete" onPress={() => { void getLocalDb().then((db) => deleteSessionLabel(db, l.id)).then(onChanged); }} />
            </View>
          ))}
        </View>
      ) : <Text v="secondary">No labels yet. Labels are the ground truth the detector lab is scored against.</Text>}
      <Button variant="secondary" label="Reload from the phone" onPress={onChanged} />
    </View>
  );
}
