import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as repo from "../../core/repo";
import { getDb } from "../../data/sqlite";
import { IconButton } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

/** Beta videos for a climb. They are Instagram posts, so they open in the browser or the Instagram app. */
export default function Beta() {
  const { uuid, name } = useLocalSearchParams<{ uuid: string; name?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<repo.BetaRow[] | null>(null);
  useEffect(() => { void getDb().then((db) => repo.betaLinks(db, uuid)).then(setRows); }, [uuid]);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text v="sheetTitle">Beta videos</Text>
          {name ? <Text v="caption" numberOfLines={1}>{name}</Text> : null}
        </View>
      </View>
      <JumpList
        data={rows ?? []}
        keyExtractor={(x) => x.link}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={<Text v="secondary" style={{ padding: 16 }}>{rows ? "Nobody has shared beta for this climb yet." : "Loading"}</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="link" accessibilityLabel={`Beta video${item.username ? ` by ${item.username}` : ""}`} onPress={() => void Linking.openURL(item.link)}
            style={{ flexDirection: "row", gap: 12, padding: 10, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center" }}>
            {item.thumbnail ? <Image source={{ uri: item.thumbnail }} accessibilityIgnoresInvertColors style={{ width: 84, height: 84, borderRadius: r.thumb, backgroundColor: c.raised }} /> : <View style={{ width: 84, height: 84, borderRadius: r.thumb, backgroundColor: c.raised }} />}
            <View style={{ flex: 1, gap: 2 }}>
              <Text v="bodyStrong" numberOfLines={1}>{item.username ?? "Instagram"}</Text>
              <Text v="secondary">{item.angle != null ? `Filmed at ${item.angle}°` : "Any angle"}</Text>
              <Text v="caption">Opens Instagram</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
