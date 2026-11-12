import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as repo from "../core/repo";
import { getDb } from "../data/sqlite";
import { removeBoard, updateBoard } from "../state/boards";
import { getProvider } from "../providers";
import { useData } from "../state/data";
import { Button, Chip, IconButton, Segmented, Sheet } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/** Rename a board, change its angle, hold sets or controller serial, or remove it. */
export default function EditBoard() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useData((d) => d.boards.find((b) => b.id === uuid));
  const local = getProvider(board?.spec.provider).kind === "local";
  const [name, setName] = useState(board?.name ?? "");
  const [serial, setSerial] = useState(board?.serial ?? "");
  const [adjustable, setAdjustable] = useState(board?.isAdjustable ?? true);
  const [angle, setAngle] = useState(board?.angle ?? 40);
  const [sets, setSets] = useState<repo.SetOption[]>([]);
  const [picked, setPicked] = useState<number[]>(board?.spec.setIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!board) return;
    void getDb().then(async (db) => setSets(await repo.listSets(db, board.spec.layoutId, board.spec.productSizeId)));
  }, [board?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!board) return <View style={{ flex: 1, backgroundColor: c.ground }}><Text v="secondary" style={{ padding: 20, paddingTop: insets.top + 20 }}>That board is gone.</Text></View>;

  const input = { height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" } as const;
  const valid = name.trim().length > 0 && picked.length > 0;

  const save = async () => {
    // Only a changed serial is checked: the one the board already has was accepted when it was saved, and a board copied from a gym
    // can carry a serial that is not in this account's own controller list.
    if (serial.trim() && serial.trim() !== (board.serial ?? "") && !(await repo.isKnownSerial(await getDb(), serial.trim()))) {
      setError("That serial number isn't recognised. It's the number printed on the controller.");
      return;
    }
    setBusy(true); setError("");
    const out = await updateBoard(board.id, {
      name: name.trim(), isAdjustable: adjustable, angle, layoutId: board.spec.layoutId, productSizeId: board.spec.productSizeId, setIds: picked, serial: serial.trim() || undefined,
    });
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    router.back();
  };
  const remove = async () => {
    setBusy(true);
    const out = await removeBoard(board.id);
    setBusy(false);
    if (!out.ok) { setConfirm(false); setError(out.message); return; }
    setConfirm(false);
    router.dismissAll();
    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Edit board</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text v="secondary">{board.spec.layoutName} · {board.spec.sizeName}</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Board name" placeholderTextColor={c.placeholder} accessibilityLabel="Board name" style={input} />
        {local ? <Text v="caption">Its setup and angle are fixed. To use a different one, add another board.</Text> : <>
        <Text v="section" style={{ marginTop: 8 }}>Hold sets</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {sets.map((s) => <Chip key={s.id} label={s.name} selected={picked.includes(s.id)} onPress={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))} />)}
        </View>
        <Text v="section" style={{ marginTop: 8 }}>Angle</Text>
        <Segmented options={[{ value: "adj", label: "Adjustable" }, { value: "fix", label: "Fixed" }]} value={adjustable ? "adj" : "fix"} onChange={(v) => setAdjustable(v === "adj")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {board.spec.angles.map((a) => <Chip key={a} label={`${a}°`} selected={angle === a} onPress={() => setAngle(a)} />)}
        </View>
        <Text v="section" style={{ marginTop: 8 }}>Controller serial number</Text>
        <TextInput value={serial} onChangeText={setSerial} placeholder="Optional" placeholderTextColor={c.placeholder} keyboardType="number-pad" accessibilityLabel="Controller serial number" style={input} />
        <Text v="caption">Needed for Recently lit. It's printed on the controller.</Text>
        </>}
        {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => setConfirm(true)} style={{ minHeight: 48, justifyContent: "center", marginTop: 16 }}>
          <Text v="bodyStrong" style={{ color: c.danger }}>Remove this board</Text>
        </Pressable>
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line }}>
        <Button label={busy ? "Saving" : "Save changes"} disabled={!valid || busy} onPress={() => void save()} />
      </View>
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Remove this board?"
        footer={<View style={{ gap: 8 }}><Button variant="danger" label={busy ? "Removing" : "Remove board"} disabled={busy} onPress={() => void remove()} /><Button variant="secondary" label="Keep it" onPress={() => setConfirm(false)} /></View>}>
        <Text v="secondary">{local ? `"${board.name}" is removed from this phone. Your logs are kept, and the problems stay downloaded.` : `"${board.name}" is removed from your account. Your logbook is kept. You can add the board again at any time.`} You can add the board again at any time.</Text>
      </Sheet>
    </View>
  );
}
