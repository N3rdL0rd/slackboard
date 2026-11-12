import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProvider, providers } from "../providers";
import { useStore } from "../state/store";
import { useActiveProviderId } from "../state/useActive";
import { BrandPicker } from "../ui/BrandPicker";
import { MoonBoardSetup } from "../ui/MoonBoardSetup";
import { IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/**
 * Add a board. Pick the brand first (each brand is its own account), then find your gym or set it up by hand. A brand you are
 * not signed in to asks for its sign-in right here; afterwards you land back on this screen with that brand chosen.
 */
export default function AddBoard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accounts = useStore((s) => s.accounts);
  const active = useActiveProviderId();
  const params = useLocalSearchParams<{ provider?: string }>();
  const [picked, setPicked] = useState(params.provider && (accounts[params.provider] || getProvider(params.provider).kind === "local") ? params.provider : accounts[active] ? active : Object.keys(accounts)[0] ?? active);
  const provider = getProvider(picked);
  const signedIn = !!accounts[provider.id];

  const choose = (id: string) => {
    if (accounts[id] || getProvider(id).kind === "local") { setPicked(id); return; }
    // Sign in first; the root sends the user through the first download and back here with this brand chosen.
    useStore.getState().setPendingLink(`/add-board?provider=${id}`);
    router.push({ pathname: "/welcome", params: { provider: id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
        <Text v="sheetTitle">Add a board</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {providers.length > 1 ? <BrandPicker providers={providers} accounts={accounts} value={picked} onPick={choose} /> : null}
        {provider.kind === "local" ? <MoonBoardSetup /> : (
          <>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/find-gym", params: { provider: provider.id } })}
          style={{ padding: 18, borderRadius: r.card, backgroundColor: c.card, borderWidth: 2, borderColor: c.text, gap: 4 }}>
          <Text v="climbName">Find my gym</Text>
          <Text v="secondary">Pick your gym on the map. Its {provider.name} is added to your account, named after the gym, with the right size, holds and angle.</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/add-board-manual", params: { provider: provider.id } })}
          style={{ padding: 18, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 4 }}>
          <Text v="climbName">Set up by hand</Text>
          <Text v="secondary">For a board at home or one that isn't listed: choose the layout, size and hold sets yourself.</Text>
        </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}
