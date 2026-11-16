import { requireOptionalNativeModule } from "expo-modules-core";

/** What the native side offers. Null where it does not exist (iOS, web, Expo Go). */
export interface SlackboardWearNative {
  isWatchReachable(): Promise<boolean>;
  ping(): Promise<boolean>;
  requestCapabilities(): Promise<boolean>;
  startSession(session: string): Promise<boolean>;
  stopSession(): Promise<boolean>;
  /** One message to the watch on a /slackboard/remote/ path, the body as JSON text. */
  sendRemote(path: string, body: string): Promise<boolean>;
  drainInbox(): Promise<string[]>;
  addListener(event: "onWatchMessage", listener: () => void): { remove(): void };
}

export default requireOptionalNativeModule<SlackboardWearNative>("SlackboardWear");
