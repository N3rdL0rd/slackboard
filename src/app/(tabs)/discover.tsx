import { useUserId } from "../../state/useActive";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../../core/api";
import { circuitDisplayColor } from "../../core/circuits";
import { difficultyOf } from "../../core/filters";
import { parseFeed } from "../../core/feed";
import { parseExplore, type ExploreResult } from "../../core/social";
import { isRoute } from "../../core/types";
import { grades } from "../../data/grades";
import { useData } from "../../state/data";
import { useExplore } from "../../state/explore";
import { setSequence } from "../../state/sequence";
import { getProvider } from "../../providers";
import { sessionFor } from "../../state/session";
import { useActiveProviderId } from "../../state/useActive";
import { useStore } from "../../state/store";
import { Avatar } from "../../ui/Avatar";
import { CircuitBrowser } from "../../ui/CircuitBrowser";
import { Icon } from "../../ui/Icon";
import { Chip, GradeChip, IconButton, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

type Scope = "all" | "climbs" | "climbers" | "circuits";
const PLACEHOLDER: Record<Scope, string> = { all: "Climbs, climbers, circuits", climbs: "Search climbs on your board", climbers: "Search climbers", circuits: "Search circuits" };

/** Search climbs, climbers and circuits. Circuits and climbers open as browsable lists; the bell opens Activity. */
export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const seen = useStore((s) => s.activitySeen);
  const display = useStore((s) => s.settings.gradeDisplay);
  const climbs = useData((d) => d.boardData?.climbs);
  const stats = useData((d) => d.stats);
  const [q, setQ] = useState("");
  const caps = getProvider(useActiveProviderId()).capabilities;
  const [wanted, setScope] = useState<Scope>("all");
  // A local provider has no climbers, circuits or leaderboards to browse: only its own climbs can be searched.
  const scope: Scope = caps.explore ? wanted : "climbs";
  const [remote, setRemote] = useState<ExploreResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [unread, setUnread] = useState(0);
  const session = sessionFor();
  const dq = q.trim();

  // "All" searches the server for climbers and circuits (debounced); climbs are searched on the device.
  useEffect(() => {
    if (scope !== "all" || dq.length < 2 || !session) { setRemote(null); return; }
    setSearching(true);
    const t = setTimeout(() => void get(session, `/explore?q=${encodeURIComponent(dq)}`).then((j) => { setRemote(parseExplore(j).filter((x) => x.kind !== "climb")); setSearching(false); }), 600);
    return () => clearTimeout(t);
  }, [dq, scope, session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const localHits = useMemo(() => {
    if (dq.length < 2 || !climbs || (scope !== "all" && scope !== "climbs")) return [];
    const lq = dq.toLowerCase();
    return climbs.filter((x) => x.name.toLowerCase().includes(lq)).slice(0, scope === "all" ? 5 : 40);
  }, [dq, climbs, scope]);

  useEffect(() => {
    if (!session) return;
    void get(session, "/notifications?users=1&climbs=1&ascents=1&likes=1&follows=1").then((j) => setUnread(parseFeed(j).filter((e) => e.createdAt > seen).length));
  }, [session?.token, seen]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchingNow = dq.length >= 2;
  const listScope = scope === "circuits" || scope === "climbers";

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>Discover</Text>
        {caps.follow ? <View>
          <IconButton icon="bell" label={unread ? `Activity, ${unread} new` : "Activity"} onPress={() => router.push("/activity")} />
          {unread > 0 && <View style={{ position: "absolute", top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.text, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
            <Text style={{ color: c.btnText, fontSize: 11, fontFamily: "Barlow_600SemiBold" }}>{unread > 9 ? "9+" : unread}</Text></View>}
        </View> : null}
      </View>
      <View style={{ margin: 16, marginBottom: 8, height: 48, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: "row", alignItems: "center", paddingLeft: 12, gap: 8 }}>
        <Icon name="search" size={20} color={c.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder={PLACEHOLDER[scope]} placeholderTextColor={c.placeholder} accessibilityLabel="Search" autoCorrect={false}
          style={{ flex: 1, color: c.text, fontSize: 16, fontFamily: "Barlow_400Regular", height: 48 }} />
        {q ? <IconButton icon="close" label="Clear search" onPress={() => setQ("")} /> : null}
      </View>
      {caps.explore ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, height: 46 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: "center" }}>
        {(["all", "climbs", "climbers", "circuits"] as Scope[]).map((s) => <Chip key={s} label={s[0].toUpperCase() + s.slice(1)} selected={scope === s} onPress={() => setScope(s)} />)}
      </ScrollView> : null}

      {scope === "circuits" ? <CircuitBrowser query={q} /> : scope === "climbers" ? <ClimberList query={q} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 6 }} keyboardShouldPersistTaps="handled">
          {searchingNow ? (
            <>
              {localHits.length > 0 && <Text v="section">Climbs</Text>}
              {localHits.map((cl) => {
                const d = difficultyOf(stats?.get(cl.uuid));
                const label = d != null ? grades.label(d, display, isRoute(cl)) : null;
                return (
                  <Row key={cl.uuid} onPress={() => { setSequence(localHits.map((x) => x.uuid), "Search results"); router.push({ pathname: "/climb/[uuid]", params: { uuid: cl.uuid } }); }} title={cl.name} subtitle={`Set by ${cl.setter}`}
                    right={label && d != null ? <GradeChip band={grades.band(d)} label={label.primary} /> : undefined} />
                );
              })}
              {(remote ?? []).some((x) => x.kind === "user") && <Text v="section" style={{ marginTop: 12 }}>Climbers</Text>}
              {(remote ?? []).map((x) => x.kind === "user" ? <PersonRow key={`u${x.person.id}`} person={x.person} /> : null)}
              {(remote ?? []).some((x) => x.kind === "circuit") && <Text v="section" style={{ marginTop: 12 }}>Circuits</Text>}
              {(remote ?? []).map((x) => x.kind === "circuit" ? (
                <Row key={`c${x.uuid}`} onPress={() => router.push({ pathname: "/circuit/[uuid]", params: { uuid: x.uuid } })} title={x.name} subtitle={`${x.count} ${x.count === 1 ? "climb" : "climbs"}${x.owner ? ` · ${x.owner.username}` : ""}`}
                  left={<View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: circuitDisplayColor(x.color), marginHorizontal: 13 }} />} />
              ) : null)}
              {searching && <Text v="secondary">Searching</Text>}
              {!searching && localHits.length === 0 && (remote ?? []).length === 0 && <Text v="secondary">Nothing found for "{dq}".</Text>}
            </>
          ) : scope === "climbs" ? (
            <Text v="secondary">Type a climb's name to find it on {" "}your board. To browse and filter every climb, use the Climb tab.</Text>
          ) : (
            <View style={{ gap: 10 }}>
              <Hub title="Suggested" note="Climbs picked for you from your own sends, and what to try on the gym wall." onPress={() => router.push("/suggestions")} />
              <Hub title="Circuits" note="Browse lists of climbs made by other climbers, and your own." onPress={() => setScope("circuits")} />
              <Hub title="Climbers" note="Find people to follow." onPress={() => setScope("climbers")} />
              <Hub title="Leaderboards" note="See who is sending the most on your board." onPress={() => router.push("/leaderboards")} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

/** Climbers to browse straight away, narrowed by the search box. */
function ClimberList({ query }: { query: string }) {
  const { items, loading, failed, reload } = useExplore("user", query);
  const people = (items ?? []).flatMap((x) => (x.kind === "user" ? [x.person] : []));
  return (
    <JumpList
      data={people}
      keyExtractor={(p) => String(p.id)}
      onRefresh={() => void reload()}
      refreshing={loading && !!items}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      ListHeaderComponent={<Text v="caption" style={{ paddingVertical: 8 }}>{loading && !items ? "Loading" : `${people.length} climbers`}</Text>}
      ListFooterComponent={people.length >= 500 ? <Text v="caption" style={{ paddingVertical: 12, textAlign: "center" }}>The server shows at most 500 at a time. Search to find others.</Text> : <View />}
      ListEmptyComponent={<Text v="secondary" style={{ paddingVertical: 16 }}>{failed ? "Couldn't load climbers. Check your connection." : loading ? "Loading" : "No climbers match."}</Text>}
      renderItem={({ item }) => <PersonRow person={item} />}
    />
  );
}

function PersonRow({ person }: { person: { id: number; username: string; name: string | null; avatar: string | null } }) {
  const router = useRouter();
  return <Row onPress={() => router.push({ pathname: "/profile/[id]", params: { id: String(person.id) } })} title={person.name || person.username} subtitle={`@${person.username}`} left={<Avatar path={person.avatar} name={person.username} />} />;
}

function Hub({ title, note, onPress }: { title: string; note: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Text v="climbName">{title}</Text>
        <Text v="secondary">{note}</Text>
      </View>
      <Icon name="chevR" size={20} color={c.muted} />
    </Tap>
  );
}

function Row({ title, subtitle, onPress, left, right }: { title: string; subtitle?: string; onPress: () => void; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider }}>
      {left}
      <View style={{ flex: 1 }}>
        <Text v="climbName" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text v="secondary" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </Tap>
  );
}
