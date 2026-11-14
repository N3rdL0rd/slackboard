import { UpdateBanner } from "../../ui/UpdateBanner";
import { usePermissions, useUserId, useUsername } from "../../state/useActive";
import { getProvider } from "../../providers";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { boardColor } from "../../core/boards";
import { circuitDisplayColor } from "../../core/circuits";
import { useData } from "../../state/data";
import { useGoals } from "../../state/goals";
import { useLitHistory } from "../../state/litHistory";
import { useOutsideLogs } from "../../state/outside";
import { useRopedLogs } from "../../state/roped";
import { useProfile } from "../../state/social";
import { useBoard, useStore } from "../../state/store";
import { Avatar } from "../../ui/Avatar";
import { Icon } from "../../ui/Icon";
import { IconButton, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

export default function You() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const username = useUsername();
  const setBoard = useStore((s) => s.setBoard);
  const boards = useData((d) => d.boards);
  const circuits = useData((d) => d.circuits);
  const logbook = useData((d) => d.logbook);
  const outside = useOutsideLogs();
  const roped = useRopedLogs();
  const lit = useLitHistory();
  const permissions = usePermissions();
  const accounts = useStore((s) => s.accounts);
  const blockedCount = useData((d) => d.blocked.size);
  const current = useBoard();
  const { profile } = useProfile(me);

  const goals = useGoals();
  const canSet = permissions.has("set_boulder") || permissions.has("set_route");
  const caps = getProvider(current?.spec.provider).capabilities;
  const shortcuts: { label: string; value?: string; to: () => void }[] = [
    { label: "Stats", to: () => router.push("/stats") },
    { label: "Weekly review", to: () => router.push("/review") },
    { label: "Year in review", to: () => router.push("/year-review") },
    { label: "Goals", value: String(goals.filter((g) => g.status === "active").length), to: () => router.push("/goals") },
    { label: "Log", value: String(logbook.length), to: () => router.navigate("/log") },
    { label: "Off-board climbs", value: String(outside.length), to: () => router.push("/off-board") },
    { label: "Roped climbs", value: String(roped.length), to: () => router.push("/roped-climbs") },
    { label: "Lit history", value: String(lit.length), to: () => router.push("/lit-history") },
    { label: "Circuits", value: String(circuits.length), to: () => router.push("/circuits") },
    ...(canSet ? [{ label: "Drafts you set", to: () => router.push("/drafts") }] : []),
    ...(current?.serial && caps.litHistory ? [{ label: "Recently lit", to: () => router.push("/recently-lit") }] : []),
    ...(caps.workouts ? [{ label: "Climb workouts", to: () => router.push("/climb-workouts") }] : []),
    { label: "Interval timer", to: () => router.push("/timer") },
    ...(blockedCount > 0 ? [{ label: "Blocked climbs", value: String(blockedCount), to: () => router.push("/blocked") }] : []),
    ...(caps.leaderboards ? [{ label: "Leaderboards", to: () => router.push("/leaderboards") }] : []),
    { label: "Accounts", value: String(Object.keys(accounts).length), to: () => router.push("/accounts") },
    { label: "Export your data", to: () => router.push("/export") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 }}>
        <Text v="screenTitle" style={{ flex: 1 }}>You</Text>
        <IconButton icon="gear" label="Settings" onPress={() => router.push("/settings")} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 24 }}>
        <UpdateBanner />
        <Tap accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => me != null && router.push({ pathname: "/profile/[id]", params: { id: String(me) } })} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar path={profile?.avatar} name={profile?.name || username} size={64} />
          <View style={{ flex: 1 }}>
            <Text v="climbName" numberOfLines={1}>{profile?.name || username}</Text>
            <Text v="secondary">@{username}</Text>
          </View>
          <IconButton icon="edit" label="Edit profile" onPress={() => router.push("/edit-profile")} />
        </Tap>
        {profile && (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="Followers" value={profile.followers} onPress={() => router.push({ pathname: "/follows/[id]", params: { id: String(profile.id), type: "followers" } })} />
            <Stat label="Following" value={profile.following} onPress={() => router.push({ pathname: "/follows/[id]", params: { id: String(profile.id), type: "followees" } })} />
          </View>
        )}
        {profile && profile.followRequests > 0 && (
          <Tap accessibilityRole="button" onPress={() => router.push("/activity")} style={{ padding: 14, borderRadius: r.card, backgroundColor: c.raised, borderWidth: 1, borderColor: c.lineStrong }}>
            <Text v="bodyStrong">{profile.followRequests} follow {profile.followRequests === 1 ? "request" : "requests"}</Text>
            <Text v="caption">Open Activity to accept or decline</Text>
          </Tap>
        )}

        <View style={{ gap: 8 }}>
          <Text v="section">My boards</Text>
          {boards.map((b) => (
            <Tap key={b.id} accessibilityRole="button" onPress={() => { setBoard(b.id); router.navigate("/"); }}
              style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: b.id === current?.id ? c.text : c.line }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: boardColor(b.id) }} />
                <View style={{ flex: 1 }}>
                  <Text v="climbName">{b.name}</Text>
                  <Text v="secondary">{b.spec.layoutName} · {b.spec.sizeName}</Text>
                </View>
                <IconButton icon="edit" label={`Edit ${b.name}`} onPress={() => router.push({ pathname: "/edit-board", params: { uuid: b.id } })} />
              </View>
            </Tap>
          ))}
          <Tap accessibilityRole="button" onPress={() => router.push("/add-board")}
            style={{ padding: 14, borderRadius: r.card, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.lineStrong, alignItems: "center" }}>
            <Text v="bodyStrong">Add a board</Text>
          </Tap>
        </View>

        <View style={{ gap: 8 }}>
          {shortcuts.map((s) => (
            <Tap key={s.label} accessibilityRole="button" onPress={s.to} style={{ flexDirection: "row", alignItems: "center", padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
              <Text v="bodyStrong" style={{ flex: 1 }}>{s.label}</Text>
              {s.value ? <Text v="secondary">{s.value}</Text> : null}
              <Icon name="chevR" size={20} color={c.muted} />
            </Tap>
          ))}
        </View>
        {circuits.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {circuits.slice(0, 6).map((ci) => (
              <Tap key={ci.uuid} accessibilityRole="button" onPress={() => router.push({ pathname: "/circuit/[uuid]", params: { uuid: ci.uuid } })}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingHorizontal: 12, borderRadius: r.pill, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: circuitDisplayColor(ci.color) }} />
                <Text v="bodyStrong" style={{ fontSize: 14 }}>{ci.name}</Text>
              </Tap>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ flex: 1, backgroundColor: c.card, borderRadius: r.card, padding: 12, borderWidth: 1, borderColor: c.line }}>
      <Text v="numeral" style={{ fontSize: 30 }}>{value}</Text>
      <Text v="caption">{label}</Text>
    </Tap>
  );
}
