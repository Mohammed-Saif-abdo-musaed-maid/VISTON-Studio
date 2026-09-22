export interface HistoryEntry {
  id: number;
  name: string;
  bytes: number;
  thumb?: string | null;
  undo: () => void;
  redo: () => void;
}

export interface HistoryItem {
  id: number;
  name: string;
  bytes: number;
  thumb: string | null;
}

export interface HistoryManagerOptions {
  maxEntries?: number;
  maxBytes?: number;
  onChange?: () => void;
}

let HISTORY_ID = 1;

export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private index = -1;
  private totalBytes = 0;
  private maxEntries: number;
  private maxBytes: number;
  private onChange?: () => void;

  constructor(opts: HistoryManagerOptions = {}) {
    this.maxEntries = opts.maxEntries ?? 200;
    this.maxBytes = opts.maxBytes ?? 512 * 1024 * 1024;
    this.onChange = opts.onChange;
  }

  push(entry: Omit<HistoryEntry, "id">): void {
    while (this.entries.length > this.index + 1) {
      const dropped = this.entries.pop();
      if (dropped) this.totalBytes -= dropped.bytes;
    }
    const e: HistoryEntry = { ...entry, id: HISTORY_ID++ };
    this.entries.push(e);
    this.index = this.entries.length - 1;
    this.totalBytes += e.bytes;
    while (this.entries.length > this.maxEntries) {
      const dropped = this.entries.shift();
      if (dropped) {
        this.totalBytes -= dropped.bytes;
        this.index -= 1;
      }
    }
    while (this.totalBytes > this.maxBytes && this.entries.length > 1) {
      const dropped = this.entries.shift();
      if (dropped) {
        this.totalBytes -= dropped.bytes;
        this.index -= 1;
      }
    }
    this.onChange?.();
  }

  get current(): HistoryEntry | null {
    if (this.index < 0 || this.index >= this.entries.length) return null;
    return this.entries[this.index];
  }

  canUndo(): boolean {
    return this.index >= 0;
  }

  canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  undo(): boolean {
    const e = this.current;
    if (!e) return false;
    e.undo();
    this.index -= 1;
    this.onChange?.();
    return true;
  }

  redo(): boolean {
    const next = this.entries[this.index + 1];
    if (!next) return false;
    const e = next;
    this.index += 1;
    e.redo();
    this.onChange?.();
    return true;
  }

  /** Move to an absolute history index by replaying undo/redo closures. */
  jumpTo(target: number): boolean {
    if (this.entries.length === 0) return false;
    const clamped = Math.max(-1, Math.min(target, this.entries.length - 1));
    if (clamped === this.index) return false;
    while (this.index > clamped) {
      const e = this.current;
      if (!e) break;
      e.undo();
      this.index -= 1;
    }
    while (this.index < clamped) {
      const next = this.entries[this.index + 1];
      if (!next) break;
      this.index += 1;
      next.redo();
    }
    this.onChange?.();
    return true;
  }

  items(): HistoryItem[] {
    return this.entries.map((e) => ({ id: e.id, name: e.name, bytes: e.bytes, thumb: e.thumb ?? null }));
  }

  currentIndex(): number {
    return this.index;
  }

  reset(): void {
    this.entries = [];
    this.index = -1;
    this.totalBytes = 0;
    this.onChange?.();
  }
}