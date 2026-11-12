import { doneKey } from "../../core/mergedLog";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Placement, Role } from "../../core/types";
import { Animated, PanResponder, TextInput, View } from "react-native";
import { useSpaceFor } from "../../state/spaces";
import { boardColor, neighbourBoard } from "../../core/boards";
import { JumpList } from "../../ui/JumpToTop";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activeChips, DEFAULT_FILTER } from "../../core/filters";
import { Icon } from "../../ui/Icon";
import { QuickGymLog } from "../../ui/QuickGymLog";
import { showBluetooth } from "../../state/bluetoothTray";
import { useProblems } from "../../state/moonboard";
import { MoonProblemsBanner } from "../../ui/MoonProblemsBanner";
import { ClimbRow } from "../../ui/ClimbRow";
import { ClimbSummary } from "../../ui/ClimbSummary";
import { SpeedDial } from "../../ui/SpeedDial";
import { ClimbWorkoutSheet } from "../../ui/ClimbWorkoutSheet";
import { Button, Chip, IconButton, Spinner, Tap } from "../../ui/parts";
import { AngleSheet, BoardSheet, FilterSheet } from "../../ui/climbSheets";
import { ArrivalChip } from "../../ui/SpaceBar";
import { Text } from "../../ui/Text";
import { useData } from "../../state/data";
import { useBoard, useFilter, useStore } from "../../state/store";
import { setSequence } from "../../state/sequence";
import { useClimbList } from "../../state/useClimbList";
import { useLedStatus } from "../../state/useLedStatus";
import { settingUpProviders, useProviderSync, useSync } from "../../state/sync";
import { SyncBanner } from "../../ui/SyncBanner";
import { getProvider } from "../../providers";
import { useDrafts, useCanSet } from "../../state/useActive";
import { c, r } from "../../theme";

const NO_PLACEMENTS: Placement[] = [];
const NO_ROLES: Role[] = [];

