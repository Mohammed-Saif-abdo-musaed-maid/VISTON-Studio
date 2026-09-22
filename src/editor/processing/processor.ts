import { clamp } from "../../utils/math";

export type FilterOp =
  | "gaussianBlur"
  | "meanBlur"
  | "medianFilter"
  | "sharpen"
  | "laplacian"
  | "sobel"
  | "prewitt"
  | "unsharpMask"
  | "highBoost"
  | "sobelEdge"
  | "prewittEdge"
  | "laplacianEdge"
  | "cannyEdge"
  | "smartSharpen"
  | "sharpenDetails"
  | "edgeSharpen"
  | "claritySharpen"
  | "textureSharpen"
  | "localContrastSharpen"
  | "directionalSharpen"
  | "focusSharpen"
  | "noiseGeneration"
  | "arithmeticMean"
  | "geometricMean"
  | "contraHarmonicMean"
  | "alphaTrimmedMean"
  | "wienerFilter"
  | "morphoErosion"
  | "morphoDilation"
  | "morphoOpening"
  | "morphoClosing"
  | "morphoGradient"
  | "morphoTopHat"
  | "morphoBlackHat"
  | "morphoHitOrMiss"
  | "morphoBoundary"
  | "morphoHoleFill"
  | "morphoThinning"
  | "morphoThickening"
  | "morphoSkeleton"
  | "morphoComponents"
  | "morphoReconstruction";

/** The 15 morphological processing operations (subset of ProcessOp). */
export const MORPHO_OPS: ReadonlyArray<ProcessOp> = [
  "morphoErosion",
  "morphoDilation",
  "morphoOpening",
  "morphoClosing",
  "morphoGradient",
  "morphoTopHat",
  "morphoBlackHat",
  "morphoHitOrMiss",
  "morphoBoundary",
  "morphoHoleFill",
  "morphoThinning",
  "morphoThickening",
  "morphoSkeleton",
  "morphoComponents",
  "morphoReconstruction",
];

/** Operations that inherently operate on binary (thresholded) input. */
export const MORPHO_BINARY_OPS: ReadonlyArray<ProcessOp> = [
  "morphoHitOrMiss",
  "morphoBoundary",
  "morphoHoleFill",
  "morphoThinning",
  "morphoThickening",
  "morphoSkeleton",
  "morphoComponents",
  "morphoReconstruction",
];

export const FILTER_OPS: ReadonlyArray<ProcessOp> = [
  "gaussianBlur",
  "meanBlur",
  "medianFilter",
  "sharpen",
  "laplacian",
  "sobel",
  "prewitt",
  "unsharpMask",
  "highBoost",
  "sobelEdge",
  "prewittEdge",
  "laplacianEdge",
  "cannyEdge",
  "smartSharpen",
  "sharpenDetails",
  "edgeSharpen",
  "claritySharpen",
  "textureSharpen",
  "localContrastSharpen",
  "directionalSharpen",
  "focusSharpen",
  "noiseGeneration",
  "arithmeticMean",
  "geometricMean",
  "contraHarmonicMean",
  "alphaTrimmedMean",
  "wienerFilter",
  "morphoErosion",
  "morphoDilation",
  "morphoOpening",
  "morphoClosing",
  "morphoGradient",
  "morphoTopHat",
  "morphoBlackHat",
  "morphoHitOrMiss",
  "morphoBoundary",
  "morphoHoleFill",
  "morphoThinning",
  "morphoThickening",
  "morphoSkeleton",
  "morphoComponents",
  "morphoReconstruction",
];

export type ProcessOp =
  | "brightness"
  | "contrast"
  | "gamma"
  | "saturation"
  | "exposure"
  | "hue"
  | "temperature"
  | "vibrance"
  | "colorBalance"
  | "shadows"
  | "highlights"
  | "levels"
  | "curves"
  | "equalize"
  | "tint"
  | "blackWhite"
  | "channelMixer"
  | "selectiveColor"
  | "gradientMap"
  | "colorLookup"
  | "gaussianBlur"
  | "meanBlur"
  | "medianFilter"
  | "sharpen"
  | "laplacian"
  | "sobel"
  | "prewitt"
  | "unsharpMask"
  | "highBoost"
  | "sobelEdge"
  | "prewittEdge"
  | "laplacianEdge"
  | "cannyEdge"
  | "smartSharpen"
  | "sharpenDetails"
  | "edgeSharpen"
  | "claritySharpen"
  | "textureSharpen"
  | "localContrastSharpen"
  | "directionalSharpen"
  | "focusSharpen"
  | "noiseGeneration"
  | "arithmeticMean"
  | "geometricMean"
  | "contraHarmonicMean"
  | "alphaTrimmedMean"
  | "wienerFilter"
  | "morphoErosion"
  | "morphoDilation"
  | "morphoOpening"
  | "morphoClosing"
  | "morphoGradient"
  | "morphoTopHat"
  | "morphoBlackHat"
  | "morphoHitOrMiss"
  | "morphoBoundary"
  | "morphoHoleFill"
  | "morphoThinning"
  | "morphoThickening"
  | "morphoSkeleton"
  | "morphoComponents"
  | "morphoReconstruction"
  | "adjustments";

export interface Adjustments {
  brightness?: number;
  contrast?: number;
  gamma?: number;
  saturation?: number;
  exposure?: number;
  hue?: number;
  temperature?: number;
}

export interface ProcessParams {
  amount?: number;
  radius?: number;
  threshold?: number;
  strength?: number;
  angle?: number;
  blur?: number;
  edgeStrength?: number;
  noiseProtection?: number;
  noiseReduction?: number;
  shadowFade?: number;
  highlightFade?: number;
  fineDetail?: number;
  mediumDetail?: number;
  largeDetail?: number;
  texturePreservation?: number;
  fineTexture?: number;
  mediumTexture?: number;
  detail?: number;
  lowThreshold?: number;
  highThreshold?: number;
  noiseType?: number; // 0 = Gaussian, 1 = Uniform, 2 = Salt & Pepper
  mean?: number;
  variance?: number;
  saltProb?: number;
  pepperProb?: number;
  seed?: number;
  kernel?: number; // 3 | 5 | 7 | 9
  q?: number;
  trim?: number;
  noiseVarianceMode?: number; // 0 = Auto, 1 = Manual
  noiseVariance?: number;
  values?: Adjustments;
  /** Vibrance strength (−100..100). */
  vibrance?: number;
  colorBalance?: { shadows: number; midtones: number; highlights: number };
  /** Shadow recovery (−100..100). */
  shadows?: number;
  /** Highlight recovery (−100..100). */
  highlights?: number;
  levels?: { black: number; mid: number; white: number };
  curves?: number[][];
  equalize?: boolean;
  // Morphological processing parameters
  /** Structuring element shape: 0 = rectangle, 1 = ellipse, 2 = cross. */
  shape?: number;
  /** Structuring element size (odd, clamped to [3, 25]). */
  size?: number;
  /** Number of operation iterations (1..12). */
  iterations?: number;
  /** Border behavior: 0 = replicate, 1 = constant, 2 = reflect. */
  borderMode?: number;
  /** Value (0..255) used when borderMode = constant. */
  borderValue?: number;
  /** Input interpretation: 0 = grayscale, 1 = binary (threshold), 2 = per-channel. */
  inputMode?: number;
  /** Threshold (0..255) used to derive binary foreground / reconstruction marker. */
  markerThreshold?: number;
  /** Custom 0/1 structuring element grid ("0 1 0\\n1 1 1\\n0 1 0"). */
  customKernel?: string;
  /** Tint: signed amount toward magenta (+) / green (−), −100..100. */
  tint?: number;
  /** Black & white per-channel red/green/blue mixing weights. */
  blackWhite?: { red: number; green: number; blue: number };
  /** Channel mixer: output = r*R + g*G + b*B per row (rows 0..1). */
  channelMixer?: {
    red: { r: number; g: number; b: number };
    green: { r: number; g: number; b: number };
    blue: { r: number; g: number; b: number };
  };
  /** Selective color: signed per-colour-region adjustment (−100..100). */
  selectiveColor?: {
    reds: number;
    yellows: number;
    greens: number;
    cyans: number;
    blues: number;
    magentas: number;
    whites: number;
    neutrals: number;
    blacks: number;
  };
  /** Gradient map luminance stops (pos 0..1, hex color). */
  gradientMap?: { stops: { pos: number; color: string }[] };
  /** Color lookup: identity / grayscale / invert / sepia built-ins. */
  colorLookup?: { lut: "identity" | "grayscale" | "invert" | "sepia" };
}

