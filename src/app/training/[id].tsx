import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseStamp } from "../../core/days";
import { entryName, setText } from "../../core/training";
import { exerciseById } from "../../data/exercises";
import { useStore } from "../../state/store";
import { useTraining, useTrainingStore } from "../../state/training";
import { Button, IconButton, LinkButton, SectionLabel, Sheet } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

/** One logged exercise: its sets as they were done. It can be deleted; to change it, log the session again. */
export default function TrainingEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entries = useTraining();
  const units = useStore((s) => s.settings.units);
  const [confirm, setConfirm] = useState(false);
  const e = entries.find((x) => x.id === id);
  const remove = async () => { await useTrainingStore.getState().remove(id); setConfirm(false); router.back(); };
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }} numberOfLines={1}>{e ? entryName(e) : "Training"}</Text>
      </View>
      {!e ? (
        <Text v="secondary" style={{ padding: 20 }}>That entry isn't on this phone any more.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 + insets.bottom }}>
          <Text v="secondary">{`${parseStamp(e.performedAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}${e.effort !== null ? ` \u00B7 effort ${e.effort} of 10` : ""}`}</Text>
          <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
            {e.sets.map((s, i) => (
              <View key={s.position} style={{ padding: 14, flexDirection: "row", gap: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider }}>
                <Text v="numeral" style={{ width: 28 }}>{i + 1}</Text>
                <Text v="body" style={{ flex: 1 }}>{setText(s, units) || "Done"}</Text>
              </View>
            ))}
          </View>
          {e.note ? <View style={{ gap: 4 }}><SectionLabel>Note</SectionLabel><Text v="body">{e.note}</Text></View> : null}
          {exerciseById(e.exerciseId) ? <Button variant="secondary" label="About this exercise" onPress={() => router.push({ pathname: "/exercise/[id]", params: { id: e.exerciseId } })} /> : null}
          <LinkButton label="Delete this entry" icon="trash" danger onPress={() => setConfirm(true)} />
        </ScrollView>
      )}
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title="Delete this entry?"
        footer={<Button variant="danger" label="Delete" onPress={() => void remove()} />}>
        <Text v="secondary">It is removed from your log and your training history. This can't be undone.</Text>
      </Sheet>
    </View>
  );
}
