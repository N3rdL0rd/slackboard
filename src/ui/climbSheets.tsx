import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { getProvider } from "../providers";
import { activeChips, DEFAULT_FILTER, sortLabel, type ClimbFilter, type Sort } from "../core/filters";
import { boardColor, orderBoards } from "../core/boards";
import { settersOf } from "../core/repo";
import { grades } from "../data/grades";
import { useData } from "../state/data";
import { useBoard, useFilter, useStore } from "../state/store";
import { useSpaces } from "../state/spaces";
import { c, r } from "../theme";
import { AngleDial } from "./AngleDial";
import { GradeRange } from "./GradeRange";
import { Icon } from "./Icon";
import { Button, Chip, IconButton, LinkButton, Segmented, SectionLabel, Sheet, Tap } from "./parts";
import { Text } from "./Text";

export function AngleSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const board = useBoard();
  const setAngle = useStore((s) => s.setAngle);
  if (!board) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Angle">
      <Text v="secondary" style={{ marginBottom: 14 }}>
        Grades, stars and sends are tracked per angle. Climbs nobody has sent at this angle show as projects.
      </Text>
      <AngleDial angles={board.spec.angles} value={board.angle} onChange={setAngle} />
      <View style={{ marginTop: 16 }}><Button label="Done" onPress={onClose} /></View>
    </Sheet>
  );
}