export function runProcess(
  op: ProcessOp,
  width: number,
  height: number,
  src: Uint8ClampedArray,
  params: ProcessParams
): Uint8ClampedArray {
  switch (op) {
    case "brightness":
      return brightness(src, (params.amount ?? 0) / 100);
    case "contrast":
      return contrast(src, params.amount ?? 0);
    case "gamma":
      return gamma(src, params.amount ?? 1);
    case "saturation":
      return saturation(src, (params.amount ?? 0) / 100);
    case "exposure":
      return exposure(src, params.amount ?? 0);
    case "hue":
      return hueRotate(src, params.amount ?? 0);
    case "temperature":
      return temperature(src, params.amount ?? 0);
    case "vibrance":
      return vibrance(src, params.amount ?? 0);
    case "colorBalance": {
      const cb = params.colorBalance;
      return cb ? colorBalance(src, cb) : src.slice();
    }
    case "shadows":
      return shadows(src, params.amount ?? 0);
    case "highlights":
      return highlights(src, params.amount ?? 0);
    case "levels":
      return params.levels ? levels(src, params.levels) : src.slice();
    case "curves":
      return params.curves ? curves(src, params.curves) : src.slice();
    case "equalize":
      return equalize(src);
    case "tint":
      return tint(src, params.tint ?? params.amount ?? 0);
    case "blackWhite":
      return params.blackWhite ? blackWhite(src, params.blackWhite) : src.slice();
    case "channelMixer":
      return params.channelMixer ? channelMixer(src, params.channelMixer) : src.slice();
    case "selectiveColor":
      return params.selectiveColor ? selectiveColor(src, params.selectiveColor) : src.slice();
    case "gradientMap":
      return params.gradientMap ? gradientMap(src, params.gradientMap.stops ?? []) : src.slice();
    case "colorLookup":
      return params.colorLookup ? colorLookup(src, params.colorLookup.lut ?? "identity") : src.slice();
    case "adjustments":
      return runAdjustments(width, height, src, params.values ?? {});
    case "gaussianBlur":
      return gaussianBlur(src, width, height, params.radius ?? 3);
    case "meanBlur":
      return boxBlur(src, width, height, Math.max(0, Math.round(params.radius ?? 2)));
    case "medianFilter":
      return medianFilter(src, width, height, params.radius ?? 1);
    case "sharpen":
      return sharpen(src, width, height, params.amount ?? 0.5, params.radius ?? 2);
    case "unsharpMask":
      return unsharpMask(src, width, height, params.amount ?? 0.5, params.radius ?? 2, params.threshold ?? 0);
    case "highBoost":
      return highBoost(src, width, height, params.amount ?? 0.5, params.radius ?? 2, params.threshold ?? 0);
    case "sobelEdge":
      return directionalEdge(src, width, height, 0, params.strength ?? 1);
    case "prewittEdge":
      return directionalEdge(src, width, height, 1, params.strength ?? 1);
    case "laplacianEdge":
      return laplacianEdge(src, width, height, params.strength ?? 1, params.radius ?? 1);
    case "cannyEdge":
      return cannyEdge(src, width, height, params.lowThreshold ?? 20, params.highThreshold ?? 60, params.blur ?? 1, params.edgeStrength ?? 1);
    case "smartSharpen":
      return smartSharpen(src, width, height, params.amount ?? 0.5, params.radius ?? 2, params.noiseReduction ?? 0, params.shadowFade ?? 0, params.highlightFade ?? 0);
    case "sharpenDetails":
      return sharpenDetails(src, width, height, params.fineDetail ?? 0, params.mediumDetail ?? 0, params.largeDetail ?? 0, params.amount ?? 0.5);
    case "edgeSharpen":
      return edgeSharpen(src, width, height, params.edgeStrength ?? 1, params.radius ?? 2, params.threshold ?? 0, params.noiseProtection ?? 0);
    case "claritySharpen":
      return claritySharpen(src, width, height, params.amount ?? 0.5, params.radius ?? 2, params.texturePreservation ?? 0);
    case "textureSharpen":
      return textureSharpen(src, width, height, params.fineTexture ?? 0, params.mediumTexture ?? 0, params.strength ?? 0.5);
    case "localContrastSharpen":
      return localContrastSharpen(src, width, height, params.amount ?? 0.5, params.radius ?? 2, params.detail ?? 0);
    case "directionalSharpen":
      return directionalSharpen(src, width, height, params.angle ?? 0, params.strength ?? 0.5, params.radius ?? 2);
    case "focusSharpen":
      return focusSharpen(src, width, height, params.amount ?? 0.5, params.radius ?? 2, params.noiseReduction ?? 0);
    case "noiseGeneration":
      return noiseGeneration(src, width, height, {
        noiseType: params.noiseType ?? 0,
        amount: params.amount ?? 50,
        mean: params.mean ?? 0,
        variance: params.variance ?? 25,
        saltProb: params.saltProb ?? 5,
        pepperProb: params.pepperProb ?? 5,
        seed: params.seed ?? 0,
      });
    case "arithmeticMean":
      return arithmeticMean(src, width, height, params.kernel ?? 3);
    case "geometricMean":
      return geometricMean(src, width, height, params.kernel ?? 3);
    case "contraHarmonicMean":
      return contraHarmonicMean(src, width, height, params.kernel ?? 3, params.q ?? 0);
    case "alphaTrimmedMean":
      return alphaTrimmedMean(src, width, height, params.kernel ?? 3, params.trim ?? 2);
    case "wienerFilter":
      return wienerFilter(src, width, height, params.kernel ?? 3, params.noiseVarianceMode ?? 0, params.noiseVariance ?? 20);
    case "morphoErosion":
    case "morphoDilation":
    case "morphoOpening":
    case "morphoClosing":
    case "morphoGradient":
    case "morphoTopHat":
    case "morphoBlackHat":
    case "morphoHitOrMiss":
    case "morphoBoundary":
    case "morphoHoleFill":
    case "morphoThinning":
    case "morphoThickening":
    case "morphoSkeleton":
    case "morphoComponents":
    case "morphoReconstruction":
      return runMorphology(op, src, width, height, params);
    case "laplacian":
      return edgeOps(src, width, height, 0);
    case "sobel":
      return edgeOps(src, width, height, 1);
    case "prewitt":
      return edgeOps(src, width, height, 2);
    default:
      return src.slice();
  }
}

