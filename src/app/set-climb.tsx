import { useKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, usePreventRemove, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteFrame, duplicateFrame, framesForCount, parseFrames, setHoldInFrame, type Frame } from "../core/frames";
import * as repo from "../core/repo";
import { DEFAULT_METHOD, METHODS, MOON_RULES, SETTABLE_DIFFICULTIES } from "../core/moonboard";
import { checkDraft, copyName, countRole, DEFAULT_FRAMES_PACE, framesString, MAX_DESCRIPTION_BYTES, MAX_FINISHES, MAX_STARTS, type ClimbKind, type SetterRules } from "../core/setter";
import { grades } from "../data/grades";
import { getProvider } from "../providers";
import { setSequence } from "../state/sequence";
import { haptic } from "../ui/haptics";
import { getDb } from "../data/sqlite";
import { showBluetooth } from "../state/bluetoothTray";
import { useData } from "../state/data";
import { deleteClimb } from "../state/climbActions";
import { holesFor } from "../core/led";
import { lightBoard } from "../state/ble";
import { useLedStatus } from "../state/useLedStatus";
import { saveClimb } from "../state/setClimb";
import { useBoard, useStore } from "../state/store";
import { useCanSet } from "../state/useActive";
import { BoardView } from "../ui/BoardView";
import { SetterFrames } from "../ui/SetterFrames";
import { LinkButton, Button, Chip, IconButton, Segmented, Sheet, SwitchRow } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r, role as roleTokens, type RoleName } from "../theme";

const ROLE_BUTTONS: { name: RoleName; label: string }[] = [
  { name: "start", label: "Start" }, { name: "middle", label: "Middle" }, { name: "finish", label: "Finish" }, { name: "foot", label: "Foot only" },
];

