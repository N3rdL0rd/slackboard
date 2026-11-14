import { Linking } from "react-native";
import { DOWNLOAD_URL } from "../core/updates";
import { installedVersion, useNewerBuild } from "../state/updates";
import { c, r } from "../theme";
import { Icon } from "./Icon";
import { Tap } from "./parts";
import { Text } from "./Text";
import { View } from "react-native";

/** A newer Android build exists. Tapping opens the download. Nothing when the install is current or the check is off. */
export function UpdateBanner() {
  const n = useNewerBuild();
  if (!n) return null;
  const have = installedVersion();
  return (
    <Tap accessibilityRole="link" accessibilityLabel={`Update available, build ${n.build}. Download`} onPress={() => void Linking.openURL(DOWNLOAD_URL)}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.raised, borderWidth: 1, borderColor: c.lineStrong }}>
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong">Update available</Text>
        <Text v="caption">{`Build ${n.build}${have ? `, you have ${have}` : ""}`}</Text>
      </View>
      <Icon name="share" size={18} color={c.muted} />
    </Tap>
  );
}