function brightness(src: Uint8ClampedArray, factor: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clamp(src[i] + factor * 255, 0, 255);
    out[i + 1] = clamp(src[i + 1] + factor * 255, 0, 255);
    out[i + 2] = clamp(src[i + 2] + factor * 255, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function exposure(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const factor = Math.pow(2, amount);
  if (factor === 1) return src.slice();
  const lookup = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lookup[v] = clamp(Math.round(v * factor), 0, 255);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = lookup[src[i]];
    out[i + 1] = lookup[src[i + 1]];
    out[i + 2] = lookup[src[i + 2]];
    out[i + 3] = src[i + 3];
  }
  return out;
}

function contrast(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const c = (259 * (amount + 255)) / (255 * (259 - amount));
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clamp(c * (src[i] - 128) + 128, 0, 255);
    out[i + 1] = clamp(c * (src[i + 1] - 128) + 128, 0, 255);
    out[i + 2] = clamp(c * (src[i + 2] - 128) + 128, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function gamma(src: Uint8ClampedArray, g: number): Uint8ClampedArray {
  const inv = 1 / Math.max(0.01, g);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clamp(255 * Math.pow(src[i] / 255, inv), 0, 255);
    out[i + 1] = clamp(255 * Math.pow(src[i + 1] / 255, inv), 0, 255);
    out[i + 2] = clamp(255 * Math.pow(src[i + 2] / 255, inv), 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function saturation(src: Uint8ClampedArray, factor: number): Uint8ClampedArray {
  const f = 1 + factor;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const l = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
    out[i] = clamp(l + (src[i] - l) * f, 0, 255);
    out[i + 1] = clamp(l + (src[i + 1] - l) * f, 0, 255);
    out[i + 2] = clamp(l + (src[i + 2] - l) * f, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

export function runAdjustments(width: number, height: number, src: Uint8ClampedArray, adj: Adjustments): Uint8ClampedArray {
  const brightnessAmt = adj.brightness ?? 0;
  const contrastAmt = clamp(adj.contrast ?? 0, -254, 254);
  const gammaVal = adj.gamma ?? 1;
  const sat = adj.saturation ?? 0;
  const exposureAmt = adj.exposure ?? 0;
  const hueDeg = adj.hue ?? 0;
  const tempAmt = adj.temperature ?? 0;
  const b = brightnessAmt / 100;
  const bOff = b * 255;
  const cf = (259 * (contrastAmt + 255)) / (255 * (259 - contrastAmt));
  const inv = 1 / Math.max(0.01, gammaVal);
  const sf = 1 + sat / 100;
  const gammaActive = gammaVal !== 1;
  const expFactor = Math.pow(2, exposureAmt);
  const expActive = expFactor !== 1;
  const hueA = (hueDeg * Math.PI) / 180;
  const cosA = Math.cos(hueA);
  const sinA = Math.sin(hueA);
  const hueActive = hueDeg % 360 !== 0;
  const ta = tempAmt / 100;
  const rMul = 1 + ta * 0.35;
  const bMul = 1 - ta * 0.35;
  const tempActive = ta !== 0;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    let r = src[i];
    let g = src[i + 1];
    let bv = src[i + 2];
    if (b !== 0) {
      r = clamp(r + bOff, 0, 255);
      g = clamp(g + bOff, 0, 255);
      bv = clamp(bv + bOff, 0, 255);
    }
    if (contrastAmt !== 0) {
      r = clamp(cf * (r - 128) + 128, 0, 255);
      g = clamp(cf * (g - 128) + 128, 0, 255);
      bv = clamp(cf * (bv - 128) + 128, 0, 255);
    }
    if (gammaActive) {
      r = clamp(255 * Math.pow(r / 255, inv), 0, 255);
      g = clamp(255 * Math.pow(g / 255, inv), 0, 255);
      bv = clamp(255 * Math.pow(bv / 255, inv), 0, 255);
    }
    if (sf !== 1) {
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * bv;
      r = clamp(l + (r - l) * sf, 0, 255);
      g = clamp(l + (g - l) * sf, 0, 255);
      bv = clamp(l + (bv - l) * sf, 0, 255);
    }
    if (expActive) {
      r = clamp(r * expFactor, 0, 255);
      g = clamp(g * expFactor, 0, 255);
      bv = clamp(bv * expFactor, 0, 255);
    }
    if (hueActive) {
      const hr = 0.213 * r + 0.715 * g + 0.072 * bv;
      const hg = hr;
      const hb = hr;
      const r2 = hr + (0.787 * r - 0.715 * g - 0.072 * bv) * cosA + (-0.213 * r + 0.285 * g - 0.072 * bv) * sinA;
      const g2 = hg + (-0.213 * r + 0.285 * g - 0.072 * bv) * cosA + (0.143 * r + 0.14 * g - 0.283 * bv) * sinA;
      const b2 = hb + (-0.213 * r - 0.715 * g + 0.928 * bv) * cosA + (-0.787 * r + 0.715 * g + 0.072 * bv) * sinA;
      r = clamp(r2, 0, 255);
      g = clamp(g2, 0, 255);
      bv = clamp(b2, 0, 255);
    }
    if (tempActive) {
      r = clamp(r * rMul, 0, 255);
      bv = clamp(bv * bMul, 0, 255);
    }
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = bv;
    out[i + 3] = src[i + 3];
  }
  return out;
}

function hueRotate(src: Uint8ClampedArray, deg: number): Uint8ClampedArray {
  const a = (deg * Math.PI) / 180;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const nr = 0.213 * r + 0.715 * g + 0.072 * b;
    const ng = 0.213 * r + 0.715 * g + 0.072 * b;
    const nb = 0.213 * r + 0.715 * g + 0.072 * b;
    // rotation matrices
    const r2 = nr + (0.787 * r - 0.715 * g - 0.072 * b) * cosA + (-0.213 * r + 0.285 * g - 0.072 * b) * sinA;
    const g2 = ng + (-0.213 * r + 0.285 * g - 0.072 * b) * cosA + (0.143 * r + 0.14 * g - 0.283 * b) * sinA;
    const b2 = nb + (-0.213 * r - 0.715 * g + 0.928 * b) * cosA + (-0.787 * r + 0.715 * g + 0.072 * b) * sinA;
    out[i] = clamp(r2, 0, 255);
    out[i + 1] = clamp(g2, 0, 255);
    out[i + 2] = clamp(b2, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function temperature(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const a = amount / 100;
  const rMul = 1 + a * 0.35;
  const bMul = 1 - a * 0.35;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clamp(src[i] * rMul, 0, 255);
    out[i + 1] = src[i + 1];
    out[i + 2] = clamp(src[i + 2] * bMul, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

/* ─── Unified adjustment ops (bake path, mirrors the compositor LUT math) ─── */

function buildLumaLut(fn: (v: number) => number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp(Math.round(fn(i)), 0, 255);
  return lut;
}

function lerpCurve(points: number[][], input: number): number {
  if (!points || points.length === 0) return input;
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const x = clamp(input, 0, 255);
  const first = pts[0];
  if (!first) return input;
  if (x <= first[0]) return first[1];
  const last = pts[pts.length - 1];
  if (!last) return input;
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (!p) continue;
    if (x <= p[0]) {
      const prev = pts[i - 1];
      if (!prev) continue;
      const t = (x - prev[0]) / (p[0] - prev[0] || 1);
      return prev[1] + (p[1] - prev[1]) * t;
    }
  }
  return last[1];
}

function levelsLut(black: number, mid: number, white: number): Uint8ClampedArray {
  const range = Math.max(1, white - black);
  return buildLumaLut((v: number) => {
    let c = (v - black) / range;
    if (c < 0) c = 0;
    if (c > 1) c = 1;
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
  return buildLumaLut((v: number) => {
    if (v <= lo) return 0;
    if (v >= hi) return 255;
    return ((hist2[v] - hist2[lo]) / (total - hist2[lo])) * 255;
  });
}

function vibrance(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const base = 1 + amount / 100;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let boost = base;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc > 0 ? (maxc - minc) / Math.max(1, maxc) : 0;
    const weights = Math.max(0, 1 - sat * (l / 255));
    boost = 1 + (amount / 100) * weights;
    out[i] = clamp(l + (r - l) * boost, 0, 255);
    out[i + 1] = clamp(l + (g - l) * boost, 0, 255);
    out[i + 2] = clamp(l + (b - l) * boost, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function colorBalance(src: Uint8ClampedArray, cb: { shadows: number; midtones: number; highlights: number }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
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
    out[i] = clamp(r + dr, 0, 255);
    out[i + 1] = clamp(g + dg, 0, 255);
    out[i + 2] = clamp(b + db, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function shadows(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const f = 1 + amount / 100;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const w = 1 - l / 255;
    out[i] = clamp(r * (1 + w * (f - 1)), 0, 255);
    out[i + 1] = clamp(g * (1 + w * (f - 1)), 0, 255);
    out[i + 2] = clamp(b * (1 + w * (f - 1)), 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function highlights(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const f = 1 - amount / 100;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const w = l / 255;
    out[i] = clamp(r * (1 + w * (f - 1)), 0, 255);
    out[i + 1] = clamp(g * (1 + w * (f - 1)), 0, 255);
    out[i + 2] = clamp(b * (1 + w * (f - 1)), 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function levels(src: Uint8ClampedArray, lv: { black: number; mid: number; white: number }): Uint8ClampedArray {
  const lut = levelsLut(lv.black ?? 0, lv.mid ?? 1, lv.white ?? 255);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = lut[src[i]];
    out[i + 1] = lut[src[i + 1]];
    out[i + 2] = lut[src[i + 2]];
    out[i + 3] = src[i + 3];
  }
  return out;
}

function curves(src: Uint8ClampedArray, points: number[][]): Uint8ClampedArray {
  const lut = buildLumaLut((v) => lerpCurve(points, v));
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = lut[src[i]];
    out[i + 1] = lut[src[i + 1]];
    out[i + 2] = lut[src[i + 2]];
    out[i + 3] = src[i + 3];
  }
  return out;
}

function equalize(src: Uint8ClampedArray): Uint8ClampedArray {
  const lut = histogramLut(src);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = lut[src[i]];
    out[i + 1] = lut[src[i + 1]];
    out[i + 2] = lut[src[i + 2]];
    out[i + 3] = src[i + 3];
  }
  return out;
}

function tint(src: Uint8ClampedArray, amount: number): Uint8ClampedArray {
  const a = clamp(amount, -100, 100) / 100;
  const rMul = 1 + a * 0.35;
  const gMul = 1 - a * 0.35;
  const bMul = 1 + a * 0.35;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clamp(src[i] * rMul, 0, 255);
    out[i + 1] = clamp(src[i + 1] * gMul, 0, 255);
    out[i + 2] = clamp(src[i + 2] * bMul, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function blackWhite(src: Uint8ClampedArray, weights: { red: number; green: number; blue: number }): Uint8ClampedArray {
  const rw = weights.red ?? 1;
  const gw = weights.green ?? 1;
  const bw = weights.blue ?? 1;
  const sum = Math.max(0.0001, Math.abs(rw) + Math.abs(gw) + Math.abs(bw));
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const gray = clamp((src[i] * rw + src[i + 1] * gw + src[i + 2] * bw) / sum, 0, 255);
    out[i] = gray;
    out[i + 1] = gray;
    out[i + 2] = gray;
    out[i + 3] = src[i + 3];
  }
  return out;
}

function channelMixer(
  src: Uint8ClampedArray,
  m: {
    red: { r: number; g: number; b: number };
    green: { r: number; g: number; b: number };
    blue: { r: number; g: number; b: number };
  }
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    out[i] = clamp(m.red.r * r + m.red.g * g + m.red.b * b, 0, 255);
    out[i + 1] = clamp(m.green.r * r + m.green.g * g + m.green.b * b, 0, 255);
    out[i + 2] = clamp(m.blue.r * r + m.blue.g * g + m.blue.b * b, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function selectiveColor(
  src: Uint8ClampedArray,
  rgn: {
    reds: number;
    yellows: number;
    greens: number;
    cyans: number;
    blues: number;
    magentas: number;
    whites: number;
    neutrals: number;
    blacks: number;
  }
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    let dr = 0;
    let dg = 0;
    let db = 0;
    let amt = 0;
    if (l >= 200) {
      amt = rgn.whites;
    } else if (l < 40) {
      amt = rgn.blacks;
    } else if (sat < 0.2) {
      amt = rgn.neutrals;
    } else {
      let hue = 0;
      if (mx === r) hue = ((g - b) / (mx - mn || 1)) % 6;
      else if (mx === g) hue = (b - r) / (mx - mn || 1) + 2;
      else hue = (r - g) / (mx - mn || 1) + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
      if (hue < 15 || hue >= 345) amt = rgn.reds;
      else if (hue < 45) amt = rgn.yellows;
      else if (hue < 165) amt = rgn.greens;
      else if (hue < 195) amt = rgn.cyans;
      else if (hue < 255) amt = rgn.blues;
      else amt = rgn.magentas;
    }
    const f = clamp(amt, -100, 100) / 100;
    if (amt === rgn.reds || (l >= 200 && amt === rgn.whites && rgn.whites !== 0)) {
      dr = f * 96;
      dg = -f * 96;
      db = -f * 96;
    } else if (amt === rgn.yellows) {
      dr = f * 96;
      dg = f * 96;
      db = -f * 96;
    } else if (amt === rgn.greens) {
      dr = -f * 96;
      dg = f * 96;
      db = -f * 96;
    } else if (amt === rgn.cyans) {
      dr = -f * 96;
      dg = f * 96;
      db = f * 96;
    } else if (amt === rgn.blues) {
      dr = -f * 96;
      dg = -f * 96;
      db = f * 96;
    } else if (amt === rgn.magentas) {
      dr = f * 96;
      dg = -f * 96;
      db = f * 96;
    } else {
      dr = f * 48;
      dg = f * 48;
      db = f * 48;
    }
    out[i] = clamp(r + dr, 0, 255);
    out[i + 1] = clamp(g + dg, 0, 255);
    out[i + 2] = clamp(b + db, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function gradientMap(src: Uint8ClampedArray, stops: { pos: number; color: string }[]): Uint8ClampedArray {
  if (!stops || stops.length === 0) return src.slice();
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const parse = (c: string): [number, number, number] => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [0, 0, 0];
  };
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    let tr = 0;
    let tg = 0;
    let tb = 0;
    if (l <= first.pos) {
      const [cr, cg, cbb] = parse(first.color);
      tr = cr; tg = cg; tb = cbb;
    } else if (l >= last.pos) {
      const [cr, cg, cbb] = parse(last.color);
      tr = cr; tg = cg; tb = cbb;
    } else {
      for (let s = 1; s < sorted.length; s++) {
        const a = sorted[s - 1];
        const z = sorted[s];
        if (l <= z.pos) {
          const t = (l - a.pos) / (z.pos - a.pos || 1);
          const [r1, g1, b1] = parse(a.color);
          const [r2, g2, b2] = parse(z.color);
          tr = r1 + (r2 - r1) * t;
          tg = g1 + (g2 - g1) * t;
          tb = b1 + (b2 - b1) * t;
          break;
        }
      }
    }
    out[i] = clamp(tr, 0, 255);
    out[i + 1] = clamp(tg, 0, 255);
    out[i + 2] = clamp(tb, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function colorLookup(src: Uint8ClampedArray, name: "identity" | "grayscale" | "invert" | "sepia"): Uint8ClampedArray {
  if (name === "identity") return src.slice();
  const grayLut = buildLumaLut((v) => v);
  const invLut = buildLumaLut((v) => 255 - v);
  const out = new Uint8ClampedArray(src.length);
  if (name === "grayscale") {
    for (let i = 0; i < src.length; i += 4) {
      const gray = grayLut[Math.round(0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2])];
      out[i] = gray;
      out[i + 1] = gray;
      out[i + 2] = gray;
      out[i + 3] = src[i + 3];
    }
    return out;
  }
  if (name === "invert") {
    for (let i = 0; i < src.length; i += 4) {
      out[i] = invLut[src[i]];
      out[i + 1] = invLut[src[i + 1]];
      out[i + 2] = invLut[src[i + 2]];
      out[i + 3] = src[i + 3];
    }
    return out;
  }
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    out[i] = clamp(0.393 * r + 0.769 * g + 0.189 * b, 0, 255);
    out[i + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b, 0, 255);
    out[i + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

function gaussianKernel(radius: number): Float32Array {
  const sigma = Math.max(0.6, radius / 2);
  const size = Math.max(3, Math.round(radius * 3) | 1);
  const half = (size - 1) / 2;
  const k = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    k[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += k[i];
  }
  for (let i = 0; i < size; i++) k[i] /= sum;
  return k;
}

/**
 * Gaussian blur — separable convolution with a normalized 1D Gaussian kernel.
 * Sigma is derived as radius/2 (>= 0.6) so the user-facing parameter is simply
 * the radius. Edges are handled with replicate-edge sampling; alpha preserved.
 */
function gaussianBlur(src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(0, Math.min(128, radius));
  if (r <= 0) return src.slice();
  const kernel = gaussianKernel(Math.max(0.5, r));
  return separableBlur(src, w, h, kernel);
}

/**
 * Mean / box blur — running-sum separable implementation (O(w*h) per pass),
 * replicate-edge sampling, alpha preserved. Avoids the wasteful nested
 * per-kernel-tap approach of a naive convolution for large radii.
 */
function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number, keepAlpha = false): Uint8ClampedArray {
  r = Math.max(0, Math.min(128, r));
  if (r <= 0) return src.slice();
  const win = r * 2 + 1;
  const inv = 1 / (win * win);
  const tmp = new Float64Array(src.length);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    const row = y * w;
    for (let k = 0; k < win; k++) {
      const sx = k - r < 0 ? 0 : k - r >= w ? w - 1 : k - r;
      const pi = (row + sx) * 4;
      s0 += src[pi]; s1 += src[pi + 1]; s2 += src[pi + 2]; s3 += src[pi + 3];
    }
    let pi = row * 4;
    tmp[pi] = s0; tmp[pi + 1] = s1; tmp[pi + 2] = s2; tmp[pi + 3] = s3;
    for (let x = 1; x < w; x++) {
      const addX = x + r >= w ? w - 1 : x + r;
      const subX = x - r - 1 < 0 ? 0 : x - r - 1;
      const ai = (row + addX) * 4;
      const si = (row + subX) * 4;
      s0 += src[ai] - src[si]; s1 += src[ai + 1] - src[si + 1]; s2 += src[ai + 2] - src[si + 2]; s3 += src[ai + 3] - src[si + 3];
      pi = (row + x) * 4;
      tmp[pi] = s0; tmp[pi + 1] = s1; tmp[pi + 2] = s2; tmp[pi + 3] = s3;
    }
  }
  for (let x = 0; x < w; x++) {
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let k = 0; k < win; k++) {
      const sy = k - r < 0 ? 0 : k - r >= h ? h - 1 : k - r;
      const pi = (sy * w + x) * 4;
      s0 += tmp[pi]; s1 += tmp[pi + 1]; s2 += tmp[pi + 2]; s3 += tmp[pi + 3];
    }
    const n0 = s0 * inv, n1 = s1 * inv, n2 = s2 * inv, n3 = s3 * inv;
    let pi = x * 4;
    out[pi] = n0; out[pi + 1] = n1; out[pi + 2] = n2; out[pi + 3] = n3;
    for (let y = 1; y < h; y++) {
      const addY = y + r >= h ? h - 1 : y + r;
      const subY = y - r - 1 < 0 ? 0 : y - r - 1;
      const ai = (addY * w + x) * 4;
      const si = (subY * w + x) * 4;
      s0 += tmp[ai] - tmp[si]; s1 += tmp[ai + 1] - tmp[si + 1]; s2 += tmp[ai + 2] - tmp[si + 2]; s3 += tmp[ai + 3] - tmp[si + 3];
      pi = (y * w + x) * 4;
      out[pi] = s0 * inv; out[pi + 1] = s1 * inv; out[pi + 2] = s2 * inv; out[pi + 3] = s3 * inv;
    }
  }
  if (keepAlpha) {
    for (let i = 3; i < src.length; i += 4) out[i] = src[i];
  }
  return out;
}

function separableBlur(src: Uint8ClampedArray, w: number, h: number, kernel: Float32Array): Uint8ClampedArray {
  const half = Math.floor(kernel.length / 2);
  const out = new Uint8ClampedArray(src.length);
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = 0; k < kernel.length; k++) {
          const kx = x + k - half;
          const kk = kx < 0 ? 0 : kx >= w ? w - 1 : kx;
          acc += kernel[k] * src[(y * w + kk) * 4 + c];
        }
        tmp[pi + c] = acc;
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const pi = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        let acc = 0;
        for (let k = 0; k < kernel.length; k++) {
          const ky = y + k - half;
          const kk = ky < 0 ? 0 : ky >= h ? h - 1 : ky;
          acc += kernel[k] * tmp[(kk * w + x) * 4 + c];
        }
        out[pi + c] = acc;
      }
    }
  }
  return out;
}

/**
 * Median filter — per-channel histogram median over a (2r+1)^2 window.
 * Uses sliding column-histograms + running window merge so cost is close to
 * O(w*h*256) regardless of radius. Border pixels use replicate-edge sampling.
 * Alpha preserved. Radius clamped to [0, 15] (kernel <= 31x31) to protect
 * against unreasonable kernel sizes.
 */
function medianFilter(src: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  const r = Math.max(0, Math.min(15, Math.round(radius)));
  if (r <= 0) return src.slice();
  const k = r * 2 + 1;
  const need = (k * k + 1) >> 1;
  const out = src.slice();
  const windowHist = new Uint16Array(256);
  for (let c = 0; c < 3; c++) {
    const colHist: Uint16Array[] = [];
    for (let x = 0; x < w; x++) colHist.push(new Uint16Array(256));
    const valAt = (x: number, y: number): number => src[(y * w + x) * 4 + c];
    const fillCol = (x: number, y: number) => {
      const hist = colHist[x]!;
      for (let dy = 0; dy < k; dy++) {
        const sy = clamp(y + dy - r, 0, h - 1);
        hist[valAt(x, sy)!] = (hist[valAt(x, sy)!] as number) + 1;
      }
    };
    const shiftCol = (x: number, newY: number) => {
      const hist = colHist[x]!;
      const rm = valAt(x, clamp(newY - r - 1, 0, h - 1));
      const add = valAt(x, clamp(newY + r, 0, h - 1));
      hist[rm] = (hist[rm] as number) - 1;
      hist[add] = (hist[add] as number) + 1;
    };
    const addToWindow = (hist: Uint16Array) => { for (let v = 0; v < 256; v++) windowHist[v] += hist[v] as number; };
    const subFromWindow = (hist: Uint16Array) => { for (let v = 0; v < 256; v++) windowHist[v] -= hist[v] as number; };
    for (let y = 0; y < h; y++) {
      if (y === 0) { for (let x = 0; x < w; x++) fillCol(x, 0); }
      else { for (let x = 0; x < w; x++) shiftCol(x, y); }
      windowHist.fill(0);
      for (let p = 0; p < k; p++) addToWindow(colHist[clamp(p - r, 0, w - 1)]!);
      let med: number;
      {
        let acc = 0; med = 0;
        for (let v = 0; v < 256; v++) {
          acc += windowHist[v] as number;
          if (acc >= need) { med = v; break; }
        }
      }
      out[(y * w + 0) * 4 + c] = med;
      for (let x = 1; x < w; x++) {
        addToWindow(colHist[clamp(x + r, 0, w - 1)]!);
        subFromWindow(colHist[clamp(x - r - 1, 0, w - 1)]!);
        let acc = 0; med = 0;
        for (let v = 0; v < 256; v++) {
          acc += windowHist[v] as number;
          if (acc >= need) { med = v; break; }
        }
        out[(y * w + x) * 4 + c] = med;
      }
    }
  }
  return out;
}

/**
 * Sharpen — unsharp masking: out = orig + amount * (orig − gaussian(radius)).
 * Radius of the masking blur is optional (default 2). Amount clamped to [0, 4].
 * Alpha preserved.
 */
function sharpen(src: Uint8ClampedArray, w: number, h: number, amount: number, radius: number): Uint8ClampedArray {
  const a = clamp(amount, 0, 4);
  if (a <= 0) return src.slice();
  const blurred = gaussianBlur(src, w, h, Math.max(0.5, radius));
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clamp(src[i] + (src[i] - blurred[i]) * a, 0, 255);
    out[i + 1] = clamp(src[i + 1] + (src[i + 1] - blurred[i + 1]) * a, 0, 255);
    out[i + 2] = clamp(src[i + 2] + (src[i + 2] - blurred[i + 2]) * a, 0, 255);
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Edge operations over the luminance channel, computed over the FULL image
 * using replicate-edge sampling (no black/empty frames).
 *   mode 0 — Laplacian: 4-neighborhood response, displayed as 128 − response
 *            (flat regions render middle gray, edges deviate).
 *   mode 1 — Sobel:   |G| = sqrt(Gx^2 + Gy^2), grayscale edge magnitude.
 *   mode 2 — Prewitt: |G| = sqrt(Gx^2 + Gy^2), grayscale edge magnitude.
 * Alpha is preserved.
 */
function edgeOps(src: Uint8ClampedArray, w: number, h: number, mode: 0 | 1 | 2): Uint8ClampedArray {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
  }
  const kx: readonly number[] =
    mode === 1 ? [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    : mode === 2 ? [-1, 0, 1, -1, 0, 1, -1, 0, 1]
    : [0, -1, 0, -1, 4, -1, 0, -1, 0];
  const ky: readonly number[] =
    mode === 1 ? [-1, -2, -1, 0, 0, 0, 1, 2, 1]
    : mode === 2 ? [-1, -1, -1, 0, 0, 0, 1, 1, 1]
    : [0, -1, 0, -1, 4, -1, 0, -1, 0];
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    const y0 = clamp(y - 1, 0, h - 1);
    const y2 = clamp(y + 1, 0, h - 1);
    for (let x = 0; x < w; x++) {
      const xa = clamp(x - 1, 0, w - 1);
      const xb = clamp(x + 1, 0, w - 1);
      const v00 = lum[y0 * w + xa] as number;
      const v01 = lum[y0 * w + x] as number;
      const v02 = lum[y0 * w + xb] as number;
      const v10 = lum[y * w + xa] as number;
      const v11 = lum[y * w + x] as number;
      const v12 = lum[y * w + xb] as number;
      const v20 = lum[y2 * w + xa] as number;
      const v21 = lum[y2 * w + x] as number;
      const v22 = lum[y2 * w + xb] as number;
      const Gx = kx[0]! * v00 + kx[1]! * v01 + kx[2]! * v02 + kx[3]! * v10 + kx[4]! * v11 + kx[5]! * v12 + kx[6]! * v20 + kx[7]! * v21 + kx[8]! * v22;
      const Gy = ky[0]! * v00 + ky[1]! * v01 + ky[2]! * v02 + ky[3]! * v10 + ky[4]! * v11 + ky[5]! * v12 + ky[6]! * v20 + ky[7]! * v21 + ky[8]! * v22;
      const mag = Math.sqrt(Gx * Gx + Gy * Gy);
      const val = mode === 0 ? clamp(128 - mag, 0, 255) : clamp(mag, 0, 255);
      const idx = (y * w + x) * 4;
      out[idx] = val;
      out[idx + 1] = val;
      out[idx + 2] = val;
      out[idx + 3] = src[idx + 3];
    }
  }
  return out;
}

/* ─── Sharpening filter helpers ─── */

function luminance(src: Uint8ClampedArray, w: number, h: number): Float32Array {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
  }
  return lum;
}

function convolve3x3(src: Float32Array, w: number, h: number, kernel: readonly number[]): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = clamp(y - 1, 0, h - 1);
    const y2 = clamp(y + 1, 0, h - 1);
    for (let x = 0; x < w; x++) {
      const xa = clamp(x - 1, 0, w - 1);
      const xb = clamp(x + 1, 0, w - 1);
      out[y * w + x] =
        kernel[0] * src[y0 * w + xa] + kernel[1] * src[y0 * w + x] + kernel[2] * src[y0 * w + xb] +
        kernel[3] * src[y * w + xa] + kernel[4] * src[y * w + x] + kernel[5] * src[y * w + xb] +
        kernel[6] * src[y2 * w + xa] + kernel[7] * src[y2 * w + x] + kernel[8] * src[y2 * w + xb];
    }
  }
  return out;
}

/**
 * Unsharp Mask — out = src + amount * (src − blurred) where |diff| > threshold.
 * Threshold operates on the luminance difference to suppress noise amplification.
 */
function unsharpMask(src: Uint8ClampedArray, w: number, h: number, amount: number, radius: number, threshold: number): Uint8ClampedArray {
  const a = clamp(amount, 0, 4);
  if (a <= 0) return src.slice();
  const blurred = gaussianBlur(src, w, h, Math.max(0.5, radius));
  const t = clamp(threshold, 0, 255);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = src[i + c] - blurred[i + c];
      out[i + c] = clamp(src[i + c] + (Math.abs(diff) > t ? diff * a : 0), 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * High Boost — out = A * src − blurred, where A = 1 + amount.
 * Classic high-boost filter that amplifies original + adds detail.
 * Threshold suppresses noise in smooth areas.
 */
function highBoost(src: Uint8ClampedArray, w: number, h: number, amount: number, radius: number, threshold: number): Uint8ClampedArray {
  const boost = 1 + clamp(amount, 0, 4);
  if (boost <= 1) return src.slice();
  const blurred = gaussianBlur(src, w, h, Math.max(0.5, radius));
  const t = clamp(threshold, 0, 255);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = src[i + c] - blurred[i + c];
      out[i + c] = clamp(boost * src[i + c] - blurred[i + c] + (Math.abs(diff) > t ? 0 : diff * 0.5), 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Directional edge detection — applies horizontal or vertical Sobel/Prewitt kernels
 * with adjustable strength. mode 0 = Sobel, mode 1 = Prewitt.
 */
function directionalEdge(src: Uint8ClampedArray, w: number, h: number, mode: 0 | 1, strength: number): Uint8ClampedArray {
  const lum = luminance(src, w, h);
  const sx: readonly number[] = mode === 0 ? [-1, 0, 1, -2, 0, 2, -1, 0, 1] : [-1, 0, 1, -1, 0, 1, -1, 0, 1];
  const sy: readonly number[] = mode === 0 ? [-1, -2, -1, 0, 0, 0, 1, 2, 1] : [-1, -1, -1, 0, 0, 0, 1, 1, 1];
  const gx = convolve3x3(lum, w, h, sx);
  const gy = convolve3x3(lum, w, h, sy);
  const str = clamp(strength, 0, 5);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < w * h; i++) {
    const val = clamp(Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]) * str, 0, 255);
    out[i * 4] = val;
    out[i * 4 + 1] = val;
    out[i * 4 + 2] = val;
    out[i * 4 + 3] = src[i * 4 + 3];
  }
  return out;
}

/**
 * Laplacian edge detection with adjustable strength and radius.
 * Radius > 1 applies a Gaussian pre-blur to reduce noise sensitivity.
 * Returns an edge-enhanced image blended with the original.
 */
function laplacianEdge(src: Uint8ClampedArray, w: number, h: number, strength: number, radius: number): Uint8ClampedArray {
  const str = clamp(strength, 0, 5);
  const processed = radius > 0.5 ? gaussianBlur(src, w, h, radius) : src;
  const lum = luminance(processed, w, h);
  const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];
  const lap = convolve3x3(lum, w, h, kernel);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < w * h; i++) {
    const base = i * 4;
    const edge = lap[i] * str;
    out[base] = clamp(src[base] + edge, 0, 255);
    out[base + 1] = clamp(src[base + 1] + edge, 0, 255);
    out[base + 2] = clamp(src[base + 2] + edge, 0, 255);
    out[base + 3] = src[base + 3];
  }
  return out;
}

/**
 * Canny edge detection — full pipeline:
 * 1. Gaussian blur (separable)
 * 2. Gradient magnitude + direction (Sobel)
 * 3. Non-maximum suppression
 * 4. Double threshold + hysteresis edge tracking
 * Output: grayscale edge map (0/255).
 */
function cannyEdge(src: Uint8ClampedArray, w: number, h: number, lowT: number, highT: number, blurRadius: number, edgeStrength: number): Uint8ClampedArray {
  const blurred = blurRadius > 0 ? gaussianBlur(src, w, h, Math.max(0.5, blurRadius)) : src;
  const lum = luminance(blurred, w, h);

  // Sobel gradients
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] =
        -lum[(y - 1) * w + (x - 1)] + lum[(y - 1) * w + (x + 1)] +
        -2 * lum[y * w + (x - 1)] + 2 * lum[y * w + (x + 1)] +
        -lum[(y + 1) * w + (x - 1)] + lum[(y + 1) * w + (x + 1)];
      gy[i] =
        -lum[(y - 1) * w + (x - 1)] - 2 * lum[(y - 1) * w + x] - lum[(y - 1) * w + (x + 1)] +
        lum[(y + 1) * w + (x - 1)] + 2 * lum[(y + 1) * w + x] + lum[(y + 1) * w + (x + 1)];
    }
  }

  // Magnitude + direction
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    mag[i] = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
    dir[i] = Math.atan2(gy[i], gx[i]);
  }

  // Non-maximum suppression
  const nms = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const angle = ((dir[i] * 180) / Math.PI + 180) % 180;
      let n1 = 0, n2 = 0;
      if (angle < 22.5 || angle >= 157.5) {
        n1 = mag[i - 1]; n2 = mag[i + 1];
      } else if (angle < 67.5) {
        n1 = mag[(y - 1) * w + (x + 1)]; n2 = mag[(y + 1) * w + (x - 1)];
      } else if (angle < 112.5) {
        n1 = mag[(y - 1) * w + x]; n2 = mag[(y + 1) * w + x];
      } else {
        n1 = mag[(y - 1) * w + (x - 1)]; n2 = mag[(y + 1) * w + (x + 1)];
      }
      nms[i] = mag[i] >= n1 && mag[i] >= n2 ? mag[i] : 0;
    }
  }

  // Double threshold + hysteresis
  const strong = 255;
  const out = new Uint8ClampedArray(src.length);
  const labels = new Uint8Array(w * h); // 0=none, 1=weak, 2=strong
  for (let i = 0; i < w * h; i++) {
    if (nms[i] >= highT) labels[i] = 2;
    else if (nms[i] >= lowT) labels[i] = 1;
  }
  // Hysteresis: promote weak connected to strong
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (labels[y * w + x] === 1) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (labels[(y + dy) * w + (x + dx)] === 2) {
              labels[y * w + x] = 2;
            }
          }
        }
      }
    }
  }
  const str = clamp(edgeStrength, 0, 5);
  for (let i = 0; i < w * h; i++) {
    const val = labels[i] === 2 ? clamp(strong * str, 0, 255) : 0;
    out[i * 4] = val;
    out[i * 4 + 1] = val;
    out[i * 4 + 2] = val;
    out[i * 4 + 3] = src[i * 4 + 3];
  }
  return out;
}

/**
 * Smart Sharpen — unsharp mask with noise suppression, shadow/highlight fade.
 * noiseReduction: Gaussian blur applied to the mask before subtracting (reduces noise amplification).
 * shadowFade/highlightFade: reduces sharpening effect in shadow/highlight regions.
 */
function smartSharpen(
  src: Uint8ClampedArray, w: number, h: number,
  amount: number, radius: number, noiseReduction: number,
  shadowFade: number, highlightFade: number,
): Uint8ClampedArray {
  const a = clamp(amount, 0, 4);
  if (a <= 0) return src.slice();
  const blurred = gaussianBlur(src, w, h, Math.max(0.5, radius));
  const denoise = clamp(noiseReduction, 0, 100) / 100;
  const sf = clamp(shadowFade, 0, 100) / 100;
  const hf = clamp(highlightFade, 0, 100) / 100;
  const denoised = denoise > 0 ? gaussianBlur(blurred, w, h, Math.max(0.5, denoise * 3)) : blurred;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const lum = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
    const shadowFactor = lum < 85 ? 1 - sf * ((85 - lum) / 85) : 1;
    const highlightFactor = lum > 170 ? 1 - hf * ((lum - 170) / 85) : 1;
    const fade = shadowFactor * highlightFactor;
    for (let c = 0; c < 3; c++) {
      const diff = src[i + c] - denoised[i + c];
      out[i + c] = clamp(src[i + c] + diff * a * fade, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Sharpen Details — multi-scale sharpening with separate fine/medium/large detail control.
 * Fine detail: small-radius high-pass. Medium detail: medium-radius. Large detail: large-radius.
 */
function sharpenDetails(
  src: Uint8ClampedArray, w: number, h: number,
  fineDetail: number, mediumDetail: number, largeDetail: number, amount: number,
): Uint8ClampedArray {
  const a = clamp(amount, 0, 4);
  if (a <= 0) return src.slice();
  const fine = clamp(fineDetail, 0, 3);
  const med = clamp(mediumDetail, 0, 3);
  const large = clamp(largeDetail, 0, 3);
  const blurredFine = gaussianBlur(src, w, h, 1);
  const blurredMed = gaussianBlur(src, w, h, 3);
  const blurredLarge = gaussianBlur(src, w, h, 8);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const detailFine = src[i + c] - blurredFine[i + c];
      const detailMed = blurredFine[i + c] - blurredMed[i + c];
      const detailLarge = blurredMed[i + c] - blurredLarge[i + c];
      out[i + c] = clamp(src[i + c] + (detailFine * fine + detailMed * med + detailLarge * large) * a, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Edge Sharpen — sharpen only along edges detected by Laplacian.
 * Threshold controls minimum edge magnitude to sharpen.
 * Noise protection blurs the mask to avoid amplifying noise at weak edges.
 */
function edgeSharpen(
  src: Uint8ClampedArray, w: number, h: number,
  edgeStrength: number, radius: number, threshold: number, noiseProtection: number,
): Uint8ClampedArray {
  const str = clamp(edgeStrength, 0, 3);
  const t = clamp(threshold, 0, 100);
  const np = clamp(noiseProtection, 0, 100) / 100;
  const blurred = gaussianBlur(src, w, h, Math.max(0.5, radius));
  const lum = luminance(src, w, h);
  const lapKernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];
  const lap = convolve3x3(lum, w, h, lapKernel);
  let edgeMask = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    edgeMask[i] = Math.abs(lap[i]) > t ? 1 : 0;
  }
  if (np > 0) {
    const maskU8 = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      maskU8[i * 4] = edgeMask[i] * 255;
      maskU8[i * 4 + 1] = edgeMask[i] * 255;
      maskU8[i * 4 + 2] = edgeMask[i] * 255;
      maskU8[i * 4 + 3] = 255;
    }
    const blurredMask = gaussianBlur(maskU8, w, h, Math.max(0.5, np * 3));
    for (let i = 0; i < w * h; i++) {
      edgeMask[i] = blurredMask[i * 4] / 255;
    }
  }
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const mask = edgeMask[(i / 4) | 0];
    for (let c = 0; c < 3; c++) {
      const diff = src[i + c] - blurred[i + c];
      out[i + c] = clamp(src[i + c] + diff * str * mask, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Clarity Sharpen — enhances mid-tone contrast (local contrast) with texture preservation.
 * Amount controls overall strength. Radius controls the local area.
 * Texture preservation protects fine textures from over-sharpening.
 */
function claritySharpen(
  src: Uint8ClampedArray, w: number, h: number,
  amount: number, radius: number, texturePreservation: number,
): Uint8ClampedArray {
  const a = clamp(amount, 0, 3);
  if (a <= 0) return src.slice();
  const blurred = gaussianBlur(src, w, h, Math.max(1, radius));
  const tp = clamp(texturePreservation, 0, 100) / 100;
  const blurredSmall = tp > 0 ? gaussianBlur(src, w, h, Math.max(0.5, 1)) : src;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const midContrast = (src[i + c] - blurred[i + c]) * a;
      const texture = src[i + c] - blurredSmall[i + c];
      const textureMask = 1 - tp * Math.abs(texture) / 128;
      out[i + c] = clamp(src[i + c] + midContrast * textureMask, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Texture Sharpen — multi-band texture enhancement.
 * Fine texture: high-frequency details (small radius).
 * Medium texture: mid-frequency details (medium radius).
 * Strength: overall blend factor.
 */
function textureSharpen(
  src: Uint8ClampedArray, w: number, h: number,
  fineTexture: number, mediumTexture: number, strength: number,
): Uint8ClampedArray {
  const str = clamp(strength, 0, 3);
  if (str <= 0) return src.slice();
  const ft = clamp(fineTexture, 0, 3);
  const mt = clamp(mediumTexture, 0, 3);
  const blurredFine = gaussianBlur(src, w, h, 1);
  const blurredMed = gaussianBlur(src, w, h, 4);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const fine = src[i + c] - blurredFine[i + c];
      const med = blurredFine[i + c] - blurredMed[i + c];
      out[i + c] = clamp(src[i + c] + (fine * ft + med * mt) * str, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Local Contrast Sharpen — enhances local contrast using a local mean.
 * Uses box blur for the local mean (faster than Gaussian for large radii).
 * Detail parameter controls additional edge enhancement.
 */
function localContrastSharpen(
  src: Uint8ClampedArray, w: number, h: number,
  amount: number, radius: number, detail: number,
): Uint8ClampedArray {
  const a = clamp(amount, 0, 3);
  if (a <= 0) return src.slice();
  const localMean = boxBlur(src, w, h, Math.max(1, Math.round(radius)));
  const d = clamp(detail, 0, 3);
  const detailEnhance = d > 0 ? sharpen(src, w, h, d * 0.3, 1) : src;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const localDiff = src[i + c] - localMean[i + c];
      const enhanced = src[i + c] + localDiff * a;
      out[i + c] = clamp(enhanced + (detailEnhance[i + c] - src[i + c]) * d * 0.5, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/**
 * Directional Sharpen — sharpens along a specific angle using a rotated kernel.
 * Angle in degrees. The kernel emphasizes detail perpendicular to the given angle.
 */
function directionalSharpen(
  src: Uint8ClampedArray, w: number, h: number,
  angle: number, strength: number, radius: number,
): Uint8ClampedArray {
  const str = clamp(strength, 0, 3);
  if (str <= 0) return src.slice();
  const a = ((angle % 180) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const kx = [-cos, 0, cos, -sin, 0, sin, -cos, 0, cos];
  const ky = [-sin, 0, sin, -cos, 0, cos, -sin, 0, sin];
  const blurred = radius > 0.5 ? gaussianBlur(src, w, h, radius) : src;
  const lum = luminance(blurred, w, h);
  const gx = convolve3x3(lum, w, h, kx);
  const gy = convolve3x3(lum, w, h, ky);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < w * h; i++) {
    const edge = Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]);
    const base = i * 4;
    out[base] = clamp(src[base] + edge * str, 0, 255);
    out[base + 1] = clamp(src[base + 1] + edge * str, 0, 255);
    out[base + 2] = clamp(src[base + 2] + edge * str, 0, 255);
    out[base + 3] = src[base + 3];
  }
  return out;
}

/**
 * Focus Sharpen — aggressive sharpening with noise suppression.
 * Uses a sharpen mask combined with Gaussian-blurred mask to suppress noise.
 */
function focusSharpen(
  src: Uint8ClampedArray, w: number, h: number,
  amount: number, radius: number, noiseReduction: number,
): Uint8ClampedArray {
  const a = clamp(amount, 0, 4);
  if (a <= 0) return src.slice();
  const blurred = gaussianBlur(src, w, h, Math.max(0.5, radius));
  const nr = clamp(noiseReduction, 0, 100) / 100;
  const noiseMask = nr > 0 ? gaussianBlur(src, w, h, Math.max(1, nr * 5)) : blurred;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = src[i + c] - blurred[i + c];
      const noise = Math.abs(src[i + c] - noiseMask[i + c]);
      const suppression = Math.max(0, 1 - noise / 50);
      out[i + c] = clamp(src[i + c] + diff * a * suppression, 0, 255);
    }
    out[i + 3] = src[i + 3];
  }
  return out;
}

/* ─── Restoration / noise filters ─── */

/**
 * Deterministic seeded PRNG (mulberry32). Same seed ⇒ identical stream, which
 * makes noise generation fully reproducible for tests and preview/apply parity.
 */
function mulberry32(seed: number): () => number {
  let a = (seed >>> 0) || 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface NoiseParams {
  noiseType: number; // 0 = Gaussian, 1 = Uniform, 2 = Salt & Pepper
  amount: number; // 0..100 strength percent
  mean: number;
  variance: number;
  saltProb: number; // percent 0..100
  pepperProb: number; // percent 0..100
  seed: number;
}

function noiseGeneration(src: Uint8ClampedArray, w: number, h: number, p: NoiseParams): Uint8ClampedArray {
  const rand = mulberry32(Math.floor(p.seed));
  const type = p.noiseType === 1 ? 1 : p.noiseType === 2 ? 2 : 0;
  const amount = clamp(p.amount, 0, 100) / 100;
  const mean = clamp(p.mean, -255, 255);
  const variance = Math.max(0, p.variance);
  const salt = clamp(p.saltProb, 0, 100) / 100;
  const pepper = clamp(p.pepperProb, 0, 100) / 100;
  const out = new Uint8ClampedArray(src.length);

  let n1 = 0, n2 = 0;
  const nextGaussian = (): number => {
    // Box–Muller transform (two uniforms → one gaussian)
    let u1 = 0, u2 = 0;
    do { u1 = rand(); } while (u1 <= 1e-12);
    u2 = rand();
    const mag = Math.sqrt(-2 * Math.log(u1));
    n1 = mag * Math.cos(2 * Math.PI * u2);
    n2 = mag * Math.sin(2 * Math.PI * u2);
    return n1;
  };

  const std = Math.sqrt(variance);
  for (let i = 0; i < src.length; i += 4) {
    out[i + 3] = src[i + 3];
    switch (type) {
      case 2: {
        // Salt & Pepper: per-pixel impulse noise.
        const r1 = rand();
        const r2 = rand();
        if (r1 < salt) {
          out[i] = 255; out[i + 1] = 255; out[i + 2] = 255;
        } else if (r2 < pepper) {
          out[i] = 0; out[i + 1] = 0; out[i + 2] = 0;
        } else {
          out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2];
        }
        break;
      }
      case 1: {
        // Uniform noise in [−variance, +variance] offset by mean.
        for (let c = 0; c < 3; c++) {
          const u = 2 * rand() - 1;
          out[i + c] = clamp(src[i + c] + mean + u * variance * amount, 0, 255);
        }
        break;
      }
      default: {
        // Gaussian noise: gaussian(mean, variance) scaled by amount.
        for (let c = 0; c < 3; c++) {
          const g = nextGaussian();
          out[i + c] = clamp(src[i + c] + mean + std * g * amount, 0, 255);
        }
        break;
      }
    }
  }
  return out;
}

/**
 * Arithmetic mean filter — the classic box average used to reduce noise.
 * Reuses boxBlur's running-sum separable implementation for O(N) cost.
 * The `keepAlpha: true` flag preserves the original alpha channel.
 */
function arithmeticMean(src: Uint8ClampedArray, w: number, h: number, kernel: number): Uint8ClampedArray {
  let k = clamp(Math.round(kernel), 3, 9);
  if (k % 2 === 0) k++;
  const radius = (k - 1) / 2; // ensure odd kernel ≥ 3 → integer radius
  return boxBlur(src, w, h, radius, true);
}

/**
 * Geometric mean filter — noise reduction that preserves more detail than the
 * arithmetic mean. g = (∏ neighborhood)^(1/N) = exp(Σ ln(g) / N).
 * Zero inputs yield a geometric mean of 0 (guarded with a log-domain table).
 * Alpha is preserved unchanged.
 */
function geometricMean(src: Uint8ClampedArray, w: number, h: number, kernel: number): Uint8ClampedArray {
  let k = clamp(Math.round(kernel), 3, 7);
  if (k % 2 === 0) k++;
  const radius = (k - 1) / 2;
  const win = radius * 2 + 1;
  const n = win * win;
  const lnTable = new Float64Array(256);
  for (let v = 0; v < 256; v++) lnTable[v] = Math.log(v + 1e-9);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      out[pi + 3] = src[pi + 3];
      for (let c = 0; c < 3; c++) {
        let sumL = 0;
        let hasZero = false;
        for (let dy = -radius; dy <= radius && !hasZero; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -radius; dx <= radius; dx++) {
            const vv = src[(clamp(x + dx, 0, w - 1) + yy * w) * 4 + c];
            if (vv === 0) { hasZero = true; break; }
            sumL += lnTable[vv];
          }
        }
        if (hasZero) {
          out[pi + c] = 0;
        } else {
          out[pi + c] = clamp(Math.round(Math.exp(sumL / n)), 0, 255);
        }
      }
    }
  }
  return out;
}

/**
 * Contra-harmonic mean filter.
 *   f = Σ g^(Q+1) / Σ g^Q
 * Q > 0 removes pepper (dark) noise; Q < 0 removes salt (white) noise.
 * Zero values during negative-Q exponentiation are guarded with a tiny epsilon.
 * Division-by-zero is prevented: if the denominator collapses (≈ 0) the pixel
 * is left unchanged. Alpha preserved.
 */
function contraHarmonicMean(src: Uint8ClampedArray, w: number, h: number, kernel: number, qIn: number): Uint8ClampedArray {
  let k = clamp(Math.round(kernel), 3, 7);
  if (k % 2 === 0) k++;
  const radius = (k - 1) / 2;
  const q = clamp(qIn, -2, 2);
  const EPS = 1e-6;
  const powTable = new Float64Array(256);
  for (let v = 0; v < 256; v++) powTable[v] = Math.pow(v + EPS, q);
  const powNextTable = new Float64Array(256);
  for (let v = 0; v < 256; v++) powNextTable[v] = Math.pow(v + EPS, q + 1);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      out[pi + 3] = src[pi + 3];
      for (let c = 0; c < 3; c++) {
        let num = 0, den = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -radius; dx <= radius; dx++) {
            const vv = src[(clamp(x + dx, 0, w - 1) + yy * w) * 4 + c];
            den += powTable[vv];
            num += powNextTable[vv];
          }
        }
        if (den < 1e-12 || !Number.isFinite(num / den)) {
          out[pi + c] = src[pi + c];
        } else {
          out[pi + c] = clamp(Math.round(num / den), 0, 255);
        }
      }
    }
  }
  return out;
}

/**
 * Alpha-trimmed mean filter.
 * Sorts window values per channel, discards `trim` extreme values from each
 * end, then averages the remainder. trim is clamped to floor((n−1)/2) so an
 * invalid trim count can never drain the window. Alpha preserved.
 */
function alphaTrimmedMean(src: Uint8ClampedArray, w: number, h: number, kernel: number, trimIn: number): Uint8ClampedArray {
  let k = clamp(Math.round(kernel), 3, 7);
  if (k % 2 === 0) k++;
  const radius = (k - 1) / 2;
  const win = radius * 2 + 1;
  const n = win * win;
  const maxTrim = Math.floor((n - 1) / 2);
  const trim = clamp(Math.round(trimIn), 0, maxTrim);
  const keep = n - trim * 2;
  const window = new Float64Array(n);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      out[pi + 3] = src[pi + 3];
      for (let c = 0; c < 3; c++) {
        let m = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -radius; dx <= radius; dx++) {
            window[m++] = src[(clamp(x + dx, 0, w - 1) + yy * w) * 4 + c];
          }
        }
        // Quicksort the window values (n ≤ 49).
        const sorted = Array.prototype.slice.call(window, 0, n) as number[];
        sorted.sort((a, b) => a - b);
        let sum = 0;
        for (let s = trim; s < trim + keep; s++) sum += sorted[s]!;
        out[pi + c] = clamp(Math.round(sum / keep), 0, 255);
      }
    }
  }
  return out;
}

