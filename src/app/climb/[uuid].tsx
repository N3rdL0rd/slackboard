import { useKeepAwake } from "expo-keep-awake";
import { useCanSet, useUsername } from "../../state/useActive";
import { DEFAULT_PROVIDER, getProvider } from "../../providers";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, ScrollView, Share, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseFrames, type Frame } from "../../core/frames";
import type { GradeDisplay } from "../../core/grades";
import { haptic } from "../../ui/haptics";
import { localStamp, type SendFacts, type ShareFacts, type ShareKind } from "../../core/shareCard";
import { ShareSheet } from "../../ui/ShareCard";
import { Confetti } from "../../ui/Confetti";
import { celebrationFor, type Celebration } from "../../core/celebrate";
import { difficultyOf, isClassic } from "../../core/filters";
import { isRoute } from "../../core/types";
import * as repo from "../../core/repo";
import type { AngleStat, BoardSpec, Climb, Placement, Role } from "../../core/types";
import { grades } from "../../data/grades";
import { getDb } from "../../data/sqlite";
import { LOCAL_SETTER } from "../../core/moonLocal";
import { useData } from "../../state/data";
import { holesFor } from "../../core/led";
import { lightBoard } from "../../state/ble";
import { useGeometry } from "../../state/layouts";
import { useLedStatus } from "../../state/useLedStatus";
import { useProviderContext } from "../../state/useActive";
import { useSequence } from "../../state/sequence";
import { deleteClimb, reportClimb } from "../../state/climbActions";
import { showBluetooth } from "../../state/bluetoothTray";
import { logSend, setTag, undoLog, type Logged } from "../../state/serverSends";
import { useStore, useBoard } from "../../state/store";
import { vOf } from "../../core/milestones";
import { gradeOfEntry } from "../../state/stats";
import { useToastMilestone } from "../../state/today";
import { useClimbList } from "../../state/useClimbList";
import { BoardView, boardHeight } from "../../ui/BoardView";
import { ZoomView } from "../../ui/ZoomView";
import { Icon } from "../../ui/Icon";
import { LogSheet } from "../../ui/LogSheet";
import { Button, Chip, ClassicTag, GradeChip, IconButton, Sheet, Spinner, Stars, Tap } from "../../ui/parts";
import { Text } from "../../ui/Text";
import { c, font, r, role as roleTokens, type RoleName } from "../../theme";

const ROLE_ORDER: { name: RoleName; label: string }[] = [
  { name: "start", label: "Start" }, { name: "middle", label: "Middle" }, { name: "finish", label: "Finish" }, { name: "foot", label: "Foot only" },
];

/** Height of a page's name, setter, stars and grade block. Fixed (the name never wraps), so every page of the pager lines up. */
const HEADER_H = 112;

/**
 * One climb's name, grade and board: a page of the swipe pager. The next and previous climb are rendered as pages too, so they
 * are on screen, complete, while the finger is still moving. Only the current page is interactive and plays frames.
 */
