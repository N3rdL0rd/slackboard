import { useUserId } from "../../state/useActive";
import { getProvider } from "../../providers";
import { useActiveProviderId } from "../../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Share, View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../../core/api";
import { circuitDisplayColor, moveItem } from "../../core/circuits";
import { difficultyOf } from "../../core/filters";
import { parsePerson, type Person } from "../../core/feed";
import * as repo from "../../core/repo";
import type { Climb } from "../../core/types";
import { isRoute } from "../../core/types";
import { grades } from "../../data/grades";
import { deleteCircuit, setCircuitClimbs, updateCircuit } from "../../state/circuits";
import { useData } from "../../state/data";
import { sessionFor } from "../../state/session";
import { useAngleOf, useClimbsForRefs, useStatsForRefs } from "../../state/layouts";
import { makeRef, refKey, type ClimbRef } from "../../core/provider";
import { setSequence } from "../../state/sequence";
import { useBoard, useStore } from "../../state/store";
import { Avatar } from "../../ui/Avatar";
import { ClimbThumb } from "../../ui/ClimbThumb";
import { CircuitEditSheet } from "../../ui/CircuitEditSheet";
import { Icon } from "../../ui/Icon";
import { Button, GradeChip, IconButton, Sheet } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

interface Remote { uuid: string; name: string; description: string; color: string; isPublic: boolean; owner: Person | null; climbs: string[] }