/**
 * Wiener filter (adaptive local-statistics noise reduction).
 *   output = mean + max(var − ν, 0) / max(var, ε) · (pixel − mean)
 * ν = manual noise variance, or auto-estimated from the luminance plane using
 * the first-order-difference estimator (σ² ≈ mean(|Δ|²)/2 over horizontal
 * neighbor pairs), which is a clear, bounded-cost approximation.
 * Zero-variance windows collapse to the local mean. Alpha preserved.
 */
function wienerFilter(src: Uint8ClampedArray, w: number, h: number, kernel: number, mode: number, manualVar: number): Uint8ClampedArray {
  let k = clamp(Math.round(kernel), 3, 7);
  if (k % 2 === 0) k++;
  const radius = (k - 1) / 2;
  const win = radius * 2 + 1;
  const n = win * win;

  let noiseVar = Math.max(0, manualVar);
  if (mode === 0) {
    let sum = 0;
    let cnt = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        const l1 = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
        const j = i + 4;
        const l2 = 0.2126 * src[j] + 0.7152 * src[j + 1] + 0.0722 * src[j + 2];
        sum += (l1 - l2) * (l1 - l2);
        cnt++;
      }
    }
    noiseVar = cnt > 0 ? sum / (2 * cnt) : 0;
  }

  const EPS = 1e-8;
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4;
      out[pi + 3] = src[pi + 3];
      for (let c = 0; c < 3; c++) {
        let mean = 0, sq = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -radius; dx <= radius; dx++) {
            const vv = src[(clamp(x + dx, 0, w - 1) + yy * w) * 4 + c];
            mean += vv;
            sq += vv * vv;
          }
        }
        mean /= n;
        const variance = sq / n - mean * mean;
        const gain = Math.max(variance - noiseVar, 0) / Math.max(variance, EPS);
        const denoised = mean + gain * (src[pi + c] - mean);
        out[pi + c] = clamp(Number.isFinite(denoised) ? Math.round(denoised) : Math.round(mean), 0, 255);
      }
    }
  }
  return out;
}

