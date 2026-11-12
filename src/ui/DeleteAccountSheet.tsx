import { useState } from "react";
import { TextInput } from "react-native";
import { deleteUserReq, submit } from "../core/api";
import { signOutProvider } from "../state/auth";
import { sessionFor } from "../state/session";
import { Button, Sheet, SwitchRow } from "./parts";
import { Text } from "./Text";
import { c, r } from "../theme";

/** Deleting an account is permanent, so it asks for the password and an explicit "I understand". */
export function DeleteAccountSheet({ visible, onClose, provider }: { visible: boolean; onClose: () => void; provider: string }) {
  const [password, setPassword] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    const s = sessionFor(provider);
    if (!s) return;
    setBusy(true); setError("");
    const res = await submit(s, deleteUserReq(s.userId, password));
    setBusy(false);
    if (res.status === "ok") { onClose(); await signOutProvider(provider); return; }
    setError(res.status === "retry" ? "Couldn't reach the server. Check your connection." : (res.status === "rejected" && res.errors && Object.values(res.errors).flat()[0]) || "That password isn't right.");
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Delete account"
      footer={<Button variant="danger" label={busy ? "Deleting" : "Delete my account"} disabled={!password || !ok || busy} onPress={() => void go()} />}>
      <Text v="secondary">This permanently deletes your account, your logbook, boards and circuits. It can't be undone.</Text>
      <TextInput value={password} onChangeText={setPassword} placeholder="Your password" placeholderTextColor={c.placeholder} secureTextEntry accessibilityLabel="Password"
        style={{ height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular", marginTop: 16 }} />
      <SwitchRow label="I understand this can't be undone" value={ok} onChange={setOk} />
      {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
    </Sheet>
  );
}
