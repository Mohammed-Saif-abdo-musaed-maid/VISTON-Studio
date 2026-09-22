/**
 * Phase 30 — Centralised snapping engine.
 *
 * One resolver used by every tool that needs alignment, instead of ad-hoc
 * `if (Math.abs(x - target) < 5)` checks scattered per tool. It supports
 * snapping to the grid, guides, artboards, document edges/centre and other
 * layers' edges/centres, with a tolerance expressed in document pixels (the
 * caller divides a screen tolerance by the zoom so the feel stays constant).
 *
 * Pure and deterministic: given the same inputs it returns the same result and
 * never mutates its arguments.
 */

import type { Guide } from "../../state/store";
import type { Artboard } from "../core/artboards";

export type SnapAxis = "x" | "y";
export type SnapKind = "grid" | "guide" | "layer" | "center" | "edge" | "artboard";

export interface SnapSettings {
  enabled: boolean;
  grid: boolean;
  guides: boolean;
  layers: boolean;
  center: boolean;
  edges: boolean;
  artboards: boolean;
  /** Minor grid step in document pixels (0 disables grid snapping). */
  gridSpacing: number;
  /** Tolerance in document pixels. */
  tolerance: number;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: false,
  grid: true,
  guides: true,
  layers: true,
  center: true,
  edges: true,
  artboards: true,
  gridSpacing: 0,
  tolerance: 6,
};

export interface SnapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapContext {
  guides: readonly Guide[];
  artboards: readonly Artboard[];
  /** Bounds of other (non-moving) layers in document space. */
  layerBounds: readonly SnapRect[];
  docWidth: number;
  docHeight: number;
}

export interface SnapCandidate {
  axis: SnapAxis;
  position: number;
  kind: SnapKind;
}

export interface SnapLine extends SnapCandidate {
  /** Extent of the alignment guide overlay in document space. */
  from: number;
  to: number;
}

export interface SnapResult {
  x: number;
  y: number;
  dx: number;
  dy: number;
  snappedX: boolean;
  snappedY: boolean;
  lines: SnapLine[];
}

interface Match {
  delta: number;
  candidate: SnapCandidate;
}

const EMPTY_CONTEXT: SnapContext = { guides: [], artboards: [], layerBounds: [], docWidth: 0, docHeight: 0 };

export function collectSnapCandidates(axis: SnapAxis, settings: SnapSettings, context: SnapContext): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  const extent = axis === "x" ? context.docWidth : context.docHeight;
  if (settings.edges) {
    out.push({ axis, position: 0, kind: "edge" });
    out.push({ axis, position: extent, kind: "edge" });
  }
  if (settings.center) {
    out.push({ axis, position: extent / 2, kind: "center" });
  }
  if (settings.guides) {
    for (const g of context.guides) {
      if (axis === "x" && g.orientation === "v") out.push({ axis, position: g.position, kind: "guide" });
      if (axis === "y" && g.orientation === "h") out.push({ axis, position: g.position, kind: "guide" });
    }
  }
  if (settings.artboards) {
    for (const ab of context.artboards) {
      if (axis === "x") {
        out.push({ axis, position: ab.x, kind: "artboard" });
        out.push({ axis, position: ab.x + ab.width / 2, kind: "artboard" });
        out.push({ axis, position: ab.x + ab.width, kind: "artboard" });
      } else {
        out.push({ axis, position: ab.y, kind: "artboard" });
        out.push({ axis, position: ab.y + ab.height / 2, kind: "artboard" });
        out.push({ axis, position: ab.y + ab.height, kind: "artboard" });
      }
    }
  }
  if (settings.layers) {
    for (const r of context.layerBounds) {
      if (axis === "x") {
        out.push({ axis, position: r.x, kind: "layer" });
        out.push({ axis, position: r.x + r.width / 2, kind: "layer" });
        out.push({ axis, position: r.x + r.width, kind: "layer" });
      } else {
        out.push({ axis, position: r.y, kind: "layer" });
        out.push({ axis, position: r.y + r.height / 2, kind: "layer" });
        out.push({ axis, position: r.y + r.height, kind: "layer" });
      }
    }
  }
  return out;
}

