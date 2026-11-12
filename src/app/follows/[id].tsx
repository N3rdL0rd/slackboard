import { useUserId } from "../../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get } from "../../core/api";
import { parsePerson, type Person } from "../../core/feed";
import { sessionFor } from "../../state/session";
import { useStore } from "../../state/store";
import { Avatar } from "../../ui/Avatar";
import { IconButton } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c } from "../../theme";

/** Who follows someone, or who they follow. */
export default function Follows() {
  const { id, type } = useLocalSearchParams<{ id: string; type: "followers" | "followees" }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const [people, setPeople] = useState<Person[] | null>(null);
  useEffect(() => {
    const s = sessionFor();
    if (!s) return;
    void get(s, `/users/${id}/${type}`).then((j) => setPeople(((j?.users as unknown[]) ?? []).flatMap((u) => parsePerson(u as never) ?? [])));
  }, [id, type, me]);
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">{type === "followers" ? "Followers" : "Following"}</Text>
      </View>
      <JumpList data={people ?? []} keyExtractor={(p) => String(p.id)} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={<Text v="secondary" style={{ padding: 20 }}>{people ? "Nobody yet." : "Loading"}</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/profile/[id]", params: { id: String(item.id) } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, minHeight: 64, borderBottomWidth: 1, borderBottomColor: c.divider }}>
            <Avatar path={item.avatar} name={item.username} />
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong" numberOfLines={1}>{item.name || item.username}</Text>
              <Text v="caption">@{item.username}</Text>
            </View>
          </Pressable>
        )} />
    </View>
  );
}
