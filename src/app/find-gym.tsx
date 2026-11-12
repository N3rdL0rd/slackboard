import { useProviderContext, useUserId } from "../state/useActive";
import * as Location from "expo-location";
import { withTimeout } from "../core/timeout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../core/api";
import { alreadyHave, boardNameFor, formatDistance, nearest, parseGymProfile, parseGyms, searchGyms, wallInputFor, type Gym, type GymProfile, type GymWall } from "../core/gyms";
import * as repo from "../core/repo";
import { getDb } from "../data/sqlite";
import { createBoard } from "../state/boards";
import { useData } from "../state/data";
import { sessionFor } from "../state/session";
import { useStore } from "../state/store";
import { GymMap, type MapFocus } from "../ui/GymMap";
import { Icon } from "../ui/Icon";
import { Button, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

// Each brand has its own gym list.
const cachedGyms = new Map<string, Gym[]>();

/** Pick your gym on the map; its board is copied onto your account under the gym's name. */
export default function FindGym() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const providerId = useLocalSearchParams<{ provider?: string }>().provider;
  useProviderContext(providerId);
  const userId = useUserId();
  const boards = useData((d) => d.boards);

  const [gyms, setGyms] = useState<Gym[] | null>(cachedGyms.get(providerId ?? "") ?? null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profile, setProfile] = useState<GymProfile | null | undefined>(undefined);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [near, setNear] = useState<{ lat: number; lon: number } | undefined>();
  const [locating, setLocating] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");

  const session = sessionFor();

  useEffect(() => {
    if (gyms || !session) return;
    void get(session, "/pins?gyms=1").then((json) => {
      const list = json ? parseGyms(json) : [];
      if (!list.length) { setLoadError(true); return; }
      cachedGyms.set(providerId ?? "", list);
      setGyms(list);
    });
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask for location when the screen opens: the whole point of it is finding the gyms around you.
  useEffect(() => { void locate(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const closest = useMemo(() => (gyms && near ? nearest(gyms, near, 4) : []), [gyms, near]);
  const miles = useMemo(() => ["US", "GB", "LR", "MM"].includes((Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1] ?? "").toUpperCase()), []);

  const selected = gyms?.find((g) => g.id === selectedId) ?? null;
  const results = useMemo(() => (gyms && query.trim() ? searchGyms(gyms, query, near).slice(0, 6) : []), [gyms, query, near]);

  const select = (g: Gym, recenter: boolean) => {
    setSelectedId(g.id);
    setProfile(undefined);
    setError("");
    if (recenter) setFocus({ lat: g.latitude, lon: g.longitude, zoom: 14, nonce: Date.now() });
    if (!session) return;
    void get(session, `/users/${g.id}`).then((json) => setProfile(json ? parseGymProfile(json) : null));
  };

  /** `manual` = the user tapped the locate button, so say why if it didn't work; on open it fails quietly. */
  const locate = async (manual: boolean) => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { if (manual) setError("Location is off. Search for your gym by name instead."); return; }
      const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 15_000, null);
      if (!pos) throw new Error("no location fix"); // indoors a fix can take forever; the catch below explains and offers search
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setNear(here);
      setFocus({ lat: here.lat, lon: here.lon, zoom: 11, nonce: Date.now() });
    } catch {
      if (manual) setError("Couldn't get your location. Search for your gym by name instead.");
    } finally {
      setLocating(false);
    }
  };

  const add = async (wall: GymWall, name: string) => {
    if (!session) return;
    setAdding(wall.uuid);
    setError("");
    const out = await createBoard(wallInputFor(wall, name), selected ? { gymName: selected.name, lat: selected.latitude, lon: selected.longitude } : undefined);
    if (!out.ok) { setAdding(null); setError(out.message); return; }
    router.dismissAll();
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Find my gym</Text>
        <IconButton icon="locate" label={locating ? "Finding you" : "Gyms near me"} onPress={() => void locate(true)} />
      </View>

      <View style={{ marginHorizontal: 16, marginBottom: 8, height: 48, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: "row", alignItems: "center", paddingLeft: 12, gap: 8 }}>
        <Icon name="search" size={20} color={c.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search gyms by name" placeholderTextColor={c.placeholder} autoCorrect={false}
          accessibilityLabel="Search gyms by name" style={{ flex: 1, color: c.text, fontSize: 16, fontFamily: "Barlow_400Regular", height: 48 }} />
        {query ? <IconButton icon="close" label="Clear search" onPress={() => setQuery("")} /> : null}
      </View>

      <View style={{ flex: 1 }}>
        {gyms ? (
          <GymMap gyms={gyms} selectedId={selectedId} focus={focus} onSelect={(id) => { const g = gyms.find((x) => x.id === id); if (g) select(g, false); }} />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Text v="secondary" style={{ textAlign: "center" }}>{loadError ? "Couldn't load the gym list. Check your connection." : "Loading gyms"}</Text>
          </View>
        )}

        {results.length > 0 && (
          <View style={{ position: "absolute", left: 16, right: 16, top: 0, backgroundColor: c.card, borderRadius: r.card, borderWidth: 1, borderColor: c.lineStrong, overflow: "hidden" }}>
            {results.map((g) => (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => { setQuery(""); select(g, true); }} style={{ minHeight: 52, justifyContent: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider }}>
                <Text v="bodyStrong" numberOfLines={1}>{g.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {selected && (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "62%", backgroundColor: c.ground, borderTopLeftRadius: r.sheetTop, borderTopRightRadius: r.sheetTop,
            borderTopWidth: 1, borderColor: c.lineStrong, paddingBottom: insets.bottom }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
              <View>
                <Text v="sheetTitle">{selected.name}</Text>
                <Text v="secondary">{profile ? [profile.address, profile.city, profile.province].filter(Boolean).join(", ") : profile === undefined ? "Loading" : ""}</Text>
              </View>
              {profile === null && <Text v="secondary" style={{ color: c.danger }}>Couldn't load this gym's boards.</Text>}
              {profile && profile.walls.length === 0 && (
                <>
                  <Text v="secondary">This gym hasn't published a board yet.</Text>
                  <Button variant="secondary" label="Set up by hand" onPress={() => router.replace("/add-board-manual")} />
                </>
              )}
              {profile?.walls.map((w) => (
                <WallOption providerOf={session?.provider ?? providerId ?? "tension"} key={w.uuid} wall={w} gym={profile} owned={alreadyHave(boards, w, session?.provider ?? providerId ?? "tension")} adding={adding === w.uuid} disabled={adding != null} onAdd={(name) => void add(w, name)} />
              ))}
              {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
            </ScrollView>
          </View>
        )}
        {!selected && !query && closest.length > 0 && (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.ground, borderTopLeftRadius: r.sheetTop, borderTopRightRadius: r.sheetTop,
            borderTopWidth: 1, borderColor: c.lineStrong, paddingBottom: insets.bottom + 8 }}>
            <Text v="section" style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>Gyms near you</Text>
            {closest.map(({ gym, km }) => (
              <Pressable key={gym.id} accessibilityRole="button" onPress={() => select(gym, true)}
                style={{ minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, gap: 12 }}>
                <Text v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{gym.name}</Text>
                <Text v="secondary">{formatDistance(km, miles)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {!selected && error ? (
          <View style={{ position: "absolute", left: 16, right: 16, bottom: 16 + insets.bottom, backgroundColor: c.raised, borderRadius: r.input, padding: 14 }}>
            <Text v="secondary" style={{ color: c.text2 }}>{error}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** One board a gym has published: what it is, the name it will get, and the Add button. */
function WallOption({ wall, gym, owned, adding, disabled, onAdd, providerOf }: { providerOf: string; wall: GymWall; gym: GymProfile; owned: boolean; adding: boolean; disabled: boolean; onAdd: (name: string) => void }) {
  const [what, setWhat] = useState<{ line: string; size: string } | null>(null);
  useEffect(() => {
    void getDb(providerOf).then(async (db) => {
      const spec = await repo.boardSpecFor(db, { layout_id: wall.layoutId, product_size_id: wall.productSizeId, product_id: wall.productId, hsm: wall.hsm, setIds: wall.setIds }, providerOf);
      if (!spec) { setWhat({ line: "Board details are still syncing", size: "" }); return; }
      setWhat({ line: `${spec.layoutName} · ${spec.sizeName} · ${spec.setNames.join(" + ")} · ${wall.isAdjustable ? `adjustable, ${wall.angle}°` : `fixed ${wall.angle}°`}`, size: spec.sizeName });
    });
  }, [wall]);
  const name = boardNameFor(gym.name, gym.walls.length, what?.size ?? "");
  return (
    <View style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 10 }}>
      <Text v="bodyStrong">{what?.line ?? "Loading"}</Text>
      {!owned && <Text v="caption">It will be added to your boards as "{name}".</Text>}
      <Button label={owned ? "Already in your boards" : adding ? "Adding" : "Add to my boards"} disabled={owned || disabled || !what?.size} onPress={() => onAdd(name)} />
    </View>
  );
}
