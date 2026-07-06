import { env } from "./env.js";

interface Entry<T> {
  value: T;
  fetchedAt: number;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();

export interface Cached<T> {
  data: T;
  /** True when the entry is past its TTL but served because the upstream refresh failed. */
  stale: boolean;
  fetchedAt: number;
}

/**
 * TTL cache with stale-on-error: within TTL returns the cached value; past TTL
 * re-fetches, and if the fetch fails but an old value exists, serves it flagged stale.
 * Concurrent requests for the same key share one in-flight fetch (no upstream fan-out).
 */
const inflight = new Map<string, Promise<Cached<unknown>>>();

export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<Cached<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return { data: hit.value, stale: false, fetchedAt: hit.fetchedAt };
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<Cached<T>>;

  const run = (async (): Promise<Cached<T>> => {
    try {
      const value = await fetcher();
      const fetchedAt = Date.now();
      store.set(key, { value, fetchedAt, expiresAt: fetchedAt + ttlMs });
      return { data: value, stale: false, fetchedAt };
    } catch (err) {
      if (hit) {
        return { data: hit.value, stale: true, fetchedAt: hit.fetchedAt };
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run as Promise<Cached<unknown>>);
  return run;
}

/** Upstream fetch with the Simmer User-Agent and a hard timeout. */
export async function upstream(url: string, timeoutMs = 10_000): Promise<Response> {
  const res = await fetch(url, {
    headers: { "User-Agent": env.userAgent },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Upstream ${url} responded ${res.status}`);
  return res;
}
