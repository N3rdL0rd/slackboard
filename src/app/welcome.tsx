import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Pressable } from "react-native";
import { TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signIn } from "../core/api";
import { completeSignIn } from "../state/auth";
import { startLocalAccount } from "../state/moonboard";
import { useStore } from "../state/store";
import { getProvider, providers } from "../providers";
import { Button, IconButton, LinkButton } from "../ui/parts";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const MESSAGES = {
  invalid: "That username and password didn't match.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  network: "Couldn't reach the server. Check your connection.",
  server: "The server had a problem. Try again shortly.",
};

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useStore((s) => s.accounts);
  const params = useLocalSearchParams<{ provider?: string }>();
  const signedInCount = Object.keys(accounts).length;
  // Brands you are not signed in to yet; the one named in the link (signing in again) is always offered.
  const offered = providers.filter((p) => !accounts[p.id] || p.id === params.provider);
  const [picked, setPicked] = useState<string | null>(params.provider ?? (offered.length === 1 && getProvider(offered[0].id).kind === "remote" ? offered[0].id : null));
  const provider = picked ? getProvider(picked) : null;
  const [filter, setFilter] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A local brand has no sign-in: create the local user and go straight to choosing the setup.
  const choose = async (id: string) => {
    if (getProvider(id).kind === "remote") { setPicked(id); return; }
    await startLocalAccount();
    router.replace({ pathname: "/add-board", params: { provider: id } });
  };

  const submit = async () => {
    if (!provider) return;
    setBusy(true); setError("");
    const res = await signIn(username.trim(), password, undefined, provider.host);
    setBusy(false);
    if (res.ok) { await completeSignIn(provider.id, username.trim(), res.token, res.userId); router.replace("/"); }
    else setError(res.fieldErrors ? Object.values(res.fieldErrors).flat()[0] ?? MESSAGES.invalid : MESSAGES[res.reason]);
  };

  const input = { height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" } as const;
  // One place for leaving: back to the brand list from a brand's form, otherwise close (only when there is somewhere to return to).
  const backToBrands = !!provider && offered.length > 1;
  const canClose = !backToBrands && signedInCount > 0;
  useEffect(() => {
    if (!backToBrands) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { setPicked(null); return true; });
    return () => sub.remove();
  }, [backToBrands]);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, padding: 24, paddingTop: insets.top + 4, paddingBottom: insets.bottom + 16 }}>
      <View style={{ height: 52, marginLeft: -16, marginBottom: 8, justifyContent: "center", alignItems: "flex-start" }}>
        {backToBrands ? <IconButton icon="back" label="Choose another board" onPress={() => setPicked(null)} /> : canClose ? <IconButton icon="close" label="Close" onPress={() => router.back()} /> : null}
      </View>
      {!provider ? (      <Svg width={260} height={64} viewBox="0 0 260 64" fill="none" accessibilityLabel="slackboard mark">
        <Path d="M12 10 Q130 92 248 10" stroke="#EDEBE4" strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
        <Circle cx={12} cy={10} r={6} fill="#EDEBE4" />
        <Circle cx={248} cy={10} r={6} fill="#EDEBE4" />
      </Svg>) : null}
      <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: provider ? 36 : 52, lineHeight: provider ? 44 : 64, color: c.text, marginTop: provider ? 0 : 8 }}>slackboard</Text>
      <Text v="secondary" style={{ marginTop: 2 }}>Less tension. More sending.</Text>

      {!provider ? (
        <View style={{ gap: 10, marginTop: 28 }}>
          <Text style={{ fontSize: 26, lineHeight: 34, color: c.text, fontFamily: "BarlowCondensed_700Bold" }}>Choose your board</Text>
          {offered.length >= 6 ? <TextInput value={filter} onChangeText={setFilter} placeholder="Search brands" placeholderTextColor={c.placeholder} accessibilityLabel="Search brands" autoCorrect={false} style={input} /> : null}
          {offered.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase())).map((p) => (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => void choose(p.id)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1.5, borderColor: c.lineStrong }}>
              <View style={{ flex: 1 }}>
                <Text v="climbName">{p.name}</Text>
                {p.kind === "local" ? <Text v="caption">No account. Problems download by themselves.</Text> : null}
              </View>
              <Icon name="chevR" size={20} color={c.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 28 }}>
          <Text style={{ fontSize: 32, lineHeight: 40, color: c.text, fontFamily: "BarlowCondensed_700Bold" }}>{provider.name}</Text>
          <TextInput value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor={c.placeholder} autoCapitalize="none" autoCorrect={false}
            accessibilityLabel="Username" style={input} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={c.placeholder} secureTextEntry
            accessibilityLabel="Password" style={input} onSubmitEditing={submit} />
          {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
          <Button label={busy ? "Signing in" : "Login"} disabled={busy || !username || !password} onPress={submit} />
          <LinkButton label="Forgot password?" icon="chevR" onPress={() => router.push({ pathname: "/forgot-password", params: { provider: provider.id } })} />
          <Button variant="secondary" label="Create account" onPress={() => router.push({ pathname: "/sign-up", params: { provider: provider.id } })} />
        </View>
      )}
      <View style={{ flex: 1 }} />
      <Text v="caption" style={{ textAlign: "center" }}>Your login goes straight to the board brand and is stored only on this phone.</Text>
      <Text v="caption" style={{ textAlign: "center", marginTop: 6 }}>
        Slackboard is an independent project and is not affiliated with or endorsed by any board maker.
      </Text>
    </View>
  );
}
