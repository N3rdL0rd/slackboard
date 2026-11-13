import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { categoryLabel, exerciseById, type Field } from "../../data/exercises";
import { bests, entryText, history, lastTime } from "../../core/training";
import { formatWeight } from "../../core/units";
import { parseStamp } from "../../core/days";
import { useStore } from "../../state/store";
import { useTraining } from "../../state/training";
import { Sparkline } from "../../ui/charts";
import { Button, IconButton, SectionLabel } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

const FIELD_LABEL: Record<Field, string> = { reps: "Reps", loadKg: "Load", timeS: "Hang time", edgeMm: "Edge depth", grip: "Grip" };
const UNIT_WORD = { kg: "heaviest load each session", s: "longest hold each session", reps: "reps each session" } as const;

/** One exercise: how to do it, the safety note, the fields it records, and how it has gone for you. */
export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const entries = useTraining();
  const units = useStore((s) => s.settings.units);
  const ex = exerciseById(id);
  if (!ex) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top, padding: 20 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="secondary" style={{ padding: 16 }}>That exercise isn't in this version of the library.</Text>
      </View>
    );
  }
  const last = lastTime(entries, ex.id);
  const best = bests(entries, ex.id);
  const h = history(entries, ex.id);
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }} numberOfLines={1}>{ex.name}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 + insets.bottom }}>
        <Text v="secondary">{`${categoryLabel(ex.category)} \u00B7 ${ex.equipment} \u00B7 ${ex.level}`}</Text>
        <Text v="body">{ex.howTo}</Text>
        <View style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 4 }}>
          <Text v="bodyStrong">Safety</Text>
          <Text v="secondary">{ex.safety}</Text>
        </View>
        <View>
          <SectionLabel>Records</SectionLabel>
          <Text v="secondary">{ex.fields.map((f) => FIELD_LABEL[f]).join(", ")}</Text>
        </View>
        <View style={{ gap: 6 }}>
          <SectionLabel>How it has gone</SectionLabel>
          {last ? <Text v="body">{`Last: ${entryText(last, units)} (${parseStamp(last.performedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}</Text> : <Text v="secondary">Not done yet.</Text>}
          {best.loadKg !== null ? <Text v="body">Best load: {formatWeight(best.loadKg, units.weight, { signed: true })}</Text> : null}
          {best.timeS !== null ? <Text v="body">Longest hold: {best.timeS} s</Text> : null}
          {h.unit && h.points.length >= 2 ? (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Sparkline values={h.points.map((p) => p.value)} width={width - 32} height={64} />
              <Text v="caption">{UNIT_WORD[h.unit]}</Text>
            </View>
          ) : null}
        </View>
        <Button label="Start a session with this" onPress={() => router.push({ pathname: "/session", params: { ids: ex.id } })} />
      </ScrollView>
    </View>
  );
}