function ClimbTop({ climb, stat, viewAngle, spec, placements, roles, boardW, frame, mirror, index, count, counterLabel, shapes, highContrast, gradeDisplay, onGo, onToggleMirror, onZoomedChange }: {
  climb: Climb; stat: AngleStat | undefined; viewAngle: number; spec: BoardSpec; placements: Placement[]; roles: Role[]; boardW: number;
  /** The frame to show; a page that is not the current one shows its first. */
  frame: Frame | undefined; mirror: boolean; index: number; count: number; counterLabel: string | null | undefined;
  shapes: boolean; highContrast: boolean; gradeDisplay: GradeDisplay;
  onGo: (delta: number) => void; onToggleMirror: () => void; onZoomedChange: (zoomed: boolean) => void;
}) {
  const d = difficultyOf(stat);
  const label = d != null ? grades.label(d, gradeDisplay, isRoute(climb)) : null;
  const first = useMemo(() => parseFrames(climb.frames)[0], [climb.frames]);
  const shown = frame ?? first;
  frame = shown;
  return (
    <View style={{ paddingHorizontal: 16 }}>
        <View style={{ flexDirection: "row", gap: 12, height: HEADER_H, overflow: "hidden" }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text v="climbNameView" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{climb.name}</Text>
            <Text v="secondary">Set by {climb.setter}{stat ? (stat[2] > 0 ? ` · ${stat[2]} ${stat[2] === 1 ? "send" : "sends"} at ${viewAngle}°` : ` · ${viewAngle}°`) : ` · project at ${viewAngle}°`}</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 2 }}>
              {stat && stat[2] > 0 && <Stars value={stat[3]} size={16} />}
              {isClassic(stat) && <ClassicTag />}
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {label && d != null ? (
              <>
                <GradeChip large band={grades.band(d)} label={label.primary} />
                {label.secondary ? <Text v="caption" style={{ marginTop: 3 }}>{label.secondary}</Text> : null}
              </>
            ) : (
              <Text v="bodyStrong" style={{ color: c.muted }}>Project</Text>
            )}
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <ZoomView width={boardW} height={boardHeight(spec, boardW)} resetKey={climb.uuid} onZoomedChange={onZoomedChange}>
            <BoardView spec={spec} placements={placements} roles={roles} images={spec.images} width={boardW} frame={frame} mirror={mirror} shapes={shapes} highContrast={highContrast} />
          </ZoomView>
          <View style={{ position: "absolute", left: 8, right: 8, top: 8, flexDirection: "row", alignItems: "center" }}>
            {spec.isMirrored && (
              <Tap accessibilityRole="togglebutton" accessibilityState={{ selected: mirror }} accessibilityLabel="Mirror" onPress={onToggleMirror}
                style={{ flexDirection: "row", gap: 6, alignItems: "center", height: 40, paddingHorizontal: 12, borderRadius: r.pill, backgroundColor: mirror ? c.text : c.card, borderWidth: 1, borderColor: c.lineStrong }}>
                <Icon name="mirror" size={18} color={mirror ? c.btnText : c.text} />
                <Text v="bodyStrong" style={{ fontSize: 14, color: mirror ? c.btnText : c.text }}>Mirror</Text>
              </Tap>
            )}
            <View style={{ flex: 1 }} />
            {index >= 0 && <View style={{ height: 32, paddingHorizontal: 10, borderRadius: r.pill, backgroundColor: c.card, justifyContent: "center" }}>
              <Text v="caption" style={{ color: c.text2 }}>{counterLabel ? `${counterLabel} · ` : ""}{index + 1} of {count}</Text>
            </View>}
          </View>
          <View style={{ position: "absolute", left: 4, right: 4, bottom: 6, flexDirection: "row" }}>
            <Tap accessibilityRole="button" accessibilityLabel="Previous climb" disabled={index <= 0} onPress={() => onGo(-1)}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: index <= 0 ? 0.35 : 1 }}>
              <Icon name="chevL" />
            </Tap>
            <View style={{ flex: 1 }} />
            <Tap accessibilityRole="button" accessibilityLabel="Next climb" disabled={index < 0 || index >= count - 1} onPress={() => onGo(1)}
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, alignItems: "center", justifyContent: "center", opacity: index < 0 || index >= count - 1 ? 0.35 : 1 }}>
              <Icon name="chevR" />
            </Tap>
          </View>
        </View>
    </View>
  );
}

const noop = () => {};

