import { useRouter } from "expo-router";
import { useMemo } from "react";
import { View } from "react-native";
import { recentCombos, STYLE_LABEL } from "../core/roped";
import { SETTING_LABEL, wallStyle, type OutsideLog } from "../core/outside";
import { useOutsideLogs } from "../state/outside";
import { useRopedLogs } from "../state/roped";
import { c, r } from "../theme";
import { Icon, type IconName } from "./Icon";
import { SectionLabel, Sheet, Tap } from "./parts";
import { Text } from "./Text";

function Row({ icon, title, hint, onPress }: { icon: IconName; title: string; hint?: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={hint ? `${title}. ${hint}` : title} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Icon name={icon} size={22} color={c.text} />
      <View style={{ flex: 1 }}>
        <Text v="bodyStrong">{title}</Text>
        {hint ? <Text v="caption">{hint}</Text> : null}
      </View>
      <Icon name="chevR" size={18} color={c.muted} />
    </Tap>
  );
}

/** The distinct off-board setting, wall and grade combinations used lately, newest first. */
function recentOffBoard(logs: OutsideLog[], limit: number): OutsideLog[] {
  const seen = new Set<string>();
  const out: OutsideLog[] = [];
  for (const l of logs) {
    const key = [l.setting, l.wall, l.gradeSystem, l.gradeLabel].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length === limit) break;
  }
  return out;
}

/**
 * The one way to add anything: a board climb is logged from the climb itself, so that option goes to the climb list; the others open
 * their forms. Recent rows repeat a past entry (the form opens filled in, dated now).
 */
export function LogPicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const roped = useRopedLogs();
  const offBoard = useOutsideLogs();
  const ropedRecent = useMemo(() => recentCombos(roped, 2), [roped]);
  const offRecent = useMemo(() => recentOffBoard(offBoard, 2), [offBoard]);
  const go = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <Sheet visible={visible} onClose={onClose} title="Log">
      <View style={{ gap: 8 }}>
        <Row icon="board" title="Board climb" hint="Open a climb and log it there" onPress={go(() => router.navigate("/"))} />
        <Row icon="rock" title="Boulder, gym or outdoor" onPress={go(() => router.push("/outside"))} />
        <Row icon="rope" title="Roped" hint="Sport, trad, top rope, autobelay" onPress={go(() => router.push("/roped"))} />
      </View>
      {ropedRecent.length + offRecent.length > 0 ? (
        <>
          <SectionLabel>Recent</SectionLabel>
          <View style={{ gap: 8 }}>
            {ropedRecent.map((l) => (
              <Row key={l.id} icon="rope" title={`${l.gradeLabel} ${STYLE_LABEL[l.style].toLowerCase()}${l.venue ? `, ${l.venue}` : ""}`} hint="Roped, again" onPress={go(() => router.push({ pathname: "/roped", params: { repeat: l.id } }))} />
            ))}
            {offRecent.map((l) => (
              <Row key={l.id} icon="rock" title={`${l.gradeLabel ?? "Ungraded"} ${wallStyle(l.wall).label.toLowerCase()}`} hint={`${SETTING_LABEL[l.setting]}, again`}
                onPress={go(() => router.push({ pathname: "/outside", params: { setting: l.setting, wall: l.wall, ...(l.gradeSystem === "v" && l.gradeLabel ? { grade: l.gradeLabel } : {}), result: "send" } }))} />
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}
