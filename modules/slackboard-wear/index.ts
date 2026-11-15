import { requireOptionalNativeModule } from "expo-modules-core";

/** What the native side offers. Null where it does not exist (iOS, web, Expo Go). */
export interface SlackboardWearNative {
  isWatchReachable(): Promise<boolean>;
  ping(): Promise<boolean>;
  startSession(session: string): Promise<boolean>;
  stopSession(): Promise<boolean>;
  drainInbox(): Promise<string[]>;
  addListener(event: "onWatchMessage", listener: () => void): { remove(): void };
}

export default requireOptionalNativeModule<SlackboardWearNative>("SlackboardWear");