export default function ClimbView() {
  const { uuid, provider: routeProvider, angle: routeAngle } = useLocalSearchParams<{ uuid: string; provider?: string; angle?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const board = useBoard();
  const { list, stats } = useClimbList();
  const boardData = useData((d) => d.boardData);
  const liked = useData((d) => d.liked);
  const logbook = useData((d) => d.logbook);
  const settings = useStore((s) => s.settings);

  const [current, setCurrent] = useState(uuid.toUpperCase());
  // The run of climbs to page through: a circuit, workout or search the climb was opened from, else the filtered list.
  const seq = useSequence((q) => q.ids);
  const seqLabel = useSequence((q) => q.label);
  const seqProviders = useSequence((q) => q.providers);
  // The climb's own provider (it may be on another brand than the open board): its database, account and layouts apply here.
  useProviderContext(seqProviders[current] ?? routeProvider);
  const climb = useClimb(current, boardData?.climbs);
  const inSeq = !!seq && seq.includes(current);
  const index = useMemo(() => (inSeq ? seq!.indexOf(current) : list.findIndex((x) => x.uuid === current)), [inSeq, seq, list, current]);
  const count = inSeq ? seq!.length : list.length;
  const idAt = (i: number): string | undefined => (inSeq ? seq![i] : list[i]?.uuid);
  // Holes and board shape come from the climb's own layout when it isn't on the open board (e.g. from a circuit).
  const geo = useGeometry(climb || undefined);
  const spec = geo?.spec;
  const placements = geo?.placements ?? EMPTY_PLACEMENTS;
  const roles = geo?.roles ?? EMPTY_ROLES;
  // Suggestions can open a climb at an angle other than the board's own.
  const [viewAngle, setViewAngle] = useState(Number(routeAngle) || (board?.angle ?? 40));
  const [zoomed, setZoomed] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [sheet, setSheet] = useState<null | "log" | "more" | "timer">(null);
  const [mode, setMode] = useState<"send" | "attempt">("send");
  const blocked = useData((d) => d.blocked);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [timerLen, setTimerLen] = useState(60);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [toast, setToast] = useState<{ text: string; entry: Logged; share?: { send: SendFacts; difficulty: number }; celebrate?: Celebration; loggedV?: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [share, setShare] = useState<ShareFacts | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const byAngle = useAngleStats(current);
  const betaCount = useBetaCount(current);

  const stat: AngleStat | undefined = byAngle[viewAngle];
  const d = difficultyOf(stat);
  const route = climb ? isRoute(climb) : false;
  const label = d != null ? grades.label(d, settings.gradeDisplay, route) : null;
  const allFrames = useMemo(() => (climb ? parseFrames(climb.frames) : []), [climb]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = allFrames[Math.min(frameIndex, allFrames.length - 1)];
  // While the board is connected it follows the screen: each climb, frame and mirror change is shown on the wall.
  const led = useLedStatus();
  useEffect(() => {
    if (!led.matches || !climb || !board || climb.layoutId !== board.spec.layoutId) return;
    void lightBoard(holesFor(frame, new Map(placements.map((p) => [p.id, p])), new Map(roles.map((x) => [x.id, x])), mirror), board, current);
  }, [led.matches, current, frame, mirror, climb?.uuid]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new climb starts on its first frame, paused.
  useEffect(() => { setFrameIndex(0); setPlaying(false); }, [current]);
  useEffect(() => {
    if (!playing || allFrames.length < 2 || !climb) return;
    const t = setInterval(() => setFrameIndex((i) => (i + 1) % allFrames.length), climb.pace);
    return () => clearInterval(t);
  }, [playing, allFrames.length, climb?.pace]); // eslint-disable-line react-hooks/exhaustive-deps
  const mySend = logbook.some((e) => e.climbUuid === current && e.angle === viewAngle && e.isSend);
  const isLiked = liked.has(current);
  const boardW = width - 32;

  // Swipe between climbs with a native paging list: the next and previous climb are real pages next to this one, so their name,
  // grade and board are already there while the finger moves, and the scrolling physics are the platform's. A climb changes
  // (and the board lights it) when a page settles. These are hooks, so they sit above the early return below.
  const pager = useRef<FlatList<string>>(null);
  const pagerIndex = useRef(-1);
  const lastTick = useRef(-1);
  const known = index >= 0;
  const ids = useMemo(() => (known ? (inSeq ? seq! : list.map((x) => x.uuid)) : [current]), [known, inSeq, seq, list, known ? "" : current]); // eslint-disable-line react-hooks/exhaustive-deps
  const climbsById = useMemo(() => new Map((boardData?.climbs ?? []).map((x) => [x.uuid, x] as const)), [boardData?.climbs]);
  const statFor = (id: string): AngleStat | undefined => (viewAngle === board?.angle ? stats?.get(id) : undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  if (!climb || !spec) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        {climb === null ? <Text v="secondary" style={{ padding: 20 }}>This climb isn't on your device.</Text> : <View style={{ padding: 40, alignItems: "center", gap: 12 }}><Spinner size="large" /><Text v="secondary">Loading</Text></View>}
      </View>
    );
  }
  const go = (delta: number) => {
    const target = index + delta;
    const id = idAt(target);
    if (!id) return;
    pagerIndex.current = target;
    setCurrent(id);
    pager.current?.scrollToIndex({ index: target, animated: true });
  };
  // A page came to rest: that climb is now the current one.
  const settle = (x: number) => {
    const i = Math.max(0, Math.min(ids.length - 1, Math.round(x / width)));
    lastTick.current = i;
    const id = ids[i];
    if (id && id !== current) { pagerIndex.current = i; setCurrent(id); }
  };
  // A tick each time the pager passes the halfway point to another climb.
  const onPagerScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (lastTick.current >= 0 && i !== lastTick.current) haptic.selection();
    lastTick.current = i;
  };
  const pagerH = HEADER_H + 14 + boardHeight(spec, boardW);
  const pageKey = `${current}|${viewAngle}|${mirror}|${zoomed}|${settings.shapes}|${settings.highContrast}|${settings.gradeDisplay}|${stats?.size ?? 0}|${allFrames.length > 1 ? frameIndex : 0}|${byAngle[viewAngle]?.join(",") ?? ""}`;

  /** Opens the share preview: the climb card, or a send card from the given send. */
  const openShare = (kind: ShareKind, send?: SendFacts, userGrade?: number) => {
    const here = byAngle[viewAngle] ?? statFor(current);
    const own = kind === "send" && userGrade && userGrade > 0 ? userGrade : null;
    setShare({
      kind, name: climb.name, setter: climb.setter, boardName: board?.name ?? spec.layoutName, angle: viewAngle,
      difficulty: own ?? difficultyOf(here), gradeDisplay: settings.gradeDisplay, isRoute: route, stat: here, classic: isClassic(here),
      spec, placements, roles, frame, mirror, shapes: settings.shapes, highContrast: settings.highContrast, send,
    });
  };
  const shareMySend = () => {
    const e = logbook.find((x) => x.climbUuid === current && x.angle === viewAngle && x.isSend);
    if (e) openShare("send", { attempts: e.bidCount, stars: e.quality, comment: e.comment, climbedAt: e.climbedAt }, e.difficulty);
  };

  // When the timer runs out: flip to the mirrored side if the board has one, otherwise move to the next climb, then start over.
  const onTimerExpire = () => {
    haptic.warning();
    if (spec.isMirrored && !mirror) setMirror(true);
    else { setMirror(false); go(1); }
    setTimerEnd(Date.now() + timerLen * 1000);
  };

  const save = async (input: Parameters<typeof logSend>[0], text: string) => {
    setSaving(true);
    setSaveError(false);
    const entry = await logSend(input);
    setSaving(false);
    if (!entry) { setSaveError(true); return; }
    // A send is a win; an attempt is a lighter acknowledgement.
    if (entry.kind === "ascent") haptic.success(); else haptic.light();
    setSheet(null);
    const sent = entry.kind === "ascent" && input.difficulty !== undefined;
    // `logbook` is this render's, so it holds only the sends from before this one.
    const celebrate = sent ? celebrationFor(input.bidCount, input.difficulty, logbook.filter((e) => e.isSend).map((e) => e.difficulty), (x) => grades.vNumber(x)) : null;
    if (celebrate) { haptic.done(); setConfetti((n) => n + 1); }
    setToast({
      text: entry.serverId ? text : "Saved on this phone. It uploads when you're online.", entry,
      celebrate: celebrate ?? undefined,
      share: sent ? { send: { attempts: input.bidCount, stars: input.quality ?? 0, comment: input.comment, climbedAt: localStamp(input.climbedAt) }, difficulty: input.difficulty! } : undefined,
      // The board grade just sent, so the toast can say how close the next milestone at that grade is.
      loggedV: sent && board ? vOf(gradeOfEntry({ provider: board.spec.provider, difficulty: input.difficulty! })) : undefined,
    });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), sent ? 9000 : 6000);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", height: 56, paddingHorizontal: 4 }}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }} />
        <TimerButton end={timerEnd} onPress={() => setSheet("timer")} />
        <IconButton icon="heart" label={isLiked ? "Unlike" : "Like"} filled={isLiked} color={isLiked ? c.danger : c.text} onPress={() => void setTag(current, "~flag", !isLiked)} />
        {getProvider(board?.spec.provider).links.climb(climb.uuid) ? <IconButton icon="share" label="Share" onPress={() => Share.share({ message: `${climb.name}: ${getProvider(board?.spec.provider).links.climb(climb.uuid)}` }).catch(() => {})} /> : null}
        <IconButton icon="more" label="More" onPress={() => setSheet("more")} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View accessible={false} accessibilityActions={[{ name: "increment", label: "Next climb" }, { name: "decrement", label: "Previous climb" }]} onAccessibilityAction={(e) => go(e.nativeEvent.actionName === "increment" ? 1 : -1)}>
          <FlatList
            ref={pager}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            style={{ height: pagerH }}
            data={ids}
            keyExtractor={(id) => id}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            initialScrollIndex={Math.max(0, index)}
            initialNumToRender={3}
            windowSize={3}
            maxToRenderPerBatch={3}
            scrollEnabled={!zoomed && ids.length > 1}
            scrollEventThrottle={16}
            onScroll={onPagerScroll}
            onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.x)}
            onScrollEndDrag={(e) => { if (Math.abs(e.nativeEvent.velocity?.x ?? 0) < 0.05) settle(e.nativeEvent.contentOffset.x); }}
            extraData={pageKey}
            renderItem={({ item: id, index: i }) => {
              const active = id === current;
              const page = active ? climb : climbsById.get(id);
              return (
                <View style={{ width, height: pagerH }}>
                  {page && page.layoutId === climb.layoutId ? (
                    <ClimbTop climb={page} stat={active ? byAngle[viewAngle] ?? statFor(id) : statFor(id)} viewAngle={viewAngle} spec={spec} placements={placements} roles={roles} boardW={boardW}
                      frame={active ? frame : undefined} mirror={mirror} index={i} count={ids.length} counterLabel={inSeq ? seqLabel : null}
                      shapes={settings.shapes} highContrast={settings.highContrast} gradeDisplay={settings.gradeDisplay}
                      onGo={go} onToggleMirror={() => setMirror(!mirror)} onZoomedChange={active ? setZoomed : noop} />
                  ) : (
                    <View style={{ padding: 40, alignItems: "center" }}><Spinner size="large" /></View>
                  )}
                </View>
              );
            }}
          />
        </View>
        <View style={{ paddingHorizontal: 16 }}>
        {allFrames.length > 1 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
            <IconButton icon={playing ? "pause" : "play"} label={playing ? "Pause" : "Play"} filled={!playing} onPress={() => setPlaying((p) => !p)} />
            <IconButton icon="chevL" label="Previous frame" onPress={() => { setPlaying(false); setFrameIndex((i) => (i + allFrames.length - 1) % allFrames.length); }} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text v="bodyStrong">Frame {Math.min(frameIndex, allFrames.length - 1) + 1} of {allFrames.length}</Text>
              <Text v="caption">{(climb.pace / 1000).toFixed(climb.pace % 1000 ? 1 : 0)} s per frame</Text>
            </View>
            <IconButton icon="chevR" label="Next frame" onPress={() => { setPlaying(false); setFrameIndex((i) => (i + 1) % allFrames.length); }} />
          </View>
        )}
        <Text v="section" style={{ marginTop: 18, marginBottom: 8 }}>Angle</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {/* A MoonBoard is built at one angle, so only that one is offered. */}
          {(getProvider(spec.provider).kind === "local" ? [board?.angle ?? viewAngle] : spec.angles).filter((a) => a >= 20 && a <= 55).map((a) => {
            const dd = difficultyOf(byAngle[a]);
            const on = a === viewAngle;
            const band = dd != null ? grades.band(dd) : null;
            return (
              <Tap key={a} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={`${a} degrees, ${dd != null ? grades.vName(dd) : "project"}`} onPress={() => setViewAngle(a)}
                style={{ width: 64, borderRadius: r.input, overflow: "hidden", borderWidth: 1.5, borderColor: on ? c.text : c.lineStrong, backgroundColor: on ? c.raised : c.card }}>
                <View style={{ alignItems: "center", paddingVertical: 8 }}>
                  <Text v="caption">{a}°</Text>
                  <Text v="climbName">{dd != null ? grades.vName(dd) : "V?"}</Text>
                </View>
                <View style={{ height: 5, backgroundColor: band ? band.bar : c.dim }} />
              </Tap>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16 }}>
          {ROLE_ORDER.map((ro) => (
            <View key={ro.name} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 14, height: 14, borderRadius: ro.name === "middle" || !settings.shapes ? 7 : 2, borderWidth: 3, borderColor: settings.highContrast ? roleTokens.highContrast : roleTokens[ro.name].color }} />
              <Text v="secondary">{ro.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {getProvider(board?.spec.provider).kind === "remote" ? <Chip label={betaCount ? `Beta (${betaCount})` : "Beta"} onPress={() => router.push({ pathname: "/beta/[uuid]", params: { uuid: current, name: climb.name } })} /> : null}
          <Chip label="Circuits" onPress={() => router.push({ pathname: "/circuits-for", params: { uuid: current, name: climb.name } })} />
          {getProvider(board?.spec.provider).capabilities.explore ? <Chip label="Info" onPress={() => router.push({ pathname: "/climb-info/[uuid]", params: { uuid: current, angle: String(viewAngle) } })} /> : null}
        </View>
        {climb.noMatch && <Text v="caption" style={{ marginTop: 10 }}>No matching: hands may not share a hold.</Text>}
        </View>
      </ScrollView>

      {toast && (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: 100 + insets.bottom, backgroundColor: c.raised, borderRadius: r.input, borderWidth: 1, borderColor: c.lineStrong, flexDirection: "row", alignItems: "center", paddingLeft: 16 }}>
          <View style={{ flex: 1, paddingVertical: 8 }}>
            {toast.celebrate ? <Text style={{ fontFamily: font.display, fontSize: 26, lineHeight: 30, color: c.starOn }}>Congrats!</Text> : null}
            <Text v="bodyStrong">{toast.celebrate ? toast.celebrate.text : toast.text}</Text>
            {toast.loggedV !== undefined && !toast.celebrate ? <ToastMilestone v={toast.loggedV} /> : null}
          </View>
          {toast.share ? (
            <Tap accessibilityRole="button" accessibilityLabel="Share your send" onPress={() => { const t = toast.share!; setToast(null); openShare("send", t.send, t.difficulty); }} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 12 }}>
              <Text v="bodyStrong" style={{ color: c.starOn }}>Share</Text>
            </Tap>
          ) : null}
          <Tap accessibilityRole="button" onPress={() => { void undoLog(toast.entry); setToast(null); }} style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}>
            <Text v="bodyStrong" style={{ color: c.starOn }}>Undo</Text>
          </Tap>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: 16 + insets.bottom, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card }}>
        <Tap accessibilityRole="button" accessibilityLabel={led.matches ? "Board is showing this climb. LED status" : "Light up on the board. Connect"} onPress={() => showBluetooth({ climbUuid: current, mirror })}
          style={{ width: 56, height: 56, borderRadius: r.input, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
          <Icon name="bulb" />
          <View style={{ position: "absolute", top: 8, right: 8, width: 9, height: 9, borderRadius: 5, backgroundColor: led.dot }} />
        </Tap>
        <Button variant="secondary" label="Attempt" style={{ flex: 1, height: 56 }} onPress={() => { haptic.light(); setMode("attempt"); setSheet("log"); }} />
        <Button label={mySend ? "Sent · Edit" : "Log send"} style={{ flex: 1.3, height: 56 }} onPress={() => { haptic.light(); setMode("send"); setSheet("log"); }} />
      </View>

      <LogSheet visible={sheet === "log"} onClose={() => setSheet(null)} mode={mode} setMode={setMode} climbUuid={current} climbName={climb.name} angle={viewAngle}
        isMirrored={spec.isMirrored} mirror={mirror} setMirror={setMirror} saving={saving} error={saveError} stat={stat} onSave={save} />
      <MoreSheet visible={sheet === "more"} onClose={() => setSheet(null)} climb={climb} blocked={blocked.has(current)} onShare={(k) => { if (k === "send") shareMySend(); else openShare("climb"); }} canShareSend={mySend} />
      <ShareSheet facts={share} onClose={() => setShare(null)} />
      {confetti > 0 ? <Confetti key={confetti} onDone={() => setConfetti(0)} /> : null}
      <TimerSheet visible={sheet === "timer"} onClose={() => setSheet(null)} running={timerEnd != null} onStart={(sec) => { setSheet(null); setTimerEnd(Date.now() + sec * 1000); setTimerLen(sec); }} onStop={() => { setSheet(null); setTimerEnd(null); }} />
      {timerEnd != null && <TimerBar end={timerEnd} length={timerLen} onExpire={onTimerExpire} />}
    </View>
  );
}

