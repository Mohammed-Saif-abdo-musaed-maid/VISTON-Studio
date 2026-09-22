import type { LayerTransform } from "../core/types";

const degToRad = (d: number) => (d * Math.PI) / 180;

export interface GizmoInfo {
  points: Record<string, { x: number; y: number }>;
  center: { x: number; y: number };
  axisU: { x: number; y: number };
  axisV: { x: number; y: number };
}

const HANDLE_NAMES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const MIN_SIZE = 0.5;

function halfExtents(t: LayerTransform): { hx: number; hy: number } {
  return {
    hx: Math.abs(t.width * t.scaleX) / 2,
    hy: Math.abs(t.height * t.scaleY) / 2,
  };
}

export function gizmoInfo(t: LayerTransform): GizmoInfo {
  const a = degToRad(t.rotation);
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const v = { x: -Math.sin(a), y: Math.cos(a) };
  const sx = Math.sign(t.scaleX) || 1;
  const sy = Math.sign(t.scaleY) || 1;
  const { hx, hy } = halfExtents(t);
  const center = {
    x: t.x + u.x * hx * sx + v.x * hy * sy,
    y: t.y + u.y * hx * sx + v.y * hy * sy,
  };
  const at = (ux: number, vy: number) => ({
    x: center.x + u.x * hx * ux + v.x * hy * vy,
    y: center.y + u.y * hx * ux + v.y * hy * vy,
  });
  return {
    points: {
      nw: at(-1, -1),
      n: at(0, -1),
      ne: at(1, -1),
      e: at(1, 0),
      se: at(1, 1),
      s: at(0, 1),
      sw: at(-1, 1),
      w: at(-1, 0),
    },
    center,
    axisU: u,
    axisV: v,
  };
}

export function gizmoRotationHandle(t: LayerTransform): { x: number; y: number } {
  const { points, center, axisV } = gizmoInfo(t);
  const dist = Math.max(Math.hypot(points.ne.x - points.nw.x, points.ne.y - points.nw.y), 40);
  return {
    x: center.x - axisV.x * (dist / 2 + 26),
    y: center.y - axisV.y * (dist / 2 + 26),
  };
}

export function gizmoHandleAt(t: LayerTransform, docP: { x: number; y: number }, hitPx: number, zoom: number): string | null {
  const { points } = gizmoInfo(t);
  const threshold = hitPx / zoom;
  let best: string | null = null;
  let bestD = threshold;
  for (const name of HANDLE_NAMES) {
    const p = points[name];
    const d = Math.hypot(p.x - docP.x, p.y - docP.y);
    if (d < bestD) { bestD = d; best = name; }
  }
  const rh = gizmoRotationHandle(t);
  const dRot = Math.hypot(rh.x - docP.x, rh.y - docP.y);
  if (dRot < bestD) { bestD = dRot; best = "rotate"; }
  return best;
}

/**
 * Compute the new transform when dragging a gizmo handle.
 * `pointer` is the current pointer position in document space.
 */
