import type { ProcessOp } from "./processor";

export interface FilterParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit: string;
  options?: { label: string; value: number }[];
}

export interface FilterSpec {
  label: string;
  desc: string;
  params: FilterParamSpec[];
}

// ── Morphological processing shared params ──

const morphoShapeParam: FilterParamSpec = {
  key: "shape",
  label: "morphoShapeLabel",
  min: 0,
  max: 2,
  step: 1,
  def: 0,
  unit: "",
  options: [
    { label: "morphoShapeRect", value: 0 },
    { label: "morphoShapeEllipse", value: 1 },
    { label: "morphoShapeCross", value: 2 },
  ],
};

const morphoSizeParam: FilterParamSpec = {
  key: "size",
  label: "morphoSize",
  min: 1,
  max: 9,
  step: 1,
  def: 3,
  unit: "",
  options: [
    { label: "1 px", value: 1 },
    { label: "3 px", value: 3 },
    { label: "5 px", value: 5 },
    { label: "7 px", value: 7 },
    { label: "9 px", value: 9 },
  ],
};

const morphoIterationsParam: FilterParamSpec = {
  key: "iterations",
  label: "morphoIterations",
  min: 1,
  max: 12,
  step: 1,
  def: 1,
  unit: "",
};

const morphoBorderModeParam: FilterParamSpec = {
  key: "borderMode",
  label: "morphoBorderMode",
  min: 0,
  max: 2,
  step: 1,
  def: 0,
  unit: "",
  options: [
    { label: "morphoBorderReplicate", value: 0 },
    { label: "morphoBorderConstant", value: 1 },
    { label: "morphoBorderReflect", value: 2 },
  ],
};

const morphoBorderValueParam: FilterParamSpec = {
  key: "borderValue",
  label: "morphoBorderValue",
  min: 0,
  max: 255,
  step: 1,
  def: 0,
  unit: "",
};

const morphoInputModeParam: FilterParamSpec = {
  key: "inputMode",
  label: "morphoInputMode",
  min: 0,
  max: 2,
  step: 1,
  def: 0,
  unit: "",
  options: [
    { label: "morphoModeGrayscale", value: 0 },
    { label: "morphoModeBinary", value: 1 },
    { label: "morphoModePerChannel", value: 2 },
  ],
};

const morphoThresholdParam: FilterParamSpec = {
  key: "threshold",
  label: "morphoThreshold",
  min: 0,
  max: 255,
  step: 1,
  def: 128,
  unit: "",
};

const morphoMarkerThresholdParam: FilterParamSpec = {
  key: "markerThreshold",
  label: "morphoMarkerThreshold",
  min: 0,
  max: 255,
  step: 1,
  def: 128,
  unit: "",
};

// Continuous ops: structural element + iterations + border + input interpretation.
const morphoStructuralParams: FilterParamSpec[] = [
  morphoShapeParam,
  morphoSizeParam,
  morphoIterationsParam,
  morphoBorderModeParam,
  morphoBorderValueParam,
  morphoInputModeParam,
  morphoThresholdParam,
];

/** Binary ops still honor the structuring element / iterations where meaningful. */
const morphoBinaryParams: FilterParamSpec[] = [
  morphoShapeParam,
  morphoSizeParam,
  morphoIterationsParam,
  morphoBorderModeParam,
  morphoBorderValueParam,
  morphoThresholdParam,
];