const EMPTY_PLACEMENTS: Placement[] = [];
const EMPTY_ROLES: Role[] = [];

/** The climb from the open board's list, else straight from the database (a search hit, a logbook entry). null = not on this device. */
function useClimb(uuid: string, list: Climb[] | undefined): Climb | null | undefined {
  const fromList = useMemo(() => list?.find((c) => c.uuid === uuid), [list, uuid]);
  // Remember which climb the fetched result is for, so paging to another climb never shows the previous one.
  const [fetched, setFetched] = useState<{ uuid: string; climb: Climb | null } | undefined>(undefined);
  useEffect(() => {
    if (fromList) return;
    let live = true;
    void getDb().then((db) => repo.climbByUuid(db, uuid)).then((c) => { if (live) setFetched({ uuid, climb: c ?? null }); });
    return () => { live = false; };
  }, [fromList, uuid]);
  return fromList ?? (fetched?.uuid === uuid ? fetched.climb : undefined);
}

/** Stats for one climb at every angle (the angle strip), loaded on demand. */
const NO_STATS: Record<number, AngleStat> = {};
/**
 * Stats for one climb at every angle. The result remembers which climb it is for: when the screen moves to another climb the old
 * climb's stats must not show on it while the new ones load (that was a one-frame flash of the previous grade and stars).
 */