export function resizeTransform(
  t: LayerTransform,
  handle: string,
  pointer: { x: number; y: number },
  aspectLock: boolean
): LayerTransform {
  const info = gizmoInfo(t);
  const u = info.axisU;
  const v = info.axisV;
  const c = info.center;
  const { hx, hy } = halfExtents(t);

  // Pointer in rotated local coordinates, relative to the center.
  const qx = (pointer.x - c.x) * u.x + (pointer.y - c.y) * u.y;
  const qy = (pointer.x - c.x) * v.x + (pointer.y - c.y) * v.y;

  const right = handle.includes("e") && !handle.includes("w");
  const left = handle.includes("w") && !handle.includes("e");
  const bottom = handle.includes("s") && !handle.includes("n");
  const top = handle.includes("n") && !handle.includes("s");

  let hx1 = hx;
  let hy1 = hy;

  if (right) {
    const raw = Math.max(qx, MIN_SIZE);
    hx1 = (raw + hx) / 2;
  } else if (left) {
    const raw = Math.min(qx, -MIN_SIZE);
    hx1 = (hx - raw) / 2;
  }
  if (bottom) {
    const raw = Math.max(qy, MIN_SIZE);
    hy1 = (raw + hy) / 2;
  } else if (top) {
    const raw = Math.min(qy, -MIN_SIZE);
    hy1 = (hy - raw) / 2;
  }

  const isCorner = (right || left) && (top || bottom);
  if (isCorner && aspectLock) {
    const ratio = hx / Math.max(hy, 1e-6);
    const m = Math.max(hx1, hy1 * ratio);
    hx1 = m;
    hy1 = m / ratio;
  }

  // New center offset in local coordinates (relative to old center).
  // Dragged edge lands at the raw pointer position; opposite edge stays fixed.
  let cx = 0;
  let cy = 0;
  if (hx1 !== hx) {
    cx = right ? hx1 - hx : left ? hx - hx1 : 0;
  }
  if (hy1 !== hy) {
    cy = bottom ? hy1 - hy : top ? hy - hy1 : 0;
  }
  if (isCorner && aspectLock) {
    cx = hx1 - hx;
    cy = hy1 - hy;
    if (left) cx = hx - hx1;
    if (top) cy = hy - hy1;
  }

  const sx = (Math.sign(t.scaleX) || 1) * ((hx1 * 2) / Math.max(t.width, 1));
  const sy = (Math.sign(t.scaleY) || 1) * ((hy1 * 2) / Math.max(t.height, 1));

  const newC = {
    x: c.x + u.x * cx + v.x * cy,
    y: c.y + u.y * cx + v.y * cy,
  };

  const a = degToRad(t.rotation);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hwx = (sx * t.width) / 2;
  const hwy = (sy * t.height) / 2;
  // (x,y) such that the rendered center lands on newC:
  //   newC = (x,y) + R(a) * (hwx, hwy)
  const rx = hwx * cos - hwy * sin;
  const ry = hwx * sin + hwy * cos;

  return {
    ...t,
    x: newC.x - rx,
    y: newC.y - ry,
    scaleX: sx,
    scaleY: sy,
  };
}

/**
 * Compute rotation (degrees) so the layer's -V axis points from center to pointer.
 */
export function rotateTransform(t: LayerTransform, pointer: { x: number; y: number }): LayerTransform {
  const c = gizmoInfo(t).center;
  const angle = Math.atan2(pointer.y - c.y, pointer.x - c.x);
  const rot = (angle * 180) / Math.PI + 90;
  return { ...t, rotation: rot };
}

const deg = (rad: number) => (rad * 180) / Math.PI;
const clampSkew = (v: number) => Math.max(-85, Math.min(85, v));

/**
 * Skew (shear) bound to the edge the pointer is near, in degrees.
 * Dragging the top/bottom edge horizontally shears along X;
 * dragging the left/right edge vertically shears along Y.
 */
export function skewTransform(t: LayerTransform, handle: string, pointer: { x: number; y: number }): LayerTransform {
  const info = gizmoInfo(t);
  const u = info.axisU;
  const v = info.axisV;
  const c = info.center;
  const { hx, hy } = halfExtents(t);
  const qx = (pointer.x - c.x) * u.x + (pointer.y - c.y) * u.y;
  const qy = (pointer.x - c.x) * v.x + (pointer.y - c.y) * v.y;
  if (handle === "n" || handle === "s") {
    const skewX = deg(Math.atan2(qx, Math.max(hy, 1e-3)));
    return { ...t, skewX: clampSkew(handle === "s" ? -skewX : skewX) };
  }
  if (handle === "e" || handle === "w") {
    const skewY = deg(Math.atan2(qy, Math.max(hx, 1e-3)));
    return { ...t, skewY: clampSkew(handle === "w" ? -skewY : skewY) };
  }
  return { ...t };
}