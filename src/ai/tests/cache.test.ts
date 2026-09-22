import { describe, it, expect } from "vitest";
import { AICache } from "../services/AICache";
import type { AIResult } from "../types";

function result(tag: string): AIResult {
  return { text: tag } as unknown as AIResult;
}

describe("AICache (LRU)", () => {
  it("stores and returns results by key", () => {
    const cache = new AICache(2);
    cache.enqueue("a", result("A"));
    expect(cache.get("a")?.text).toBe("A");
    expect(cache.has("a")).toBe(true);
    expect(cache.size()).toBe(1);
  });

  it("evicts the least recently used entry, not merely the oldest", () => {
    const cache = new AICache(2);
    cache.enqueue("a", result("A"));
    cache.enqueue("b", result("B"));
    // touch "a" so "b" becomes the least recently used
    expect(cache.get("a")?.text).toBe("A");
    cache.enqueue("c", result("C"));
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("re-inserting an existing key refreshes it without growing the cache", () => {
    const cache = new AICache(2);
    cache.enqueue("a", result("A1"));
    cache.enqueue("b", result("B"));
    cache.enqueue("a", result("A2"));
    expect(cache.size()).toBe(2);
    expect(cache.get("a")?.text).toBe("A2");
  });

  it("clear empties the cache", () => {
    const cache = new AICache(4);
    cache.enqueue("a", result("A"));
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has("a")).toBe(false);
  });
});