export function BoardSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const boards = useData((d) => d.boards);
  const current = useBoard();
  const setBoard = useStore((s) => s.setBoard);
  const angles = useStore((s) => s.angles);
  const filters = useStore((s) => s.filters);
  const used = useStore((s) => s.boardUsed);
  const ordered = useMemo(() => orderBoards(boards, used), [boards, used]);
  const spaces = useSpaces((s) => s.spaces);
  const renameSpace = useSpaces((s) => s.renameSpace);
  const moveBoard = useSpaces((s) => s.moveBoard);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [moving, setMoving] = useState<string | null>(null);
  const manuallyMoved = useSpaces((s) => moving ? s.places[moving]?.manualSpaceId : null);
  const rename = spaces.find((s) => s.id === renaming);
  const moved = boards.find((b) => b.id === moving);
  return (
    <>
      <Sheet visible={visible && !renaming && !moving} onClose={onClose} title="Boards">
        <Text v="secondary" style={{ marginBottom: 12 }}>
          Boards are grouped by location. Each remembers its own angle and filters; swipe the board name to flip between boards.
        </Text>
        {!spaces.length && boards.length ? <Text v="secondary" style={{ marginBottom: 12 }}>Grouping boards by location…</Text> : null}
        {spaces.map((space) => (
          <View key={space.id}>
            <View style={{ flexDirection: "row", alignItems: "center", minHeight: 44, marginTop: 8 }}>
              <Tap accessibilityRole="button" accessibilityLabel={`Rename ${space.name}`} onLongPress={() => { setRenaming(space.id); setName(space.name); }}
                onPress={() => { setRenaming(space.id); setName(space.name); }} style={{ flex: 1, paddingVertical: 8 }}>
                <Text v="section" style={{ margin: 0 }}>{space.name}</Text>
                <Text v="caption">{space.boards.length} {space.boards.length === 1 ? "board" : "boards"}</Text>
              </Tap>
              <IconButton icon="edit" label={`Rename ${space.name}`} onPress={() => { setRenaming(space.id); setName(space.name); }} />
            </View>
            {space.boards.map((placed) => {
              const b = boards.find((board) => board.id === placed.id) ?? ordered.find((board) => board.id === placed.id);
              if (!b) return null;
              const on = b.id === current?.id;
              const angle = angles[b.id] ?? b.angle;
              const active = filters[b.id] ? activeChips({ ...DEFAULT_FILTER, ...filters[b.id] }).length : 0;
              return (
                <View key={b.id} style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1.5, marginBottom: 10, borderColor: on ? c.text : c.line }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Tap accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${b.name}, ${angle} degrees${on ? ", current" : ""}`}
                      onPress={() => { setBoard(b.id); onClose(); }} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
                      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: boardColor(b.id) }} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text v="climbName" numberOfLines={1}>{b.name}</Text>
                        <Text v="secondary" numberOfLines={1}>{b.spec.layoutName} · {b.spec.sizeName}</Text>
                        <Text v="caption">{b.isAdjustable ? `Viewing ${angle}°` : `Fixed ${b.angle}°`}{active ? ` · ${active} ${active === 1 ? "filter" : "filters"}` : ""}</Text>
                      </View>
                      {on ? <Text v="caption" style={{ color: c.text }}>Current</Text> : null}
                    </Tap>
                    <IconButton icon="edit" label={`Edit ${b.name}`} onPress={() => { onClose(); router.push({ pathname: "/edit-board", params: { uuid: b.id } }); }} />
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
                    <LinkButton icon="locate" label={placed.manualSpaceId ? "Use automatic Space" : "Move to another Space"} onPress={() => setMoving(b.id)} />
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        {current?.serial ? (
          <Tap accessibilityRole="button" onPress={() => { onClose(); router.push("/recently-lit"); }}
            style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, marginBottom: 10 }}>
            <Text v="bodyStrong">Recently lit on {current.name}</Text>
          </Tap>
        ) : null}
        <Tap accessibilityRole="button" onPress={() => { onClose(); router.push("/add-board"); }}
          style={{ padding: 14, borderRadius: r.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.lineStrong, alignItems: "center" }}>
          <Text v="bodyStrong">Add a board</Text>
        </Tap>
      </Sheet>
      <Sheet visible={!!rename} onClose={() => setRenaming(null)} title="Rename Space">
        <Text v="secondary" style={{ marginBottom: 12 }}>This name stays with the Space as boards join or leave.</Text>
        <TextInput value={name} onChangeText={setName} autoFocus accessibilityLabel="Space name" placeholder="Space name" placeholderTextColor={c.placeholder}
          style={{ color: c.text, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: r.input, paddingHorizontal: 14, minHeight: 48, fontFamily: "Barlow_400Regular", fontSize: 17 }} />
        <View style={{ marginTop: 16 }}><Button label="Save name" disabled={!name.trim()} onPress={() => { if (rename) void renameSpace(rename.id, name); setRenaming(null); }} /></View>
      </Sheet>
      <Sheet visible={!!moved} onClose={() => setMoving(null)} title={`Move ${moved?.name ?? "board"}`}>
        <Text v="secondary" style={{ marginBottom: 12 }}>Your choice overrides location grouping for this board.</Text>
        <View style={{ gap: 8 }}>
          {spaces.filter((space) => !space.boards.some((b) => b.id === moving)).map((space) => (
            <LinkButton key={space.id} icon="locate" label={space.name} onPress={() => { if (moving) void moveBoard(moving, space.id); setMoving(null); }} />
          ))}
          {manuallyMoved ? (
            <Button variant="secondary" label="Group by location instead" onPress={() => { if (moving) void moveBoard(moving, null); setMoving(null); }} />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const SORTS: Sort[] = ["best", "newest", "hardest", "easiest", "most_repeats", "random"];

export function FilterSheet({ visible, onClose, count }: { visible: boolean; onClose: () => void; count: number }) {
  const localProvider = getProvider(useBoard()?.spec.provider).kind === "local";
  const f = useFilter();
  const setFilter = useStore((s) => s.setFilter);
  const climbs = useData((d) => d.boardData?.climbs);
  const circuits = useData((d) => d.circuits);
  const [picker, setPicker] = useState<null | "setter" | "circuits">(null);
  const router = useRouter();
  const blockedCount = useData((d) => d.blocked.size);
  const patch = (p: Partial<ClimbFilter>) => setFilter({ ...f, ...p });
  // Only needed once the sheet is open: a board of 14k climbs would otherwise be scanned on every board load.
  const setters = useMemo(() => (climbs && (visible || picker !== null) ? settersOf(climbs) : []), [climbs, visible, picker]);
  const circuitRules = f.circuitsAny.length + f.circuitsAll.length + f.circuitsNone.length;

  return (
    <>
      <Sheet visible={visible && picker === null} onClose={onClose} title="Filters" onReset={() => setFilter({ ...DEFAULT_FILTER, search: f.search })}
        footer={<Button label={count ? `Show ${count} climbs` : "No climbs match"} disabled={!count} onPress={onClose} />}>
        <SectionLabel>Grade</SectionLabel>
        <GradeRange scale={grades} min={f.gradeMin} max={f.gradeMax} onChange={(gradeMin, gradeMax) => patch({ gradeMin, gradeMax })} />

        <SectionLabel>My logbook</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Sent" selected={f.showSent} onPress={() => patch({ showSent: !f.showSent })} />
          <Chip label="Attempted" selected={f.showTried} onPress={() => patch({ showTried: !f.showTried })} />
          <Chip label="Not tried" selected={f.showUntried} onPress={() => patch({ showUntried: !f.showUntried })} />
        </View>
        <Text v="caption" style={{ marginTop: 8 }}>Chosen chips are shown. Untick Sent to hide everything you have already done.</Text>

        <SectionLabel>Type</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Boulders" selected={f.boulders} onPress={() => patch({ boulders: !f.boulders || !f.routes ? true : false, routes: f.routes })} />
          <Chip label="Routes" selected={f.routes} onPress={() => patch({ routes: !f.routes || !f.boulders ? true : false, boulders: f.boulders })} />
        </View>

        <SectionLabel>Climb</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Classic only" selected={f.classic} onPress={() => patch({ classic: !f.classic })} />
          <Chip label="Liked" selected={f.liked} onPress={() => patch({ liked: !f.liked })} />
          <Chip label="Has beta video" selected={f.beta} onPress={() => patch({ beta: !f.beta })} />
          <Chip label="Tall" selected={f.tall} onPress={() => patch({ tall: !f.tall })} />
          <Chip label="Side" selected={f.side} onPress={() => patch({ side: !f.side })} />
        </View>
        <Text v="caption" style={{ marginTop: 8 }}>Tall: the holes cover most of the board's height. Side: every hole is on one half of the board.</Text>

        <SectionLabel>Also show</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Established" selected={f.established} onPress={() => patch({ established: !f.established })} />
          <Chip label="Open projects" selected={f.projects} onPress={() => patch({ projects: !f.projects })} />
          <Chip label="My drafts" selected={f.drafts} onPress={() => patch({ drafts: !f.drafts })} />
          <Chip label="Blocked" selected={f.blocked} onPress={() => patch({ blocked: !f.blocked })} />
        </View>
        {blockedCount > 0 ? <LinkButton label={`${blockedCount} blocked ${blockedCount === 1 ? "climb" : "climbs"}: review`} onPress={() => { onClose(); router.push("/blocked"); }} style={{ marginTop: 10, alignSelf: "flex-start" }} /> : null}

        <SectionLabel>More</SectionLabel>
        <PickerRow label="Setter" value={f.setter ?? "Anyone"} onPress={() => setPicker("setter")} />
        <PickerRow label="Circuits" value={circuitRules ? (circuitRules === 1 ? "1 rule" : `${circuitRules} rules`) : "Any"} onPress={() => setPicker("circuits")} />

        <SectionLabel>Sort</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {/* A local provider's problems have no dates, so "Newest" would only be the order they were imported in. */}
          {SORTS.filter((s) => !(localProvider && s === "newest")).map((s) => <Chip key={s} label={sortLabel(s, localProvider)} selected={f.sort === s} onPress={() => patch({ sort: s })} />)}
        </View>
      </Sheet>

      <SetterPicker visible={visible && picker === "setter"} onClose={() => setPicker(null)} setters={setters} value={f.setter} onPick={(setter) => { patch({ setter }); setPicker(null); }} />
      <Sheet visible={visible && picker === "circuits"} onClose={() => setPicker(null)} title="Circuits"
        onReset={() => patch({ circuitsAny: [], circuitsAll: [], circuitsNone: [] })} footer={<Button label="Done" onPress={() => setPicker(null)} />}>
        {circuits.length === 0 ? <Text v="secondary">You have no circuits yet. Create one from a climb with the Circuits button.</Text> : (
          (["circuitsAny", "circuitsAll", "circuitsNone"] as const).map((key) => (
            <View key={key}>
              <SectionLabel>{{ circuitsAny: "In any of", circuitsAll: "In all of", circuitsNone: "In none of" }[key]}</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {circuits.map((ci) => (
                  <Chip key={ci.uuid} label={ci.name} selected={f[key].includes(ci.uuid)}
                    onPress={() => {
                      // A circuit can sit in one rule at a time.
                      const cleared = { circuitsAny: f.circuitsAny.filter((x) => x !== ci.uuid), circuitsAll: f.circuitsAll.filter((x) => x !== ci.uuid), circuitsNone: f.circuitsNone.filter((x) => x !== ci.uuid) };
                      patch(f[key].includes(ci.uuid) ? cleared : { ...cleared, [key]: [...cleared[key], ci.uuid] });
                    }} />
                ))}
              </View>
            </View>
          ))
        )}
      </Sheet>
    </>
  );
}

function PickerRow({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Change`} onPress={onPress}
      style={{ minHeight: 56, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: c.divider, gap: 8 }}>
      <Text v="bodyStrong" style={{ flex: 1 }}>{label}</Text>
      <Text v="secondary" numberOfLines={1} style={{ maxWidth: 180 }}>{value}</Text>
      <Icon name="chevR" size={18} color={c.muted} />
    </Tap>
  );
}

function SetterPicker({ visible, onClose, setters, value, onPick }: { visible: boolean; onClose: () => void; setters: { name: string; count: number }[]; value: string | null; onPick: (s: string | null) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => setters.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60), [setters, q]);
  return (
    <Sheet visible={visible} onClose={onClose} title="Setter" onReset={value ? () => onPick(null) : undefined}>
      <TextInput value={q} onChangeText={setQ} placeholder="Search setters" placeholderTextColor={c.placeholder} autoCorrect={false} autoCapitalize="none" accessibilityLabel="Search setters"
        style={{ height: 48, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontSize: 16, fontFamily: "Barlow_400Regular", marginBottom: 8 }} />
      {shown.map((s) => (
        <Tap key={s.name} accessibilityRole="button" accessibilityState={{ selected: s.name === value }} onPress={() => onPick(s.name)}
          style={{ minHeight: 52, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: c.divider, gap: 8 }}>
          <Text v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{s.name}</Text>
          <Text v="secondary">{s.count}</Text>
          {s.name === value && <Icon name="check" size={18} />}
        </Tap>
      ))}
    </Sheet>
  );
}

export { Icon };
