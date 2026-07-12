/**
 * Simple in-memory TTL cache for read-only contract calls.
 *
 * Avoids redundant Soroban RPC requests by caching results for a
 * configurable duration. All cache entries are keyed by a string
 * (typically `method:arg1:arg2`) and automatically expire.
 */

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000; // 30 seconds

class MemoryCache {
  private store = new Map<string, CacheEntry>();

  /** Return cached value, or undefined if missing / expired. */
  get<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** Store a value with an optional TTL (defaults to 30 s). */
  set<T = unknown>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Remove a single key. */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Current number of (possibly stale) entries. */
  get size(): number {
    return this.store.size;
  }
}

/** Singleton cache instance used across the app. */
export const cache = new MemoryCache();

/**
 * Build a deterministic cache key from a method name and its arguments.
 */
export function cacheKey(method: string, ...args: string[]): string {
  if (args.length === 0) return method;
  return `${method}:${args.join(":")}`;
}
