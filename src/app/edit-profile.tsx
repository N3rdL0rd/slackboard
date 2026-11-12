import { useUserId } from "../state/useActive";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { saveProfile, useProfile, type Avatar as AvatarChange } from "../state/social";
import { useStore } from "../state/store";
import { Avatar } from "../ui/Avatar";
import { Button, IconButton, SwitchRow } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

const SIZE = 512;

/** A square, centre-cropped, 512 px JPEG: what the server expects for a profile picture. */
async function squareJpeg(uri: string, width: number, height: number): Promise<string> {
  const side = Math.min(width, height);
  const out = await ImageManipulator.manipulateAsync(
    uri,
    [{ crop: { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side } }, { resize: { width: SIZE, height: SIZE } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  return out.uri;
}

/** Profile picture, name, email, Instagram and whether the account is private. */
export default function EditProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useUserId();
  const { profile } = useProfile(me);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [isPublic, setPublic] = useState(true);
  const [avatar, setAvatar] = useState<AvatarChange>({ kind: "keep" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? ""); setEmail(profile.email ?? ""); setInstagram(profile.instagram ?? ""); setPublic(profile.isPublic);
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (camera: boolean) => {
    setError("");
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError(camera ? "Camera access is off." : "Photo access is off."); return; }
    const res = await (camera ? ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 }));
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    try { setAvatar({ kind: "upload", uri: await squareJpeg(a.uri, a.width, a.height) }); } catch { setError("Couldn't use that photo. Try another."); }
  };

  const save = async () => {
    setBusy(true); setError("");
    const out = await saveProfile({ name, email, instagram, isPublic }, avatar);
    setBusy(false);
    if (!out.ok) { setError(out.message); return; }
    router.back();
  };

  const input = { height: 54, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, paddingHorizontal: 16, fontSize: 17, fontFamily: "Barlow_400Regular" } as const;
  const hasPicture = avatar.kind === "upload" || (avatar.kind === "keep" && !!profile?.avatar);
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
        <Text v="sheetTitle">Edit profile</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", gap: 12 }}>
          <Avatar uri={avatar.kind === "upload" ? avatar.uri : undefined} path={avatar.kind === "clear" ? null : profile?.avatar} name={name || profile?.username || "?"} size={96} />
          {avatar.kind === "upload" && <Text v="caption">New picture chosen. Tap Save to upload it.</Text>}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Button variant="secondary" label="Choose photo" style={{ height: 44, paddingHorizontal: 16 }} onPress={() => void pick(false)} />
            <Button variant="secondary" label="Take photo" style={{ height: 44, paddingHorizontal: 16 }} onPress={() => void pick(true)} />
            {hasPicture && <Button variant="secondary" label="Remove" style={{ height: 44, paddingHorizontal: 16 }} onPress={() => setAvatar({ kind: "clear" })} />}
          </View>
        </View>
        <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={c.placeholder} accessibilityLabel="Name" style={input} />
        <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={c.placeholder} autoCapitalize="none" keyboardType="email-address" accessibilityLabel="Email address" style={input} />
        <TextInput value={instagram} onChangeText={setInstagram} placeholder="Instagram username" placeholderTextColor={c.placeholder} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Instagram username" style={input} />
        <SwitchRow label="Private account" help={isPublic ? "Anyone can follow you." : "People must ask to follow you."} value={!isPublic} onChange={(p) => setPublic(!p)} />
        {error ? <Text v="secondary" style={{ color: c.danger }} aria-live="polite">{error}</Text> : null}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line }}>
        <Button label={busy ? "Saving" : "Save"} disabled={busy || !email.trim()} onPress={() => void save()} />
      </View>
    </View>
  );
}
