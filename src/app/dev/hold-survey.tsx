import { useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAX_MEASURE_CM, MIN_MEASURE_CM, scaleFromMeasurement, unitsBetween } from "../../core/boardScale";
import { localStamp } from "../../core/shareCard";
import {
  MAX_NOTE, TAG_GROUPS, TAG_INFO, canonicalTags, hasDirection, nextUnsure, nextUntagged, surveyProgress, toSurveyFile, toggleTag,
  type HoldTag, type SurveyHold, type SurveyTag,
} from "../../core/holdSurvey";
import { useBoard } from "../../state/store";
import { useData } from "../../state/data";
import { clearBoard, lightBoard, linkMatches, useBle } from "../../state/ble";
import { showBluetooth } from "../../state/bluetoothTray";
import { useBoardScale, useBoardScalesStore } from "../../state/boardScale";
import { useHoldTags, useHoldTagsStore } from "../../state/holdTags";
import { useSurveyOrder } from "../../state/holdKeys";
import { Button, Chip, IconButton, LinkButton, SectionLabel, Sheet } from "../../ui/parts";
import { FaceDial } from "../../ui/FaceDial";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

/** The one colour the hold being surveyed is lit in. */
const SURVEY_COLOR = "FFFFFF";

/**
 * Developer tool: lights each hold of the connected board in turn along the LED strip and records what you say it is. A hold takes
 * any number of tags and, for a hold pulled sideways or from underneath, the direction its face points. Answers are saved the moment
 * you tap Save, so you can stop and come back; "Next untagged" resumes. The same screen measures the board's real scale.
 */