function bestMatch(
  axis: SnapAxis,
  targets: readonly number[],
  settings: SnapSettings,
  context: SnapContext
): Match | null {
  const tolerance = Math.max(0, settings.tolerance);
  if (tolerance <= 0) return null;
  const candidates = collectSnapCandidates(axis, settings, context);
  let best: Match | null = null;
  const consider = (delta: number, candidate: SnapCandidate): void => {
    if (Math.abs(delta) > tolerance) return;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, candidate };
  };
  for (const target of targets) {
    for (const c of candidates) consider(c.position - target, c);
    if (settings.grid && settings.gridSpacing > 0) {
      const gridPos = Math.round(target / settings.gridSpacing) * settings.gridSpacing;
      consider(gridPos - target, { axis, position: gridPos, kind: "grid" });
    }
  }
  return best;
}

function boundsTargets(axis: SnapAxis, rect: SnapRect): number[] {
  return axis === "x"
    ? [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
    : [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function lineFor(candidate: SnapCandidate, rect: SnapRect): SnapLine {
  return candidate.axis === "x"
    ? { ...candidate, from: rect.y, to: rect.y + rect.height }
    : { ...candidate, from: rect.x, to: rect.x + rect.width };
}

/** Snap a single point (cursor / creation anchor). */
export function snapPoint(
  x: number,
  y: number,
  settings: SnapSettings,
  context: SnapContext = EMPTY_CONTEXT
): { x: number; y: number; lines: SnapLine[] } {
  if (!settings.enabled) return { x, y, lines: [] };
  const mx = bestMatch("x", [x], settings, context);
  const my = bestMatch("y", [y], settings, context);
  const lines: SnapLine[] = [];
  const point: SnapRect = { x, y, width: 0, height: 0 };
  if (mx) lines.push(lineFor(mx.candidate, point));
  if (my) lines.push(lineFor(my.candidate, point));
  return { x: mx ? x + mx.delta : x, y: my ? y + my.delta : y, lines };
}

/**
 * Snap a moved rectangle. `bounds` is the pre-drag document-space bounds and
 * `dx`/`dy` the raw delta; the returned delta is the snapped one.
 */
export function snapMove(
  bounds: SnapRect,
  dx: number,
  dy: number,
  settings: SnapSettings,
  context: SnapContext = EMPTY_CONTEXT
): SnapResult {
  if (!settings.enabled) {
    return { x: bounds.x + dx, y: bounds.y + dy, dx, dy, snappedX: false, snappedY: false, lines: [] };
  }
  const proposed: SnapRect = { x: bounds.x + dx, y: bounds.y + dy, width: bounds.width, height: bounds.height };
  const mx = bestMatch("x", boundsTargets("x", proposed), settings, context);
  const my = bestMatch("y", boundsTargets("y", proposed), settings, context);
  const outDx = dx + (mx?.delta ?? 0);
  const outDy = dy + (my?.delta ?? 0);
  const snapped: SnapRect = { x: bounds.x + outDx, y: bounds.y + outDy, width: bounds.width, height: bounds.height };
  const lines: SnapLine[] = [];
  if (mx) lines.push(lineFor(mx.candidate, snapped));
  if (my) lines.push(lineFor(my.candidate, snapped));
  return {
    x: snapped.x,
    y: snapped.y,
    dx: outDx,
    dy: outDy,
    snappedX: mx !== null,
    snappedY: my !== null,
    lines,
  };
}

/** Nearest snap value for a single edge (used by resize handles). */
export function nearestSnap(
  value: number,
  axis: SnapAxis,
  settings: SnapSettings,
  context: SnapContext = EMPTY_CONTEXT
): { value: number; candidate: SnapCandidate | null } {
  if (!settings.enabled) return { value, candidate: null };
  const m = bestMatch(axis, [value], settings, context);
  return m ? { value: value + m.delta, candidate: m.candidate } : { value, candidate: null };
}
