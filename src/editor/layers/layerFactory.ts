import { genId } from "../../utils/id";
import { createCanvas, getContext2d } from "../../utils/canvas";
import { pixelStore } from "../core/document";
import type { AIResult } from "../../ai/types";
import {
  AdjustmentKind,
  AdjustmentLayer,
  BlendMode,
  GroupLayer,
  ImageLayer,
  Layer,
  LayerTransform,
  Scene3DLayer,
  Object3DLayer,
  Group3DLayer,
  ShapeKind,
  ShapeLayer,
  TextLayer,
  identityTransform,
} from "../core/types";
import { measureTextBounds } from "../renderer/textRenderer";

export function createImageLayerFromCanvas(
  canvas: HTMLCanvasElement,
  name: string,
  x = 0,
  y = 0
): ImageLayer {
  const id = genId("layer");
  const resized = createCanvas(canvas.width, canvas.height);
  getContext2d(resized).drawImage(canvas, 0, 0);
  pixelStore.set(id, resized);
  return {
    id,
    name,
    type: "image",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(x, y, canvas.width, canvas.height),
    parentId: null,
    clipTo: null,
    mask: null,
    imageId: id,
  };
}

export function createBlankImageLayer(name: string, width: number, height: number, color = "#ffffff"): ImageLayer {
  const c = createCanvas(width, height);
  const ctx = getContext2d(c);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return createImageLayerFromCanvas(c, name, 0, 0);
}

export function createAiResultLayer(
  result: AIResult,
  name: string,
  opts: { sourceLayerId?: string | null; x?: number; y?: number } = {}
): ImageLayer {
  if (!result.canvas || result.canvas.width < 1 || result.canvas.height < 1) {
    throw new Error("AI result has no image to insert as a layer.");
  }
  const layer = createImageLayerFromCanvas(
    result.canvas,
    name || "AI Layer",
    opts.x ?? 0,
    opts.y ?? 0
  );
  layer.ai = {
    operation: result.request.operation,
    provider: result.provider,
    model: result.model ?? null,
    prompt: result.request.params.prompt ?? null,
    sourceLayerId: opts.sourceLayerId ?? null,
    sourceSelection: result.selection,
    parameters: result.request.params,
    createdAt: result.createdAt,
    generatedFrom: null,
    origin: result.origin,
  };
  return layer;
}

export function createTextLayer(opts: {
  name?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  color?: string;
  align?: "left" | "center" | "right";
  letterSpacing?: number;
  direction?: TextLayer["direction"];
  x?: number;
  y?: number;
}): TextLayer {
  const id = genId("layer");
  const fontFamily = opts.fontFamily ?? "Arial";
  const fontSize = opts.fontSize ?? 48;
  const text = opts.text ?? "Text";
  const direction = opts.direction ?? "ltr";
  const fontWeight = opts.fontWeight ?? 400;
  const fontStyle = opts.fontStyle ?? "normal";
  const align = opts.align ?? "left";
  const letterSpacing = opts.letterSpacing ?? 0;
  const measure = measureTextBounds(text, {
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    letterSpacing,
    lineHeight: 1.2,
    direction,
  });
  return {
    id,
    name: opts.name ?? "Text Layer",
    type: "text",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(opts.x ?? 0, opts.y ?? 0, measure.width, measure.height),
    parentId: null,
    clipTo: null,
    mask: null,
    text,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    color: opts.color ?? "#222222",
    align,
    direction,
    letterSpacing,
    lineHeight: 1.2,
    autoFit: true,
    overflowHidden: false,
    stroke: null,
    strokeWidth: 0,
    shadow: null,
  };
}

export function createShapeLayer(shape: ShapeKind, name?: string): ShapeLayer {
  const id = genId("layer");
  const isLine = shape === "line" || shape === "arrow";
  return {
    id,
    name: name ?? "Shape Layer",
    type: "shape",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(0, 0, 100, 100),
    parentId: null,
    clipTo: null,
    mask: null,
    shape,
    fill: isLine ? null : shape === "path" ? null : "#4f8cff",
    stroke: isLine ? "#222222" : shape === "path" ? "#222222" : null,
    strokeWidth: isLine ? 3 : shape === "path" ? 3 : 1,
    cornerRadius: 0,
    points: 5,
    starRatio: 0.4,
    pathPoints: shape === "path" ? null : undefined,
  };
}