/** Set a boulder or route: pick a role, tap holes on each frame, then save a draft or publish. */
export default function SetClimb() {
  // Setting a climb lights the board as you go, and a phone that sleeps mid-edit drops the link.
  useKeepAwake("set-climb");
  const { uuid, type, from } = useLocalSearchParams<{ uuid?: string; type?: ClimbKind; from?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const board = useBoard();
  const data = useData((d) => d.boardData);
  const settings = useStore((s) => s.settings);
  const canSet = useCanSet();
  const canBoulder = canSet.boulder;
  const canRoute = canSet.route;

  const [selected, setSelected] = useState<RoleName>("start");
  const [kind, setKind] = useState<ClimbKind>(type === "route" || (!canBoulder && canRoute) ? "route" : "boulder");
  const [frames, setFrames] = useState<Frame[]>([new Map()]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [pace, setPace] = useState(DEFAULT_FRAMES_PACE);
  const [playing, setPlaying] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [noMatch, setNoMatch] = useState(false);
  const [asDraft, setAsDraft] = useState(true);
  // MoonBoard: the setter's grade (the shared scale's difficulty number) and the feet rule the problem is set under.
  // Set when the screen was opened as a copy of someone's climb: what it was copied from, shown at the top.
  const [source, setSource] = useState<{ name: string; setter: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [grade, setGrade] = useState<number | null>(null);
  const [method, setMethod] = useState<string>(DEFAULT_METHOD);
  const [rules, setRules] = useState<SetterRules>({ minHolds: 2, maxHolds: 35 });
  const [taken, setTaken] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [lightInfo, setLightInfo] = useState(false);
  const [details, setDetails] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteFrame, setConfirmDeleteFrame] = useState(false);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [baseline, setBaseline] = useState<string | null>(uuid ? null : signature([new Map()], "", "", false, DEFAULT_FRAMES_PACE));
  const [allowLeave, setAllowLeave] = useState(false);

  const roles = data?.roles ?? [];
  /** A local provider (MoonBoard) has no server: no drafts or publishing, a grade of the setter's own, and no foot-only role. */
  const local = getProvider(board?.spec.provider).kind === "local";
  const roleId = (n: RoleName) => roles.find((x) => x.name === n)?.id ?? 0;

  useEffect(() => { if (board) void getDb().then((db) => repo.productLimits(db, board.spec.productId)).then((r) => setRules(local ? { ...r, maxMiddle: MOON_RULES.maxMiddle } : r)); }, [board?.spec.productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!uuid || loadedDraft) return;
    void getDb().then(async (db) => {
      const climb = await repo.climbByUuid(db, uuid);
      if (!climb) return;
      const loaded = framesForCount(parseFrames(climb.frames), climb.frameCount);
      setFrames(loaded);
      setKind(climb.frameCount > 1 ? "route" : "boulder");
      setPace(climb.frameCount > 1 && climb.pace >= 1000 ? climb.pace : DEFAULT_FRAMES_PACE);
      setName(climb.name);
      setNoMatch(climb.noMatch);
      const full = (await db.all<{ description: string }>("SELECT description FROM climbs WHERE uuid = ?", [climb.uuid]))[0];
      setDescription(full?.description ?? "");
      let loadedGrade: number | null = null;
      let loadedMethod: string = DEFAULT_METHOD;
      if (local) {
        loadedMethod = full?.description || DEFAULT_METHOD;
        const d = (await repo.climbStatsAllAngles(db, climb.uuid))[board?.angle ?? 40]?.[0];
        loadedGrade = d != null ? Math.round(d) : null;
        setMethod(loadedMethod);
        setGrade(loadedGrade);
      }
      setBaseline(signature(loaded, climb.name, full?.description ?? "", climb.noMatch, climb.frameCount > 1 && climb.pace >= 1000 ? climb.pace : DEFAULT_FRAMES_PACE, loadedGrade, loadedMethod));
      setLoadedDraft(true);
    });
  }, [uuid, loadedDraft]);
  // "Copy to a new climb": the holds and details of another climb, as a new unsaved one. Saving it makes a new climb of your own;
  // the original is untouched. It counts as unsaved, so leaving asks first.
  useEffect(() => {
    if (!from || uuid || copied || !board) return;
    void getDb().then(async (db) => {
      const src = await repo.climbByUuid(db, from);
      if (!src) return;
      const full = (await db.all<{ description: string }>("SELECT description FROM climbs WHERE uuid = ?", [src.uuid]))[0];
      setFrames(framesForCount(parseFrames(src.frames), src.frameCount));
      setKind(src.frameCount > 1 ? "route" : "boulder");
      setPace(src.frameCount > 1 && src.pace >= 1000 ? src.pace : DEFAULT_FRAMES_PACE);
      setName(copyName(src.name));
      setNoMatch(src.noMatch);
      if (local) {
        setMethod(full?.description || DEFAULT_METHOD);
        const d = (await repo.climbStatsAllAngles(db, src.uuid))[board.angle]?.[0];
        setGrade(d != null ? Math.round(d) : null);
      } else {
        setDescription(`Based on ${src.name} by ${src.setter}.`);
      }
      setSource({ name: src.name, setter: src.setter });
      setCopied(true);
    });
  }, [from, uuid, copied, board?.angle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (uuid || type || (!canBoulder && canRoute)) return;
    setKind("boulder");
  }, [uuid, type, canBoulder, canRoute]);

  useEffect(() => {
    if (!board || !name.trim()) { setTaken(false); return; }
    let live = true;
    void getDb().then((db) => repo.nameTaken(db, board.spec.layoutId, name, uuid)).then((t) => { if (live) setTaken(t); });
    return () => { live = false; };
  }, [name, board?.spec.layoutId, uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentFrame = frames[Math.min(frameIndex, frames.length - 1)] ?? new Map<number, number>();
  const led = useLedStatus();
  useEffect(() => {
    if (!led.matches || !data) return;
    void lightBoard(holesFor(currentFrame, new Map(data.placements.map((p) => [p.id, p])), new Map(data.roles.map((x) => [x.id, x])), false), board);
  }, [currentFrame, led.matches, data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = setInterval(() => setFrameIndex((i) => (i + 1) % frames.length), pace);
    return () => clearInterval(timer);
  }, [playing, frames.length, pace]);

  useEffect(() => {
    if (frameIndex >= frames.length) setFrameIndex(Math.max(0, frames.length - 1));
  }, [frameIndex, frames.length]);

  const check = useMemo(() => checkDraft({ frames, framesPace: pace, name, description }, data?.roles ?? [], rules, taken, kind), [frames, pace, name, description, data?.roles, rules, taken, kind]);
  if (!board || !data) return <View style={{ flex: 1, backgroundColor: c.ground }} />;

  const selectFrame = (index: number) => {
    setPlaying(false);
    setFrameIndex(index);
    setLimitHit(false);
  };
  const onTap = (placementId: number) => {
    const next = setHoldInFrame(frames, frameIndex, placementId, roleId(selected), rules.maxHolds);
    if (!next) { setLimitHit(true); return; }
    setLimitHit(false);
    setFrames(next);
    haptic.light();
    // Both starts down: on to the hand holds.
    if (local && selected === "start" && countRole(next[frameIndex] ?? new Map(), roles, "start") >= MAX_STARTS) setSelected("middle");
  };
  const duplicate = () => {
    setPlaying(false);
    setFrames((all) => duplicateFrame(all, frameIndex));
    setFrameIndex((i) => i + 1);
    setLimitHit(false);
  };
  const removeFrame = () => {
    setConfirmDeleteFrame(false);
    setPlaying(false);
    setFrames((all) => deleteFrame(all, frameIndex));
    setFrameIndex((i) => Math.max(0, i - (frameIndex === frames.length - 1 ? 1 : 0)));
  };

  // Back button, swipe and close all use the same guard, including frame and pace edits.
  const dirty = baseline !== null && !allowLeave && signature(frames, name, description, noMatch, pace, grade, method) !== baseline;
  usePreventRemove(dirty, () => setLeaving(true));
  const close = () => router.back();
  const leave = () => { setLeaving(false); setAllowLeave(true); setTimeout(() => router.back(), 0); };

  const removeDraft = async () => {
    if (!uuid) return;
    setBusy(true);
    const out = await deleteClimb(uuid);
    setBusy(false);
    setConfirmDelete(false);
    if (!out.ok) { setError(out.message); return; }
    setAllowLeave(true);
    setTimeout(() => router.back(), 0);
  };

  const save = async () => {
    setPlaying(false);
    setBusy(true); setError("");
    const out = await saveClimb({
      uuid: uuid || undefined, layoutId: board.spec.layoutId, name: name.trim(), description: description.trim(), isNoMatch: noMatch,
      isDraft: local ? false : asDraft, frames: framesString(frames), frameCount: kind === "route" ? frames.length : 1, framesPace: kind === "route" ? pace : 0, angle: board.angle,
      ...(local ? { difficulty: grade ?? undefined, method } : {}),
    });
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    haptic.success();
    setAllowLeave(true);
    // A new MoonBoard problem opens straight away, so it can be lit on the wall and logged.
    if (local && !uuid) setTimeout(() => { setSequence(null); router.replace({ pathname: "/climb/[uuid]", params: { uuid: out.uuid } }); }, 0);
    else setTimeout(() => router.back(), 0);
  };

  const spanX = board.spec.edges.right - board.spec.edges.left;
  const spanY = board.spec.edges.top - board.spec.edges.bottom;
  const boardW = Math.max(120, Math.min(width - 32, area.h > 0 ? (area.h - 8) * (spanX / spanY) : width - 32));
  const roleButtons = ROLE_BUTTONS.filter((b) => roles.some((x) => x.name === b.name)).map((b) => (local && b.name === "middle" ? { ...b, label: "Hand" } : b));
  const first = check.issues[0];
  // MoonBoard saves in two steps: the holds, then a name and grade. The button says which step is next.
  const detailsIssue = (i: { message: string }) => /name|description/i.test(i.message);
  const holdsOk = check.issues.every(detailsIssue);
  const detailsReady = !check.issues.some((i) => /name/i.test(i.message)) && grade !== null;
  const localReady = holdsOk && detailsReady;
  const primaryLabel = busy ? "Saving" : local ? (localReady ? (uuid ? "Save changes" : "Save climb") : "Name & grade") : asDraft ? "Save draft" : "Publish";
  const primaryDisabled = busy || (local ? !holdsOk : !!first);
  const primaryPress = () => { if (local && !localReady) { setPlaying(false); setDetails(true); } else void save(); };
  const firstMessage = first?.message;
  const detailsProblem = !!firstMessage && /name|description/i.test(firstMessage);
  const jumpToProblem = () => {
    if (detailsProblem) setDetails(true);
    else if (first?.frameIndex !== undefined) selectFrame(first.frameIndex);
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="close" label="Close" onPress={close} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{uuid ? `Edit ${kind}` : `Set a ${kind}`}</Text>
        <View style={{ height: 36, paddingHorizontal: 12, borderRadius: r.pill, backgroundColor: c.card, justifyContent: "center", marginRight: 4 }}>
          <Text v="caption" style={{ color: c.text2 }}>At {board.angle}°</Text>
        </View>
        <IconButton icon="bulb" label={led.matches ? "Board is showing this climb. LED status" : "Light up the board while you set. Connect"} dot={led.dot} onPress={() => (led.matches ? setLightInfo(true) : showBluetooth())} />
      </View>

      {source ? (
        <Text v="caption" style={{ paddingHorizontal: 16, paddingBottom: 6 }} numberOfLines={1}>Copied from {source.name} by {source.setter}. Change what you like, then save it as your own.</Text>
      ) : null}
      {!uuid && !from && canBoulder && canRoute ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
          <Segmented options={[{ value: "boulder" as const, label: "Boulder" }, { value: "route" as const, label: "Route" }]} value={kind} onChange={(next) => {
            setPlaying(false);
            setKind(next);
            setFrames((all) => next === "boulder" ? [all[Math.min(frameIndex, all.length - 1)] ?? new Map()] : all);
            setFrameIndex(0);
          }} />
        </View>
      ) : null}

      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {area.h > 0 && <BoardView spec={board.spec} placements={data.placements} roles={roles} images={board.spec.images} width={boardW} frame={currentFrame} shapes={settings.shapes} highContrast={settings.highContrast} onPressHole={onTap} />}
      </View>

      {kind === "route" ? (
        <View style={{ paddingHorizontal: 4 }}>
          <SetterFrames current={Math.min(frameIndex, frames.length - 1)} count={frames.length} currentHoldCount={currentFrame.size} playing={playing} pace={pace}
            onSelect={selectFrame} onDuplicate={duplicate} onDelete={() => setConfirmDeleteFrame(true)} onTogglePlay={() => setPlaying((v) => !v)} onPace={setPace} />
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {roleButtons.map(({ name: n, label }) => {
            const on = selected === n;
            const count = countRole(currentFrame, roles, n);
            const col = settings.highContrast ? roleTokens.highContrast : roleTokens[n].color;
            return (
              <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${label}, ${count} placed on this frame`} accessibilityState={{ selected: on }} onPress={() => setSelected(n)}
                style={{ flex: 1, height: 52, borderRadius: r.input, borderWidth: 2, borderColor: on ? col : c.lineStrong, backgroundColor: on ? c.raised : c.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <View style={{ width: 14, height: 14, borderRadius: n === "start" && settings.shapes ? 3 : 7, borderWidth: 3, borderColor: col }} />
                <Text v="bodyStrong" style={{ fontSize: 14 }}>{count}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Status ok={check.starts >= 1 && check.starts <= MAX_STARTS} label={`${check.starts} start`} />
          <Status ok={check.finishes >= 1 && check.finishes <= MAX_FINISHES} label={`${check.finishes} finish`} />
          <Status ok={currentFrame.size >= rules.minHolds && currentFrame.size <= rules.maxHolds} label={`${currentFrame.size}/${rules.maxHolds}`} />
          <Text v="caption" style={{ flex: 1, textAlign: "right" }} numberOfLines={1}>{ROLE_BUTTONS.find((x) => x.name === selected)?.label}: tap holes</Text>
        </View>
        {limitHit && <Text v="caption" style={{ color: c.danger }} aria-live="polite">Hold limit reached ({rules.maxHolds}). Remove one to add another.</Text>}
        {error ? <Text v="caption" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
      </View>

      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 8 }}>
        {firstMessage ? (
          <Pressable accessibilityRole={detailsProblem || first?.frameIndex !== undefined ? "button" : "text"} disabled={!detailsProblem && first?.frameIndex === undefined} onPress={jumpToProblem}>
            <Text v="caption" style={{ textAlign: "center", color: detailsProblem || first?.frameIndex !== undefined ? c.text : c.caption }}>
              {firstMessage}{!detailsProblem && first?.frameIndex !== undefined && kind === "route" ? ` Go to frame ${first.frameIndex + 1}.` : ""}
            </Text>
          </Pressable>
        ) : null}
        {local && holdsOk && !firstMessage && grade === null ? <Text v="caption" style={{ textAlign: "center" }}>Choose a grade to save.</Text> : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button variant="secondary" label="Details" style={{ flex: 1, height: 54 }} onPress={() => { setPlaying(false); setDetails(true); }} />
          <Button label={primaryLabel} disabled={primaryDisabled} style={{ flex: 1.6, height: 54 }} onPress={primaryPress} />
        </View>
      </View>

      <Sheet visible={details} onClose={() => setDetails(false)} title={local ? "Name & grade" : "Details"}
        footer={local
          ? <Button label={busy ? "Saving" : uuid ? "Save changes" : "Save climb"} disabled={busy || !localReady} onPress={() => { setDetails(false); void save(); }} />
          : <Button label="Done" onPress={() => setDetails(false)} />}>
        <View style={{ gap: 10, marginTop: 6 }}>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={c.placeholder} accessibilityLabel="Climb name" autoFocus={!name}
            style={{ height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" }} />
          {local && taken ? <Text v="caption" style={{ color: c.danger }} aria-live="polite">That name is already used on this board.</Text> : null}
          {local ? (
            <>
              <Text v="section" style={{ marginTop: 6 }}>Grade</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SETTABLE_DIFFICULTIES.map((d) => {
                  const l = grades.label(d, settings.gradeDisplay, false);
                  return <Chip key={d} label={`${l.primary}${l.secondary ? ` ${l.secondary}` : ""}`} selected={grade === d} onPress={() => { haptic.selection(); setGrade(d); }} />;
                })}
              </View>
              <Text v="section" style={{ marginTop: 6 }}>Feet</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {METHODS.map((m) => <Chip key={m} label={m} selected={method === m} onPress={() => { haptic.selection(); setMethod(m); }} />)}
              </View>
            </>
          ) : (
            <>
              <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor={c.placeholder} multiline accessibilityLabel="Description"
                style={{ minHeight: 72, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, padding: 14, fontSize: 16, fontFamily: "Barlow_400Regular" }} />
              <Text v="caption" style={{ textAlign: "right" }}>{new TextEncoder().encode(description).length} / {MAX_DESCRIPTION_BYTES}</Text>
              <SwitchRow label="No matching" help="Hands may not share a hold." value={noMatch} onChange={setNoMatch} />
              <SwitchRow label="Save as draft" help={asDraft ? "You can edit a draft and publish it later. Once published, a climb can't be changed." : "It will be published right away for everyone."} value={asDraft} onChange={setAsDraft} />
            </>
          )}
          {uuid ? <LinkButton danger label={local ? "Delete this climb" : "Delete this draft"} icon="trash" onPress={() => { setDetails(false); setConfirmDelete(true); }} /> : null}
        </View>
      </Sheet>

      <Sheet visible={leaving} onClose={() => setLeaving(false)} title="Discard your changes?"
        footer={<View style={{ gap: 8 }}><Button variant="danger" label="Discard" onPress={leave} /><Button variant="secondary" label="Keep editing" onPress={() => setLeaving(false)} /></View>}>
        <Text v="secondary">{uuid ? "The changes you made to this draft haven't been saved." : "This climb hasn't been saved. The holds and details you entered will be lost."}</Text>
      </Sheet>
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={local ? "Delete this climb?" : "Delete this draft?"}
        footer={<View style={{ gap: 8 }}><Button variant="danger" label={busy ? "Deleting" : local ? "Delete climb" : "Delete draft"} disabled={busy} onPress={() => void removeDraft()} /><Button variant="secondary" label="Keep it" onPress={() => setConfirmDelete(false)} /></View>}>
        <Text v="secondary">{local ? `"${name || "This climb"}" is removed from this board. Your logs of it stay.` : `"${name || "This draft"}" is deleted for good.`}</Text>
      </Sheet>
      <Sheet visible={lightInfo} onClose={() => setLightInfo(false)} title="Light up the board"
        footer={<Button label="Got it" onPress={() => setLightInfo(false)} />}>
        <Text v="secondary">The board shows each hold as you place it, so you can check the climb on the wall while you set it. Nothing you light up while setting is added to Recently lit.</Text>
      </Sheet>
      <Sheet visible={confirmDeleteFrame} onClose={() => setConfirmDeleteFrame(false)} title="Delete this frame?"
        footer={<View style={{ gap: 8 }}><Button variant="danger" label="Delete frame" onPress={removeFrame} /><Button variant="secondary" label="Keep it" onPress={() => setConfirmDeleteFrame(false)} /></View>}>
        <Text v="secondary">Frame {frameIndex + 1} and its {currentFrame.size} holds will be removed. Later frames move down.</Text>
      </Sheet>
    </View>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={{ minHeight: 32, paddingHorizontal: 10, borderRadius: r.pill, borderWidth: 1.5, borderColor: ok ? c.text : c.lineStrong, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ok ? c.raised : c.card }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ok ? c.text : "transparent", borderWidth: 1.5, borderColor: ok ? c.text : c.muted }} />
      <Text v="bodyStrong" style={{ fontSize: 14, color: ok ? c.text : c.text2 }}>{label}</Text>
    </View>
  );
}

/** A comparable snapshot of everything the user can edit. */
function signature(frames: Frame[], name: string, description: string, noMatch: boolean, pace: number, grade: number | null = null, method: string = DEFAULT_METHOD): string {
  return JSON.stringify([frames.map((f) => [...f].sort((a, b) => a[0] - b[0])), name.trim(), description.trim(), noMatch, pace, grade, method]);
}