/* ─── Morphological processing ─── */

interface SEPoint {
  dx: number;
  dy: number;
}

interface SEBox {
  /** Width / height of the kernel bounding box (odd). */
  gw: number;
  gh: number;
  /** Offset of the box's top-left corner relative to the anchor pixel. */
  x0: number;
  y0: number;
  /** Kernel cells: 1 = foreground required, 0 = background required, -1 = don't care. */
  cells: Int8Array;
}

function oddClamp(v: number, min: number, max: number): number {
  let s = Math.round(v);
  if (isNaN(s)) s = min;
  s = Math.max(min, Math.min(max, s));
  if (s % 2 === 0) s++;
  return s;
}

/** Parse a custom 0/1 structuring element grid. Returns null when invalid. */
function parseKernelGrid(text: string): number[][] | null {
  const rows = text.split(/[/;\n]/).map((r) => r.trim()).filter((r) => r.length > 0);
  if (rows.length === 0) return null;
  let cols = -1;
  const grid: number[][] = [];
  for (const row of rows) {
    const tokens = row.split(/[\s,]+/).map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) continue;
    if (cols === -1) cols = tokens.length;
    if (tokens.length !== cols) return null;
    const vals: number[] = [];
    for (const tok of tokens) {
      if (tok === "0" || tok === "1") vals.push(+tok);
      else return null;
    }
    grid.push(vals);
  }
  if (grid.length === 0 || grid.length % 2 !== 1 || cols % 2 !== 1) return null;
  return grid;
}

