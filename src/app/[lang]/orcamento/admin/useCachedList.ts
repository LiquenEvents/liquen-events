"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Stale-while-revalidate cache for the back-office list views.
 *
 * The admin dashboard mounts each API-backed view (Propostas, Faturas, Tarefas,
 * …) only while it's active, so without a cache every tab switch re-fetches from
 * scratch and re-flashes a skeleton — the biggest "feels slow" drag in daily
 * use. This module-level cache survives unmounts, so:
 *   • first ever visit  → shows the skeleton once, fetches, caches;
 *   • every later visit → renders the cached data INSTANTLY and revalidates in
 *     the background (no skeleton, no flicker) so it stays fresh.
 *
 * `setData` writes through to the cache, so optimistic updates (add/edit/delete
 * a row) persist when you leave the view and come back — no stale reappearance.
 *
 * It's intentionally tiny (no SWR dependency): a Map keyed by a stable string.
 */
const cache = new Map<string, unknown>();

/** Warm the cache for a view without rendering it (idle prefetch). No-op if
 *  already cached or in flight. */
const inFlight = new Set<string>();
export function prefetchList(key: string, url: string): void {
  if (cache.has(key) || inFlight.has(key)) return;
  inFlight.add(key);
  fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (d != null) cache.set(key, d);
    })
    .catch(() => {})
    .finally(() => inFlight.delete(key));
}

export interface CachedList<T> {
  data: T | undefined;
  /** Update the list AND the cache (use for optimistic add/edit/delete). */
  setData: (updater: T | ((prev: T) => T)) => void;
  loading: boolean;
  error: boolean;
  /** Force a foreground refresh (shows loading). */
  refresh: () => void;
}

export function useCachedList<T>(key: string, url: string): CachedList<T> {
  const cached = cache.get(key) as T | undefined;
  const [data, setDataState] = useState<T | undefined>(cached);
  // Only the true first load (nothing cached) shows the skeleton.
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState(false);

  const revalidate = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const fresh = (await res.json()) as T;
        cache.set(key, fresh);
        setDataState(fresh);
        setError(false);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [key, url],
  );

  useEffect(() => {
    // Silent revalidation when we already have cached data (no skeleton). The
    // setState happens asynchronously inside revalidate() after the fetch — this
    // is the intended stale-while-revalidate flow, not a synchronous cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    revalidate(cache.has(key));
  }, [revalidate, key]);

  const setData = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setDataState((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev as T) : updater;
        cache.set(key, next);
        return next;
      });
    },
    [key],
  );

  return { data, setData, loading, error, refresh: () => revalidate(false) };
}
