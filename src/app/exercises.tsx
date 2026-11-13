import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExerciseList } from "../ui/ExerciseList";
import { IconButton } from "../ui/parts";
import { Text } from "../ui/Text";
import { c } from "../theme";

/** The exercise library: search, filter by category, and open one for how to do it and how it has gone for you. */
export default function Exercises() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }}>Exercises</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <ExerciseList onPress={(e) => router.push({ pathname: "/exercise/[id]", params: { id: e.id } })} />
      </ScrollView>
    </View>
  );
}