export const specs: Record<ProcessOp, FilterSpec> = {
  gaussianBlur: {
    label: "gaussianBlur",
    desc: "Separable Gaussian convolution. Sigma = radius / 2, replicate-edge sampling.",
    params: [{ key: "radius", label: "Radius", min: 0, max: 50, step: 0.5, def: 3, unit: "px" }],
  },
  meanBlur: {
    label: "meanBlur",
    desc: "Box (mean) average over a (2r+1)² window. Running-sum implementation, replicate-edge sampling.",
    params: [{ key: "radius", label: "Radius", min: 0, max: 50, step: 1, def: 2, unit: "px" }],
  },
  medianFilter: {
    label: "medianFilter",
    desc: "Per-channel median over a (2r+1)² window. Removes impulse noise, preserves edges. Alpha preserved.",
    params: [{ key: "radius", label: "Radius", min: 0, max: 15, step: 1, def: 1, unit: "px" }],
  },
  sharpen: {
    label: "sharpen",
    desc: "Unsharp masking: out = src + amount × (src − gaussian(radius)).",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 4, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Blur Radius", min: 0.5, max: 8, step: 0.5, def: 2, unit: "px" },
    ],
  },
  unsharpMask: {
    label: "unsharpMask",
    desc: "Unsharp masking with threshold. Only sharpens differences above the threshold to suppress noise.",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 4, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 0.5, max: 20, step: 0.5, def: 2, unit: "px" },
      { key: "threshold", label: "Threshold", min: 0, max: 255, step: 1, def: 0, unit: "" },
    ],
  },
  highBoost: {
    label: "highBoost",
    desc: "High-boost filtering: out = A × src − blurred. Amplifies original and adds detail.",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 4, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 0.5, max: 20, step: 0.5, def: 2, unit: "px" },
      { key: "threshold", label: "Threshold", min: 0, max: 255, step: 1, def: 0, unit: "" },
    ],
  },
  sobelEdge: {
    label: "sobelEdge",
    desc: "Sobel gradient magnitude with adjustable strength. Renders grayscale edge map.",
    params: [
      { key: "strength", label: "Strength", min: 0, max: 5, step: 0.1, def: 1, unit: "" },
    ],
  },
  prewittEdge: {
    label: "prewittEdge",
    desc: "Prewitt gradient magnitude with adjustable strength. Renders grayscale edge map.",
    params: [
      { key: "strength", label: "Strength", min: 0, max: 5, step: 0.1, def: 1, unit: "" },
    ],
  },
  laplacianEdge: {
    label: "laplacianEdge",
    desc: "Laplacian edge enhancement blended with original. Strength and radius adjustable.",
    params: [
      { key: "strength", label: "Strength", min: 0, max: 5, step: 0.1, def: 1, unit: "" },
      { key: "radius", label: "Pre-blur", min: 0, max: 10, step: 0.5, def: 0, unit: "px" },
    ],
  },
  cannyEdge: {
    label: "cannyEdge",
    desc: "Full Canny pipeline: Gaussian blur → Sobel gradient → non-max suppression → hysteresis thresholding.",
    params: [
      { key: "lowThreshold", label: "Low Threshold", min: 1, max: 200, step: 1, def: 20, unit: "" },
      { key: "highThreshold", label: "High Threshold", min: 1, max: 300, step: 1, def: 60, unit: "" },
      { key: "blur", label: "Blur", min: 0, max: 10, step: 0.5, def: 1, unit: "px" },
      { key: "edgeStrength", label: "Edge Strength", min: 0, max: 5, step: 0.1, def: 1, unit: "" },
    ],
  },
  smartSharpen: {
    label: "smartSharpen",
    desc: "Sharpen with noise suppression and shadow/highlight fade control.",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 4, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 0.5, max: 20, step: 0.5, def: 2, unit: "px" },
      { key: "noiseReduction", label: "Reduce Noise", min: 0, max: 100, step: 1, def: 0, unit: "%" },
      { key: "shadowFade", label: "Shadow Fade", min: 0, max: 100, step: 1, def: 0, unit: "%" },
      { key: "highlightFade", label: "Highlight Fade", min: 0, max: 100, step: 1, def: 0, unit: "%" },
    ],
  },
  sharpenDetails: {
    label: "sharpenDetails",
    desc: "Multi-scale sharpening with separate fine, medium, and large detail control.",
    params: [
      { key: "fineDetail", label: "Fine Detail", min: 0, max: 3, step: 0.05, def: 0, unit: "" },
      { key: "mediumDetail", label: "Medium Detail", min: 0, max: 3, step: 0.05, def: 0, unit: "" },
      { key: "largeDetail", label: "Large Detail", min: 0, max: 3, step: 0.05, def: 0, unit: "" },
      { key: "amount", label: "Amount", min: 0, max: 4, step: 0.05, def: 0.5, unit: "" },
    ],
  },
  edgeSharpen: {
    label: "edgeSharpen",
    desc: "Sharpens only along detected edges. Noise protection prevents noise amplification.",
    params: [
      { key: "edgeStrength", label: "Edge Strength", min: 0, max: 3, step: 0.05, def: 1, unit: "" },
      { key: "radius", label: "Radius", min: 0.5, max: 10, step: 0.5, def: 2, unit: "px" },
      { key: "threshold", label: "Threshold", min: 0, max: 100, step: 1, def: 0, unit: "" },
      { key: "noiseProtection", label: "Noise Protection", min: 0, max: 100, step: 1, def: 0, unit: "%" },
    ],
  },
  claritySharpen: {
    label: "claritySharpen",
    desc: "Enhances mid-tone contrast with texture preservation to prevent over-sharpening.",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 3, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 1, max: 50, step: 1, def: 5, unit: "px" },
      { key: "texturePreservation", label: "Texture Preservation", min: 0, max: 100, step: 1, def: 0, unit: "%" },
    ],
  },
  textureSharpen: {
    label: "textureSharpen",
    desc: "Multi-band texture enhancement with separate fine and medium texture controls.",
    params: [
      { key: "fineTexture", label: "Fine Texture", min: 0, max: 3, step: 0.05, def: 0, unit: "" },
      { key: "mediumTexture", label: "Medium Texture", min: 0, max: 3, step: 0.05, def: 0, unit: "" },
      { key: "strength", label: "Strength", min: 0, max: 3, step: 0.05, def: 0.5, unit: "" },
    ],
  },
  localContrastSharpen: {
    label: "localContrastSharpen",
    desc: "Enhances local contrast using a local mean with additional edge detail.",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 3, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 1, max: 50, step: 1, def: 5, unit: "px" },
      { key: "detail", label: "Detail", min: 0, max: 3, step: 0.05, def: 0, unit: "" },
    ],
  },
  directionalSharpen: {
    label: "directionalSharpen",
    desc: "Sharpens along a specific angle. Emphasizes detail perpendicular to the given angle.",
    params: [
      { key: "angle", label: "Angle", min: 0, max: 180, step: 1, def: 0, unit: "°" },
      { key: "strength", label: "Strength", min: 0, max: 3, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 0.5, max: 10, step: 0.5, def: 2, unit: "px" },
    ],
  },
  focusSharpen: {
    label: "focusSharpen",
    desc: "Aggressive sharpening with automatic noise suppression.",
    params: [
      { key: "amount", label: "Amount", min: 0, max: 4, step: 0.05, def: 0.5, unit: "" },
      { key: "radius", label: "Radius", min: 0.5, max: 20, step: 0.5, def: 2, unit: "px" },
      { key: "noiseReduction", label: "Noise Suppression", min: 0, max: 100, step: 1, def: 0, unit: "%" },
    ],
  },
  noiseGeneration: {
    label: "noiseGeneration",
    desc: "Real seeded noise generation: Gaussian, Uniform, or Salt & Pepper. Deterministic for a given seed. Alpha is never modified.",
    params: [
      {
        key: "noiseType",
        label: "noiseTypeParam",
        min: 0,
        max: 2,
        step: 1,
        def: 0,
        unit: "",
        options: [
          { label: "gaussianNoise", value: 0 },
          { label: "uniformNoise", value: 1 },
          { label: "saltPepperNoise", value: 2 },
        ],
      },
      { key: "amount", label: "noiseAmountParam", min: 0, max: 100, step: 1, def: 50, unit: "%" },
      { key: "mean", label: "noiseMeanParam", min: -100, max: 100, step: 1, def: 0, unit: "" },
      { key: "variance", label: "noiseVarianceParam", min: 0, max: 100, step: 1, def: 25, unit: "" },
      { key: "saltProb", label: "saltParam", min: 0, max: 100, step: 1, def: 5, unit: "%" },
      { key: "pepperProb", label: "pepperParam", min: 0, max: 100, step: 1, def: 5, unit: "%" },
      { key: "seed", label: "seedParam", min: 0, max: 100000, step: 1, def: 0, unit: "" },
    ],
  },
  arithmeticMean: {
    label: "arithmeticMean",
    desc: "Arithmetic (box) mean filter — averages the neighborhood to reduce noise. O(N) running-sum implementation, replicate-edge sampling, original alpha preserved.",
    params: [
      {
        key: "kernel",
        label: "kernelSizeParam",
        min: 3,
        max: 9,
        step: 1,
        def: 3,
        unit: "",
        options: [
          { label: "3x3", value: 3 },
          { label: "5x5", value: 5 },
          { label: "7x7", value: 7 },
          { label: "9x9", value: 9 },
        ],
      },
    ],
  },
  geometricMean: {
    label: "geometricMean",
    desc: "Geometric mean filter — exp(Σ ln(g)/N) reduces noise while preserving more detail than the arithmetic mean. Zero-valued neighborhoods yield 0. Alpha preserved.",
    params: [
      {
        key: "kernel",
        label: "kernelSizeParam",
        min: 3,
        max: 7,
        step: 1,
        def: 3,
        unit: "",
        options: [
          { label: "3x3", value: 3 },
          { label: "5x5", value: 5 },
          { label: "7x7", value: 7 },
        ],
      },
    ],
  },
  contraHarmonicMean: {
    label: "contraHarmonicMean",
    desc: "Contra-harmonic mean — Q > 0 suppresses pepper (dark) noise, Q < 0 suppresses salt (white) noise. Q = 0 equals the arithmetic mean. Division-by-zero is guarded. Alpha preserved.",
    params: [
      {
        key: "kernel",
        label: "kernelSizeParam",
        min: 3,
        max: 7,
        step: 1,
        def: 3,
        unit: "",
        options: [
          { label: "3x3", value: 3 },
          { label: "5x5", value: 5 },
          { label: "7x7", value: 7 },
        ],
      },
      { key: "q", label: "qParam", min: -2, max: 2, step: 0.1, def: 0, unit: "" },
    ],
  },
  alphaTrimmedMean: {
    label: "alphaTrimmedMean",
    desc: "Alpha-trimmed mean — sorts the neighborhood, discards extreme values from both ends, averages the rest. Trim is clamped to the safe maximum. Alpha preserved.",
    params: [
      {
        key: "kernel",
        label: "kernelSizeParam",
        min: 3,
        max: 7,
        step: 1,
        def: 3,
        unit: "",
        options: [
          { label: "3x3", value: 3 },
          { label: "5x5", value: 5 },
          { label: "7x7", value: 7 },
        ],
      },
      { key: "trim", label: "trimParam", min: 0, max: 20, step: 1, def: 2, unit: "" },
    ],
  },
  wienerFilter: {
    label: "wienerFilter",
    desc: "Adaptive Wiener noise reduction using local mean & variance. Noise variance is auto-estimated from luminance differences or set manually. Alpha preserved.",
    params: [
      {
        key: "kernel",
        label: "kernelSizeParam",
        min: 3,
        max: 7,
        step: 1,
        def: 3,
        unit: "",
        options: [
          { label: "3x3", value: 3 },
          { label: "5x5", value: 5 },
          { label: "7x7", value: 7 },
        ],
      },
      {
        key: "noiseVarianceMode",
        label: "noiseVarianceModeParam",
        min: 0,
        max: 1,
        step: 1,
        def: 0,
        unit: "",
        options: [
          { label: "auto", value: 0 },
          { label: "manual", value: 1 },
        ],
      },
      { key: "noiseVariance", label: "noiseVarianceParam", min: 0, max: 1000, step: 1, def: 20, unit: "" },
    ],
  },
  morphoErosion: {
    label: "morphoErosion",
    desc: "Erosion: min over the structuring element. Shrinks bright regions, removes isolated specks.",
    params: morphoStructuralParams,
  },
  morphoDilation: {
    label: "morphoDilation",
    desc: "Dilation: max over the structuring element. Expands bright regions, closes small gaps.",
    params: morphoStructuralParams,
  },
  morphoOpening: {
    label: "morphoOpening",
    desc: "Opening = erosion followed by dilation. Removes small bright objects while preserving shape.",
    params: morphoStructuralParams,
  },
  morphoClosing: {
    label: "morphoClosing",
    desc: "Closing = dilation followed by erosion. Fills small dark gaps while preserving shape.",
    params: morphoStructuralParams,
  },
  morphoGradient: {
    label: "morphoGradient",
    desc: "Morphological gradient = dilation − erosion. Highlights object edges.",
    params: morphoStructuralParams,
  },
  morphoTopHat: {
    label: "morphoTopHat",
    desc: "Top hat = original − opening. Extracts small bright structures from a background.",
    params: morphoStructuralParams,
  },
  morphoBlackHat: {
    label: "morphoBlackHat",
    desc: "Black hat = closing − original. Extracts small dark structures from a background.",
    params: morphoStructuralParams,
  },
  morphoHitOrMiss: {
    label: "morphoHitOrMiss",
    desc: "Hit-or-miss: exact binary pattern match. Background (0) cells must be background, foreground (1) cells must be foreground.",
    params: [morphoShapeParam, morphoSizeParam, morphoThresholdParam],
  },
  morphoBoundary: {
    label: "morphoBoundary",
    desc: "Boundary extraction = foreground − erosion. Detects the outline of binary objects.",
    params: [morphoShapeParam, morphoSizeParam, morphoBorderModeParam, morphoBorderValueParam, morphoThresholdParam],
  },
  morphoHoleFill: {
    label: "morphoHoleFill",
    desc: "Fills holes: background regions not connected to the image border become foreground.",
    params: [morphoThresholdParam],
  },
  morphoThinning: {
    label: "morphoThinning",
    desc: "Zhang-Suen thinning: iteratively erodes structure while preserving connectivity.",
    params: [morphoThresholdParam, morphoIterationsParam],
  },
  morphoThickening: {
    label: "morphoThickening",
    desc: "Thickening = complement of the thinning of the complement.",
    params: [morphoThresholdParam, morphoIterationsParam],
  },
  morphoSkeleton: {
    label: "morphoSkeleton",
    desc: "Skeletonization: thinning applied until stable.",
    params: [morphoThresholdParam],
  },
  morphoComponents: {
    label: "morphoComponents",
    desc: "Connected components: labels each 4-connected foreground region with a distinct color.",
    params: [morphoThresholdParam],
  },
  morphoReconstruction: {
    label: "morphoReconstruction",
    desc: "Geodesic reconstruction: dilates the marker thresholded region, constrained by the mask, until stable.",
    params: [morphoShapeParam, morphoSizeParam, morphoBorderModeParam, morphoBorderValueParam, morphoThresholdParam, morphoMarkerThresholdParam],
  },
  laplacian: {
    label: "laplacian",
    desc: "4-neighborhood Laplacian edge response. Flat regions render as middle gray.",
    params: [],
  },
  sobel: {
    label: "sobel",
    desc: "Gradient magnitude |G| = √(Gx² + Gy²) rendered as grayscale edge map.",
    params: [],
  },
  prewitt: {
    label: "prewitt",
    desc: "Gradient magnitude |G| = √(Gx² + Gy²) rendered as grayscale edge map.",
    params: [],
  },
  brightness: { label: "brightness", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  contrast: { label: "contrast", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  gamma: { label: "gamma", desc: "", params: [{ key: "amount", label: "Gamma", min: 0.1, max: 5, step: 0.05, def: 1, unit: "" }] },
  saturation: { label: "saturation", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  exposure: { label: "exposure", desc: "", params: [{ key: "amount", label: "Amount", min: -5, max: 5, step: 0.1, def: 0, unit: "EV" }] },
  hue: { label: "hue", desc: "", params: [{ key: "amount", label: "Angle", min: -180, max: 180, step: 1, def: 0, unit: "°" }] },
  temperature: { label: "temperature", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  vibrance: { label: "vibrance", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  colorBalance: { label: "colorBalance", desc: "", params: [] },
  shadows: { label: "shadows", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  highlights: { label: "highlights", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  levels: { label: "levels", desc: "", params: [] },
  curves: { label: "curves", desc: "", params: [] },
  equalize: { label: "equalize", desc: "", params: [] },
  tint: { label: "tint", desc: "", params: [{ key: "amount", label: "Amount", min: -100, max: 100, step: 1, def: 0, unit: "" }] },
  blackWhite: { label: "blackWhite", desc: "", params: [] },
  channelMixer: { label: "channelMixer", desc: "", params: [] },
  selectiveColor: { label: "selectiveColor", desc: "", params: [] },
  gradientMap: { label: "gradientMap", desc: "", params: [] },
  colorLookup: { label: "colorLookup", desc: "", params: [] },
  adjustments: { label: "adjustments", desc: "", params: [] },
};

/** Ops that are pure filter-style operations (used for history naming). */
export const FILTER_OP_IDS = new Set<ProcessOp>(Object.keys(specs) as ProcessOp[]);