/**
 * Phase 26 — Color management model.
 *
 * Vision Studio composites in a browser Canvas 2D pipeline, which is a fixed
 * 8-bit, sRGB-tagged pipeline. This module makes that reality explicit and
 * typed instead of pretending to support colour spaces the architecture cannot
 * actually process:
 *
 *   - sRGB is the only working space that is genuinely processed.
 *   - Display P3 / Adobe RGB are recognised *identities* (so a file that
 *     declares them is not silently mislabelled), but they are NOT converted,
 *     and the app refuses to claim it composited in that space.
 *   - 8-bit is the only supported bit depth (Canvas `Uint8ClampedArray`).
 *   - There is no ICC engine, no linear workflow and no colour conversion.
 *
 * A `colorProfile` string on a document is therefore a *declaration*, never a
 * promise of conversion. `normalizeColorSpace` keeps declarations stable and
 * `isColorSpaceSupported` lets the UI be honest about the rest.
 */

export type ColorSpaceId = "sRGB" | "display-p3" | "adobe-rgb";

export interface ColorSpaceInfo {
  id: ColorSpaceId;
  label: string;
  /** True only for spaces the compositor can actually process. */
  supported: boolean;
}

export const COLOR_SPACES: readonly ColorSpaceInfo[] = [
  { id: "sRGB", label: "sRGB IEC61966-2.1", supported: true },
  { id: "display-p3", label: "Display P3", supported: false },
  { id: "adobe-rgb", label: "Adobe RGB (1998)", supported: false },
];

export const DEFAULT_COLOR_SPACE: ColorSpaceId = "sRGB";

const CANONICAL_BY_ID = new Map<ColorSpaceId, ColorSpaceId>(
  COLOR_SPACES.map((c) => [c.id, c.id])
);

/** Accepts any historical/aliased profile string and maps it to a canonical id. */
export function normalizeColorSpace(raw: unknown): ColorSpaceId {
  if (typeof raw !== "string") return DEFAULT_COLOR_SPACE;
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "srgb" || key === "srgbiec6196621" || key === "iec6196621" || key === "srgbcolorprofile") {
    return "sRGB";
  }
  if (key === "displayp3" || key === "p3" || key === "displayp3srgb") return "display-p3";
  if (key === "adobergb" || key === "adobergb1998" || key === "argb") return "adobe-rgb";
  const exact = CANONICAL_BY_ID.get(raw as ColorSpaceId);
  return exact ?? DEFAULT_COLOR_SPACE;
}

export function colorSpaceInfo(id: ColorSpaceId): ColorSpaceInfo {
  const found = COLOR_SPACES.find((c) => c.id === id);
  return found ?? COLOR_SPACES[0]!;
}

export function colorSpaceLabel(id: ColorSpaceId): string {
  return colorSpaceInfo(id).label;
}

/** Only the browser pipeline's native working space is genuinely processable. */
export function isColorSpaceSupported(id: ColorSpaceId): boolean {
  return colorSpaceInfo(id).supported;
}

export type BitDepth = 8 | 16 | 32;

export const SUPPORTED_BIT_DEPTHS: readonly BitDepth[] = [8];
export const DEFAULT_BIT_DEPTH: BitDepth = 8;

export function isBitDepthSupported(depth: number): depth is BitDepth {
  return (SUPPORTED_BIT_DEPTHS as readonly number[]).includes(depth);
}

export interface ColorManagementCapabilities {
  workingSpace: ColorSpaceId;
  supportedSpaces: ColorSpaceId[];
  declaredSpaces: ColorSpaceId[];
  bitDepth: BitDepth;
  supportedBitDepths: BitDepth[];
  iccProfiles: boolean;
  linearWorkflow: boolean;
  colorConversion: boolean;
  notes: string[];
}

/**
 * Honest capability report used by Document Info / export UI. It never claims a
 * feature the compositor does not have.
 */
export function colorManagementCapabilities(declared?: unknown): ColorManagementCapabilities {
  const declaredSpace = normalizeColorSpace(declared);
  return {
    workingSpace: DEFAULT_COLOR_SPACE,
    supportedSpaces: COLOR_SPACES.filter((c) => c.supported).map((c) => c.id),
    declaredSpaces: declaredSpace === DEFAULT_COLOR_SPACE ? [] : [declaredSpace],
    bitDepth: DEFAULT_BIT_DEPTH,
    supportedBitDepths: [...SUPPORTED_BIT_DEPTHS],
    iccProfiles: false,
    linearWorkflow: false,
    colorConversion: false,
    notes: [
      "Compositing is performed in 8-bit sRGB (browser Canvas 2D).",
      "No ICC profile embedding, linear workflow or colour-space conversion is performed.",
    ],
  };
}
