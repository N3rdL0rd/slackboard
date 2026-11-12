import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { anglesOf, AVAILABLE_SETUPS, sourceFor } from "../core/moonSources";
import { addMoonBoard, ensureProblems, useProblems } from "../state/moonboard";
import { Button, Chip } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/**
 * Add a MoonBoard: pick the setup it was built with (and its angle, when there is a choice) and name it. The problems for
 * that setup download by themselves afterwards. No account, no files to find.
 */
export function MoonBoardSetup() {
  const router = useRouter();
  const [setupKey, setSetupKey] = useState(AVAILABLE_SETUPS[0].key);
  const [angle, setAngle] = useState(anglesOf(AVAILABLE_SETUPS[0].key)[0]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<number | null>(null);
  const status = useProblems((s) => (layout != null ? s.by[layout] : undefined));
  const setup = AVAILABLE_SETUPS.find((s) => s.key === setupKey)!;
  const angles = anglesOf(setupKey);
  const source = sourceFor(setupKey, angle);

  const choose = (key: string) => { setSetupKey(key); const a = anglesOf(key); if (!a.includes(angle)) setAngle(a[0]); };
  const home = () => { router.dismissAll(); router.replace("/"); };
  const add = async () => {
    setBusy(true); setError("");
    try {
      const added = await addMoonBoard({ name, setupKey, angle });
      setLayout(added.layoutId);
      // Stay here until the problems are on the phone, so the board never opens empty.
      await ensureProblems(added.layoutId);
      if (useProblems.getState().by[added.layoutId]?.phase === "done") home();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (layout != null) {
    const failed = status?.phase === "error";
    const pct = status?.phase === "importing" ? Math.round(status.fraction * 100) : null;
    return (
      <View style={{ gap: 14 }} accessibilityLiveRegion="polite">
        <Text v="climbName">{failed ? `Couldn't get the ${setup.name} problems` : `Getting the ${setup.name} problems`}</Text>
        <Text v="secondary">
          {failed ? status?.error ?? "Check your connection." : status?.phase === "importing" ? `Adding them to your board${pct != null ? ` (${pct}%)` : ""}.` : `Downloading ${source ? megabytes(source.bytes) : ""}. This happens once; after this the board works offline.`}
        </Text>
        {!failed ? (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(4, pct ?? 4)}%`, height: 6, backgroundColor: c.text }} />
          </View>
        ) : null}
        {failed ? <Button label="Try again" onPress={() => void ensureProblems(layout).then(() => { if (useProblems.getState().by[layout]?.phase === "done") home(); })} /> : null}
        <Button variant="secondary" label={failed ? "Continue without problems" : "Continue in the background"} onPress={home} />
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text v="section">Which setup is your board?</Text>
      {AVAILABLE_SETUPS.map((s) => (
        <Pressable key={s.key} accessibilityRole="radio" accessibilityState={{ selected: s.key === setupKey }} onPress={() => choose(s.key)}
          style={{ minHeight: 56, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 2, borderColor: s.key === setupKey ? c.text : c.line, justifyContent: "center" }}>
          <Text v="climbName">{s.name}</Text>
          <Text v="caption">{s.mini ? "12 rows" : "18 rows"}</Text>
        </Pressable>
      ))}
      {angles.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Text v="secondary">Angle</Text>
          {angles.map((a) => <Chip key={a} label={`${a}\u00b0`} selected={a === angle} onPress={() => setAngle(a)} />)}
        </View>
      ) : null}
      <TextInput value={name} onChangeText={setName} placeholder={setup.name} placeholderTextColor={c.placeholder} accessibilityLabel="Board name"
        style={{ height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" }} />
      {source?.note ? <Text v="caption">{source.note}</Text> : null}
      {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
      <Button label={busy ? "Adding" : "Add board"} disabled={busy} onPress={add} />
      <Text v="caption" style={{ textAlign: "center" }}>
        {source ? `The problem list (${megabytes(source.bytes)}) downloads once, over your connection. ` : ""}Nothing here needs an account.
      </Text>
    </View>
  );
}