function useAngleStats(uuid: string): Record<number, AngleStat> {
  const [got, setGot] = useState<{ uuid: string; byAngle: Record<number, AngleStat> } | null>(null);
  const version = useData((d) => d.logbook.length);
  useEffect(() => {
    let live = true;
    void getDb().then((db) => repo.climbStatsAllAngles(db, uuid)).then((r) => { if (live) setGot({ uuid, byAngle: r }); });
    return () => { live = false; };
  }, [uuid, version]);
  return got?.uuid === uuid ? got.byAngle : NO_STATS;
}

function useBetaCount(uuid: string): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    void getDb().then((db) => repo.betaLinks(db, uuid)).then((r) => { if (live) setN(r.length); });
    return () => { live = false; };
  }, [uuid]);
  return n;
}

const TIMER_STEPS = [30, 60, 120, 300, 600];
const stepLabel = (s: number) => (s < 60 ? `${s} sec` : `${s / 60} min`);

function TimerSheet({ visible, onClose, running, onStart, onStop }: { visible: boolean; onClose: () => void; running: boolean; onStart: (sec: number) => void; onStop: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Timer">
      <Text v="secondary" style={{ marginBottom: 12 }}>When time is up, the climb flips to the mirrored side (if your board has one), then moves to the next climb in the list.</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TIMER_STEPS.map((sec) => <Chip key={sec} label={stepLabel(sec)} onPress={() => onStart(sec)} />)}
      </View>
      {running && <View style={{ marginTop: 16 }}><Button variant="secondary" label="Stop timer" onPress={onStop} /></View>}
    </Sheet>
  );
}

