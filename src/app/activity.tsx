import { useUserId } from "../state/useActive";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { JumpList } from "../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../core/api";
import { nextCursor, parseFeed, relativeTime, type FeedEvent } from "../core/feed";
import { setFollow } from "../state/social";
import { sessionFor } from "../state/session";
import { useStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Button, Chip, IconButton, Stars } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

type Filter = "all" | "sends" | "climbs" | "likes" | "follows";
const FILTERS: { value: Filter; label: string; flags: string }[] = [
  { value: "all", label: "All", flags: "users=1&climbs=1&ascents=1&likes=1&follows=1" },
  { value: "sends", label: "Sends", flags: "ascents=1" },
  { value: "climbs", label: "New climbs", flags: "climbs=1" },
  { value: "likes", label: "Likes", flags: "likes=1" },
  { value: "follows", label: "Follows", flags: "follows=1" },
];

/** What's happened around you: sends, new climbs, likes and follows, with follow requests you can answer here. */
export default function Activity() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const seen = useStore((s) => s.activitySeen);
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [seenAtOpen] = useState(seen);
  const session = sessionFor();

  const load = useCallback(async (reset: boolean, current: FeedEvent[]) => {
    if (!session) return;
    setLoading(true); setFailed(false);
    const before = reset ? null : nextCursor(current);
    const flags = FILTERS.find((f) => f.value === filter)!.flags;
    const j = await get(session, `/notifications?${flags}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
    if (!j) setFailed(true);
    const page = parseFeed(j);
    setDone(page.length === 0);
    const all = reset ? page : [...current, ...page];
    setEvents(all);
    setLoading(false);
    if (reset && all[0]) useStore.getState().markActivitySeen(all[0].createdAt);
  }, [filter, session?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(true, []); }, [load]);

  const answer = async (e: Extract<FeedEvent, { kind: "follow" }>, state: "accepted" | "declined") => {
    setOutcome((o) => ({ ...o, [e.id]: "Saving" }));
    const out = await setFollow(e.followee.id, e.follower.id, state);
    setOutcome((o) => ({ ...o, [e.id]: out.ok ? (state === "accepted" ? "Accepted" : "Declined") : out.message }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Activity</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
        {FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />)}
      </View>
      <JumpList
        data={events}
        keyExtractor={(e) => `${e.kind}:${e.id}`}
        refreshControl={<RefreshControl refreshing={loading && events.length === 0} onRefresh={() => void load(true, [])} tintColor={c.text} />}
        onEndReached={() => { if (!done && !loading && events.length) void load(false, events); }}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={<Text v="secondary" style={{ padding: 20 }}>{loading ? "Loading" : failed ? "Couldn't load activity. Check your connection and pull to retry." : "Nothing here yet. You'll see sends, new climbs and follows from the people around you."}</Text>}
        renderItem={({ item }) => <Row e={item} unread={!!seenAtOpen && item.createdAt > seenAtOpen} me={me} outcome={outcome[item.id]} onAnswer={answer} />}
      />
    </View>
  );
}

function Row({ e, unread, me, outcome, onAnswer }: { e: FeedEvent; unread: boolean; me: number | null; outcome?: string; onAnswer: (e: Extract<FeedEvent, { kind: "follow" }>, s: "accepted" | "declined") => void }) {
  const router = useRouter();
  const who = e.kind === "follow" ? e.follower : e.kind === "climb" ? e.user : e.user;
  const name = who?.name || who?.username || "Someone";
  const openClimb = (uuid: string) => router.push({ pathname: "/climb/[uuid]", params: { uuid } });
  let text = "";
  let detail: React.ReactNode = null;
  let onPress: (() => void) | undefined;
  switch (e.kind) {
    case "ascent": text = `sent ${e.climb.name}`; onPress = () => openClimb(e.climb.uuid);
      detail = <View style={{ gap: 2 }}><Text v="secondary">{e.gradeName.split("/")[1] ?? e.gradeName} · {e.angle}°{e.isMirror ? " · Mirrored" : ""}</Text><Stars value={e.quality} />{e.comment ? <Text v="body">{e.comment}</Text> : null}</View>; break;
    case "bid": text = `tried ${e.climb.name}`; onPress = () => openClimb(e.climb.uuid); detail = <Text v="secondary">{e.bidCount} {e.bidCount === 1 ? "attempt" : "attempts"} · {e.angle}°</Text>; break;
    case "like": text = `liked ${e.climb.name}`; onPress = () => openClimb(e.climb.uuid); break;
    case "climb": text = `set ${e.climb.name}`; onPress = () => openClimb(e.climb.uuid); break;
    case "user": text = "joined the community"; break;
    case "follow": {
      const toMe = e.followee.id === me;
      text = e.state === "pending" ? (toMe ? "wants to follow you" : `asked to follow ${e.followee.name || e.followee.username}`) : e.state === "accepted" ? (toMe ? "follows you" : `follows ${e.followee.name || e.followee.username}`) : "";
      if (!text) text = "updated a follow";
      detail = e.state === "pending" && toMe ? (
        outcome ? <Text v="bodyStrong">{outcome}</Text> : (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Button label="Accept" style={{ height: 44, paddingHorizontal: 20 }} onPress={() => onAnswer(e, "accepted")} />
            <Button variant="secondary" label="Decline" style={{ height: 44, paddingHorizontal: 20 }} onPress={() => onAnswer(e, "declined")} />
          </View>
        )
      ) : null;
      break;
    }
  }
  return (
    <Pressable accessibilityRole={onPress ? "button" : "text"} onPress={onPress} style={{ flexDirection: "row", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: unread ? c.card : "transparent" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}'s profile`} onPress={() => who && router.push({ pathname: "/profile/[id]", params: { id: String(who.id) } })}>
        <Avatar path={who?.avatar} name={name} />
      </Pressable>
      <View style={{ flex: 1, gap: 3 }}>
        <Text v="body"><Text v="bodyStrong">{name}</Text> {text}</Text>
        <Text v="caption">{relativeTime(e.createdAt)}</Text>
        {detail}
      </View>
      {unread && <View accessibilityLabel="Unread" style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.starOn, marginTop: 6 }} />}
    </Pressable>
  );
}
void r;
