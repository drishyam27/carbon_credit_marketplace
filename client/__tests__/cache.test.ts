import { describe, it, expect, beforeEach } from "vitest";
import { cache, cacheKey } from "@/lib/cache";

describe("cacheKey", () => {
  it("builds a deterministic key from method and args", () => {
    expect(cacheKey("get_listing", "42")).toBe("get_listing:42");
  });

  it("returns method alone when no args provided", () => {
    expect(cacheKey("get_active_listings")).toBe("get_active_listings");
  });

  it("joins multiple args with colons", () => {
    expect(cacheKey("method", "a", "b", "c")).toBe("method:a:b:c");
  });
});

describe("MemoryCache", () => {
  beforeEach(() => cache.clear());

  it("stores and retrieves a value", () => {
    cache.set("key1", { balance: 100n });
    expect(cache.get("key1")).toEqual({ balance: 100n });
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("nope")).toBeUndefined();
  });

  it("expires entries after TTL", () => {
    cache.set("expiring", "data", 0); // 0ms TTL → already expired
    expect(cache.get("expiring")).toBeUndefined();
  });

  it("deletes a single key", () => {
    cache.set("del", 1);
    cache.delete("del");
    expect(cache.get("del")).toBeUndefined();
  });

  it("clears all entries", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("returns correct size", () => {
    cache.set("x", 1);
    cache.set("y", 2);
    expect(cache.size).toBe(2);
  });
});
