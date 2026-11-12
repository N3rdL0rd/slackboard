import { getProvider } from "../providers";
import { useProviderContext, useUserId } from "../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as repo from "../core/repo";
import { getDb } from "../data/sqlite";
import { createBoard } from "../state/boards";
import { useStore } from "../state/store";
import { Button, Chip, IconButton, Segmented } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

type Step = 0 | 1 | 2;

/** Three steps, no auto-advance. A step with only one possible answer is skipped. */
export default function AddBoardManual() {
  const router = useRouter();
  const providerId = useLocalSearchParams<{ provider?: string }>().provider;
  useProviderContext(providerId);
  const insets = useSafeAreaInsets();
  const userId = useUserId();

  const [layouts, setLayouts] = useState<repo.LayoutOption[]>([]);
  const [sizes, setSizes] = useState<repo.SizeOption[]>([]);
  const [sets, setSets] = useState<repo.SetOption[]>([]);
  const [angles, setAngles] = useState<number[]>([]);
  const [step, setStep] = useState<Step>(0);
  const [layout, setLayout] = useState<repo.LayoutOption | null>(null);
  const [size, setSize] = useState<repo.SizeOption | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [adjustable, setAdjustable] = useState(true);
  const [angle, setAngle] = useState(40);
  const [name, setName] = useState("");
  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getDb().then(async (db) => {
      const all = (await repo.listLayouts(db)).filter((l) => !l.locked);
      setLayouts(all);
      if (all.length === 1) { setLayout(all[0]); setStep(1); }
    });
  }, []);

  useEffect(() => {
    if (!layout) return;
    void getDb().then(async (db) => {
      const s = await repo.listSizes(db, layout.id);
      setSizes(s);
      setSize(s.length === 1 ? s[0] : null);
      setAngles(await repo.listAngles(db, layout.productId));
    });
  }, [layout]);

  useEffect(() => {
    if (!layout || !size) return;
    void getDb().then(async (db) => {
      const s = await repo.listSets(db, layout.id, size.id);
      setSets(s);
      setPicked(s.length === 1 ? [s[0].id] : []);
    });
  }, [layout, size]);

  useEffect(() => { if (angles.length && !angles.includes(angle)) setAngle(angles.includes(40) ? 40 : angles[0]); }, [angles]); // eslint-disable-line react-hooks/exhaustive-deps

  const setupReady = !!size && picked.length > 0;
  const next: Record<Step, { label: string; disabled: boolean; why?: string }> = {
    0: { label: "Continue", disabled: !layout, why: "Pick your board" },
    1: { label: "Continue", disabled: !setupReady, why: !size ? "Pick a size" : "Pick a hold set" },
    2: { label: busy ? "Creating" : "Create board", disabled: busy || !name.trim(), why: "Name your board" },
  };

  const create = async () => {
    if (!layout || !size) return;
    if (serial.trim() && !(await repo.isKnownSerial(await getDb(), serial.trim()))) {
      setError("That serial number isn't recognised. It's the number printed on the controller.");
      return;
    }
    setBusy(true);
    setError("");
    const out = await createBoard({ name: name.trim(), isAdjustable: adjustable, angle, layoutId: layout.id, productSizeId: size.id, setIds: picked, serial: serial.trim() || undefined });
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    router.dismissAll();
    router.replace("/");
  };

  const input = { height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" } as const;
  const back = () => (step === 0 || (step === 1 && layouts.length === 1) ? router.back() : setStep((step - 1) as Step));

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon={step === 0 ? "close" : "back"} label={step === 0 ? "Close" : "Back"} onPress={back} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Set up by hand</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 20, marginBottom: 8 }}>
        {[0, 1, 2].map((i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.text : c.raised }} />)}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Text v="climbNameView" style={{ fontSize: 28 }}>Which board is it?</Text>
            {layouts.map((l) => (
              <Pressable key={l.id} accessibilityRole="radio" accessibilityState={{ selected: layout?.id === l.id }} onPress={() => setLayout(l)}
                style={{ padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 2, borderColor: layout?.id === l.id ? c.text : c.line }}>
                <Text v="climbName">{l.name}</Text>
                <Text v="secondary">{getProvider(providerId).name}</Text>
              </Pressable>
            ))}
          </>
        )}

        {step === 1 && layout && (
          <>
            <Text v="climbNameView" style={{ fontSize: 28 }}>Size and setup</Text>
            <Text v="section">Size</Text>
            <View style={{ gap: 8 }}>
              {sizes.map((s) => (
                <Pressable key={s.id} accessibilityRole="radio" accessibilityState={{ selected: size?.id === s.id }} onPress={() => setSize(s)}
                  style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 2, borderColor: size?.id === s.id ? c.text : c.line }}>
                  <Text v="bodyStrong">{s.name}</Text>
                  {s.description ? <Text v="secondary">{s.description}</Text> : null}
                </Pressable>
              ))}
            </View>
            {size && (
              <>
                <Text v="section" style={{ marginTop: 8 }}>Hold sets on your board</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {sets.map((s) => (
                    <Chip key={s.id} label={s.name} selected={picked.includes(s.id)} onPress={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))} />
                  ))}
                </View>
                <Text v="section" style={{ marginTop: 8 }}>Angle</Text>
                <Segmented options={[{ value: "adj", label: "Adjustable" }, { value: "fix", label: "Fixed" }]} value={adjustable ? "adj" : "fix"} onChange={(v) => setAdjustable(v === "adj")} />
                <Text v="caption">{adjustable ? "Your usual angle. You can change it any time in the app." : "The angle your board is set to."}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {angles.map((a) => <Chip key={a} label={`${a}°`} selected={angle === a} onPress={() => setAngle(a)} />)}
                </View>
              </>
            )}
          </>
        )}

        {step === 2 && layout && size && (
          <>
            <Text v="climbNameView" style={{ fontSize: 28 }}>Name it</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Board name, e.g. Home board" placeholderTextColor={c.placeholder} accessibilityLabel="Board name" style={input} />
            <TextInput value={serial} onChangeText={setSerial} placeholder="Controller serial number (optional)" placeholderTextColor={c.placeholder} keyboardType="number-pad"
              accessibilityLabel="Controller serial number" style={input} />
            <Text v="caption">The serial number lets Slackboard show what was recently lit on your board.</Text>
            <View style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 2 }}>
              <Text v="bodyStrong">{layout.name}</Text>
              <Text v="secondary">{size.name} · {sets.filter((s) => picked.includes(s.id)).map((s) => s.name).join(", ")} · {adjustable ? `adjustable, ${angle}°` : `fixed ${angle}°`}</Text>
            </View>
            {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
          </>
        )}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, gap: 8 }}>
        {next[step].disabled && !busy ? <Text v="caption" style={{ textAlign: "center" }}>{next[step].why}</Text> : null}
        <Button label={next[step].label} disabled={next[step].disabled} onPress={() => (step === 2 ? void create() : setStep((step + 1) as Step))} />
      </View>
    </View>
  );
}
