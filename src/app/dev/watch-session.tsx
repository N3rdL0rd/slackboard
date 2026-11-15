import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { attemptWindows } from "../../core/attempts";
import { durationText } from "../../core/attempts";
import { linkAttempts, type SessionData } from "../../core/watchData";
import { deleteWatchSession, loadSessionData } from "../../core/watchLocal";
import { getLocalDb } from "../../data/sqlite";
import { useData } from "../../state/data";
import { useLitHistory } from "../../state/litHistory";
import { useWear } from "../../state/wear";
import { Button, Chip, IconButton, Sheet } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { DetectorLab } from "../../ui/dev/DetectorLab";
import { ElevationLab } from "../../ui/dev/ElevationLab";
import { SessionAttempts } from "../../ui/dev/SessionAttempts";
import { SessionExport } from "../../ui/dev/SessionExport";
import { SessionHealth } from "../../ui/dev/SessionHealth";
import { SessionTimeline, sessionRange } from "../../ui/dev/SessionTimeline";
import { c } from "../../theme";

type Tab = "timeline" | "health" | "attempts" | "detector" | "elevation" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "health", label: "Health" },
  { id: "attempts", label: "Attempts" },
  { id: "detector", label: "Detector lab" },
  { id: "elevation", label: "Elevation lab" },
  { id: "export", label: "Export" },
];

/** One recorded watch session, from every side. Developer tool: nothing here is shown anywhere else. */
export default function WatchSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const version = useWear((s) => s.dataVersion);
  const logbook = useData((d) => d.logbook);
  const lit = useLitHistory();
  const [data, setData] = useState<SessionData | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("timeline");
  const [scrollOn, setScrollOn] = useState(true);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => setData(await loadSessionData(await getLocalDb(), id)), [id]);
  useEffect(() => { void load(); }, [load, version]);

  // The attempts you logged that fall inside this session, from your log and lighting history.
  const linked = useMemo(() => {
    if (!data) return [];
    const windows = attemptWindows(logbook, lit.map((e) => ({ provider: e.provider, climbUuid: e.climbUuid, litAt: e.litAt })));
    return linkAttempts(windows, data.session, data.hr);
  }, [data, logbook, lit]);
  const nameOf = useCallback((provider: string, uuid: string) => logbook.find((e) => e.provider === provider && e.climbUuid === uuid)?.climbName ?? uuid, [logbook]);

  const remove = async () => { await deleteWatchSession(await getLocalDb(), id); setConfirm(false); router.back(); };
  const range = data ? sessionRange(data) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Watch session</Text>
      </View>
      {data === undefined ? <Text v="secondary" style={{ padding: 20 }}>Loading.</Text> : data === null || !range ? <Text v="secondary" style={{ padding: 20 }}>That session is gone.</Text> : (
        <ScrollView scrollEnabled={scrollOn} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 + insets.bottom }}>
          <Text v="secondary">{new Date(data.session.startedAt).toLocaleString()} · {durationText((range.to - range.from) / 1000)} · {data.session.mode === "heart-rate" ? "heart rate only" : "workout"} · {data.hr.length} heart rate, {data.elevation.length} elevation, {data.motion.length} motion</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TABS.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}
          </View>
          {tab === "timeline" ? <SessionTimeline data={data} linked={linked} onChanged={() => void load()} onActive={(a) => setScrollOn(!a)} /> : null}
          {tab === "health" ? <SessionHealth data={data} /> : null}
          {tab === "attempts" ? <SessionAttempts data={data} linked={linked} nameOf={nameOf} /> : null}
          {tab === "detector" ? <DetectorLab data={data} linked={linked} onActive={(a) => setScrollOn(!a)} /> : null}
          {tab === "elevation" ? <ElevationLab data={data} linked={linked} onActive={(a) => setScrollOn(!a)} /> : null}
          {tab === "export" ? <SessionExport data={data} onDelete={() => setConfirm(true)} /> : null}
        </ScrollView>
      )}
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Delete this session?"
        footer={<View style={{ gap: 8 }}><Button variant="danger" label="Delete" onPress={() => void remove()} /><Button variant="secondary" label="Cancel" onPress={() => setConfirm(false)} /></View>}>
        <Text v="secondary">The session, its samples and its labels are removed from this phone. This can't be undone.</Text>
      </Sheet>
    </View>
  );
}
