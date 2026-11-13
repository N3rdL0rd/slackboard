/**
 * The phone side of notifications: the permission, the one channel, and applying the scheduler's plan. What to schedule is decided in
 * core/notifications.ts; this file only reads what is scheduled and cancels and schedules the difference. Every call is safe where the
 * native module is missing (Expo Go, the web): it quietly does nothing.
 */
import { Platform } from "react-native";
import { diff, REST_END_ID, routeOf, type PlannedNotification, type ScheduledNotification } from "../core/notifications";

type Mod = typeof import("expo-notifications");
let mod: Mod | null | undefined;

function native(): Mod | null {
  if (mod !== undefined) return mod;
  try { mod = require("expo-notifications") as Mod; } catch { mod = null; }
  return mod;
}

export const CHANNEL_ID = "plans-reviews";

/** Android needs a channel before anything can show. Created once; asking again changes nothing. */
async function ensureChannel(n: Mod): Promise<void> {
  if (Platform.OS !== "android") return;
  await n.setNotificationChannelAsync(CHANNEL_ID, { name: "Plans and reviews", importance: n.AndroidImportance.DEFAULT, description: "Your weekly review and the reminders you turned on." });
}

/** Banners show while the app is open too, quietly. Set once, at the root. */
export function installNotificationHandler(): void {
  const n = native();
  if (!n) return;
  n.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
}

export type Permission = "granted" | "denied" | "undetermined" | "unavailable";

export async function permission(): Promise<Permission> {
  const n = native();
  if (!n) return "unavailable";
  try {
    const p = await n.getPermissionsAsync();
    return p.granted ? "granted" : p.canAskAgain ? "undetermined" : "denied";
  } catch { return "unavailable"; }
}

/** The system prompt. True when granted. Call it only after explaining why. */
export async function requestPermission(): Promise<boolean> {
  const n = native();
  if (!n) return false;
  try {
    await ensureChannel(n);
    return (await n.requestPermissionsAsync()).granted;
  } catch { return false; }
}

interface Data { route?: unknown; fireAtMs?: unknown }

async function scheduled(n: Mod): Promise<ScheduledNotification[]> {
  const all = await n.getAllScheduledNotificationsAsync();
  return all.map((r) => {
    const d = (r.content.data ?? {}) as Data;
    return { id: r.identifier, title: r.content.title ?? "", body: r.content.body ?? "", route: typeof d.route === "string" ? d.route : "", fireAtMs: typeof d.fireAtMs === "number" ? d.fireAtMs : 0 };
  });
}

/**
 * Makes the phone's scheduled notifications match the plan: cancels what is no longer wanted or has changed, schedules what is new.
 * Identifiers are deterministic, so running it twice changes nothing. Without permission it only cancels.
 */
export async function reconcile(desired: PlannedNotification[]): Promise<void> {
  const n = native();
  if (!n) return;
  try {
    const granted = (await permission()) === "granted";
    const d = diff(granted ? desired : [], await scheduled(n));
    for (const id of d.cancel) await n.cancelScheduledNotificationAsync(id);
    if (!d.schedule.length) return;
    await ensureChannel(n);
    for (const p of d.schedule) {
      await n.scheduleNotificationAsync({
        identifier: p.id,
        content: { title: p.title, body: p.body, data: { route: p.route, fireAtMs: p.fireAt.getTime() } },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: p.fireAt, channelId: CHANNEL_ID },
      });
    }
  } catch {
    // A reminder that could not be scheduled is not worth an error; the next run tries again.
  }
}

/** Removes everything this app scheduled for the plan (all types turned off, or the user removed their data). */
export async function cancelAll(): Promise<void> {
  await reconcile([]);
}

/** One alert for when a rest ends while the app is in the background. Replaces any earlier one. */
export async function scheduleRestEnd(fireAt: Date, title: string, body: string): Promise<void> {
  const n = native();
  if (!n || (await permission()) !== "granted") return;
  try {
    await ensureChannel(n);
    await n.cancelScheduledNotificationAsync(REST_END_ID);
    await n.scheduleNotificationAsync({ identifier: REST_END_ID, content: { title, body, data: {} }, trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL_ID } });
  } catch { /* see reconcile */ }
}

export async function cancelRestEnd(): Promise<void> {
  const n = native();
  if (!n) return;
  try { await n.cancelScheduledNotificationAsync(REST_END_ID); } catch { /* nothing was scheduled */ }
}

/** Calls `open` with the route of each tapped notification, including the one that started the app. Returns the unsubscribe. */
export function onNotificationTap(open: (route: string) => void): () => void {
  const n = native();
  if (!n) return () => {};
  const handle = (data: unknown) => { const r = routeOf(data); if (r) open(r); };
  const sub = n.addNotificationResponseReceivedListener((r) => handle(r.notification.request.content.data));
  // The notification that started the app is handled once and then cleared, or it would open again at every launch.
  void n.getLastNotificationResponseAsync().then((r) => { if (r) { handle(r.notification.request.content.data); n.clearLastNotificationResponse(); } }).catch(() => {});
  return () => sub.remove();
}

