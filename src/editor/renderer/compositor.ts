import type {
  AdjustmentLayer,
  BlendMode,
  Layer,
  LayerTransform,
  TextLayer,
} from "../core/types";
import { hasAnyStyle } from "../core/types";
import { EditorDocument, PixelStore, maskStore } from "../core/document";
import { createCanvas, getContext2d } from "../../utils/canvas";
import { drawTextLayer } from "./textRenderer";
import { drawShapeLayer } from "./shapeRenderer";
import { applyLayerStyles, StyledOutput } from "./styleRenderer";
import { runProcess, ProcessOp } from "../processing/processor";
import { degToRad } from "../../utils/math";

/** Every blend mode maps to a native Canvas2D composite operator. */
const canvasBlendOp: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  "soft-light": "soft-light",
  "hard-light": "hard-light",
  darken: "darken",
  lighten: "lighten",
  difference: "difference",
  exclusion: "exclusion",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

export const BLEND_OP_FOR_TEST: Record<BlendMode, GlobalCompositeOperation> = canvasBlendOp;

export function blendModeSupported(mode: BlendMode): boolean {
  return mode in canvasBlendOp;
}

interface Node {
  layer: Layer;
  children: Node[];
}

function buildNodes(layers: Layer[]): Node[] {
  const nodes: Node[] = [];
  let i = 0;
  const consume = (): Node | null => {
    if (i >= layers.length) return null;
    const layer = layers[i++];
    const node: Node = { layer, children: [] };
    if (layer.type === "group") {
      while (i < layers.length && (layers[i].parentId ?? null) === layer.id) {
        const child = consume();
        if (child) node.children.push(child);
      }
    }
    return node;
  };
  while (i < layers.length) {
    const n = consume();
    if (n) nodes.push(n);
  }
  return nodes;
}

export function localMatrix(t: LayerTransform): DOMMatrix {
  const m = new DOMMatrix();
  m.translateSelf(t.x, t.y);
  m.rotateSelf(0, 0, degToRad(t.rotation));
  m.scaleSelf(t.scaleX !== 0 ? t.scaleX : 0.0001, t.scaleY !== 0 ? t.scaleY : 0.0001);
  if (t.skewX !== 0 || t.skewY !== 0) {
    const tx = Math.tan(degToRad(t.skewX));
    const ty = Math.tan(degToRad(t.skewY));
    const a = m.a + m.b * ty;
    const b = m.b + m.a * tx;
    const c = m.c + m.d * ty;
    const d = m.d + m.c * tx;
    return new DOMMatrix([a, b, c, d, m.e, m.f]);
  }
  return m;
}

function matrixForStack(): DOMMatrix {
  return new DOMMatrix();
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function buildLut(fn: (v: number) => number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp(fn(i));
  return lut;
}

function lerpLut(points: number[][], input: number): number {
  if (!points || points.length === 0) return input;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const x = clamp(input);
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const t = (x - x0) / (x1 - x0 || 1);
      return y0 + (y1 - y0) * t;
    }
  }
  return last[1];
}

function levelsLut(black: number, mid: number, white: number): Uint8ClampedArray {
  const range = Math.max(1, white - black);
  return buildLut((v: number) => {
    let c = (v - black) / range;
    if (c < 0) c = 0;
    c = Math.pow(c, 1 / Math.max(0.1, Math.min(9.9, mid)));
    return c * 255;
  });
}

function histogramLut(data: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Float64Array(256);
  const hist2 = new Float64Array(256);
  for (let i = 0; i < data.length; i += 4) {
    hist[data[i]]++;
    hist[data[i + 1]]++;
    hist[data[i + 2]]++;
  }
  for (let i = 0; i < 256; i++) {
    hist2[i] = hist[i];
    if (i > 0) hist2[i] += hist2[i - 1];
  }
  const total = Math.max(1, hist2[255]);
  let lo = 0;
  while (lo < 255 && hist2[lo] === 0) lo++;
  let hi = 255;
  while (hi > 0 && hist2[hi] === hist2[255]) hi--;
  const span = Math.max(1, hi - lo);
  void span;
  return buildLut((v: number) => {
    if (v <= lo) return 0;
    if (v >= hi) return 255;
    return ((hist2[v] - hist2[lo]) / (total - hist2[lo])) * 255;
  });
}

