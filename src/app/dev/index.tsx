import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "../../state/store";
import { Button, IconButton, SectionLabel } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

const ITEMS: { section: string; entries: { title: string; text: string; to: string }[] }[] = [
  {
    section: "Watch",
    entries: [
      { title: "Watch sessions", text: "Recorded sessions, stream health, timeline, labels, the detector and elevation labs, export. Also the link to the watch.", to: "/dev/watch" },
      { title: "Live monitor", text: "What the watch is sending right now, and how fast.", to: "/dev/watch-live" },
    ],
  },
  {
    section: "Boards",
    entries: [
      { title: "Hold survey", text: "Light each hold of the connected board and tag it.", to: "/dev/hold-survey" },
      { title: "Dead holds", text: "Mark holds that are missing, broken or spinning.", to: "/dead-holds" },
    ],
  },
  {
    section: "App",
    entries: [{ title: "Internal values", text: "The numbers the app works out, and why: streak, load, working grade, milestones, plan, data.", to: "/dev/internals" }],
  },
];

/** The developer hub: everything that is for exploring and not for everyday use. Reached from the plus menu once developer settings are on. */
export default function DevHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const patch = useStore((s) => s.patchSettings);
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Developer</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 + insets.bottom }}>
        {ITEMS.map((g) => (
          <View key={g.section} style={{ gap: 8 }}>
            <SectionLabel>{g.section}</SectionLabel>
            {g.entries.map((e) => (
              <Pressable key={e.to} accessibilityRole="button" onPress={() => router.push(e.to as never)}
                style={{ borderRadius: r.card, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, padding: 14, gap: 2 }}>
                <Text v="bodyStrong">{e.title}</Text>
                <Text v="secondary">{e.text}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={{ marginTop: 20 }}>
          <Button variant="secondary" label="Hide the developer menu" onPress={() => { patch({ developer: false }); router.back(); }} />
        </View>
      </ScrollView>
    </View>
  );
}
