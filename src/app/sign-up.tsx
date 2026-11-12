import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { signUp } from "../core/api";
import { completeSignIn } from "../state/auth";
import { getProvider } from "../providers";
import { LinkButton, Button, IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const MESSAGES = { invalid: "Check the highlighted details.", rate_limited: "Too many attempts. Wait a minute and try again.", network: "Couldn't reach the server. Check your connection.", server: "The server had a problem. Try again shortly." };

/** Create an account. There is no mailing-list option: nothing is ever subscribed. */
export default function SignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const provider = getProvider(useLocalSearchParams<{ provider?: string }>().provider);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");

  const submit = async () => {
    setBusy(true); setErrors({}); setMessage("");
    const res = await signUp({ username: username.trim(), password, email: email.trim() }, undefined, provider.host);
    setBusy(false);
    if (res.ok) { await completeSignIn(provider.id, username.trim(), res.token, res.userId); router.replace("/"); return; }
    setErrors(res.fieldErrors ?? {});
    setMessage(MESSAGES[res.reason]);
  };

  const field = (key: string) => errors[key]?.[0];
  const input = (bad: boolean) => ({ height: 54, borderRadius: r.input, borderWidth: 1, borderColor: bad ? c.danger : c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" }) as const;
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Create a {provider.name} account</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 8, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <TextInput value={username} onChangeText={setUsername} placeholder="Username" placeholderTextColor={c.placeholder} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Username" style={input(!!field("username"))} />
        {field("username") ? <Text v="caption" style={{ color: c.danger }}>{field("username")}</Text> : null}
        <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={c.placeholder} autoCapitalize="none" keyboardType="email-address" accessibilityLabel="Email address" style={input(!!field("email_address"))} />
        {field("email_address") ? <Text v="caption" style={{ color: c.danger }}>{field("email_address")}</Text> : null}
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={c.placeholder} secureTextEntry accessibilityLabel="Password" style={input(!!field("password"))} />
        {field("password") ? <Text v="caption" style={{ color: c.danger }}>{field("password")}</Text> : null}
        {message ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{message}</Text> : null}
        <View style={{ height: 8 }} />
        <Button label={busy ? "Creating" : "Create account"} disabled={busy || !username.trim() || !email.trim() || !password} onPress={() => void submit()} />
        <Text v="caption" style={{ textAlign: "center", marginTop: 8 }}>By creating an account you accept {provider.name}'s terms and privacy policy.</Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <LinkButton external label="Terms of Use" onPress={() => void Linking.openURL(provider.links.terms)} />
          <LinkButton external label="Privacy Policy" onPress={() => void Linking.openURL(provider.links.privacy)} />
        </View>
      </ScrollView>
    </View>
  );
}
