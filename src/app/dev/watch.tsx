import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { durationText } from "../../core/attempts";
import { deleteAllWatchData, loadWatchSessions, pruneWatchSessions, type WatchSessionListing } from "../../core/watchLocal";
import { getLocalDb } from "../../data/sqlite";
import { useStore } from "../../state/store";
import { useWear } from "../../state/wear";
import { Button, IconButton, SectionLabel, Sheet, SwitchRow } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { WatchSettings } from "../../ui/WatchSettings";
import { c, r } from "../../theme";

const when = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Mean seconds between samples of a stream, from its count and span; null with under two samples. */
const meanInterval = (count: number, span: [number, number] | null): string | null =>
  span && count > 1 ? `${((span[1] - span[0]) / 1000 / (count - 1)).toFixed(span[1] - span[0] > 100_000 ? 1 : 2)} s` : null;

export default function WatchSessions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const version = useWear((s) => s.dataVersion);
  const watchBackup = useStore((s) => s.settings.watchBackup);
  const patch = useStore((s) => s.patchSettings);
  const [list, setList] = useState<WatchSessionListing[] | null>(null);
  const [confirm, setConfirm] = useState<null | "all" | "old">(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => setList(await loadWatchSessions(await getLocalDb())), []);
  useEffect(() => { void load(); }, [load, version]);

  const clear = async () => {
    const db = await getLocalDb();
    if (confirm === "all") { await deleteAllWatchData(db); setNote("All watch data deleted."); }
    else { const n = await pruneWatchSessions(db, Date.now() - 30 * 86_400_000); setNote(`${n} ${n === 1 ? "session" : "sessions"} older than 30 days deleted.`); }
    setConfirm(null);
    await load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Watch</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 + insets.bottom }}>
        <WatchSettings />

        <SectionLabel>Recorded sessions</SectionLabel>
        {list === null ? <Text v="secondary">Loading.</Text> : list.length === 0 ? <Text v="secondary">Nothing recorded yet. Start a session from the watch, or with Start recording above.</Text> : null}
        {list?.map((s) => {
          const parts = [
            s.counts.hr ? `heart rate ${s.counts.hr}${meanInterval(s.counts.hr, s.spans.hr) ? ` (every ${meanInterval(s.counts.hr, s.spans.hr)})` : ""}` : "",
            s.counts.elevation ? `elevation ${s.counts.elevation}${meanInterval(s.counts.elevation, s.spans.elevation) ? ` (every ${meanInterval(s.counts.elevation, s.spans.elevation)})` : ""}` : "",
            s.counts.motion ? `motion ${s.counts.motion}${meanInterval(s.counts.motion, s.spans.motion) ? ` (every ${meanInterval(s.counts.motion, s.spans.motion)})` : ""}` : "",
            s.counts.labels ? `${s.counts.labels} ${s.counts.labels === 1 ? "label" : "labels"}` : "",
          ].filter(Boolean);
          const end = s.endedAt ?? Math.max(...[s.spans.hr, s.spans.elevation, s.spans.motion].map((x) => (x ? x[1] : s.startedAt)));
          return (
            <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/dev/watch-session", params: { id: s.id } })}
              style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 14, gap: 3 }}>
              <Text v="bodyStrong">{when(s.startedAt)} · {durationText(Math.max(0, (end - s.startedAt) / 1000))}{s.endedAt === null ? " (open)" : ""}</Text>
              <Text v="secondary">{s.mode === "heart-rate" ? "Heart rate only" : s.mode === "workout" ? "Workout" : "Mode unknown"}{s.stats.calories !== null ? ` · ${Math.round(s.stats.calories)} kcal` : ""}{s.stats.gain !== null ? ` · ${s.stats.gain.toFixed(1)} m gained` : ""}</Text>
              <Text v="caption">{parts.join(" · ") || "No samples"}</Text>
            </Pressable>
          );
        })}

        <SectionLabel>Data</SectionLabel>
        <SwitchRow label="Include watch data in backups" help="Off by default: motion rows add up (about 700 KB for a two-hour session)." value={watchBackup} onChange={(v) => patch({ watchBackup: v })} />
        <Button variant="secondary" label="Delete sessions older than 30 days" onPress={() => setConfirm("old")} />
        <Button variant="danger" label="Delete all watch data" onPress={() => setConfirm("all")} />
        {note ? <Text v="secondary" aria-live="polite">{note}</Text> : null}
      </ScrollView>
      <Sheet visible={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "all" ? "Delete all watch data?" : "Delete old sessions?"}
        footer={<View style={{ gap: 8 }}><Button variant="danger" label="Delete" onPress={() => void clear()} /><Button variant="secondary" label="Cancel" onPress={() => setConfirm(null)} /></View>}>
        <Text v="secondary">{confirm === "all" ? "Every recorded session, with its samples and labels, is removed from this phone. This can't be undone." : "Sessions that started more than 30 days ago are removed, with their samples and labels."}</Text>
      </Sheet>
    </View>
  );
}
