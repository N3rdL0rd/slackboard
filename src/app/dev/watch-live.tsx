import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWear } from "../../state/wear";
import { Button, IconButton, SectionLabel } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

const age = (now: number, at: number | null): string => {
  if (at === null) return "never";
  const s = Math.round((now - at) / 1000);
  return s < 0 ? `${-s} s ahead (clocks differ)` : s < 120 ? `${s} s ago` : `${Math.round(s / 60)} min ago`;
};
const n = (v: number | null | undefined, places = 2) => (v === null || v === undefined ? "-" : v.toFixed(places));

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Text v="secondary" style={{ width: 130 }}>{label}</Text>
      <Text v="bodyStrong" style={{ flex: 1 }}>{value}</Text>
      {hint ? <Text v="caption">{hint}</Text> : null}
    </View>
  );
}

/** What the watch is sending right now: the latest value of each stream, how old it is, and how fast messages are arriving. */
export default function WatchLive() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const w = useWear();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { void useWear.getState().check(); }, []);

  const recent = w.arrivals.filter((t) => now - t <= 60_000);
  const m = w.live.motion;
  const e = w.live.elevation;
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Live monitor</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 + insets.bottom }}>
        <View style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 14 }}>
          <Text v="numeral" style={{ fontSize: 54, lineHeight: 58 }}>{w.live.bpm ?? "--"}</Text>
          <Text v="secondary">{w.running ? "bpm, recording" : "bpm (not recording)"} · {age(now, w.live.bpmAt)}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button variant="secondary" label="Start" onPress={() => void w.start()} /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" label="Stop" onPress={() => void w.stop()} /></View>
        </View>
        {w.note ? <Text v="secondary" aria-live="polite">{w.note}</Text> : null}

        <SectionLabel>Link</SectionLabel>
        <Row label="Watch" value={w.reachable === null ? "not checked" : w.reachable ? "reachable" : "not reachable"} />
        <Row label="Session" value={w.live.session ? w.live.session.slice(0, 8) : "none"} />
        <Row label="Last message" value={age(now, w.live.lastMessageAt)} />
        <Row label="Messages, last min" value={String(recent.length)} hint="batches every few seconds" />
        <Row label="Rejected" value={String(w.rejected)} hint="values refused as impossible" />

        <SectionLabel>Latest values</SectionLabel>
        <Row label="Acceleration" value={m ? `${n(m.accRms)} (peak ${n(m.accMax)}) m/s²` : "-"} />
        <Row label="Rotation" value={m ? `${n(m.gyroRms)} (peak ${n(m.gyroMax)}) rad/s` : "-"} />
        <Row label="Gravity x, y, z" value={m ? `${n(m.gx, 1)}, ${n(m.gy, 1)}, ${n(m.gz, 1)}` : "-"} hint="m/s²" />
        <Row label="Air pressure" value={m ? `${n(m.pressure, 2)} hPa` : "-"} />
        <Row label="Motion sample" value={age(now, m?.at ?? null)} />
        <Row label="Elevation" value={e ? `${n(e.metres, 1)} m` : "-"} hint={age(now, e?.at ?? null)} />

        <SectionLabel>Workout totals</SectionLabel>
        <Row label="Calories" value={w.stats?.calories != null ? `${n(w.stats.calories, 1)} kcal` : "-"} />
        <Row label="Elevation gained" value={w.stats?.gain != null ? `${n(w.stats.gain, 1)} m` : "-"} />
        <Row label="Heart rate" value={w.stats?.hrAvg != null ? `avg ${n(w.stats.hrAvg, 0)}, min ${n(w.stats.hrMin, 0)}, max ${n(w.stats.hrMax, 0)}` : "-"} />

        <SectionLabel>Received since the app started</SectionLabel>
        <Row label="Heart rate" value={String(w.received)} />
        <Row label="Elevation" value={String(w.elevationSamples)} />
        <Row label="Motion seconds" value={String(w.motionRows)} />
      </ScrollView>
    </View>
  );
}
