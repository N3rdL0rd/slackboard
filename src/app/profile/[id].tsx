import { useUserId } from "../../state/useActive";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { circuitDisplayColor } from "../../core/circuits";
import { followButton } from "../../core/social";
import { setFollow, useProfile } from "../../state/social";
import { useStore } from "../../state/store";
import { Avatar } from "../../ui/Avatar";
import { LinkButton, Button, IconButton } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, r } from "../../theme";

/** Someone's profile: picture, counts, follow button, circuits. */
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const { profile, reload } = useProfile(Number(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mine = me === Number(id);

  const toggleFollow = async () => {
    if (!profile || me == null) return;
    const btn = followButton(profile.followState, false);
    if (!btn.action) return;
    setBusy(true); setError("");
    const out = await setFollow(profile.id, me, btn.action);
    setBusy(false);
    if (!out.ok) setError(out.message); else await reload();
  };

  const btn = profile ? followButton(profile.followState, false) : null;
  const hidden = profile && !profile.isPublic && !mine && profile.followState !== "accepted";
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle" style={{ flex: 1 }} numberOfLines={1}>{profile?.username ?? "Profile"}</Text>
        {mine && <IconButton icon="edit" label="Edit profile" onPress={() => router.push("/edit-profile")} />}
      </View>
      {profile === undefined ? <Text v="secondary" style={{ padding: 20 }}>Loading</Text> : profile === null ? <Text v="secondary" style={{ padding: 20 }}>This profile isn't available.</Text> : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Avatar path={profile.avatar} name={profile.name ?? profile.username} size={80} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text v="climbName">{profile.name || profile.username}{profile.verified ? "  ✓" : ""}</Text>
              <Text v="secondary">@{profile.username}</Text>
              {profile.instagram ? <LinkButton external label={`Instagram: ${profile.instagram}`} onPress={() => void Linking.openURL(`https://instagram.com/${profile.instagram}`)} style={{ alignSelf: "flex-start" }} /> : null}
            </View>
          </View>

          {!mine && btn && (
            <Button label={busy ? "Please wait" : btn.label} variant={btn.action === "pending" ? "primary" : "secondary"} disabled={busy || !btn.action} onPress={() => void toggleFollow()} />
          )}
          {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="Followers" value={profile.followers} onPress={hidden ? undefined : () => router.push({ pathname: "/follows/[id]", params: { id: String(profile.id), type: "followers" } })} />
            <Stat label="Following" value={profile.following} onPress={hidden ? undefined : () => router.push({ pathname: "/follows/[id]", params: { id: String(profile.id), type: "followees" } })} />
            <Stat label="Sends logged" value={profile.logbookCount} />
          </View>
          {hidden ? <Text v="secondary">This account is private.</Text> : null}

          {profile.gym && (
            <View style={{ padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 2 }}>
              <Text v="bodyStrong">Gym</Text>
              <Text v="secondary">{[profile.gym.address, profile.gym.city, profile.gym.province].filter(Boolean).join(", ")}</Text>
            </View>
          )}

          {!hidden && profile.circuits.length > 0 && (
            <View style={{ gap: 8 }}>
              <Text v="section">Circuits</Text>
              {profile.circuits.map((ci) => (
                <Pressable key={ci.uuid} accessibilityRole="button" onPress={() => router.push({ pathname: "/circuit/[uuid]", params: { uuid: ci.uuid } })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: circuitDisplayColor(ci.color) }} />
                  <Text v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{ci.name}</Text>
                  <Text v="secondary">{ci.count}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : "text"} disabled={!onPress} onPress={onPress} style={{ flex: 1, backgroundColor: c.card, borderRadius: r.card, padding: 12, borderWidth: 1, borderColor: c.line }}>
      <Text v="numeral" style={{ fontSize: 30 }}>{value}</Text>
      <Text v="caption">{label}</Text>
    </Pressable>
  );
}
