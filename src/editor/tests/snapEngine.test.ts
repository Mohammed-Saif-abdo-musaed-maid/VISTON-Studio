import { describe, it, expect } from "vitest";
import {
  DEFAULT_SNAP_SETTINGS,
  collectSnapCandidates,
  nearestSnap,
  snapMove,
  snapPoint,
  type SnapContext,
  type SnapSettings,
} from "../snap/snapEngine";
import type { Guide } from "../../state/store";
import type { Artboard } from "../core/artboards";

const guide = (id: string, orientation: "h" | "v", position: number): Guide => ({ id, orientation, position });
const artboard = (x: number, y: number, width: number, height: number): Artboard => ({
  id: `ab-${x}-${y}`,
  name: "A",
  x,
  y,
  width,
  height,
  background: null,
  visible: true,
});

const ctx: SnapContext = {
  guides: [guide("g1", "v", 100), guide("g2", "h", 50)],
  artboards: [artboard(300, 200, 100, 80)],
  layerBounds: [{ x: 500, y: 400, width: 40, height: 20 }],
  docWidth: 800,
  docHeight: 600,
};

const settings = (over: Partial<SnapSettings> = {}): SnapSettings => ({ ...DEFAULT_SNAP_SETTINGS, enabled: true, ...over });

describe("Snapping engine (Phase 30)", () => {
  it("does nothing when disabled", () => {
    const r = snapMove({ x: 0, y: 0, width: 10, height: 10 }, 97, 5, settings({ enabled: false }), ctx);
    expect(r.dx).toBe(97);
    expect(r.dy).toBe(5);
    expect(r.lines).toHaveLength(0);
    expect(r.snappedX).toBe(false);
  });

  it("snaps a layer's left edge to a vertical guide", () => {
    const r = snapMove({ x: 0, y: 0, width: 40, height: 40 }, 97, 300, settings(), ctx);
    expect(r.dx).toBe(100);
    expect(r.snappedX).toBe(true);
    expect(r.lines.some((l) => l.kind === "guide" && l.position === 100)).toBe(true);
  });

  it("snaps to the document centre", () => {
    const r = snapMove({ x: 0, y: 0, width: 100, height: 100 }, 352, 500, settings({ artboards: false }), ctx);
    expect(r.dx).toBe(350);
    expect(r.snappedX).toBe(true);
    expect(r.lines.some((l) => l.kind === "center")).toBe(true);
  });

  it("snaps to another layer's edges", () => {
    const r = snapMove({ x: 0, y: 0, width: 40, height: 20 }, 462, 0, settings(), ctx);
    expect(r.dx).toBe(460);
    expect(r.lines.some((l) => l.kind === "layer" && l.position === 500)).toBe(true);
  });

  it("snaps to artboard edges", () => {
    const r = snapMove({ x: 0, y: 0, width: 20, height: 20 }, 298, 700, settings(), ctx);
    expect(r.dx).toBe(300);
    expect(r.lines.some((l) => l.kind === "artboard" && l.position === 300)).toBe(true);
  });

  it("snaps to the grid step", () => {
    const r = snapPoint(63, 129, settings({ gridSpacing: 16, guides: false, center: false, edges: false, layers: false, artboards: false }), ctx);
    expect(r.x).toBe(64);
    expect(r.y).toBe(128);
    expect(r.lines.every((l) => l.kind === "grid")).toBe(true);
  });

  it("respects tolerance and picks the closest candidate", () => {
    const far = snapMove({ x: 0, y: 0, width: 10, height: 10 }, 80, 0, settings({ tolerance: 5 }), ctx);
    expect(far.dx).toBe(80);
    const near = snapMove({ x: 0, y: 0, width: 10, height: 10 }, 98, 0, settings({ tolerance: 5 }), ctx);
    expect(near.dx).toBe(100);
  });

  it("can be restricted per target type", () => {
    const onlyGuides = settings({ grid: false, layers: false, center: false, edges: false, artboards: false });
    const cands = collectSnapCandidates("x", onlyGuides, ctx);
    expect(cands.every((c) => c.kind === "guide")).toBe(true);
    expect(cands.map((c) => c.position)).toEqual([100]);
  });

  it("nearestSnap reports the candidate for resize handles", () => {
    const r = nearestSnap(48, "y", settings(), ctx);
    expect(r.value).toBe(50);
    expect(r.candidate?.kind).toBe("guide");
  });
});
