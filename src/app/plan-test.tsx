import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomHex } from "../core/api";
import { parseStamp, stampOf } from "../core/days";
import type { TestKind } from "../data/protocols";
import { testInfo, TESTS } from "../data/protocols";
import { formatWeight, roundTo, weightIn, weightStep, weightToKg } from "../core/units";
import { usePlanner, usePlannerStore } from "../state/planner";
import { useStore } from "../state/store";
import { haptic } from "../ui/haptics";
import { Button, IconButton, LinkButton, SectionLabel, Tap } from "../ui/parts";
import { Stepper } from "../ui/Stepper";
import { Text } from "../ui/Text";
import { c, font, r } from "../theme";

/** A countdown for the 7-second hang, so the timing is not left to counting in your head. */
function HangTimer() {
  const [left, setLeft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const start = () => {
    if (timer.current) clearInterval(timer.current);
    const end = Date.now() + 7000;
    setLeft(7);
    haptic.heavy();
    timer.current = setInterval(() => {
      const s = Math.ceil((end - Date.now()) / 1000);
      if (s <= 0) { if (timer.current) clearInterval(timer.current); timer.current = null; setLeft(0); haptic.done(); } else setLeft(s);
    }, 200);
  };
  return (
    <View style={{ alignItems: "center", gap: 8, padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text style={{ fontFamily: font.display, fontSize: 72, lineHeight: 80, color: left === 0 ? c.starOn : c.text }}>{left === null ? "7" : left === 0 ? "Off" : String(left)}</Text>
      <Button variant="secondary" label={left === null ? "Start a 7 second hang" : "Again"} onPress={start} />
    </View>
  );
}

/** Record a test result. Each test says how to do it; the 7-second hang has a timer. Nothing here is required. */
export default function PlanTest() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const units = useStore((s) => s.settings.units);
  const { tests } = usePlanner();
  const [kind, setKind] = useState<TestKind | null>(null);
  const [value, setValue] = useState(0);
  const info = kind ? testInfo(kind) : null;
  const pick = (k: TestKind) => { setKind(k); setValue(k === "hang7" ? 0 : k === "hangFail" ? 30 : 10); };
  const step = kind === "hang7" ? weightStep(units.weight) : 1;
  const shown = kind === "hang7" ? roundTo(weightIn(value, units.weight), step) : value;
  const bump = (d: 1 | -1) => {
    if (kind === "hang7") setValue(weightToKg(roundTo(weightIn(value, units.weight) + d * step, step), units.weight));
    else setValue(Math.max(0, value + d));
  };
  const save = async () => {
    if (!kind) return;
    await usePlannerStore.getState().addTest({ id: randomHex(16), test: kind, value, takenAt: stampOf(new Date()) });
    router.back();
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => (kind ? setKind(null) : router.back())} />
        <Text v="sheetTitle" style={{ flex: 1 }}>{info ? info.label : "Tests"}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 + insets.bottom }}>
        {!kind ? (
          <>
            <Text v="secondary">Warm up first, and stop if anything hurts. Pick a test.</Text>
            {TESTS.map((t) => (
              <Tap key={t.kind} accessibilityRole="button" onPress={() => pick(t.kind)} style={{ padding: 16, gap: 2, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
                <Text v="climbName">{t.label}</Text>
                <Text v="secondary">{t.measures}</Text>
              </Tap>
            ))}
            {tests.length ? <SectionLabel>Past results</SectionLabel> : null}
            {tests.map((t) => (
              <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text v="body" style={{ flex: 1 }}>{`${testInfo(t.test).label}: ${t.test === "hang7" ? formatWeight(t.value, units.weight, { signed: true }) : `${t.value} ${testInfo(t.test).unit}`} \u00B7 ${parseStamp(t.takenAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</Text>
                <LinkButton label="Delete" danger onPress={() => void usePlannerStore.getState().removeTest(t.id)} />
              </View>
            ))}
          </>
        ) : info ? (
          <>
            <Text v="body">{info.how}</Text>
            {kind === "hang7" ? <HangTimer /> : null}
            <Stepper label="Result" value={kind === "hang7" ? formatWeight(value, units.weight, { signed: true }) : `${shown} ${info.unit}`} min={!info.signed && value <= 0} onChange={bump} />
            <Text v="caption">{kind === "hang7" ? "Added weight for your best clean 7 second hang. Zero is bodyweight; negative is help from a pulley." : "Your best result."}</Text>
            <Button label="Save result" onPress={() => void save()} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