/** Build the hit/miss kernel box (1/0/-1 cells) from shape + size or custom grid. */
function buildSEBox(shape: number, size: number, customKernel: string | undefined): SEBox {
  if (customKernel && customKernel.trim().length > 0) {
    const grid = parseKernelGrid(customKernel);
    if (grid) {
      const gw = grid[0]!.length;
      const gh = grid.length;
      const x0 = -Math.floor(gw / 2);
      const y0 = -Math.floor(gh / 2);
      const cells = new Int8Array(gh * gw);
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) cells[y * gw + x] = grid[y]![x]!;
      return { gw, gh, x0, y0, cells };
    }
  }
  const s = oddClamp(size, 3, 25);
  const g = (s - 1) / 2;
  const cells = new Int8Array(s * s).fill(-1);
  const shp = shape === 1 ? 1 : shape === 2 ? 2 : 0;
  for (let dy = -g; dy <= g; dy++) {
    for (let dx = -g; dx <= g; dx++) {
      let on = 0;
      if (shp === 2) {
        on = dx === 0 || dy === 0 ? 1 : 0;
      } else if (shp === 1) {
        const nx = dx / (g || 1);
        const ny = dy / (g || 1);
        on = nx * nx + ny * ny <= 1 ? 1 : 0;
      } else {
        on = 1;
      }
      cells[(dy + g) * s + (dx + g)] = on;
    }
  }
  return { gw: s, gh: s, x0: -g, y0: -g, cells };
}