export default function ClimbTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const board = useBoard();
  // With two or more boards in this Space, the pills under the header pick the board, so the header names the Space instead of repeating them.
  const space = useSpaceFor(board?.id);
  const hasPills = !!space && space.boards.length > 1;
  const [quickLog, setQuickLog] = useState(false);
  const liked = useData((d) => d.liked);
  const boardsLoaded = useData((d) => d.boardsLoaded);
  const boardData = useData((d) => d.boardData);
  const canSet = useCanSet();
  const drafts = useDrafts();
  const draftIds = useMemo(() => new Set(drafts.map((d) => d.uuid)), [drafts]);
  const filter = useFilter();
  const setFilter = useStore((s) => s.setFilter);
  const settings = useStore((s) => s.settings);
  const { list, stats, done, angle, loading, pending } = useClimbList();
  const problemsPhase = useProblems((s) => (board ? s.by[board.spec.layoutId]?.phase : undefined));
  const problemsComing = problemsPhase === "downloading" || problemsPhase === "importing";
  const boards = useData((d) => d.boards);
  const led = useLedStatus();
  const providerSync = useProviderSync(board?.spec.provider ?? "");
  const settingUp = settingUpProviders(useStore((s) => s.accounts), useSync((s) => s.by), useSync((s) => s.deferred));
  const setBoard = useStore((s) => s.setBoard);
  // Swipe the board name to flip to the next or previous board: the chip follows the finger a little, then springs back.
  const nudge = useRef(new Animated.Value(0)).current;
  const liveBoards = useRef({ boards, id: board?.id });
  liveBoards.current = { boards, id: board?.id };
  const switchBoard = (dir: 1 | -1) => {
    const next = neighbourBoard(liveBoards.current.boards, liveBoards.current.id, dir);
    if (next) setBoard(next.id);
  };
  const flip = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => liveBoards.current.boards.length > 1 && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => nudge.setValue(Math.max(-40, Math.min(40, g.dx / 3))),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 40) { const next = neighbourBoard(liveBoards.current.boards, liveBoards.current.id, g.dx < 0 ? 1 : -1); if (next) useStore.getState().setBoard(next.id); }
      Animated.spring(nudge, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(nudge, { toValue: 0, useNativeDriver: true }).start(),
  })).current;
  const openClimb = useCallback((uuid: string) => { setSequence(null); router.push({ pathname: "/climb/[uuid]", params: { uuid } }); }, [router]);
  const [sheet, setSheet] = useState<null | "board" | "angle" | "filter" | "workout">(null);
  if (!board) {
    return (
      <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top, padding: 24, justifyContent: "center", gap: 14 }}>
        <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 36, lineHeight: 46, color: c.text }}>{settingUp.length ? `${getProvider(settingUp[0]).name} is still setting up` : boardsLoaded ? "Add your board" : "Loading"}</Text>
        {settingUp.length ? <Text v="secondary">Your board will appear when the first download finishes. Downloaded pages are saved if you leave or close Slackboard.</Text> : boardsLoaded && (
          <>
            <Text v="secondary">Tell Slackboard which board you climb on to see its climbs, grades and holes.</Text>
            <Button label="Add a board" onPress={() => router.push("/add-board")} />
          </>
        )}
      </View>
    );
  }
  const chips = activeChips(filter);
  // Sort counts as a filter once it is not the default.
  const filterCount = chips.length + (filter.sort !== "best" ? 1 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.ground, paddingTop: insets.top }}>
      <JumpList
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <SyncBanner />
            <MoonProblemsBanner layoutId={board.spec.layoutId} />
            {providerSync.expired ? (
              <Tap accessibilityRole="button" onPress={() => router.push({ pathname: "/welcome", params: { provider: board.spec.provider } })}
                style={{ marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: r.input, backgroundColor: c.raised, borderWidth: 1, borderColor: c.danger }}>
                <Text v="bodyStrong">Sign in again to {getProvider(board.spec.provider).name}</Text>
                <Text v="caption">Its session ended. Your boards and climbs are still here, but new logs wait until you sign in.</Text>
              </Tap>
            ) : null}
            <ArrivalChip board={board} />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
        <Animated.View style={{ flex: 1, transform: [{ translateX: nudge }] }} {...flip.panHandlers}>
          <Tap accessibilityRole="button" accessibilityLabel={hasPills ? `${board.name}, in ${space!.name}. Boards and spaces` : `Board: ${board.name}. Change board`} onPress={() => setSheet("board")}
            accessibilityActions={boards.length > 1 ? [{ name: "increment", label: "Next board" }, { name: "decrement", label: "Previous board" }] : undefined}
            onAccessibilityAction={(e) => switchBoard(e.nativeEvent.actionName === "increment" ? 1 : -1)}
            onLongPress={() => router.push({ pathname: "/edit-board", params: { uuid: board.id } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.card, borderRadius: r.card, padding: 10, borderWidth: 1, borderColor: c.line }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: boardColor(board.id) }} />
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong" numberOfLines={1}>{board.name}</Text>
              <Text v="caption" numberOfLines={1}>{hasPills ? `${space!.name} · ` : ""}{board.spec.sizeName} · {board.isAdjustable ? "adjustable" : `fixed ${board.angle}°`}</Text>
            </View>
            {boards.length > 1 ? (
              <View style={{ flexDirection: "row", gap: 4 }} accessibilityElementsHidden>
                {boards.map((b) => <View key={b.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: b.id === board.id ? c.text : c.dim }} />)}
              </View>
            ) : null}
            <Icon name="chevD" size={20} color={c.muted} />
          </Tap>
        </Animated.View>
        <IconButton icon="bulb" label={led.label} color={c.text} dot={led.dot} onPress={() => showBluetooth()} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
        <Tap accessibilityRole="button" accessibilityLabel={board.isAdjustable ? `Angle ${board.angle} degrees. Change` : `Fixed angle ${board.angle} degrees`}
          disabled={!board.isAdjustable} onPress={() => setSheet("angle")}
          style={{ height: 48, paddingHorizontal: 12, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, justifyContent: "center" }}>
          <Text v="caption" style={{ fontSize: 10.5, letterSpacing: 0.8 }}>{board.isAdjustable ? "ANGLE" : "FIXED"}</Text>
          <Text v="numeral" style={{ fontSize: 24 }}>{board.angle}°</Text>
        </Tap>
        <View style={{ flex: 1, height: 48, borderRadius: r.input, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: "row", alignItems: "center", paddingLeft: 12 }}>
          <Icon name="search" size={20} color={c.muted} />
          <TextInput value={filter.search} onChangeText={(search) => setFilter({ ...filter, search })} placeholder="Search climbs" placeholderTextColor={c.placeholder}
            accessibilityLabel="Search climbs by name" style={{ flex: 1, marginLeft: 8, color: c.text, fontSize: 16, fontFamily: "Barlow_400Regular", height: 48 }} />
          <View>
            <IconButton icon="filter" label={`Filters, ${filterCount} active`} onPress={() => setSheet("filter")} />
            {filterCount > 0 && (
              <View style={{ position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.text, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: c.btnText, fontSize: 11, fontFamily: "Barlow_600SemiBold" }}>{filterCount}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <ClimbSummary total={list.length} loading={loading} pending={pending} filterCount={filterCount} onFilters={() => setSheet("filter")} onReset={() => setFilter(DEFAULT_FILTER)} />

          </View>
        }
        fabBottom={84}
        data={list}
        style={{ opacity: pending ? 0.5 : 1 }}
        keyExtractor={(x) => x.uuid}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) => (
          <ClimbRow climb={item} stat={stats.get(item.uuid)} spec={board.spec} placements={boardData?.placements ?? NO_PLACEMENTS} roles={boardData?.roles ?? NO_ROLES}
            done={done.get(doneKey(board.spec.provider, item.uuid, angle))} display={settings.gradeDisplay}
            shapes={settings.shapes} highContrast={settings.highContrast} draft={draftIds.has(item.uuid)} liked={liked.has(item.uuid)}
            onPress={openClimb} />
        )}
        ListEmptyComponent={loading || problemsComing ? (
          <View style={{ alignItems: "center", padding: 40, gap: 12 }}><Spinner size="large" /><Text v="secondary">{problemsComing ? "Getting the problems for this board" : "Loading climbs"}</Text></View>
        ) : (
          <View style={{ alignItems: "center", padding: 40, gap: 12 }}>
            <Text style={{ fontFamily: "CaveatBrush_400Regular", fontSize: 30, lineHeight: 40, color: c.text }}>Nothing on the board</Text>
            <Text v="secondary" style={{ textAlign: "center" }}>No climbs match these filters at {angle}°.</Text>
            <Chip label="Reset filters" onPress={() => setFilter(DEFAULT_FILTER)} />
          </View>
        )}
      />
      <SpeedDial bottom={16} items={[
        ...(canSet.any ? [{ icon: "edit" as const, label: "Set a climb", primary: true, onPress: () => router.push("/set-climb") }] : []),
        { icon: "log" as const, label: "Log gym climb", primary: !canSet.any, onPress: () => setQuickLog(true) },
        { icon: "spark" as const, label: "Suggested", onPress: () => router.push("/suggestions") },
        ...(getProvider(board.spec.provider).capabilities.workouts ? [{ icon: "bolt" as const, label: "Climb workout", onPress: () => setSheet("workout") }] : []),
      ]} />
      <BoardSheet visible={sheet === "board"} onClose={() => setSheet(null)} />
      <QuickGymLog visible={quickLog} onClose={() => setQuickLog(false)} />
      <AngleSheet visible={sheet === "angle"} onClose={() => setSheet(null)} />
      <ClimbWorkoutSheet visible={sheet === "workout"} onClose={() => setSheet(null)} />
      <FilterSheet visible={sheet === "filter"} onClose={() => setSheet(null)} count={list.length} />
    </View>
  );
}
