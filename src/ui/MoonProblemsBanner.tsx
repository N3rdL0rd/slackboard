import { Pressable, View } from "react-native";
import { targetOfLayout } from "../core/moonSources";
import { ensureProblems, useProblems } from "../state/moonboard";
import { Text } from "./Text";
import { c, r } from "../theme";

/** Shown on a MoonBoard's Climb tab while its problem list is being fetched, or when that failed and can be retried. */
export function MoonProblemsBanner({ layoutId }: { layoutId: number }) {
  const status = useProblems((s) => s.by[layoutId]);
  const name = targetOfLayout(layoutId)?.setup.name;
  if (!name || !status || status.phase === "done") return null;
  const failed = status.phase === "error";
  const label = failed ? `Couldn't get the ${name} problems` : status.phase === "downloading" ? `Downloading the ${name} problems` : `Adding the ${name} problems ${Math.round(status.fraction * 100)}%`;
  return (
    <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: failed ? c.danger : c.line, gap: 8 }}>
      <Text v="bodyStrong">{label}</Text>
      {failed ? (
        <>
          <Text v="caption">{status.error ?? "Check your connection."}</Text>
          <Pressable accessibilityRole="button" onPress={() => void ensureProblems(layoutId)} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text v="bodyStrong">Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" }}>
            <View style={{ width: `${status.phase === "downloading" ? 4 : Math.max(4, status.fraction * 100)}%`, height: 6, backgroundColor: c.text }} />
          </View>
          <Text v="caption">This happens once. You can keep using the app.</Text>
        </>
      )}
    </View>
  );
}
