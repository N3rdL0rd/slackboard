import { Image, View } from "react-native";
import { avatarUrl } from "../core/feed";
import { useActiveProvider } from "../state/useActive";
import { c } from "../theme";
import { Text } from "./Text";

/** Profile picture from the server, or the first letter of the name on a plain disc. */
export function Avatar({ path, uri: local, name, size = 40 }: { path?: string | null; /** A local file or full URL; wins over `path`. */ uri?: string; name: string; size?: number }) {
  const imgHost = useActiveProvider().imgHost;
  const uri = local ?? avatarUrl(path ?? null, imgHost);
  return uri ? (
    <Image source={{ uri }} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.raised }} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: "BarlowCondensed_700Bold", fontSize: size * 0.45, color: c.text }}>{(name[0] ?? "?").toUpperCase()}</Text>
    </View>
  );
}