/** A thin countdown under the top bar. */
function TimerBar({ end, length, onExpire }: { end: number; length: number; onExpire: () => void }) {
  // The bar is only mounted while the rest timer runs, so the screen stays on for exactly that long.
  useKeepAwake("rest-timer");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { if (now >= end) onExpire(); }, [now >= end]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = Math.max(0, end - now);
  // The last three seconds tick.
  const secs = Math.ceil(left / 1000);
  useEffect(() => { if (secs >= 1 && secs <= 3) haptic.medium(); }, [secs]);
  return (
    <View accessibilityLabel={`Timer: ${Math.ceil(left / 1000)} seconds left`} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 4, backgroundColor: c.raised }}>
      <View style={{ width: `${(left / (length * 1000)) * 100}%`, height: 4, backgroundColor: c.text }} />
    </View>
  );
}

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** The timer's place in the top bar: a clock, or while it runs a pill with the time left. Either way it opens the timer sheet. */
function TimerButton({ end, onPress }: { end: number | null; onPress: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end == null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [end]);
  if (end == null) return <IconButton icon="timer" label="Timer" onPress={onPress} />;
  const left = clock(end - now);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Timer running, ${left} left. Change or stop`} onPress={onPress}
      style={{ height: 40, minWidth: 48, paddingHorizontal: 12, borderRadius: 20, backgroundColor: c.btn, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginHorizontal: 4 }}>
      <Icon name="timer" size={20} color={c.btnText} />
      <Text v="bodyStrong" style={{ color: c.btnText, fontVariant: ["tabular-nums"] }}>{left}</Text>
    </Tap>
  );
}

function MoreSheet({ visible, onClose, climb, blocked, onShare, canShareSend }: { visible: boolean; onClose: () => void; climb: Climb; blocked: boolean; onShare: (kind: ShareKind) => void; canShareSend: boolean }) {
  const router = useRouter();
  const username = useUsername();
  const board = useBoard();
  const boards = useData((d) => d.boards);
  const [mode, setMode] = useState<"menu" | "report" | "delete" | "boards">("menu");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { if (visible) { setMode("menu"); setMessage(""); setNote(""); } }, [visible]);
  // A local provider has no server: its own problems carry "You" as setter, and nothing can be reported.
  const local = getProvider(board?.spec.provider).kind === "local";
  const mine = local ? climb.setter === LOCAL_SETTER : climb.setter === username;
  // Anyone who can set climbs can start a new one from this one, when it is on the open board's layout (the editor draws that board).
  const canSet = useCanSet();
  const canCopy = (isRoute(climb) ? canSet.route : canSet.boulder) && climb.layoutId === board?.spec.layoutId;
  const others = boards.filter((b) => b.id !== board?.id && b.spec.layoutId === board?.spec.layoutId);

  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>, done: () => void) => {
    setBusy(true);
    const r2 = await fn();
    setBusy(false);
    if (r2.ok) done(); else setNote((r2 as { message?: string }).message ?? "That didn't work.");
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={mode === "report" ? "Report this climb" : mode === "delete" ? "Delete this climb?" : mode === "boards" ? "Show on another board" : "More"}
      footer={mode === "report" ? <Button label={busy ? "Sending" : "Send report"} disabled={!message.trim() || busy} onPress={() => void act(() => reportClimb(climb.uuid, message.trim()), () => { setNote(""); onClose(); })} />
        : mode === "delete" ? <View style={{ gap: 8 }}><Button variant="danger" label={busy ? "Deleting" : "Delete climb"} disabled={busy} onPress={() => void act(() => deleteClimb(climb.uuid), () => { onClose(); router.back(); })} /><Button variant="secondary" label="Keep it" onPress={() => setMode("menu")} /></View> : undefined}>
      {mode === "menu" && (
        <View style={{ gap: 8 }}>
          <Item label={blocked ? "Unblock this climb" : "Block this climb"} onPress={() => { void setTag(climb.uuid, "~block", !blocked); onClose(); }} />
          <Item label="Share image" onPress={() => { onClose(); onShare("climb"); }} />
{canShareSend && <Item label="Share your send" onPress={() => { onClose(); onShare("send"); }} />}
          {others.length > 0 && <Item label="Show on another board" onPress={() => setMode("boards")} />}
          {!local && <Item label="Report" onPress={() => setMode("report")} />}
          {canCopy && <Item label="Copy to a new climb" onPress={() => { onClose(); router.push({ pathname: "/set-climb", params: { from: climb.uuid, type: isRoute(climb) ? "route" : "boulder" } }); }} />}
          {local && mine && <Item label="Edit this climb" onPress={() => { onClose(); router.push({ pathname: "/set-climb", params: { uuid: climb.uuid } }); }} />}
          {mine && <Item label="Delete climb" danger onPress={() => setMode("delete")} />}
        </View>
      )}
      {mode === "report" && (
        <View style={{ gap: 8 }}>
          <Text v="secondary">What's wrong with it? A moderator will take a look.</Text>
          <TextInput value={message} onChangeText={setMessage} multiline placeholder="Describe the problem" placeholderTextColor={c.placeholder} accessibilityLabel="Report message"
            style={{ minHeight: 96, borderRadius: r.input, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.text, padding: 12, fontSize: 16, fontFamily: "Barlow_400Regular" }} />
        </View>
      )}
      {mode === "delete" && <Text v="secondary">{local ? `"${climb.name}" is removed from this board. Your logs of it stay.` : `"${climb.name}" is removed for everyone. The server may refuse if other climbers have already sent it.`}</Text>}
      {mode === "boards" && (
        <View style={{ gap: 8 }}>
          {others.map((b) => <Item key={b.id} label={`${b.name} · ${b.spec.sizeName}`} onPress={() => { useStore.getState().setBoard(b.id); onClose(); }} />)}
        </View>
      )}
      {note ? <Text v="secondary" style={{ color: c.danger, marginTop: 8 }} aria-live="polite">{note}</Text> : null}
    </Sheet>
  );
}

function Item({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap accessibilityRole="button" onPress={onPress} style={{ minHeight: 56, justifyContent: "center", paddingHorizontal: 16, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
      <Text v="bodyStrong" style={{ color: danger ? c.danger : c.text }}>{label}</Text>
    </Tap>
  );
}

/** The milestone about the grade just sent, when it has come close: "3 more V4s until you have 10". */
function ToastMilestone({ v }: { v: number }) {
  const m = useToastMilestone(v);
  return m ? <Text v="caption">{m.text}</Text> : null;
}
