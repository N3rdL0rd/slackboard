import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { doneKey } from "../core/mergedLog";
import { makeRef } from "../core/provider";
import { suggest, workingGrade, type StyleSet } from "../core/suggest";
import { angleAdvice, angleForStyle, angleSamples, gymTarget, gymTargetText, outsideEvidence, snapAngle, styleProfile, wallStyle, type WallStyleId } from "../core/outside";
import { useData } from "../state/data";
import { useOutsideLogs } from "../state/outside";
import { setSequence } from "../state/sequence";
import { gradeOfEntry } from "../state/stats";
import { useBoard, useStore } from "../state/store";
import { useSpaceFor } from "../state/spaces";
import { useBoardCandidates } from "../state/useBoardCandidates";
import { ClimbRow } from "../ui/ClimbRow";
import { Button, Chip, IconButton, LinkButton, SwitchRow, Tap } from "../ui/parts";
import { Icon } from "../ui/Icon";
import { haptic } from "../ui/haptics";
import { Text } from "../ui/Text";
import { c, r } from "../theme";

/** "Another": the die tumbles a turn and a half and bounces up as it lands. The animation runs on the UI thread and is skipped under reduce-motion. */
function RollingDice({ onRoll }: { onRoll: () => void }) {
  const t = useRef(new Animated.Value(0)).current;
  const press = () => {
    haptic.light();
    onRoll();
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      t.setValue(0);
      Animated.timing(t, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  };
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] });
  const scale = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1.3, 1] });
  return (
    <Tap accessibilityRole="button" accessibilityLabel="Another suggestion" onPress={press} hitSlop={8}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, paddingLeft: 10, paddingRight: 4 }}>
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
        <Icon name="dice" size={22} color={c.text} />
      </Animated.View>
      <Text v="bodyStrong" style={{ includeFontPadding: false }}>Another</Text>
    </Tap>
  );
}

