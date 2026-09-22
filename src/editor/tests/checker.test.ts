import { describe, it, expect } from "vitest";
import { checkerTiles } from "../canvas/checker";

const SIZE = 10;

describe("checkerTiles (transparency checkerboard display)", () => {
  it("uses a fixed tile size no matter the covered rect size (zoom-stable)", () => {
    const rects = [
      [640, 400],
      [320, 200],
      [80, 50],
      [21, 13],
      [2000, 1500],
    ] as const;
    for (const [w, h] of rects) {
      const tiles = checkerTiles(0, 0, w, h, SIZE);
      expect(tiles.length).toBeGreaterThan(0);
      for (const t of tiles) {
        expect(t.size).toBe(SIZE);
        expect(t.x % SIZE).toBe(0);
        expect(t.y % SIZE).toBe(0);
      }
    }
  });

  it("strictly alternates light/dark in both axes", () => {
    const tiles = checkerTiles(0, 0, 40, 40, SIZE);
    const cell = (c: number, r: number) =>
      tiles.find((t) => t.x === c * SIZE && t.y === r * SIZE)!.light;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        expect(cell(c, r)).toBe((r + c) % 2 === 0);
        expect(cell(c, r)).not.toBe(cell(c + 1, r));
        expect(cell(c, r)).not.toBe(cell(c, r + 1));
      }
    }
  });

  it("covers the full rect edge-to-edge with tightly packed tiles (no seams)", () => {
    const x = 123;
    const y = -47;
    const w = 415;
    const h = 231;
    const tiles = checkerTiles(x, y, w, h, SIZE);
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    expect(Math.min(...xs)).toBeLessThanOrEqual(x);
    expect(Math.max(...xs) + SIZE).toBeGreaterThanOrEqual(x + w);
    expect(Math.min(...ys)).toBeLessThanOrEqual(y);
    expect(Math.max(...ys) + SIZE).toBeGreaterThanOrEqual(y + h);

    const byRow = new Map<number, number[]>();
    for (const t of tiles) {
      const row = byRow.get(t.y) ?? [];
      row.push(t.x);
      byRow.set(t.y, row);
    }
    for (const rowXs of byRow.values()) {
      rowXs.sort((a, b) => a - b);
      for (let i = 1; i < rowXs.length; i++) expect(rowXs[i] - rowXs[i - 1]).toBe(SIZE);
    }
    const rows = [...byRow.keys()].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i++) expect(rows[i] - rows[i - 1]).toBe(SIZE);
  });

  it("keeps the checker phase anchored in screen space while panning (seamless)", () => {
    const cellAt = (vx: number, vy: number, w: number, h: number) => {
      const t = checkerTiles(vx, vy, w, h, SIZE).find(
        (tile) => 70 >= tile.x && 70 < tile.x + SIZE && 55 >= tile.y && 55 < tile.y + SIZE
      );
      if (!t) throw new Error("view rect does not contain the target cell");
      return t;
    };
    const a = cellAt(0, 0, 200, 120);
    const b = cellAt(37, -19, 200, 120);
    const c = cellAt(-300, -250, 500, 400);
    const d = cellAt(70, 55, 40, 40);
    for (const view of [b, c, d]) {
      expect(view.x).toBe(a.x);
      expect(view.y).toBe(a.y);
      expect(view.light).toBe(a.light);
    }
  });

  it("returns no tiles for degenerate rects or sizes", () => {
    expect(checkerTiles(0, 0, 0, 100, SIZE)).toEqual([]);
    expect(checkerTiles(0, 0, -10, 100, SIZE)).toEqual([]);
    expect(checkerTiles(0, 0, 100, 0, SIZE)).toEqual([]);
    expect(checkerTiles(0, 0, Number.NaN, 100, SIZE)).toEqual([]);
    expect(checkerTiles(0, 0, 100, 100, 0)).toEqual([]);
    expect(checkerTiles(0, 0, 100, 100, -5)).toEqual([]);
  });
});