/** The active structuring element as an offset list (for min/max dilation). */
function buildSE(shape: number, size: number, customKernel: string | undefined): SEPoint[] {
  const box = buildSEBox(shape, size, customKernel);
  const pts: SEPoint[] = [];
  for (let ky = 0; ky < box.gh; ky++) {
    for (let kx = 0; kx < box.gw; kx++) {
      if (box.cells[ky * box.gw + kx] === 1) pts.push({ dx: kx + box.x0, dy: ky + box.y0 });
    }
  }
  return pts.length > 0 ? pts : [{ dx: 0, dy: 0 }];
}

type Plane = Float32Array;

/** Edge sample for a plane with the requested border behavior. */
function bwGet(
  p: Plane,
  w: number,
  h: number,
  x: number,
  y: number,
  mode: number,
  cv: number
): number {
  if (x >= 0 && x < w && y >= 0 && y < h) return p[y * w + x] as number;
  if (mode === 1) return cv;
  let cx = x;
  let cy = y;
  if (mode === 2) {
    if (cx < 0) cx = -cx - 1;
    else if (cx >= w) cx = 2 * w - cx - 1;
    if (cy < 0) cy = -cy - 1;
    else if (cy >= h) cy = 2 * h - cy - 1;
    cx = Math.min(w - 1, Math.max(0, cx));
    cy = Math.min(h - 1, Math.max(0, cy));
    return p[cy * w + cx] as number;
  }
  cx = Math.min(w - 1, Math.max(0, cx));
  cy = Math.min(h - 1, Math.max(0, cy));
  return p[cy * w + cx] as number;
}

/** Generic min (erode) / max (dilate) morphological transform over a plane. */
function planeMorph(
  src: Plane,
  w: number,
  h: number,
  se: SEPoint[],
  iterations: number,
  borderMode: number,
  borderValue: number,
  wantMax: boolean
): Plane {
  const n = Math.max(1, Math.round(iterations));
  let a = src;
  let b: Plane = new Float32Array(w * h);
  for (let it = 0; it < n; it++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let acc = wantMax ? -Infinity : Infinity;
        for (const o of se) {
          const v = bwGet(a, w, h, x + o.dx, y + o.dy, borderMode, borderValue);
          if (wantMax ? v > acc : v < acc) acc = v;
        }
        b[row + x] = acc;
      }
    }
    const t: Plane = a;
    a = b;
    b = t;
  }
  return a;
}

function planeErode(p: Plane, w: number, h: number, se: SEPoint[], it: number, bm: number, bv: number): Plane {
  return planeMorph(p, w, h, se, it, bm, bv, false);
}

function planeDilate(p: Plane, w: number, h: number, se: SEPoint[], it: number, bm: number, bv: number): Plane {
  return planeMorph(p, w, h, se, it, bm, bv, true);
}

function luminancePlane(src: Uint8ClampedArray, w: number, h: number): Plane {
  const p = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    p[i] = 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
  }
  return p;
}

/**
 * Continuous morphological operation on a single plane.
 * Supported kinds: erode, dilate, open, close, gradient, tophat, blackhat.
 */
function planeOperation(
  src: Plane,
  w: number,
  h: number,
  se: SEPoint[],
  iterations: number,
  borderMode: number,
  borderValue: number,
  kind: "erode" | "dilate" | "open" | "close" | "gradient" | "tophat" | "blackhat"
): Plane {
  switch (kind) {
    case "erode":
      return planeErode(src, w, h, se, iterations, borderMode, borderValue);
    case "dilate":
      return planeDilate(src, w, h, se, iterations, borderMode, borderValue);
    case "open": {
      const e = planeErode(src, w, h, se, iterations, borderMode, borderValue);
      return planeDilate(e, w, h, se, iterations, borderMode, borderValue);
    }
    case "close": {
      const d = planeDilate(src, w, h, se, iterations, borderMode, borderValue);
      return planeErode(d, w, h, se, iterations, borderMode, borderValue);
    }
    case "gradient": {
      const d = planeDilate(src, w, h, se, iterations, borderMode, borderValue);
      const e = planeErode(src, w, h, se, iterations, borderMode, borderValue);
      const out = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = d[i]! - e[i]!;
      return out;
    }
    case "tophat": {
      const e = planeErode(src, w, h, se, iterations, borderMode, borderValue);
      const o = planeDilate(e, w, h, se, iterations, borderMode, borderValue);
      const out = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = src[i]! - o[i]!;
      return out;
    }
    case "blackhat": {
      const d = planeDilate(src, w, h, se, iterations, borderMode, borderValue);
      const c = planeErode(d, w, h, se, iterations, borderMode, borderValue);
      const out = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) out[i] = c[i]! - src[i]!;
      return out;
    }
  }
}

/** Continuous ops that can consume grayscale, binary, or per-channel input. */
const CONTINUOUS_MORPHO_OPS: ReadonlySet<string> = new Set([
  "morphoErosion",
  "morphoDilation",
  "morphoOpening",
  "morphoClosing",
  "morphoGradient",
  "morphoTopHat",
  "morphoBlackHat",
]);

function continuousOpKind(op: ProcessOp): "erode" | "dilate" | "open" | "close" | "gradient" | "tophat" | "blackhat" {
  switch (op) {
    case "morphoErosion":
      return "erode";
    case "morphoDilation":
      return "dilate";
    case "morphoOpening":
      return "open";
    case "morphoClosing":
      return "close";
    case "morphoGradient":
      return "gradient";
    case "morphoTopHat":
      return "tophat";
    default:
      return "blackhat";
  }
}

/** Foreground predicate used by every binary morpho operation. */
function binaryThreshold(src: Uint8ClampedArray, w: number, h: number, threshold: number): Uint8Array {
  const t = Math.max(0, Math.min(255, Math.round(threshold)));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const lum = 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
    out[i] = lum >= t ? 1 : 0;
  }
  return out;
}

function binaryFromBinaryPlane(b: Uint8Array, w: number, h: number): Plane {
  const p = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) p[i] = b[i]! * 255;
  return p;
}

function rgbaFromPlane(src: Uint8ClampedArray, plane: Plane, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < w * h; i++) {
    const v = Math.round(clamp(plane[i] ?? 0, 0, 255));
    const pi = i * 4;
    out[pi] = v;
    out[pi + 1] = v;
    out[pi + 2] = v;
    out[pi + 3] = src[pi + 3];
  }
  return out;
}

function rgbaFromBinary(src: Uint8ClampedArray, b: Uint8Array, w: number, h: number, fg = 255): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < w * h; i++) {
    const v = b[i]! > 0 ? fg : 0;
    const pi = i * 4;
    out[pi] = v;
    out[pi + 1] = v;
    out[pi + 2] = v;
    out[pi + 3] = src[pi + 3];
  }
  return out;
}

/** Binary erosion using the min operator on a 0/1 plane. */
function binaryErode(b: Uint8Array, w: number, h: number, se: SEPoint[], borderMode: number, borderValue: number): Uint8Array {
  const p = binaryFromBinaryPlane(b, w, h);
  const e = planeErode(p, w, h, se, 1, borderMode, borderValue);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = e[i]! >= 255 ? 1 : 0;
  return out;
}

function hitOrMissBinary(b: Uint8Array, w: number, h: number, box: SEBox): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 1;
      outer: for (let ky = 0; ky < box.gh; ky++) {
        for (let kx = 0; kx < box.gw; kx++) {
          const want = box.cells[ky * box.gw + kx]!;
          if (want < 0) continue;
          const px = x + kx + box.x0;
          const py = y + ky + box.y0;
          const v = px >= 0 && px < w && py >= 0 && py < h ? b[py * w + px]! : 0;
          if ((want === 1 ? 1 : 0) !== v) {
            hit = 0;
            break outer;
          }
        }
      }
      out[y * w + x] = hit;
    }
  }
  return out;
}

