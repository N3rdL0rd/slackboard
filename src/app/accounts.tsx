import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { providers } from "../providers";
import { signOutProvider } from "../state/auth";
import { removeMoonData } from "../state/moonboard";
import { useStore } from "../state/store";
import { IDLE_SYNC, useSync } from "../state/sync";
import { DeleteAccountSheet } from "../ui/DeleteAccountSheet";
import { LinkButton, Button, IconButton, Sheet } from "../ui/parts";
import { SyncBanner } from "../ui/SyncBanner";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const ago = (t: number) => {
  if (!t) return "not yet this session";
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

/**
 * One row per board brand. Accounts are separate (each brand has its own), but you never switch between them: boards use the
 * right one on their own. This screen is for signing in, signing out and seeing whether a brand needs attention.
 */
export default function Accounts() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useStore((s) => s.accounts);
  const by = useSync((s) => s.by);
  const [signingOut, setSigningOut] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const outName = providers.find((p) => p.id === signingOut)?.name ?? "";

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="screenTitle" style={{ flex: 1 }}>Accounts</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <SyncBanner />
        <Text v="secondary">Each board brand has its own account. Boards use the right one automatically, so there is nothing to switch. Slackboard sends data only to the brand it belongs to.</Text>
        {providers.map((p) => {
          const acc = accounts[p.id];
          const st = by[p.id] ?? IDLE_SYNC;
          const state = !acc ? null : p.kind === "local" ? "On this phone" : st.expired ? "Sign in again" : st.initialDone === false ? "Setting up" : st.running ? "Syncing" : st.error ? "Offline" : "OK";
          return (
            <View key={p.id} style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: st.expired ? c.danger : c.line, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text v="climbName" style={{ flex: 1 }}>{p.name}</Text>
                {state ? <Text v="caption" style={{ color: st.expired ? c.danger : c.text2 }}>{state}</Text> : null}
              </View>
              {p.kind === "local" ? (
                acc ? (
                  <>
                    <Text v="secondary">No account. Boards, problems and logs are kept on this phone only.</Text>
                    <LinkButton danger label={`Remove ${p.name} data`} icon="trash" onPress={() => setRemoving(p.id)} />
                  </>
                ) : (
                  <>
                    <Text v="secondary">No account needed.</Text>
                    <Button variant="secondary" label={`Add a ${p.name}`} onPress={() => router.push({ pathname: "/add-board", params: { provider: p.id } })} />
                  </>
                )
              ) : acc ? (
                <>
                  <Text v="secondary">@{acc.username} · synced {ago(st.lastAt)}</Text>
                  {st.expired ? <Button label="Sign in again" onPress={() => router.push({ pathname: "/welcome", params: { provider: p.id } })} /> : (
                    <Button variant="secondary" label={st.running ? "Syncing" : "Sync now"} disabled={st.running} onPress={() => void useSync.getState().syncNow(p.id)} />
                  )}
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <LinkButton label="Sign out" icon="back" onPress={() => setSigningOut(p.id)} />
                    <LinkButton danger label="Delete account" icon="trash" onPress={() => setDeleting(p.id)} />
                  </View>
                </>
              ) : (
                <>
                  <Text v="secondary">Not signed in.</Text>
                  <Button variant="secondary" label="Sign in" onPress={() => router.push({ pathname: "/welcome", params: { provider: p.id } })} />
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
      <Sheet visible={signingOut != null} onClose={() => setSigningOut(null)} title={`Sign out of ${outName}?`}
        footer={<View style={{ gap: 8 }}>
          <Button variant="danger" label="Sign out" onPress={() => { const p = signingOut!; setSigningOut(null); void signOutProvider(p); }} />
          <Button variant="secondary" label="Cancel" onPress={() => setSigningOut(null)} />
        </View>}>
        <Text v="secondary">This removes {outName}'s data from this phone, including its boards and its copy of the climbs. Your circuits and logs stay, and everything comes back when you sign in again.</Text>
      </Sheet>
      <Sheet visible={removing != null} onClose={() => setRemoving(null)} title="Remove MoonBoard data?"
        footer={<View style={{ gap: 8 }}>
          <Button variant="danger" label="Remove everything" onPress={() => { setRemoving(null); void removeMoonData(); }} />
          <Button variant="secondary" label="Cancel" onPress={() => setRemoving(null)} />
        </View>}>
        <Text v="secondary">This removes your MoonBoard boards, the downloaded problems and every log you made on them from this phone. Nothing is stored anywhere else, so it cannot be restored. Export your data first if you want to keep it.</Text>
      </Sheet>
      {deleting ? <DeleteAccountSheet visible onClose={() => setDeleting(null)} provider={deleting} /> : null}
    </View>
  );
}