function applyAdjustmentPixels(data: Uint8ClampedArray, adj: AdjustmentLayer): void {
  const kind = adj.adjustment;
  const amount = adj.amount ?? 0;
  const params = adj.params ?? null;
  const stride = data.length;

  switch (kind) {
    case "brightness": {
      const off = (amount / 100) * 255;
      const lut = buildLut((v) => v + off);
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "contrast": {
      const c = (259 * (amount + 255)) / (255 * (259 - amount));
      const lut = buildLut((v) => c * (v - 128) + 128);
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "gamma": {
      const inv = 1 / Math.max(0.01, amount);
      const lut = buildLut((v) => 255 * Math.pow(v / 255, inv));
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "saturation":
    case "vibrance": {
      const useVibrance = kind === "vibrance";
      const base = 1 + amount / 100;
      for (let i = 0; i < stride; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let boost = base;
        if (useVibrance) {
          const maxc = Math.max(r, g, b);
          const minc = Math.min(r, g, b);
          const sat = maxc > 0 ? (maxc - minc) / Math.max(1, maxc) : 0;
          const weights = Math.max(0, 1 - sat * (l / 255));
          boost = 1 + (amount / 100) * weights;
        }
        data[i] = clamp(l + (r - l) * boost);
        data[i + 1] = clamp(l + (g - l) * boost);
        data[i + 2] = clamp(l + (b - l) * boost);
      }
      return;
    }
    case "exposure": {
      const mult = Math.pow(2, amount);
      const lut = buildLut((v) => v * mult);
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "hue": {
      // Degrees (same semantics as the processor bake path).
      const a = ((amount % 360) * Math.PI) / 180;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      for (let i = 0; i < stride; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const l = 0.213 * r + 0.715 * g + 0.072 * b;
        const r2 = l + (0.787 * r - 0.715 * g - 0.072 * b) * cosA + (-0.213 * r + 0.285 * g - 0.072 * b) * sinA;
        const g2 = l + (-0.213 * r + 0.285 * g - 0.072 * b) * cosA + (0.143 * r + 0.14 * g - 0.283 * b) * sinA;
        const b2 = l + (-0.213 * r - 0.715 * g + 0.928 * b) * cosA + (-0.787 * r + 0.715 * g + 0.072 * b) * sinA;
        data[i] = clamp(r2);
        data[i + 1] = clamp(g2);
        data[i + 2] = clamp(b2);
      }
      return;
    }
    case "temperature": {
      const a = amount / 100;
      const rMul = 1 + a * 0.35;
      const bMul = 1 - a * 0.35;
      for (let i = 0; i < stride; i += 4) {
        data[i] = clamp(data[i] * rMul);
        data[i + 2] = clamp(data[i + 2] * bMul);
      }
      return;
    }
    case "colorBalance": {
      const cb = params?.colorBalance;
      if (cb) {
        for (let i = 0; i < stride; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          let dr = 0;
          let dg = 0;
          let db = 0;
          if (l < 85) {
            dr = cb.shadows;
            dg = -cb.shadows * 0.5;
            db = -cb.shadows;
          } else if (l > 170) {
            dr = cb.highlights;
            dg = -cb.highlights * 0.5;
            db = -cb.highlights;
          } else {
            dr = cb.midtones;
            dg = -cb.midtones * 0.5;
            db = -cb.midtones;
          }
          data[i] = clamp(r + dr);
          data[i + 1] = clamp(g + dg);
          data[i + 2] = clamp(b + db);
        }
      }
      return;
    }
    case "shadows": {
      const f = 1 + amount / 100;
      for (let i = 0; i < stride; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const w = 1 - l / 255;
        data[i] = clamp(r * (1 + w * (f - 1)));
        data[i + 1] = clamp(g * (1 + w * (f - 1)));
        data[i + 2] = clamp(b * (1 + w * (f - 1)));
      }
      return;
    }
    case "highlights": {
      const f = 1 - amount / 100;
      for (let i = 0; i < stride; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const w = l / 255;
        data[i] = clamp(r * (1 + w * (f - 1)));
        data[i + 1] = clamp(g * (1 + w * (f - 1)));
        data[i + 2] = clamp(b * (1 + w * (f - 1)));
      }
      return;
    }
    case "levels": {
      const p = params?.levels;
      if (!p) return;
      const lut = levelsLut(p.black ?? 0, p.mid ?? 1, p.white ?? 255);
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "curves": {
      const pts = params?.curves;
      if (!pts) return;
      const lut = buildLut((v) => lerpLut(pts, v));
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "equalize": {
      const lut = histogramLut(data);
      for (let i = 0; i < stride; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
      }
      return;
    }
    case "tint":
    case "blackWhite":
    case "channelMixer":
    case "selectiveColor":
    case "gradientMap":
    case "colorLookup": {
      // Delegate to the processor so the non-destructive render path and the
      // destructive bake path share one implementation (guaranteed parity).
      const op = kind as ProcessOp;
      const out = runProcess(op, 0, 0, data, {
        tint: params?.tint ?? amount,
        blackWhite: params?.blackWhite,
        channelMixer: params?.channelMixer,
        selectiveColor: params?.selectiveColor,
        gradientMap: params?.gradientMap,
        colorLookup: params?.colorLookup,
      });
      data.set(out);
      return;
    }
    default:
      return;
  }
}

let spare: HTMLCanvasElement | null = null;
let spare2: HTMLCanvasElement | null = null;

function getSpare(w: number, h: number): HTMLCanvasElement {
  if (!spare || spare.width !== w || spare.height !== h) {
    spare = createCanvas(w, h);
  }
  const ctx = getContext2d(spare);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.clearRect(0, 0, w, h);
  return spare;
}

function getSpare2(w: number, h: number): HTMLCanvasElement {
  if (!spare2 || spare2.width !== w || spare2.height !== h) {
    spare2 = createCanvas(w, h);
  }
  const ctx = getContext2d(spare2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  ctx.clearRect(0, 0, w, h);
  return spare2;
}

function drawContent(
  tctx: CanvasRenderingContext2D,
  layer: Layer,
  pixelStore: PixelStore
): void {
  if (layer.type === "image") {
    const src = pixelStore.get(layer.imageId);
    if (src) {
      tctx.drawImage(src, 0, 0, layer.transform.width, layer.transform.height);
    }
  } else if (layer.type === "3d-scene" || layer.type === "3d-object" || layer.type === "3d-group") {
    const src = pixelStore.get((layer as { imageId: string }).imageId);
    if (src) {
      tctx.drawImage(src, 0, 0, layer.transform.width, layer.transform.height);
    }
  } else if (layer.type === "text") {
    drawTextLayer(tctx, layer as TextLayer);
  } else if (layer.type === "shape") {
    drawShapeLayer(tctx, layer as never);
  }
}

interface StackFrame {
  temp: HTMLCanvasElement;
  tctx: CanvasRenderingContext2D;
  pixels: PixelStore;
  w: number;
  h: number;
}

function beginStack(w: number, h: number, pixels: PixelStore): StackFrame {
  const temp = getSpare(w, h);
  const tctx = getContext2d(temp);
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = "high";
  return { temp, tctx, pixels, w, h };
}

function applyMaskTo(sub: HTMLCanvasElement, maskId: string | null, enabled: boolean, x = 0, y = 0, cw?: number, ch?: number): void {
  if (!maskId || !enabled) return;
  const mask = maskStore.get(maskId);
  if (!mask) return;
  const sctx = getContext2d(sub);
  sctx.globalCompositeOperation = "destination-in";
  if (cw !== undefined && ch !== undefined) sctx.drawImage(mask, x, y, cw, ch);
  else sctx.drawImage(mask, 0, 0, sub.width, sub.height);
  sctx.globalCompositeOperation = "source-over";
}

/**
 * Rasterise a layer's content (+ non-destructive layer styles) into a canvas
 * that the transform matrix can place into document space. When the layer has
 * styles the output is a padded canvas whose live content sits at (pad, pad)
 * so outward effects can bleed outside the layer box.
 */
function buildLayerSurface(
  layer: Layer,
  stack: StackFrame
): { canvas: HTMLCanvasElement; pad: number; cw: number; ch: number } {
  const w = Math.max(1, layer.transform.width);
  const h = Math.max(1, layer.transform.height);
  const contentW = Math.ceil(w);
  const contentH = Math.ceil(h);
  const sub = createCanvas(contentW, contentH);
  const sctx = getContext2d(sub);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, contentW, contentH);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = "source-over";
  drawContent(sctx, layer, stack.pixels);
  const styled: StyledOutput | null = applyLayerStyles(sub, w, h, layer.styles ?? null);
  if (styled) return { canvas: styled.canvas, pad: styled.pad, cw: contentW, ch: contentH };
  return { canvas: sub, pad: 0, cw: contentW, ch: contentH };
}

function drawSurfaceToStack(
  stack: StackFrame,
  layer: Layer,
  m: DOMMatrix,
  alpha: number,
  surface: { canvas: HTMLCanvasElement; pad: number; cw: number; ch: number }
): void {
  const tctx = stack.tctx;
  tctx.save();
  tctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  tctx.globalAlpha = alpha;
  tctx.globalCompositeOperation = canvasBlendOp[layer.blendMode];
  if (surface.pad > 0) {
    const dw = surface.cw + surface.pad * 2;
    const dh = surface.ch + surface.pad * 2;
    tctx.drawImage(surface.canvas, -surface.pad, -surface.pad, dw, dh);
  } else {
    tctx.drawImage(surface.canvas, 0, 0, layer.transform.width, layer.transform.height);
  }
  tctx.restore();
}

function surfaceToDocSpace(
  contentCanvas: HTMLCanvasElement,
  layer: Layer,
  m: DOMMatrix,
  docW: number,
  docH: number,
  pad: number
): HTMLCanvasElement {
  const out = createCanvas(docW, docH);
  const octx = getContext2d(out);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, docW, docH);
  octx.save();
  octx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  if (pad > 0) {
    const w = layer.transform.width;
    const h = layer.transform.height;
    octx.drawImage(contentCanvas, -pad, -pad, w + pad * 2, h + pad * 2);
  } else {
    octx.drawImage(contentCanvas, 0, 0, layer.transform.width, layer.transform.height);
  }
  octx.restore();
  return out;
}

/** Pre-render clip provider content as a doc-space alpha canvas. */
function captureClipAlpha(
  node: Node,
  parentMatrix: DOMMatrix,
  stack: StackFrame,
  providers: Set<string>,
  alphas: Map<string, HTMLCanvasElement>
): void {
  const layer = node.layer;
  if (providers.has(layer.id) && layer.type !== "group" && layer.type !== "adjustment") {
    const surface = buildLayerSurface(layer, stack);
    applyMaskTo(surface.canvas, layer.mask?.id ?? null, layer.mask?.enabled ?? false, surface.pad, surface.pad, surface.cw, surface.ch);
    const m = parentMatrix.multiply(localMatrix(layer.transform));
    alphas.set(layer.id, surfaceToDocSpace(surface.canvas, layer, m, stack.w, stack.h, surface.pad));
  }
  if (layer.type === "group") {
    const childMatrix = parentMatrix.multiply(localMatrix(layer.transform));
    for (const child of node.children) {
      captureClipAlpha(child, childMatrix, stack, providers, alphas);
    }
  }
}

function compositeNodeToStack(
  stack: StackFrame,
  node: Node,
  parentMatrix: DOMMatrix,
  parentAlpha: number,
  clipAlphas: Map<string, HTMLCanvasElement>
): void {
  const layer = node.layer;
  if (!layer.visible) return;
  const alpha = parentAlpha * layer.opacity;

  if (layer.type === "group") {
    const gm = localMatrix(layer.transform);
    const childMatrix = parentMatrix.multiply(gm);
    for (const child of node.children) {
      compositeNodeToStack(stack, child, childMatrix, alpha, clipAlphas);
    }
    return;
  }

  if (layer.type === "adjustment") {
    const adj = layer as AdjustmentLayer;
    const { tctx, w, h } = stack;
    const src = getSpare2(w, h);
    const sctx = getContext2d(src);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.globalAlpha = 1;
    sctx.drawImage(stack.temp, 0, 0);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, w, h);
    tctx.globalAlpha = 1;
    tctx.globalCompositeOperation = "source-over";
    tctx.filter = "none";
    const img = sctx.getImageData(0, 0, w, h);
    applyAdjustmentPixels(img.data, adj);
    sctx.putImageData(img, 0, 0);
    tctx.drawImage(src, 0, 0);
    return;
  }

  const m = parentMatrix.multiply(localMatrix(layer.transform));

  const hasStyles = hasAnyStyle(layer.styles);
  const maskActive = layer.mask !== null && layer.mask.enabled;
  const clipAlpha = layer.clipTo ? clipAlphas.get(layer.clipTo) : undefined;
  const needsSub =
    hasStyles || layer.blendMode !== "normal" || alpha < 1 || maskActive || Boolean(clipAlpha);

  if (!needsSub) {
    const tctx = stack.tctx;
    tctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    drawContent(tctx, layer, stack.pixels);
    return;
  }

  const surface = buildLayerSurface(layer, stack);
  applyMaskTo(surface.canvas, layer.mask?.id ?? null, layer.mask?.enabled ?? false, surface.pad, surface.pad, surface.cw, surface.ch);

  const tctx = stack.tctx;
  const clipMask = clipAlpha;

  tctx.save();
  if (clipMask) {
    const chained = surfaceToDocSpace(surface.canvas, layer, m, stack.w, stack.h, surface.pad);
    const cctx = getContext2d(chained);
    cctx.globalCompositeOperation = "destination-in";
    cctx.drawImage(clipMask, 0, 0);
    cctx.globalCompositeOperation = "source-over";
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalAlpha = alpha;
    tctx.globalCompositeOperation = canvasBlendOp[layer.blendMode];
    tctx.drawImage(chained, 0, 0);
    tctx.restore();
    return;
  }

  drawSurfaceToStack(stack, layer, m, alpha, surface);
  tctx.restore();
}

export interface CompositeSource {
  pixels: PixelStore;
}

export function compositeDocument(
  ctx: CanvasRenderingContext2D,
  doc: EditorDocument,
  source: CompositeSource,
  clipToDoc = true
): void {
  const providers = new Set<string>();
  for (const l of doc.layers) {
    if (l.clipTo) providers.add(l.clipTo);
  }

  const nodes = buildNodes(doc.layers);
  const stack = beginStack(doc.width, doc.height, source.pixels);
  const clipAlphas = new Map<string, HTMLCanvasElement>();
  for (const node of nodes) {
    captureClipAlpha(node, matrixForStack(), stack, providers, clipAlphas);
  }
  for (const node of nodes) {
    compositeNodeToStack(stack, node, matrixForStack(), 1, clipAlphas);
  }

  const tctx = stack.tctx;
  tctx.save();
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalAlpha = 1;
  tctx.globalCompositeOperation = "source-over";
  if (clipToDoc) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, doc.width, doc.height);
    ctx.clip();
  }
  ctx.drawImage(stack.temp, 0, 0);
  if (clipToDoc) {
    ctx.restore();
  }
  tctx.restore();
}

export function compositeToCanvas(doc: EditorDocument, source: CompositeSource): HTMLCanvasElement {
  const out = createCanvas(doc.width, doc.height);
  const ctx = getContext2d(out);
  compositeDocument(ctx, doc, source, false);
  return out;
}

export function hasGroupOrAdjustment(doc: EditorDocument): boolean {
  return doc.layers.some(
    (l) =>
      l.type === "group" ||
      l.type === "adjustment" ||
      l.blendMode !== "normal" ||
      l.mask !== null ||
      l.clipTo !== null
  );
}

/** Composite a single layer's content (+ styles + mask) into a doc-sized canvas. */
export function renderLayerToCanvas(
  layer: Layer,
  docW: number,
  docH: number,
  source: CompositeSource
): HTMLCanvasElement {
  const out = createCanvas(docW, docH);
  const octx = getContext2d(out);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, docW, docH);
  if (layer.type === "adjustment" || layer.type === "group") return out;
  const w = Math.max(1, layer.transform.width);
  const h = Math.max(1, layer.transform.height);
  const stack = beginStack(w, h, source.pixels);
  const surface = buildLayerSurface(layer, stack);
  applyMaskTo(surface.canvas, layer.mask?.id ?? null, layer.mask?.enabled ?? false, surface.pad, surface.pad, surface.cw, surface.ch);
  const m = localMatrix(layer.transform);
  octx.save();
  octx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  if (surface.pad > 0) {
    octx.drawImage(surface.canvas, -surface.pad, -surface.pad, surface.cw + surface.pad * 2, surface.ch + surface.pad * 2);
  } else {
    octx.drawImage(surface.canvas, 0, 0, w, h);
  }
  octx.restore();
  return out;
}