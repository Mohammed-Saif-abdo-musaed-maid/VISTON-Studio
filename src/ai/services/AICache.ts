import type { AIResult } from "../types";

/**
 * Memory-backed result cache with true LRU eviction. Matches requests through
 * their stable cache key (provider, model, operation, source hash, selection
 * hash, prompt, params). Large canvases are intentionally not written to
 * localStorage.
 */
export class AICache {
  private entries = new Map<string, AIResult>();
  private maxEntries: number;

  constructor(maxEntries = 64) {
    this.maxEntries = maxEntries;
  }

  enqueue(key: string, result: AIResult): void {
    if (!key) return;
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, result);
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
  }

  get(key: string): AIResult | undefined {
    const hit = this.entries.get(key);
    if (hit === undefined) return undefined;
    // Refresh recency so frequently used results survive eviction.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}