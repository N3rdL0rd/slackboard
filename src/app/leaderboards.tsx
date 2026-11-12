import { useUserId } from "../state/useActive";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { JumpList } from "../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../core/api";
import { leaderboardChoices, parseLeaderboards, parseScores, pickLeaderboard, type LeaderboardChoice, type LeaderboardKey, type Score } from "../core/social";
import { sessionFor } from "../state/session";
import { useBoard, useStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Button, Chip, IconButton, Segmented } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** Who's sending the most on each board. Pick the board, size and period; the ranking is right below. */
export default function Leaderboards() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const board = useBoard();
  const [choices, setChoices] = useState<LeaderboardChoice[] | null>(null);
  const [want, setWant] = useState<Partial<LeaderboardKey> | null>(null);
  const [rows, setRows] = useState<Score[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const session = sessionFor();

  useEffect(() => {
    if (!session) return;
    void get(session, "/leaderboards").then((j) => {
      const list = leaderboardChoices(parseLeaderboards(j));
      setChoices(list);
      // Start on the board you're looking at, all time.
      const first = pickLeaderboard(list, { layout: board?.spec.layoutName, size: board?.spec.sizeName, period: "All Time" });
      setWant(first?.key ?? null);
    });
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const layouts = useMemo(() => uniq((choices ?? []).map((x) => x.key.layout)), [choices]);
  const sizes = useMemo(() => uniq((choices ?? []).filter((x) => x.key.layout === want?.layout).map((x) => x.key.size)), [choices, want?.layout]);
  const periods = useMemo(() => uniq((choices ?? []).filter((x) => x.key.layout === want?.layout && x.key.size === want?.size).map((x) => x.key.period)), [choices, want?.layout, want?.size]);
  const current = choices && want ? pickLeaderboard(choices, want) : undefined;

  const pickLayout = (layout: string) => setWant((w) => pickLeaderboard(choices ?? [], { ...w, layout })?.key ?? w);
  const pickSize = (size: string) => setWant((w) => pickLeaderboard(choices ?? [], { ...w, size })?.key ?? w);
  const pickPeriod = (period: string) => setWant((w) => pickLeaderboard(choices ?? [], { ...w, period })?.key ?? w);

  const load = async (id: number, reset: boolean, have: number) => {
    if (!session) return;
    setLoading(true); setFailed(false);
    const j = await get(session, `/leaderboards?leaderboard_id=${id}&offset=${reset ? 0 : have}`);
    if (!j) setFailed(true);
    const page = parseScores(j);
    setDone(page.length === 0);
    setRows((cur) => (reset ? page : [...cur, ...page]));
    setLoading(false);
  };
  useEffect(() => { if (current) { setRows([]); void load(current.id, true, 0); } }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = rows.find((s) => s.person.id === me);
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);
  const open = (id: number) => router.push({ pathname: "/profile/[id]", params: { id: String(id) } });

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Leaderboards</Text>
      </View>

      {choices && want ? (
        <>
          <ChipRow label="Board" items={layouts} value={want.layout} onPick={pickLayout} />
          <ChipRow label="Size" items={sizes} value={want.size} onPick={pickSize} />
          {periods.length > 1 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Segmented options={periods.map((p) => ({ value: p, label: p }))} value={want.period ?? periods[0]} onChange={pickPeriod} />
            </View>
          )}
        </>
      ) : <Text v="secondary" style={{ padding: 16 }}>{choices ? "No leaderboards available." : "Loading"}</Text>}

      <JumpList
        data={rest}
        keyExtractor={(s) => `${s.rank}:${s.person.id}`}
        onEndReached={() => { if (current && !done && !loading && rows.length) void load(current.id, false, rows.length); }}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          rows.length > 0 ? (
            <View style={{ gap: 12, paddingBottom: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8 }}>
                {[top[1], top[0], top[2]].map((s, i) => s ? <Podium key={s.person.id} score={s} first={i === 1} you={s.person.id === me} onPress={() => open(s.person.id)} /> : <View key={i} style={{ flex: 1 }} />)}
              </View>
              {mine && (
                <View accessible accessibilityLabel={`You are ranked ${mine.rank}`} style={{ marginHorizontal: 16, padding: 12, borderRadius: r.card, backgroundColor: c.raised, borderWidth: 1.5, borderColor: c.text, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <Text v="numeral" style={{ fontSize: 26 }}>#{mine.rank}</Text>
                  <Text v="bodyStrong" style={{ flex: 1 }}>You</Text>
                  <Text v="bodyStrong">{mine.score.toLocaleString("en-US")}</Text>
                </View>
              )}
            </View>
          ) : <View />
        }
        ListEmptyComponent={rows.length === 0 ? <Text v="secondary" style={{ padding: 20 }}>{loading ? "Loading" : failed ? "Couldn't load this leaderboard. Check your connection." : current ? "No scores yet." : ""}</Text> : <View />}
        ListFooterComponent={!done && rows.length > 0 ? <View style={{ padding: 16 }}><Button variant="secondary" label={loading ? "Loading" : "Show more"} disabled={loading} onPress={() => current && void load(current.id, false, rows.length)} /></View> : <View />}
        renderItem={({ item }) => {
          const you = item.person.id === me;
          return (
            <Pressable accessibilityRole="button" onPress={() => open(item.person.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 60, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: you ? c.card : "transparent" }}>
              <Text v="numeral" style={{ width: 44, fontSize: 22, color: c.muted }}>{item.rank}</Text>
              <Avatar path={item.person.avatar} name={item.person.username} size={36} />
              <View style={{ flex: 1 }}>
                <Text v="bodyStrong" numberOfLines={1}>{you ? "You" : item.person.username}</Text>
                <Text v="caption">{item.ascents.toLocaleString("en-US")} sends</Text>
              </View>
              <Text v="bodyStrong">{item.score.toLocaleString("en-US")}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function ChipRow({ label, items, value, onPick }: { label: string; items: string[]; value?: string; onPick: (v: string) => void }) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const xs = useRef<Record<string, number>>({});
  // Keep the selected chip in view when the row is longer than the screen.
  const reveal = (v?: string) => { if (v != null && xs.current[v] != null) scroller.current?.scrollTo({ x: Math.max(0, xs.current[v] - 16), animated: false }); };
  useEffect(() => reveal(value), [value, items.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (items.length < 2) return null;
  return (
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, height: 52 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: "center" }} accessibilityLabel={label}>
      {items.map((it) => (
        <View key={it} onLayout={(e) => { xs.current[it] = e.nativeEvent.layout.x; if (it === value) reveal(value); }}>
          <Chip label={it} selected={it === value} onPress={() => onPick(it)} />
        </View>
      ))}
    </ScrollView>
  );
}

function Podium({ score, first, you, onPress }: { score: Score; first: boolean; you: boolean; onPress: () => void }) {
  const medal = score.rank === 1 ? c.starOn : score.rank === 2 ? "#C5CBC9" : "#C98A5B";
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Rank ${score.rank}, ${score.person.username}`} onPress={onPress}
      style={{ flex: 1, alignItems: "center", gap: 4, paddingVertical: 12, paddingHorizontal: 6, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1.5, borderColor: you ? c.text : c.line, minHeight: first ? 168 : 140, justifyContent: "flex-end" }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: medal, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#101416", fontFamily: "BarlowCondensed_700Bold", fontSize: 16 }}>{score.rank}</Text>
      </View>
      <Avatar path={score.person.avatar} name={score.person.username} size={first ? 64 : 48} />
      <Text v="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>{you ? "You" : score.person.username}</Text>
      <Text v="caption">{score.score.toLocaleString("en-US")}</Text>
    </Pressable>
  );
}
