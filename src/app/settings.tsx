import { DEFAULT_PROVIDER } from "../providers";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GradeDisplay } from "../core/grades";
import { signOutAll } from "../state/auth";
import { useStore } from "../state/store";
import { deleteUserReq, submit } from "../core/api";
import { sessionFor } from "../state/session";
import { Button, IconButton, Segmented, SectionLabel, Sheet, SwitchRow } from "../ui/parts";
import { Text } from "../ui/Text";
import { c, r, role as roleTokens, type RoleName } from "../theme";

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useStore((x) => x.settings);
  const patch = useStore((x) => x.patchSettings);
  const accounts = useStore((x) => x.accounts);
  const roles: { n: RoleName; l: string }[] = [{ n: "start", l: "Start" }, { n: "middle", l: "Middle" }, { n: "finish", l: "Finish" }, { n: "foot", l: "Foot only" }];
  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text v="sheetTitle">Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 + insets.bottom }}>
        <SectionLabel>Grades</SectionLabel>
        <Segmented<GradeDisplay> options={[{ value: "both", label: "V and Font" }, { value: "v", label: "V only" }, { value: "font", label: "Font only" }]} value={s.gradeDisplay} onChange={(gradeDisplay) => patch({ gradeDisplay })} />

        <SectionLabel>Reading the board</SectionLabel>
        <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 14, borderRadius: r.card, backgroundColor: c.board, borderWidth: 1, borderColor: c.line }}>
          {roles.map(({ n, l }) => {
            const col = s.highContrast ? roleTokens.highContrast : roleTokens[n].color;
            const shape = roleTokens[n].shape as string;
            const show = s.shapes || s.highContrast;
            return (
              <View key={n} style={{ alignItems: "center", gap: 6 }}>
                <View style={{ width: 22, height: 22, borderWidth: 3.5, borderColor: col,
                  borderRadius: !show || shape === "circle" ? 11 : shape === "square" ? 2 : 0, transform: shape === "diamond" && show ? [{ rotate: "45deg" }, { scale: 0.8 }] : [] }} />
                <Text v="caption">{l}</Text>
              </View>
            );
          })}
        </View>
        <SwitchRow label="Shapes as well as colors" value={s.shapes || s.highContrast} onChange={(shapes) => patch({ shapes })} />
        <SwitchRow label="High contrast" help="Chalk-white holds, shapes forced on" value={s.highContrast} onChange={(highContrast) => patch({ highContrast })} />
        <SwitchRow label="Haptics" help="Taps you can feel when swiping, turning the angle dial, logging and during the timer" value={s.haptics !== false} onChange={(haptics) => patch({ haptics })} />
        <SwitchRow label="Auto connect" value={s.autoConnect} onChange={(autoConnect) => patch({ autoConnect })} />
        <SwitchRow label="Train tab" help="A tab for training. Hide it if you only climb; the interval timer stays under You." value={s.trainTab} onChange={(trainTab) => patch({ trainTab })} />

        <SectionLabel>Auto disconnect</SectionLabel>
        <Segmented<string> options={[{ value: "0", label: "Off" }, { value: "30", label: "30 sec" }, { value: "60", label: "1 min" }, { value: "300", label: "5 min" }]}
          value={String(s.autoDisconnectSec)} onChange={(v) => patch({ autoDisconnectSec: Number(v) })} />

        <SectionLabel>Privacy</SectionLabel>
        <SwitchRow label="Log climbs I light up" help={`Each board brand keeps a Recently lit history for each controller. Turn this off and Slackboard won't add the climbs you light up to it.`} value={s.logLit} onChange={(logLit) => patch({ logLit })} />

        <SectionLabel>Accounts</SectionLabel>
        <Pressable accessibilityRole="button" onPress={() => router.push("/accounts")} style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
          <Text v="bodyStrong">Accounts and sign out</Text>
          <Text v="caption">{Object.keys(accounts).length === 1 ? "1 account" : `${Object.keys(accounts).length} accounts`}, one per board brand</Text>
        </Pressable>

        <SectionLabel>About</SectionLabel>
        <Text v="secondary">Slackboard is an independent project and is not affiliated with or endorsed by any board maker.</Text>
      </ScrollView>
    </View>
  );
}
