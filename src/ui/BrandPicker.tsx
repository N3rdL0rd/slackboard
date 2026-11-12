import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { Provider } from "../core/provider";
import { Icon } from "./Icon";
import { Sheet } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

/** Search appears once the list is long enough that scanning it is slower than typing. */
const SEARCH_FROM = 6;

/**
 * A closed row showing the chosen brand, which opens a list of every brand: the ones you are signed in to first, then the rest
 * (marked "Sign in"). Scales to any number of brands, where a row of chips would not.
 */
export function BrandPicker({ providers, accounts, value, onPick }: {
  providers: Provider[]; accounts: Record<string, { username: string }>; value: string; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = providers.find((p) => p.id === value) ?? providers[0];
  const match = (p: Provider) => p.name.toLowerCase().includes(q.trim().toLowerCase());
  const mine = useMemo(() => providers.filter((p) => accounts[p.id] && match(p)), [providers, accounts, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const others = useMemo(() => providers.filter((p) => !accounts[p.id] && match(p)), [providers, accounts, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (id: string) => { setOpen(false); setQ(""); onPick(id); };

  const row = (p: Provider) => (
    <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: p.id === current.id }} onPress={() => pick(p.id)}
      style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1.5, borderColor: p.id === current.id ? c.text : c.line, marginBottom: 8 }}>
      <View style={{ flex: 1 }}>
        <Text v="climbName">{p.name}</Text>
        <Text v="caption">{p.kind === "local" ? "No account needed" : accounts[p.id] ? `@${accounts[p.id].username}` : "Not signed in"}</Text>
      </View>
      {p.id === current.id ? <Icon name="check" size={20} color={c.text} /> : !accounts[p.id] && p.kind === "remote" ? <Text v="bodyStrong" style={{ fontSize: 14 }}>Sign in</Text> : null}
    </Pressable>
  );

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Board brand: ${current.name}. Change`} onPress={() => setOpen(true)}
        style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
        <View style={{ flex: 1 }}>
          <Text v="caption">BOARD BRAND</Text>
          <Text v="climbName">{current.name}</Text>
        </View>
        <Text v="bodyStrong" style={{ fontSize: 14 }}>Change</Text>
        <Icon name="chevD" size={20} color={c.muted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Board brand">
        {providers.length >= SEARCH_FROM ? (
          <TextInput value={q} onChangeText={setQ} placeholder="Search brands" placeholderTextColor={c.placeholder} accessibilityLabel="Search brands" autoCorrect={false}
            style={{ height: 48, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 14, fontSize: 16, fontFamily: "Barlow_400Regular", marginBottom: 12 }} />
        ) : null}
        {mine.length > 0 ? <Text v="caption" style={{ marginBottom: 8 }}>YOUR ACCOUNTS</Text> : null}
        {mine.map(row)}
        {others.length > 0 ? <Text v="caption" style={{ marginTop: mine.length ? 8 : 0, marginBottom: 8 }}>MORE BRANDS</Text> : null}
        {others.map(row)}
        {mine.length + others.length === 0 ? <Text v="secondary">No brand matches "{q}".</Text> : null}
      </Sheet>
    </>
  );
}
