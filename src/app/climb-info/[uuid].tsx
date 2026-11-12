import { useUserId } from "../../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../../core/api";
import { nextCursor, parseClimbInfo, parseFeed, relativeTime, type ClimbInfo, type FeedEvent, type Histogram } from "../../core/feed";
import { grades } from "../../data/grades";
import { sessionFor } from "../../state/session";
import { useStore } from "../../state/store";
import { Avatar } from "../../ui/Avatar";
import { Button, IconButton, Segmented, Stars } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

type Tab = "info" | "sends";

/** Everything about one climb: who set it, who sent it first, how the grade and quality votes split, and the sends with their comments. */
export default function ClimbInfoScreen() {
  const { uuid, angle } = useLocalSearchParams<{ uuid: string; angle?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const display = useStore((s) => s.settings.gradeDisplay);
  const [tab, setTab] = useState<Tab>("info");
  const [info, setInfo] = useState<ClimbInfo | null | undefined>(undefined);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const session = sessionFor();

  useEffect(() => {
    if (!session) return;
    void get(session, `/climbs/${uuid}/info?angle=${angle ?? 40}&_version=2`).then((j) => setInfo(parseClimbInfo(j)));
  }, [uuid, angle]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = async () => {
    if (!session || loading || done) return;
    setLoading(true);
    const before = nextCursor(events);
    const j = await get(session, `/climbs/${uuid}/notifications?climbs=1&ascents=1${before ? `&before=${encodeURIComponent(before)}` : ""}`);
    const page = parseFeed(j).filter((e) => e.kind === "ascent");
    setEvents((cur) => [...cur, ...page]);
    if (!page.length) setDone(true);
    setLoading(false);
  };
  useEffect(() => { if (tab === "sends" && events.length === 0 && !done) void more(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }} numberOfLines={1}>{info?.name ?? "Climb info"}</Text>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented options={[{ value: "info", label: "Info" }, { value: "sends", label: "Sends and comments" }]} value={tab} onChange={setTab} />
      </View>

      {tab === "info" ? (
        <JumpList data={[0]} keyExtractor={() => "info"} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 16 }}
          renderItem={() => (
            info === undefined ? <Text v="secondary">Loading</Text> : info === null ? <Text v="secondary">Couldn't load this climb. Check your connection.</Text> : (
              <View style={{ gap: 16 }}>
                {info.description ? <Text v="body">{info.description}</Text> : null}
                {info.isNoMatch && <Text v="secondary">No matching: hands may not share a hold.</Text>}
                {info.setter && (
                  <Row label="Set by" avatar={<Avatar path={info.setter.avatar} name={info.setter.username} size={36} />} value={info.setter.name ?? info.setter.username} />
                )}
                {info.firstAscent && <Row label="First ascent" avatar={info.firstAscent.user ? <Avatar path={info.firstAscent.user.avatar} name={info.firstAscent.user.username} size={36} /> : undefined}
                  value={`${info.firstAscent.user?.name ?? info.firstAscent.user?.username ?? "Someone"} · ${relativeTime(info.firstAscent.at)}`} />}
                <Row label="Sends, all angles" value={info.ascentCount.toLocaleString("en-US")} />
                <Bars title="What people graded it" data={info.difficulty} label={(v) => grades.label(v, display).primary} total={info.ascentCount} />
                <Bars title="Quality votes" data={info.quality} label={(v) => `${v} ${v === 1 ? "star" : "stars"}`} total={info.ascentCount} />
              </View>
            )
          )} />
      ) : (
        <JumpList data={events} keyExtractor={(e) => e.id} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          onEndReached={() => void more()} onEndReachedThreshold={0.6}
          ListEmptyComponent={<Text v="secondary" style={{ padding: 16 }}>{loading ? "Loading" : "No sends yet."}</Text>}
          ListFooterComponent={!done && events.length > 0 ? <View style={{ padding: 16 }}><Button variant="secondary" label={loading ? "Loading" : "Show more"} disabled={loading} onPress={() => void more()} /></View> : <View />}
          renderItem={({ item }) => item.kind === "ascent" ? (
            <View style={{ flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}>
              <Avatar path={item.user.avatar} name={item.user.username} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text v="bodyStrong">{item.user.name ?? item.user.username}</Text>
                <Text v="secondary">{item.gradeName.split("/")[1] ?? item.gradeName} · {item.angle}°{item.isMirror ? " · Mirrored" : ""} · {relativeTime(item.createdAt)}</Text>
                <Stars value={item.quality} />
                {item.comment ? <Text v="body" style={{ marginTop: 2 }}>{item.comment}</Text> : null}
              </View>
            </View>
          ) : <View />} />
      )}
    </View>
  );
}

function Row({ label, value, avatar }: { label: string; value: string; avatar?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      {avatar}
      <View style={{ flex: 1 }}>
        <Text v="caption">{label}</Text>
        <Text v="bodyStrong">{value}</Text>
      </View>
    </View>
  );
}

function Bars({ title, data, label, total }: { title: string; data: Histogram[]; label: (v: number) => string; total: number }) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.count));
  return (
    <View style={{ gap: 6 }}>
      <Text v="section">{title}</Text>
      {data.map((d) => (
        <View key={d.value} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text v="bodyStrong" style={{ width: 64 }} numberOfLines={1}>{label(d.value)}</Text>
          <View style={{ height: 12, width: `${Math.max(2, (d.count / max) * 62)}%`, backgroundColor: c.text2, borderRadius: 4 }} />
          <Text v="caption">{d.count.toLocaleString("en-US")}{total ? ` · ${Math.round((d.count / total) * 100)}%` : ""}</Text>
        </View>
      ))}
    </View>
  );
}
