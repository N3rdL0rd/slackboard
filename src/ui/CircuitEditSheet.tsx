import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { SaveCircuitInput } from "../core/api";
import type { CircuitInput } from "../state/circuits";
import { getProvider } from "../providers";
import { CIRCUIT_COLORS, circuitDisplayColor, DEFAULT_CIRCUIT_COLOR } from "../core/circuits";
import { Icon } from "./Icon";
import { Button, Sheet, SwitchRow } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

/** Name, description, colour and privacy of a circuit. Used to create one and to edit one. */
export function CircuitEditSheet({ visible, onClose, initial, title, saveLabel, onSave, provider: providerId }: {
  /** Which provider a published copy would live on. */
  provider: string;
  visible: boolean; onClose: () => void; initial?: Partial<SaveCircuitInput> & { publish?: boolean }; title: string; saveLabel: string;
  onSave: (input: CircuitInput) => Promise<string | null>;
}) {
  const provider = getProvider(providerId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_CIRCUIT_COLOR);
  const [isPublic, setPublic] = useState(true);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setName(initial?.name ?? ""); setDescription(initial?.description ?? ""); setColor(initial?.color ?? DEFAULT_CIRCUIT_COLOR); setPublic(initial?.isPublic ?? true); setPublish(initial?.publish ?? true); setError("");
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const input = { borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" } as const;
  const save = async () => {
    setBusy(true); setError("");
    const message = await onSave({ name: name.trim(), description: description.trim(), color, isPublic, publish });
    setBusy(false);
    if (message) setError(message); else onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={
      <View style={{ gap: 8 }}>
        {error ? <Text v="caption" style={{ color: c.danger, textAlign: "center" }} aria-live="polite">{error}</Text> : null}
        <Button label={busy ? "Saving" : saveLabel} disabled={!name.trim() || busy} onPress={() => void save()} />
      </View>
    }>
      <View style={{ gap: 12, marginTop: 8 }}>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={c.placeholder} accessibilityLabel="Circuit name" style={[input, { height: 54 }]} />
        <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor={c.placeholder} multiline accessibilityLabel="Description" style={[input, { minHeight: 72, paddingTop: 14 }]} />
        <Text v="section">Colour</Text>
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {CIRCUIT_COLORS.map((h) => (
            <Pressable key={h} accessibilityRole="radio" accessibilityLabel={`Colour ${h}`} accessibilityState={{ selected: color === h }} onPress={() => setColor(h)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: circuitDisplayColor(h), alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: color === h ? c.text : "transparent" }}>
              {color === h && <Icon name="check" size={20} color="#101416" stroke={3} />}
            </Pressable>
          ))}
        </View>
        {provider.capabilities.circuits ? (
          <>
            <SwitchRow label={`Keep on ${provider.name}`} help={publish
              ? `A copy lives on ${provider.name}'s server, so it shows in the official app too.`
              : initial?.publish ? `Turning this off deletes the copy on ${provider.name}'s server. The circuit stays here.` : "Only on this phone."} value={publish} onChange={setPublish} />
            {publish && provider.capabilities.publicCircuits ? <SwitchRow label="Public" help={isPublic ? "Anyone can find and open it." : "Only you can see it."} value={isPublic} onChange={setPublic} /> : null}
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