export default function HoldSurvey() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useBoard();
  const ready = useData((d) => !!d.boardData);
  useBle((s) => s.phase);
  useBle((s) => s.match);
  const connected = linkMatches(board);
  const all = useHoldTags();
  const { boardId, order } = useSurveyOrder(board);
  const tags = new Map(all.filter((t) => t.board === boardId).map((t) => [t.key, t]));
  const progress = surveyProgress(order, tags);
  const scale = useBoardScale(boardId);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Set<SurveyTag>>(new Set());
  const [face, setFace] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [sheet, setSheet] = useState<null | "guide" | "scale">(null);
  const started = useRef(false);
  const last = useRef<{ tags: SurveyTag[]; face: number | null } | null>(null);
  const hold = order[index];

  // Start at the first hold still to do.
  useEffect(() => {
    if (started.current || order.length === 0) return;
    started.current = true;
    setIndex(nextUntagged(order, tags, 0) ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // Show the hold on the board, and load what it already has.
  useEffect(() => {
    if (!hold) return;
    const t = tags.get(hold.key);
    setPicked(new Set(t?.tags ?? []));
    setFace(t?.face ?? null);
    setNote(t?.note ?? "");
    setMessage("");
    if (connected) void lightBoard([{ position: hold.led, color: SURVEY_COLOR }], board).then((ok) => { if (!ok) setMessage("Lost the link to the board."); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold?.key, connected]);

  // Leave the board dark.
  const boardRef = useRef(board);
  boardRef.current = board;
  useEffect(() => () => { void clearBoard(boardRef.current); }, []);

  const go = (i: number | null) => { if (i !== null) setIndex(i); };
  const step = (d: number) => setIndex((i) => (i + d + order.length) % order.length);
  const toggle = (t: SurveyTag) => setPicked((p) => toggleTag(p, t));
  const showDial = hasDirection(picked) || face !== null;

  const save = async () => {
    if (!hold) return;
    if (picked.size === 0) { setMessage("Pick at least one tag, or skip this hold."); return; }
    const t: HoldTag = { board: boardId, key: hold.key, tags: canonicalTags(picked), face, note: note.trim().slice(0, MAX_NOTE), taggedAt: localStamp(new Date()) };
    await useHoldTagsStore.getState().save(t);
    last.current = { tags: t.tags, face: t.face };
    const n = nextUntagged(order, new Map([...tags, [t.key, t]]), index + 1);
    if (n === null) { setMessage("Every hold is done. Use Share to export the tags."); return; }
    setIndex(n);
  };

  const share = async () => {
    try {
      const file = new File(Paths.cache, `hold-survey-${boardId}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(toSurveyFile(boardId, all), null, 2));
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device.");
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Share the hold tags" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't share the file.");
    }
  };

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
      <IconButton icon="back" label="Back" onPress={() => router.back()} />
      <Text v="sheetTitle" style={{ flex: 1 }}>Hold survey</Text>
      <IconButton icon="bulb" label="Guide to the tags" onPress={() => setSheet("guide")} />
    </View>
  );

  const guideSheet = (
    <Sheet visible={sheet === "guide"} onClose={() => setSheet(null)} title="Tag guide">
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
        <Text v="secondary">Tag every one that applies: a crimpy wooden hold that is also a pinch gets crimp, pinch and wood. Edge depth, fingers that fit and texture take one answer each. Use Unsure rather than guess; the filter only trusts holds you were sure of.</Text>
        <Text v="secondary">Not sure what a hold is? Hold it and see what your hand does. Fingertips only fit: crimp or pocket. Fingers hook behind a lip: incut. Nothing to hook, held by friction: sloper. Thumb squeezes against fingers: pinch. Whole hand wraps and you can rest: jug.</Text>
        {TAG_GROUPS.flatMap((g) => g.tags).concat(["unsure"]).map((t) => (
          <View key={t}><Text v="bodyStrong">{TAG_INFO[t].label}</Text><Text v="secondary">{TAG_INFO[t].hint}</Text></View>
        ))}
      </ScrollView>
    </Sheet>
  );

  if (!board || !ready) {
    return <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>{header}<Text v="secondary" style={{ padding: 20 }}>Open the board you are at first.</Text>{guideSheet}</View>;
  }
  if (!connected) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
        {header}
        <View style={{ padding: 20, gap: 12 }}>
          <Text v="secondary">Connect to the controller of {board.name} (the board open in the Climb tab). The survey lights each hold, so it needs the link.</Text>
          <Button label="Connect to a board" onPress={() => showBluetooth()} />
        </View>
        {guideSheet}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text v="caption" aria-live="polite">{progress.tagged} tagged · {progress.unsure} unsure · {progress.left} left of {progress.total}</Text>
        <View style={{ backgroundColor: c.card, borderRadius: r.card, borderWidth: 1, borderColor: c.line, padding: 14, gap: 4 }}>
          <Text v="caption">Hold {index + 1} of {order.length}, lit white on the board</Text>
          <Text v="numeral" style={{ fontSize: 40, lineHeight: 44 }}>{hold?.key}</Text>
          {tags.get(hold?.key ?? "") ? <Text v="secondary">Saved: {tags.get(hold!.key)!.tags.map((t) => TAG_INFO[t].label).join(", ")}</Text> : null}
        </View>

        {TAG_GROUPS.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionLabel>{g.title}</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {g.tags.map((t) => <Chip key={t} label={TAG_INFO[t].label} selected={picked.has(t)} onPress={() => toggle(t)} />)}
            </View>
          </View>
        ))}

        <View style={{ gap: 8 }}>
          <SectionLabel>Direction of the face</SectionLabel>
          {showDial ? <FaceDial value={face} onChange={setFace} /> : <LinkButton label="Set a direction for this hold" onPress={() => setFace(0)} />}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label={TAG_INFO.unsure.label} selected={picked.has("unsure")} onPress={() => toggle("unsure")} />
          {last.current ? <Chip label="Same as last" onPress={() => { setPicked(new Set(last.current!.tags)); setFace(last.current!.face); }} /> : null}
        </View>

        <TextInput value={note} onChangeText={setNote} placeholder="Note (optional): sharp, slopey top, which hold lit instead" placeholderTextColor={c.placeholder}
          maxLength={MAX_NOTE} style={{ minHeight: 44, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontFamily: "Barlow_400Regular", fontSize: 16 }} />
        {message ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{message}</Text> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          <LinkButton label="Next untagged" onPress={() => go(nextUntagged(order, tags, index + 1))} />
          <LinkButton label="Next unsure" onPress={() => go(nextUnsure(order, tags, index + 1))} />
          <LinkButton label="Measure the scale" onPress={() => setSheet("scale")} />
          <LinkButton label="Share the tags" onPress={() => void share()} />
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 8, padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.card }}>
        <View style={{ flex: 1 }}><Button variant="secondary" label="Back" onPress={() => step(-1)} /></View>
        <View style={{ flex: 1 }}><Button variant="secondary" label="Skip" onPress={() => step(1)} /></View>
        <View style={{ flex: 2 }}><Button label="Save, next" onPress={() => void save()} /></View>
      </View>

      {guideSheet}
      <ScaleSheet visible={sheet === "scale"} onClose={() => setSheet(null)} boardId={boardId} hold={hold} scale={scale} />
    </View>
  );
}

/**
 * Measuring the board's real scale: the lit hold is point A, move to another hold far from it (use Next and Back; the lit hold moves)
 * for point B, measure between their centres with a tape, and type it in. The further apart the holds, the better the scale.
 */
function ScaleSheet({ visible, onClose, boardId, hold, scale }: { visible: boolean; onClose: () => void; boardId: string; hold: SurveyHold | undefined; scale: ReturnType<typeof useBoardScale> }) {
  const [a, setA] = useState<SurveyHold | null>(null);
  const [b, setB] = useState<SurveyHold | null>(null);
  const [cm, setCm] = useState("");
  const [msg, setMsg] = useState("");
  const value = Number(cm.replace(",", "."));
  const s = a && b ? scaleFromMeasurement(a, b, value) : null;

  const save = async () => {
    if (!a || !b || s === null) { setMsg(`Choose two different holds and type their distance between ${MIN_MEASURE_CM} and ${MAX_MEASURE_CM} cm.`); return; }
    await useBoardScalesStore.getState().save({ board: boardId, cmPerUnit: s, refA: a.key, refB: b.key, refCm: value, measuredAt: localStamp(new Date()) });
    setMsg("Saved.");
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Measure the scale">
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 10, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
        <Text v="secondary">Lets the app show real distances: between holds, along a climb, and moves. Close this sheet and use Next and Back to move the light. Pick two holds a long way apart, such as the same column near the top and the bottom. Measure from the centre of one hold to the centre of the other with a tape.</Text>
        {scale ? <Text v="caption">Now: one board unit is {scale.cmPerUnit.toFixed(2)} cm (measured {scale.refCm} cm between {scale.refA} and {scale.refB}).</Text> : <Text v="caption">Not measured yet.</Text>}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Button variant="secondary" label={a ? `A: ${a.key}` : "Lit hold is A"} onPress={() => { if (hold) setA(hold); }} /></View>
          <View style={{ flex: 1 }}><Button variant="secondary" label={b ? `B: ${b.key}` : "Lit hold is B"} onPress={() => { if (hold) setB(hold); }} /></View>
        </View>
        {a && b ? <Text v="caption">{unitsBetween(a, b).toFixed(1)} board units apart.</Text> : null}
        <TextInput value={cm} onChangeText={setCm} keyboardType="decimal-pad" placeholder="Distance in centimetres" placeholderTextColor={c.placeholder}
          style={{ minHeight: 44, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontFamily: "Barlow_400Regular", fontSize: 16 }} />
        {s !== null ? <Text v="secondary">That makes one board unit {s.toFixed(2)} cm.</Text> : null}
        {msg ? <Text v="secondary" aria-live="polite">{msg}</Text> : null}
        <Button label="Save the scale" onPress={() => void save()} />
      </ScrollView>
    </Sheet>
  );
}