/** One circuit: its climbs in order. The owner can edit details, reorder, remove climbs and delete it; anyone can share it. */
export default function CircuitScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useUserId();
  const activeId = useActiveProviderId();
  const display = useStore((s) => s.settings.gradeDisplay);
  // A shared link carries the server's uuid, which may differ from the local id of a circuit published from here.
  const mine = useData((d) => d.circuits.find((x) => x.uuid === uuid || x.projections.some((p) => p.remoteUuid === uuid)));
  const angleOf = useAngleOf();
  const [remote, setRemote] = useState<Remote | null | undefined>(undefined);
  const [reorder, setReorder] = useState(false);
  const [order, setOrder] = useState<ClimbRef[]>([]);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Someone else's circuit is read from the server; your own comes from the local database.
  useEffect(() => {
    if (mine) return;
    const s = sessionFor();
    if (!s) return;
    void get(s, `/circuits/${uuid}`).then((j) => {
      const ci = (j as { circuit?: Record<string, any> } | null)?.circuit;
      setRemote(ci ? { uuid: ci.uuid, name: ci.name, description: ci.description ?? "", color: ci.color ?? "808080", isPublic: !!ci.is_public, owner: parsePerson(ci.user), climbs: ((ci.climbs as { uuid: string }[]) ?? []).map((x) => String(x.uuid).toUpperCase()) } : null);
    });
  }, [uuid, mine, userId]);

  const circuit: Remote | null | undefined = mine ? { ...mine, owner: null } : remote;
  // A circuit may hold climbs from several providers; someone else's circuit is on the open board's provider.
  const items: ClimbRef[] = useMemo(() => (mine ? mine.items : (circuit?.climbs ?? []).map((id) => makeRef(activeId, id))), [mine, circuit, activeId]);
  const shown = reorder ? order : items;
  const byRef = useClimbsForRefs(shown);
  const stats = useStatsForRefs(shown, angleOf);
  const owned = !!mine;

  const shareProvider = getProvider(mine ? mine.projections[0]?.provider : activeId);
  const shareUuid = mine ? mine.projections[0]?.remoteUuid : circuit?.uuid;
  const share = () => circuit && shareUuid && Share.share({ message: `${circuit.name}: ${shareProvider.links.circuit(shareUuid)}` }).catch(() => {});
  const startReorder = () => { setOrder(items); setReorder(true); setMenu(false); };
  const saveOrder = async () => {
    if (!circuit) return;
    setBusy(true); setError("");
    const out = await setCircuitClimbs(circuit.uuid, order);
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    setReorder(false);
  };
  const remove = async () => {
    if (!circuit) return;
    setBusy(true);
    const out = await deleteCircuit(circuit.uuid);
    setBusy(false);
    setConfirm(false);
    if (!out.ok) { setError(out.message); return; }
    router.back();
  };

  if (circuit === undefined) return <Shell onBack={() => router.back()} title="Circuit"><Text v="secondary" style={{ padding: 20 }}>Loading</Text></Shell>;
  if (circuit === null) return <Shell onBack={() => router.back()} title="Circuit"><Text v="secondary" style={{ padding: 20 }}>This circuit isn't available. It may be private or removed.</Text></Shell>;

  return (
    <Shell onBack={() => (reorder ? setReorder(false) : router.back())} title={circuit.name}
      right={reorder ? <Button label={busy ? "Saving" : "Save"} disabled={busy} style={{ height: 44, paddingHorizontal: 16 }} onPress={() => void saveOrder()} /> : <IconButton icon="more" label="Circuit options" onPress={() => setMenu(true)} />}>
      <JumpList
        data={shown}
        keyExtractor={refKey}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          <View style={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: circuitDisplayColor(circuit.color) }} />
              <Text v="secondary">{mine && mine.projections.length === 0 ? "On this phone" : circuit.isPublic ? "Public" : "Private"} · {items.length} {items.length === 1 ? "climb" : "climbs"}{new Set(items.map((i) => i.provider)).size > 1 ? " · several boards" : ""}</Text>
            </View>
            {circuit.description ? <Text v="body">{circuit.description}</Text> : null}
            {circuit.owner && <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Avatar path={circuit.owner.avatar} name={circuit.owner.username} size={28} /><Text v="secondary">By {circuit.owner.name ?? circuit.owner.username}</Text></View>}
            {reorder && <Text v="caption">Use the arrows to move climbs, then tap Save.</Text>}
            {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={<Text v="secondary" style={{ padding: 16 }}>No climbs yet. Open a climb and tap Circuits to add it here.</Text>}
        renderItem={({ item: ref, index }) => {
          const climb = byRef.get(refKey(ref));
          const d = difficultyOf(stats.get(refKey(ref)));
          const label = d != null && climb ? grades.label(d, display, isRoute(climb)) : null;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 72, gap: 10 }}>
              {climb ? <ClimbThumb climb={climb} provider={ref.provider} /> : <View style={{ width: 56, height: 56 }} />}
              <Pressable accessibilityRole="button" disabled={reorder || !climb} onPress={() => { setSequence(shown.filter((x) => byRef.has(refKey(x))), circuit.name); router.push({ pathname: "/climb/[uuid]", params: { uuid: ref.id, provider: ref.provider } }); }} style={{ flex: 1, paddingVertical: 10 }}>
                <Text v="climbName" numberOfLines={1}>{climb?.name ?? "Not on this device"}</Text>
                {climb && <Text v="secondary" numberOfLines={1}>{climb.setter}</Text>}
              </Pressable>
              {label && d != null && !reorder ? <GradeChip band={grades.band(d)} label={label.primary} /> : null}
              {reorder && (
                <>
                  <IconButton icon="chevD" label="Move down" onPress={() => setOrder((o) => moveItem(o, index, 1))} />
                  <View style={{ transform: [{ rotate: "180deg" }] }}><IconButton icon="chevD" label="Move up" onPress={() => setOrder((o) => moveItem(o, index, -1))} /></View>
                  <IconButton icon="close" label="Remove from circuit" onPress={() => setOrder((o) => o.filter((x) => refKey(x) !== refKey(ref)))} />
                </>
              )}
            </View>
          );
        }}
      />
      <Sheet visible={menu} onClose={() => setMenu(false)} title="Circuit">
        <View style={{ gap: 8 }}>
          {shareUuid ? <MenuItem label="Share link" onPress={() => { setMenu(false); void share(); }} /> : <Text v="caption" style={{ paddingHorizontal: 4 }}>Only on this phone. Turn on "Keep on {shareProvider.name}" in Edit details to share it.</Text>}
          {owned && <MenuItem label="Edit details" onPress={() => { setMenu(false); setEditing(true); }} />}
          {owned && <MenuItem label="Reorder or remove climbs" onPress={startReorder} />}
          {owned && <MenuItem label="Delete circuit" danger onPress={() => { setMenu(false); setConfirm(true); }} />}
        </View>
      </Sheet>
      {mine && <CircuitEditSheet provider={mine.projections[0]?.provider ?? activeId} visible={editing} onClose={() => setEditing(false)} title="Edit circuit" saveLabel="Save changes"
        initial={{ name: mine.name, description: mine.description, color: mine.color, isPublic: mine.isPublic, publish: mine.projections.length > 0 }}
        onSave={async (i) => { const out = await updateCircuit(mine.uuid, i, mine.projections[0]?.provider ?? activeId); return out.ok ? null : out.message; }} />}
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Delete this circuit?"
        footer={<View style={{ gap: 8 }}><Button variant="danger" label={busy ? "Deleting" : "Delete circuit"} disabled={busy} onPress={() => void remove()} /><Button variant="secondary" label="Keep it" onPress={() => setConfirm(false)} /></View>}>
        <Text v="secondary">"{circuit.name}" is deleted. The climbs in it are not affected.</Text>
      </Sheet>
    </Shell>
  );
}

function Shell({ onBack, title, right, children }: { onBack: () => void; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4, paddingRight: 12 }}>
        <IconButton icon="back" label="Back" onPress={onBack} />
        <Text v="sheetTitle" style={{ flex: 1 }} numberOfLines={1}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function MenuItem({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 16, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text v="bodyStrong" style={{ color: danger ? c.danger : c.text }}>{label}</Text>
    </Pressable>
  );
}
