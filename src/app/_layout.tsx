import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold } from "@expo-google-fonts/barlow";
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed";
import { CaveatBrush_400Regular } from "@expo-google-fonts/caveat-brush";
import { useFonts } from "expo-font";
import { Redirect, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { syncBackgroundTaskRegistration } from "../state/backgroundSync";
import { BluetoothTray } from "../ui/BluetoothTray";
import { useData } from "../state/data";
import { getProvider } from "../providers";
import { resolveBoardId } from "../core/boards";
import { ensureProblems, useProblems } from "../state/moonboard";
import { hasToken } from "../state/session";
import { useBoard, useStore } from "../state/store";
import { pendingProvider, useSync } from "../state/sync";
import { c } from "../theme";

const SYNC_EVERY_MS = 5 * 60 * 1000;

export default function Root() {
  const [loaded] = useFonts({
    Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, CaveatBrush_400Regular,
  });
  const hydrated = useHydrated();
  const booted = useBoot();
  const accounts = useStore((s) => s.accounts);
  const signedIn = Object.keys(accounts).length > 0;
  const syncBy = useSync((s) => s.by);
  const deferred = useSync((s) => s.deferred);
  const pending = pendingProvider(accounts, syncBy, deferred);
  const checked = Object.keys(accounts).every((p) => syncBy[p]?.initialDone != null);
  const path = usePathname();
  const pendingLink = useStore((s) => s.pendingLink);
  // A shared climb or circuit link opened while signed out is kept, and opened once the user is in.
  useEffect(() => {
    if (!signedIn && /^\/(climbs|circuits)\/[0-9a-fA-F]{32}\/?$/.test(path)) useStore.getState().setPendingLink(path);
    if (signedIn && pendingLink && path === pendingLink.split("?")[0]) useStore.getState().setPendingLink(null);
  }, [path, signedIn, pendingLink]);

  if (!loaded || !hydrated || !booted) return <View style={{ flex: 1, backgroundColor: c.ground }} />;

  let redirect: string | null = null;
  const authPath = path === "/welcome" || path === "/sign-up" || path === "/forgot-password";
  if (!signedIn) redirect = authPath ? null : "/welcome";
  else if (pending) redirect = path === "/sync" ? null : `/sync?provider=${pending}`;
  else if (path === "/sync") redirect = pendingLink ?? "/";
  // Signed-in users reach the sign-in screens only to add another account or sign in again, so those stay open.

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {signedIn && checked ? <DataLoader /> : null}
      {redirect ? <Redirect href={redirect as "/"} /> : null}
      <BluetoothTray />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground }, animation: "slide_from_right" }} />
    </SafeAreaProvider>
  );
}

/** Restores persisted state and sessions before any screen decides where to send the user. */
function useBoot() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    void (async () => {
      await useSync.getState().boot();
      // An account whose token is gone (keystore wiped) has to sign in again: it is removed so its provider asks for a login.
      for (const p of Object.keys(useStore.getState().accounts)) if (getProvider(p).kind === "remote" && !hasToken(p)) useStore.getState().signOut(p);
      setDone(true);
    })();
  }, []);
  return done;
}

function useHydrated() {
  const [h, setH] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setH(true)), []);
  return h;
}

/** Keeps the in-memory view of the local databases current and syncs every account in the background. */
function DataLoader() {
  const accounts = useStore((s) => s.accounts);
  const board = useBoard();
  const version = useSync((s) => s.version);
  const boardId = board?.id;
  const spec = board?.spec;
  const angle = board?.angle;

  useEffect(() => { void useData.getState().loadAll(accounts); }, [accounts, version]);
  // A local board's problem list is fetched when missing (first run, or a download that failed earlier); a failed one waits for its Try again.
  const boards = useData((d) => d.boards);
  const chosenBoard = useStore((s) => s.boardId);
  // The Climb tab shows the first board when none was ever chosen; record it, or changing its angle or filters has nowhere to save.
  useEffect(() => {
    const id = resolveBoardId(chosenBoard, boards);
    if (id && id !== chosenBoard) useStore.getState().adoptBoard(id);
  }, [boards, chosenBoard]);
  useEffect(() => {
    for (const b of boards) {
      if (getProvider(b.spec.provider).kind === "local" && useProblems.getState().by[b.spec.layoutId]?.phase !== "error") void ensureProblems(b.spec.layoutId);
    }
  }, [boards]);
  useEffect(() => { if (spec) void useData.getState().loadBoard(spec); }, [boardId, spec?.provider, spec?.layoutId, spec?.productSizeId, spec?.hsm, version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (spec && angle != null) void useData.getState().loadStats(spec.provider, spec.layoutId, angle); }, [boardId, spec?.provider, spec?.layoutId, angle, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void syncBackgroundTaskRegistration();
    void useSync.getState().syncNow();
    const timer = setInterval(() => void useSync.getState().syncNow(), SYNC_EVERY_MS);
    const sub = AppState.addEventListener("change", (s) => {
      const sync = useSync.getState();
      const last = Math.max(0, ...Object.values(sync.by).map((x) => x.lastAt));
      if (s === "active" && (Object.keys(sync.deferred).length > 0 || Date.now() - last > 60_000)) void sync.syncNow();
    });
  }, []);
  return null;
}