/** Climbs picked for today from your own logbook, across all your boards. */
export default function Suggestions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useStore((s) => s.settings);
  const logbook = useData((d) => d.logbook);
  const done = useData((d) => d.done);
  const outside = useOutsideLogs();
  const allBoards = useData((d) => d.boards);
  // Where your sends, on the boards and off them, say you have the most to gain; adjustable boards are then shown at that angle.
  const samples = useMemo(() => angleSamples(logbook, outside, gradeOfEntry), [logbook, outside]);
  const advice = useMemo(() => angleAdvice(samples, new Date()), [samples]);
  // The wall angle you send most, and its opposite: "For you" and "Antistyle" show each board at those angles.
  const profile = useMemo(() => styleProfile(samples, new Date()), [samples]);
  // What to try on the gym wall today: a style, tag, angle and grade you have done little of at your level. "Another" asks again.
  const [rerolls, setRerolls] = useState(0);
  const working = useMemo(() => workingGrade(logbook, new Date(), gradeOfEntry, outsideEvidence(outside)), [logbook, outside]);
  const target = useMemo(() => {
    const now = new Date();
    const favoured: WallStyleId[] = [...(advice?.worthTraining ? [advice.weak.style] : []), ...(profile ? [profile.anti] : [])];
    return gymTarget({ logs: outside, working, favoured, now, seed: Math.floor(now.getTime() / 86_400_000) * 100 + rerolls });
  }, [outside, working, advice, profile, rerolls]);
  const logTarget = (result: "send" | "attempt") => {
    if (!target) return;
    router.push({ pathname: "/outside", params: { setting: "gym", wall: target.wall, tag: target.tag, grade: target.gradeLabel, result } });
  };
  const planFor = (style: WallStyleId | undefined) => {
    const overrides: Record<string, number> = {};
    const allowed = new Set<string>();
    if (style) {
      for (const b of allBoards) {
        const a = angleForStyle(style, b.spec.angles, b.angle);
        if (a == null) continue;
        allowed.add(b.id);
        if (b.spec.angles.length >= 2) overrides[b.id] = a;
      }
    }
    return { overrides, allowed };
  };
  const forYouPlan = useMemo(() => planFor(profile?.main), [profile, allBoards]); // eslint-disable-line react-hooks/exhaustive-deps
  const antiPlan = useMemo(() => planFor(profile?.anti), [profile, allBoards]); // eslint-disable-line react-hooks/exhaustive-deps
  const [trainAngle, setTrainAngle] = useState(true);
  const overrides = useMemo(() => {
    const o: Record<string, number> = {};
    if (trainAngle && advice?.worthTraining) for (const b of allBoards) { const a = snapAngle(advice.targetAngle, b.spec.angles); if (a != null) o[b.id] = a; }
    return o;
  }, [trainAngle, advice, allBoards]);
  const base = useBoardCandidates(0, overrides);
  const forYouSet = useBoardCandidates(0, forYouPlan.overrides);
  const antiSet = useBoardCandidates(0, antiPlan.overrides);
  const { candidates, geometry } = base;
  const ready = base.ready && forYouSet.ready && antiSet.ready;
  const board = useBoard();
  const space = useSpaceFor(board?.id);
  const spaceKeys = useMemo(() => new Set(space && space.boards.length > 1 ? space.boards.map((b) => b.id) : []), [space]);
  const [scope, setScope] = useState<"space" | "all" | string>("space");
  const multi = candidates.length > 1;
  // "This space" only means something when the open board shares a space with others; otherwise it is the same as all boards.
  const activeScope = scope === "space" && !spaceKeys.size ? "all" : scope;
  const scoped = activeScope === "space" ? candidates.filter((b) => spaceKeys.has(b.key)) : activeScope === "all" ? candidates : candidates.filter((b) => b.key === activeScope);

  // Your grade comes from every send on every board; only the candidates are narrowed by the board chips.
  const groups = useMemo(() => {
    if (!ready) return [];
    const inScope = new Set(scoped.map((b) => b.key));
    const styleSet = (set: typeof forYouSet, plan: typeof forYouPlan, style: WallStyleId | undefined): StyleSet | null => {
      if (!profile || !style) return null;
      const aim = profile.counts[style] >= 3 ? profile.working[style] ?? null : null;
      return { label: wallStyle(style).label.toLowerCase(), boards: set.candidates.filter((b) => plan.allowed.has(b.key) && inScope.has(b.key)), aim };
    };
    return suggest({
      boards: scoped, logbook, logGrade: gradeOfEntry, now: new Date(), extraGrades: outsideEvidence(outside),
      forYou: styleSet(forYouSet, forYouPlan, profile?.main), anti: styleSet(antiSet, antiPlan, profile?.anti),
    });
  }, [ready, scoped, logbook, outside, profile, forYouSet, antiSet, forYouPlan, antiPlan]);
  const sets = { base: base, foryou: forYouSet, anti: antiSet };
  const flat = useMemo(() => groups.flatMap((g) => g.items.map((i) => makeRef(i.provider, i.climb.uuid))), [groups]);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text v="sheetTitle">Suggested for you</Text>
          <Text v="caption">{multi ? `${candidates.length} boards` : candidates[0] ? `${candidates[0].name}` : " "}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 8, padding: 16, borderRadius: r.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", minHeight: 40 }}>
            <Text v="section" style={{ flex: 1 }}>Try on the gym wall</Text>
            {target ? (
              <RollingDice onRoll={() => setRerolls((n) => n + 1)} />
            ) : null}
          </View>
          {target ? (
            <>
              {/* The three tags say it all on screen; the sentence is kept for screen readers. */}
              <View accessible accessibilityLabel={gymTargetText(target)} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[wallStyle(target.wall).label, target.tag, target.gradeLabel].map((t) => (
                  <View key={t} style={{ paddingHorizontal: 14, height: 38, justifyContent: "center", borderRadius: r.pill, backgroundColor: c.raised }}>
                    <Text v="bodyStrong" style={{ includeFontPadding: false }}>{t}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Log send" style={{ flex: 1, minWidth: 0 }} onPress={() => logTarget("send")} />
                <Button variant="secondary" label="Log attempts" style={{ flex: 1, minWidth: 0 }} onPress={() => logTarget("attempt")} />
              </View>
            </>
          ) : (
            <>
              <Text v="secondary">Log a few graded sends and this will point at the gym styles worth trying.</Text>
              <LinkButton label="Log a gym climb" icon="plus" onPress={() => router.push("/outside")} />
            </>
          )}
          {advice?.worthTraining ? (
            <View style={{ borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 4 }}>
              <SwitchRow label="Train your weakest angle" help={`V${Math.floor(advice.best.working)} ${wallStyle(advice.best.style).label.toLowerCase()}, V${Math.floor(advice.weak.working)} ${wallStyle(advice.weak.style).label.toLowerCase()}. Shows adjustable boards at that angle.`} value={trainAngle} onChange={setTrainAngle} />
            </View>
          ) : null}
        </View>
        {multi && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 52 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 6, alignItems: "center" }}>
            {spaceKeys.size > 0 && <Chip label="This space" selected={activeScope === "space"} onPress={() => setScope("space")} />}
            <Chip label="All boards" selected={activeScope === "all"} onPress={() => setScope("all")} />
            {candidates.map((b) => <Chip key={b.key} label={b.name} selected={activeScope === b.key} onPress={() => setScope(b.key)} />)}
          </ScrollView>
        )}
        {!ready ? <Text v="secondary" style={{ padding: 24 }}>Loading climbs</Text> : groups.length === 0 ? (
          <View style={{ alignItems: "center", padding: 40, gap: 8 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing to suggest</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>You have sent or hidden everything that fits at the angles you view. Try another angle.</Text>
          </View>
        ) : groups.map((g) => (
          <View key={g.key}>
            <View style={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 }}>
              <Text v="section">{g.title}</Text>
              <Text v="caption">{g.blurb}</Text>
            </View>
            {g.items.map((it) => {
              const geo = sets[it.set].geometry.get(it.boardKey);
              const b = sets[it.set].candidates.find((x) => x.key === it.boardKey);
              if (!geo || !b) return null;
              return (
                <ClimbRow key={`${it.boardKey}:${it.climb.uuid}`} climb={it.climb} stat={b.stats.get(it.climb.uuid)} spec={geo.board.spec} placements={geo.placements} roles={geo.roles}
                  done={done.get(doneKey(it.provider, it.climb.uuid, geo.angle))} display={settings.gradeDisplay} shapes={settings.shapes} highContrast={settings.highContrast}
                  note={it.set !== "base" && it.angle != null ? `${multi ? `${it.boardName} \u00B7 ` : ""}${it.angle}\u00B0` : multi ? it.boardName : undefined}
                  onPress={() => { setSequence(flat, "Suggested"); router.push({ pathname: "/climb/[uuid]", params: { uuid: it.climb.uuid, provider: it.provider, angle: String(geo.angle) } }); }} />
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
