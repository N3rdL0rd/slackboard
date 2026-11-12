import { useUserId, useUsername } from "../state/useActive";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { JumpList } from "./JumpToTop";
import { circuitDisplayColor, CIRCUIT_COLORS } from "../core/circuits";
import { circuitFilterCount, DEFAULT_CIRCUIT_FILTER, filterCircuits, type CircuitFilter, type CircuitSort, type ExploreCircuit } from "../core/social";
import { useData } from "../state/data";
import { useExplore } from "../state/explore";
import { useStore } from "../state/store";
import { Icon } from "./Icon";
import { Button, Chip, IconButton, Segmented, SectionLabel, Sheet } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

/** `/explore` returns at most this many results and ignores paging parameters, so the only way past them is a search. */
const SERVER_CAP = 500;

const SORTS: { value: CircuitSort; label: string }[] = [
  { value: "featured", label: "Featured" }, { value: "newest", label: "Newest" }, { value: "most", label: "Most climbs" }, { value: "name", label: "A to Z" },
];
const SIZES = [{ value: 0, label: "Any size" }, { value: 5, label: "5+ climbs" }, { value: 10, label: "10+" }, { value: 20, label: "20+" }];

/** Circuits to browse straight away, narrowed by the search box and the filters. */
export function CircuitBrowser({ query }: { query: string }) {
  const router = useRouter();
  const me = useUserId();
  const username = useUsername();
  const mine = useData((d) => d.circuits);
  const [scope, setScope] = useState<"everyone" | "mine">("everyone");
  const [filter, setFilter] = useState<CircuitFilter>(DEFAULT_CIRCUIT_FILTER);
  const [sheet, setSheet] = useState(false);
  const { items, loading, failed, reload } = useExplore("circuit", scope === "everyone" ? query : "");

  const mineAsRows: ExploreCircuit[] = useMemo(() => mine.map((m) => ({
    kind: "circuit", uuid: m.uuid, name: m.name, color: m.color, count: m.climbs.length, createdAt: "", owner: me != null ? { id: me, username, name: null, avatar: null, verified: false } : null,
  })), [mine, me, username]);

  const base: ExploreCircuit[] = scope === "mine" ? mineAsRows : (items ?? []).filter((x): x is ExploreCircuit => x.kind === "circuit");
  // Search narrows the server's list; for your own circuits (already on the device) it filters here.
  const shown = useMemo(() => filterCircuits(base, filter, scope === "mine" ? query : ""), [base, filter, query, scope]);
  const count = circuitFilterCount(filter);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Segmented options={[{ value: "everyone", label: "Everyone" }, { value: "mine", label: `Mine (${mine.length})` }]} value={scope} onChange={setScope} />
        </View>
        <View>
          <IconButton icon="filter" label={`Filter and sort circuits, ${count} active`} onPress={() => setSheet(true)} />
          {count > 0 && <View style={{ position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.text, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.btnText, fontSize: 11, fontFamily: "Barlow_600SemiBold" }}>{count}</Text></View>}
        </View>
      </View>
      {(count > 0 || filter.sort !== "featured") && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 8 }}>
          {filter.colors.length > 0 && <Chip label={filter.colors.length === 1 ? "1 colour" : `${filter.colors.length} colours`} onRemove={() => setFilter({ ...filter, colors: [] })} />}
          {filter.minClimbs > 0 && <Chip label={`${filter.minClimbs}+ climbs`} onRemove={() => setFilter({ ...filter, minClimbs: 0 })} />}
          <Chip label={`Sort: ${SORTS.find((s) => s.value === filter.sort)!.label}`} onPress={() => setSheet(true)} />
          <Chip label="Reset" onPress={() => setFilter(DEFAULT_CIRCUIT_FILTER)} />
        </View>
      )}
      <Text v="caption" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>{loading && !items ? "Loading" : `${shown.length} ${shown.length === 1 ? "circuit" : "circuits"}`}</Text>

      <JumpList
        data={shown}
        keyExtractor={(x) => x.uuid}
        refreshControl={scope === "everyone" ? <RefreshControl refreshing={loading && !!items} onRefresh={() => void reload()} tintColor={c.text} /> : undefined}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
        ListFooterComponent={scope === "everyone" && (items ?? []).length >= SERVER_CAP ? <Text v="caption" style={{ paddingVertical: 12, textAlign: "center" }}>The server shows at most {SERVER_CAP} at a time. Search to find others.</Text> : <View />}
        ListEmptyComponent={
          <View style={{ padding: 24, gap: 10, alignItems: "center" }}>
            <Text v="secondary" style={{ textAlign: "center" }}>
              {failed ? "Couldn't load circuits. Check your connection." : loading ? "Loading" : scope === "mine" ? (mine.length ? "None of your circuits match." : "You haven't made a circuit yet.") : "No circuits match."}
            </Text>
            {failed && <Button variant="secondary" label="Try again" onPress={() => void reload()} />}
            {!failed && (count > 0 || query.trim()) && <Chip label="Reset filters" onPress={() => setFilter(DEFAULT_CIRCUIT_FILTER)} />}
            {!failed && scope === "mine" && mine.length === 0 && <Button label="Create a circuit" onPress={() => router.push("/circuits")} />}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/circuit/[uuid]", params: { uuid: item.uuid } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: circuitDisplayColor(item.color) }} />
            <View style={{ flex: 1 }}>
              <Text v="climbName" numberOfLines={1}>{item.name}</Text>
              <Text v="secondary" numberOfLines={1}>{item.count} {item.count === 1 ? "climb" : "climbs"}{item.owner ? ` · ${item.owner.id === me ? "You" : item.owner.username}` : ""}</Text>
            </View>
            <Icon name="chevR" size={20} color={c.muted} />
          </Pressable>
        )}
      />

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Filter circuits" onReset={() => setFilter(DEFAULT_CIRCUIT_FILTER)} footer={<Button label={`Show ${shown.length} circuits`} onPress={() => setSheet(false)} />}>
        <SectionLabel>Sort</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SORTS.map((s) => <Chip key={s.value} label={s.label} selected={filter.sort === s.value} onPress={() => setFilter({ ...filter, sort: s.value })} />)}
        </View>
        <SectionLabel>Colour</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {CIRCUIT_COLORS.map((h) => {
            const on = filter.colors.includes(h);
            return (
              <Pressable key={h} accessibilityRole="checkbox" accessibilityLabel={`Colour ${h}`} accessibilityState={{ checked: on }}
                onPress={() => setFilter({ ...filter, colors: on ? filter.colors.filter((x) => x !== h) : [...filter.colors, h] })}
                style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: circuitDisplayColor(h), alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: on ? c.text : "transparent" }}>
                {on && <Icon name="check" size={20} color="#101416" stroke={3} />}
              </Pressable>
            );
          })}
        </View>
        <SectionLabel>Size</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {SIZES.map((s) => <Chip key={s.value} label={s.label} selected={filter.minClimbs === s.value} onPress={() => setFilter({ ...filter, minClimbs: s.value })} />)}
        </View>
      </Sheet>
    </View>
  );
}
