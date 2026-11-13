import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { CATEGORIES, EXERCISES, searchExercises, type Category, type Exercise } from "../data/exercises";
import { entryText, lastTime } from "../core/training";
import { useStore } from "../state/store";
import { useTraining } from "../state/training";
import { c, r } from "../theme";
import { Icon } from "./Icon";
import { Chip, Tap } from "./parts";
import { Text } from "./Text";

/**
 * The library as a list: a search box, category chips, and a row per exercise with what the user did last time. The caller supplies what
 * a tap does and, optionally, a mark at the end of the row (a check for a selection). The caller scrolls it.
 */
export function ExerciseList({ onPress, trailing }: { onPress: (e: Exercise) => void; trailing?: (e: Exercise) => ReactNode }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const entries = useTraining();
  const units = useStore((s) => s.settings.units);
  const list = useMemo(() => searchExercises(EXERCISES, query, category), [query, category]);
  return (
    <View style={{ gap: 12 }}>
      <TextInput
        value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={c.placeholder} accessibilityLabel="Search exercises"
        autoCapitalize="none" autoCorrect={false}
        style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, fontSize: 16 }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
        {CATEGORIES.map((x) => <Chip key={x.value} label={x.label} selected={category === x.value} onPress={() => setCategory(category === x.value ? null : x.value)} />)}
      </ScrollView>
      <View style={{ borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
        {list.length === 0 ? <Text v="secondary" style={{ padding: 16 }}>Nothing matches.</Text> : null}
        {list.map((e, i) => {
          const last = lastTime(entries, e.id);
          return (
            <Tap key={e.id} accessibilityRole="button" accessibilityLabel={e.name} onPress={() => onPress(e)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.divider }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text v="climbName" numberOfLines={1}>{e.name}</Text>
                <Text v="secondary" numberOfLines={2}>{e.equipment}{last ? ` \u00B7 Last: ${entryText(last, units)}` : ""}</Text>
              </View>
              {trailing ? trailing(e) : <Icon name="chevR" size={20} color={c.muted} />}
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
