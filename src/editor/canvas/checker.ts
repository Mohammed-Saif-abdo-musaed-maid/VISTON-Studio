/**
 * Pure tile math for the transparency checkerboard overlay.
 *
 * The checkerboard is DISPLAY-ONLY: it never touches image pixels, export,
 * save/load or history. Drawer code consumes this helper to paint tiles.
 *
 * The tile grid is anchored to SCREEN (view) space, not to document pixels.
 * Tiles are always `size` CSS pixels — independent of the current zoom — so
 * the grid stays visually consistent across 25% .. 400% zoom. Parity is derived
 * from absolute cell indices so the pattern is seamless while panning.
 */
export interface CheckerTile {
  x: number;
  y: number;
  size: number;
  light: boolean;
}

/** Tiles covering the rect [x, x+w] × [y, y+h], aligned to the `size` grid. */
export function checkerTiles(x: number, y: number, w: number, h: number, size: number): CheckerTile[] {
  if (!Number.isFinite(size) || size <= 0) return [];
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return [];
  const c0 = Math.floor(x / (2 * size)) * 2;
  const r0 = Math.floor(y / (2 * size)) * 2;
  const cols = Math.ceil((x + w - c0 * size) / size) + 1;
  const rows = Math.ceil((y + h - r0 * size) / size) + 1;
  const tiles: CheckerTile[] = [];
  for (let r = r0; r < r0 + rows; r++) {
    for (let c = c0; c < c0 + cols; c++) {
      tiles.push({ x: c * size, y: r * size, size, light: (r + c) % 2 === 0 });
    }
  }
  return tiles;
}