import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../ui/Icon";
import { Button } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

/**
 * The Train tab. Today it holds what already works for training: the interval timer. Sessions, exercises and plans are added to this
 * screen as they are built (see docs/IMPLEMENTATION_PLAN.md); the empty state below is what a new user sees until then.
 */
export default function Train() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, height: 56 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>Train</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <View style={{ padding: 20, gap: 12, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="muscle" size={28} color={c.text} />
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 38, color: c.text }}>Nothing planned yet</Text>
          </View>
          <Text v="secondary">Training sessions, an exercise library and plans will live here. Until they arrive, the interval timer works for hangboard sets and rests.</Text>
          <Button label="Open the interval timer" onPress={() => router.push("/timer")} />
        </View>
        <Text v="caption">Not training? Turn this tab off in Settings.</Text>
      </ScrollView>
    </View>
  );
}
