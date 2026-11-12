import { useUserId } from "./useActive";
import { useCallback, useEffect, useState } from "react";
import { get } from "../core/api";
import { parseExplore, type ExploreResult } from "../core/social";
import { sessionFor } from "./session";
import { useStore } from "./store";

type Kind = "circuit" | "user";
const cache = new Map<string, ExploreResult[]>();

/**
 * Browse the server's circuits or climbers without typing anything: with no query the server returns up to 500
 * of them. A query narrows it on the server. Results are kept for the session so switching tabs is instant.
 */
export function useExplore(kind: Kind, query: string) {
  const me = useUserId();
  const q = query.trim().length >= 2 ? query.trim() : "";
  const key = `${kind}:${q}`;
  const [items, setItems] = useState<ExploreResult[] | null>(cache.get(key) ?? null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (force: boolean) => {
    const s = sessionFor();
    if (!s) return;
    if (!force && cache.has(key)) { setItems(cache.get(key)!); return; }
    setLoading(true); setFailed(false);
    const j = await get(s, `/explore?t=${kind}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    if (!j) setFailed(true);
    const list = parseExplore(j);
    if (j) cache.set(key, list);
    setItems(list);
    setLoading(false);
  }, [key, kind, q, me]);

  useEffect(() => {
    // Typing is debounced; the default list loads at once.
    const t = setTimeout(() => void load(false), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return { items, loading, failed, reload: () => load(true) };
}