export function createGroupLayer(name?: string): GroupLayer {
  const id = genId("layer");
  return {
    id,
    name: name ?? "Group",
    type: "group",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(0, 0, 0, 0),
    parentId: null,
    clipTo: null,
    mask: null,
    collapsed: false,
  };
}

export function createAdjustmentLayer(
  adjustment: AdjustmentKind,
  amount: number,
  name?: string,
  params?: AdjustmentLayer["params"]
): AdjustmentLayer {
  const id = genId("layer");
  return {
    id,
    name: name ?? `Adjustment`,
    type: "adjustment",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(0, 0, 0, 0),
    parentId: null,
    clipTo: null,
    mask: null,
    adjustment,
    amount,
    params: params ?? null,
  };
}

function blank3DImage(x: number, y: number, width: number, height: number): { id: string; transform: LayerTransform } {
  const id = genId("layer");
  const c = createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  getContext2d(c).clearRect(0, 0, c.width, c.height);
  pixelStore.set(id, c);
  return { id, transform: identityTransform(x, y, Math.max(1, width), Math.max(1, height)) };
}

/** A composited whole-scene layer (rasterized 3D view of the scene). */
export function createScene3DLayer(sceneId: string, opts?: { name?: string; x?: number; y?: number; width?: number; height?: number }): Scene3DLayer {
  const { id, transform } = blank3DImage(opts?.x ?? 0, opts?.y ?? 0, opts?.width ?? 800, opts?.height ?? 600);
  return {
    id,
    name: opts?.name ?? "3D Scene",
    type: "3d-scene",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform,
    parentId: null,
    clipTo: null,
    mask: null,
    sceneId,
    imageId: id,
  };
}

/** A rasterized single-object layer (mirrors a scene object). */
export function createObject3DLayer(sceneId: string, objectId: string, opts?: { name?: string; x?: number; y?: number; width?: number; height?: number }): Object3DLayer {
  const { id, transform } = blank3DImage(opts?.x ?? 0, opts?.y ?? 0, opts?.width ?? 256, opts?.height ?? 256);
  return {
    id,
    name: opts?.name ?? "3D Object",
    type: "3d-object",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform,
    parentId: null,
    clipTo: null,
    mask: null,
    sceneId,
    objectId,
    imageId: id,
  };
}

/** A rasterized group layer (mirrors a scene group node). */
export function createGroup3DLayer(sceneId: string, objectId: string, opts?: { name?: string; x?: number; y?: number; width?: number; height?: number }): Group3DLayer {
  const { id, transform } = blank3DImage(opts?.x ?? 0, opts?.y ?? 0, opts?.width ?? 256, opts?.height ?? 256);
  return {
    id,
    name: opts?.name ?? "3D Group",
    type: "3d-group",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform,
    parentId: null,
    clipTo: null,
    mask: null,
    sceneId,
    objectId,
    imageId: id,
  };
}

export function duplicateLayer(layer: Layer, offset = 12, transform: LayerTransform = layer.transform): Layer {
  const isImage = layer.type === "image";
  if (isImage) {
    const src = pixelStore.get((layer as ImageLayer).imageId);
    const copy = src ? cloneCanvas(src) : createCanvas(1, 1);
    const dup: ImageLayer = {
      ...(layer as ImageLayer),
      id: genId("layer"),
      imageId: genId("img"),
      name: `${layer.name} Copy`,
      transform: { ...transform, x: transform.x + offset, y: transform.y + offset },
    };
    pixelStore.set(dup.imageId, copy);
    return dup;
  }
  return {
    ...layer,
    id: genId("layer"),
    name: `${layer.name} Copy`,
    transform: {
      ...transform,
      x: transform.x + (layer.type === "group" ? 0 : offset),
      y: transform.y + (layer.type === "group" ? 0 : offset),
    },
  };
}

function cloneCanvas(c: HTMLCanvasElement): HTMLCanvasElement {
  const copy = createCanvas(c.width, c.height);
  getContext2d(copy).drawImage(c, 0, 0);
  return copy;
}
