import { useUserId } from "./useActive";
import { useCallback, useEffect, useState } from "react";
import { followReq, get, profileParts, submit, submitMultipart, type FollowAction, type ProfileInput } from "../core/api";
import { parseProfile, type Profile } from "../core/social";
import { sessionFor } from "./session";
import { useStore } from "./store";

/** A user's profile from the server, reloaded on demand. `undefined` while loading, `null` if it can't be read (private, gone, offline). */
export function useProfile(userId: number | null | undefined) {
  const me = useUserId();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const reload = useCallback(async () => {
    const s = sessionFor();
    if (!s || userId == null) return;
    setProfile(parseProfile(await get(s, `/users/${userId}`)));
  }, [me, userId]);
  useEffect(() => { void reload(); }, [reload]);
  return { profile, reload };
}

export type SocialResult = { ok: true } | { ok: false; message: string };

/** `state`: follow (pending), unfollow, or answer a request (accepted / declined / blocked). */
export async function setFollow(followeeId: number, followerId: number, state: FollowAction): Promise<SocialResult> {
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const res = await submit(s, followReq(followeeId, followerId, state));
  if (res.status === "ok") return { ok: true };
  return { ok: false, message: res.status === "retry" ? "Couldn't reach the server. Check your connection and try again." : "The server didn't accept that." };
}

export type Avatar = { kind: "keep" } | { kind: "clear" } | { kind: "upload"; uri: string };

/** Saves name, email, Instagram and privacy, and optionally a new or removed profile picture. */
export async function saveProfile(input: ProfileInput, avatar: Avatar): Promise<SocialResult> {
  const s = sessionFor();
  if (!s) return { ok: false, message: "Sign in again to continue." };
  const parts = profileParts(s.userId, input);
  if (avatar.kind === "clear") parts.avatar = "null";
  const res = await submitMultipart(s, "/user_profiles/save", parts, avatar.kind === "upload" ? { name: "avatar.jpg", uri: avatar.uri, type: "image/jpeg" } : undefined);
  if (res.status === "ok") return { ok: true };
  if (res.status === "rejected") {
    const first = res.errors && Object.values(res.errors).flat()[0];
    return { ok: false, message: first || "The server didn't accept those changes." };
  }
  return { ok: false, message: "Couldn't reach the server. Check your connection and try again." };
}