/** Fill holes in a binary image (background regions not connected to the border). */
function holeFillBinary(b: Uint8Array, w: number, h: number): Uint8Array {
  const seed = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) {
    if (b[x] === 0 && seed[x] === 0) { seed[x] = 1; stack.push(x); }
    if (b[(h - 1) * w + x] === 0 && seed[(h - 1) * w + x] === 0) { seed[(h - 1) * w + x] = 1; stack.push((h - 1) * w + x); }
  }
  for (let y = 0; y < h; y++) {
    if (b[y * w] === 0 && seed[y * w] === 0) { seed[y * w] = 1; stack.push(y * w); }
    if (b[y * w + (w - 1)] === 0 && seed[y * w + (w - 1)] === 0) { seed[y * w + (w - 1)] = 1; stack.push(y * w + (w - 1)); }
  }
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && b[i - 1] === 0 && seed[i - 1] === 0) { seed[i - 1] = 1; stack.push(i - 1); }
    if (x < w - 1 && b[i + 1] === 0 && seed[i + 1] === 0) { seed[i + 1] = 1; stack.push(i + 1); }
    if (y > 0 && b[i - w] === 0 && seed[i - w] === 0) { seed[i - w] = 1; stack.push(i - w); }
    if (y < h - 1 && b[i + w] === 0 && seed[i + w] === 0) { seed[i + w] = 1; stack.push(i + w); }
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = b[i]! === 1 || seed[i] === 0 ? 1 : 0;
  return out;
}

function bin8At(b: Uint8Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return b[y * w + x]!;
}

/** One Zhang-Suen sub-iteration. Returns the number of removed pixels. */
function zhangSuenPass(b: Uint8Array, w: number, h: number, cond: 0 | 1): number {
  const toRemove: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (b[i]! === 0) continue;
      const p2 = bin8At(b, w, h, x, y - 1);
      const p3 = bin8At(b, w, h, x + 1, y - 1);
      const p4 = bin8At(b, w, h, x + 1, y);
      const p5 = bin8At(b, w, h, x + 1, y + 1);
      const p6 = bin8At(b, w, h, x, y + 1);
      const p7 = bin8At(b, w, h, x - 1, y + 1);
      const p8 = bin8At(b, w, h, x - 1, y);
      const p9 = bin8At(b, w, h, x - 1, y - 1);
      const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      if (B < 2 || B > 6) continue;
      const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
      let A = 0;
      for (let k = 0; k < 8; k++) if (ring[k] === 0 && ring[k + 1] === 1) A++;
      if (A !== 1) continue;
      if (cond === 0) {
        if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
      } else {
        if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
      }
      toRemove.push(i);
    }
  }
  for (const i of toRemove) b[i] = 0;
  return toRemove.length;
}

/** Thinning (Zhang-Suen). `maxIterations` of 0 means "until stable". */
function thinBinary(b: Uint8Array, w: number, h: number, maxIterations: number): Uint8Array {
  const work = new Uint8Array(b);
  const limit = maxIterations > 0 ? maxIterations : w + h;
  for (let it = 0; it < limit; it++) {
    const r1 = zhangSuenPass(work, w, h, 0);
    const r2 = zhangSuenPass(work, w, h, 1);
    if (r1 + r2 === 0) break;
  }
  return work;
}

/** Reconstruction via geodesic dilation (marker constrained by the mask). */
function reconstructionBinary(
  mask: Uint8Array,
  marker: Uint8Array,
  w: number,
  h: number,
  se: SEPoint[],
  versions: number,
  borderMode: number,
  borderValue: number
): Uint8Array {
  let r = new Uint8Array(marker);
  const limit = versions > 0 ? versions : w + h;
  for (let v = 0; v < limit; v++) {
    const p = binaryFromBinaryPlane(r, w, h);
    const d = planeDilate(p, w, h, se, 1, borderMode, borderValue);
    let changed = 0;
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const val = d[i]! >= 255 && mask[i]! === 1 ? 1 : 0;
        next[i] = val;
        if (val !== r[i]!) changed++;
      }
    }
    r = next;
    if (changed === 0) break;
  }
  return r;
}

interface MorphoComponent2 {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
}

export interface MorphoComponentStats {
  count: number;
  components: MorphoComponent2[];
}

/**
 * Label connected foreground regions (4-connectivity) and report count,
 * bounding box, and area for each. `fg` is any array where > 0 = foreground.
 */
export function analyzeConnectedComponents(
  fg: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number
): MorphoComponentStats {
  const labels = new Int32Array(w * h).fill(-1);
  const queue: number[] = [];
  let next = 0;
  const comps: MorphoComponent2[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (fg[i]! <= 0 || labels[i]! >= 0) continue;
      const id = next++;
      let area = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      queue.length = 0;
      queue.push(i);
      labels[i] = id;
      while (queue.length > 0) {
        const ci = queue.pop()!;
        const cx = ci % w;
        const cy = (ci - cx) / w;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        if (cx > 0 && fg[ci - 1]! > 0 && labels[ci - 1]! < 0) { labels[ci - 1] = id; queue.push(ci - 1); }
        if (cx < w - 1 && fg[ci + 1]! > 0 && labels[ci + 1]! < 0) { labels[ci + 1] = id; queue.push(ci + 1); }
        if (cy > 0 && fg[ci - w]! > 0 && labels[ci - w]! < 0) { labels[ci - w] = id; queue.push(ci - w); }
        if (cy < h - 1 && fg[ci + w]! > 0 && labels[ci + w]! < 0) { labels[ci + w] = id; queue.push(ci + w); }
      }
      comps.push({ id, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, area });
    }
  }
  return { count: next, components: comps };
}

/** Threshold derived components from raw RGBA pixels (reuses luminance rule). */
export function binaryFromLuminanceThreshold(src: Uint8ClampedArray, w: number, h: number, threshold: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h);
  const t = Math.max(0, Math.min(255, Math.round(threshold)));
  for (let i = 0; i < w * h; i++) {
    const lum = 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
    out[i] = lum >= t ? 255 : 0;
  }
  return out;
}

/** Colorize labeled components with a deterministic golden-ratio hue. */
function colorizeComponents(src: Uint8ClampedArray, b: Uint8Array, w: number, h: number): Uint8ClampedArray {
  const labelMap = new Int32Array(w * h).fill(-1);
  let count = 0;
  {
    const stack: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (b[i] === 0 || labelMap[i]! >= 0) continue;
        const id = ++count;
        stack.length = 0;
        stack.push(i);
        labelMap[i] = id;
        while (stack.length > 0) {
          const ci = stack.pop()!;
          const cx = ci % w;
          if (cx > 0 && b[ci - 1]! > 0 && labelMap[ci - 1]! < 0) { labelMap[ci - 1] = id; stack.push(ci - 1); }
          if (cx < w - 1 && b[ci + 1]! > 0 && labelMap[ci + 1]! < 0) { labelMap[ci + 1] = id; stack.push(ci + 1); }
          if (ci >= w && b[ci - w]! > 0 && labelMap[ci - w]! < 0) { labelMap[ci - w] = id; stack.push(ci - w); }
          if (ci < w * (h - 1) && b[ci + w]! > 0 && labelMap[ci + w]! < 0) { labelMap[ci + w] = id; stack.push(ci + w); }
        }
      }
    }
  }
  const PHI = 0.618033988749895;
  const out = new Uint8ClampedArray(src.length);
  const n = Math.max(1, count);
  void n;
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4;
    out[pi + 3] = src[pi + 3];
    const label = labelMap[i]!;
    if (label <= 0) {
      out[pi] = 0;
      out[pi + 1] = 0;
      out[pi + 2] = 0;
      continue;
    }
    const hue = ((label * PHI) % 1) * 360;
    const sat = 0.75 + ((label % 2) * 0.15);
    const val = 0.85 + ((label % 3) * 0.05);
    const c = val * sat;
    const hx = hue / 60;
    const x = c * (1 - Math.abs((hx % 2) - 1));
    let r = 0, g = 0, bv = 0;
    if (hx < 1) { r = c; g = x; } else if (hx < 2) { r = x; g = c; } else if (hx < 3) { g = c; bv = x; } else if (hx < 4) { g = x; bv = c; } else if (hx < 5) { r = x; bv = c; } else { r = c; bv = x; }
    const m = val - c;
    out[pi] = clamp(Math.round((r + m) * 255), 0, 255);
    out[pi + 1] = clamp(Math.round((g + m) * 255), 0, 255);
    out[pi + 2] = clamp(Math.round((bv + m) * 255), 0, 255);
  }
  return out;
}

function runMorphology(op: ProcessOp, src: Uint8ClampedArray, w: number, h: number, params: ProcessParams): Uint8ClampedArray {
  const shape = params.shape ?? 0;
  const size = Math.round(params.size ?? 3);
  const iterations = Math.max(1, Math.round(params.iterations ?? 1));
  const borderMode = params.borderMode ?? 0;
  const borderValue = Math.max(0, Math.min(255, params.borderValue ?? 0));
  const inputMode = params.inputMode ?? 0;
  const threshold = Math.max(0, Math.min(255, params.threshold ?? 128));
  const markerThreshold = Math.max(0, Math.min(255, params.markerThreshold ?? 128));
  const se = buildSE(shape, size, params.customKernel);

  if (CONTINUOUS_MORPHO_OPS.has(op)) {
    const kind = continuousOpKind(op);
    // per-channel mode operates on each RGB channel independent
    if (inputMode === 2) {
      const out = new Uint8ClampedArray(src.length);
      for (let c = 0; c < 3; c++) {
        const ch = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) ch[i] = src[i * 4 + c]!;
        const res = planeOperation(ch, w, h, se, iterations, borderMode, borderValue, kind);
        for (let i = 0; i < w * h; i++) out[i * 4 + c] = clamp(Math.round(res[i] ?? 0), 0, 255);
      }
      for (let i = 0; i < w * h; i++) out[i * 4 + 3] = src[i * 4 + 3];
      return out;
    }
    if (inputMode === 1) {
      const bin = binaryThreshold(src, w, h, threshold);
      const plane = binaryFromBinaryPlane(bin, w, h);
      const res = planeOperation(plane, w, h, se, iterations, borderMode, borderValue, kind);
      return rgbaFromPlane(src, res, w, h);
    }
    const lum = luminancePlane(src, w, h);
    const res = planeOperation(lum, w, h, se, iterations, borderMode, borderValue, kind);
    return rgbaFromPlane(src, res, w, h);
  }

  const bin = binaryThreshold(src, w, h, threshold);

  switch (op) {
    case "morphoHitOrMiss": {
      const box = buildSEBox(shape, size, params.customKernel);
      const res = hitOrMissBinary(bin, w, h, box);
      return rgbaFromBinary(src, res, w, h);
    }
    case "morphoBoundary": {
      const e = binaryErode(bin, w, h, se, borderMode, borderValue);
      const res = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) res[i] = bin[i]! === 1 && e[i] === 0 ? 1 : 0;
      return rgbaFromBinary(src, res, w, h);
    }
    case "morphoHoleFill": {
      const res = holeFillBinary(bin, w, h);
      return rgbaFromBinary(src, res, w, h);
    }
    case "morphoThinning": {
      const res = thinBinary(bin, w, h, iterations);
      return rgbaFromBinary(src, res, w, h);
    }
    case "morphoThickening": {
      const comp = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) comp[i] = bin[i]! === 1 ? 0 : 1;
      const thin = thinBinary(comp, w, h, iterations);
      const res = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) res[i] = thin[i] === 1 ? 0 : 1;
      return rgbaFromBinary(src, res, w, h);
    }
    case "morphoSkeleton": {
      const res = thinBinary(bin, w, h, 0);
      return rgbaFromBinary(src, res, w, h);
    }
    case "morphoComponents": {
      return colorizeComponents(src, bin, w, h);
    }
    case "morphoReconstruction": {
      const marker = binaryThreshold(src, w, h, markerThreshold);
      const res = reconstructionBinary(bin, marker, w, h, se, 0, borderMode, borderValue);
      return rgbaFromBinary(src, res, w, h);
    }
    default:
      return src.slice();
  }
}