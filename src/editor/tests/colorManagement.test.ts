import { describe, it, expect } from "vitest";
import {
  DEFAULT_COLOR_SPACE,
  COLOR_SPACES,
  normalizeColorSpace,
  colorSpaceLabel,
  isColorSpaceSupported,
  colorManagementCapabilities,
  isBitDepthSupported,
  SUPPORTED_BIT_DEPTHS,
} from "../core/colorSpace";

describe("Color space model (Phase 26)", () => {
  it("only sRGB is genuinely supported", () => {
    expect(SUPPORTED_BIT_DEPTHS).toEqual([8]);
    expect(isColorSpaceSupported("sRGB")).toBe(true);
    expect(isColorSpaceSupported("display-p3")).toBe(false);
    expect(isColorSpaceSupported("adobe-rgb")).toBe(false);
  });

  it("normalizes aliases to canonical ids", () => {
    expect(normalizeColorSpace("sRGB")).toBe("sRGB");
    expect(normalizeColorSpace("srgb")).toBe("sRGB");
    expect(normalizeColorSpace("sRGB IEC61966-2.1")).toBe("sRGB");
    expect(normalizeColorSpace("display-p3")).toBe("display-p3");
    expect(normalizeColorSpace("Display P3")).toBe("display-p3");
    expect(normalizeColorSpace("p3")).toBe("display-p3");
    expect(normalizeColorSpace("Adobe RGB (1998)")).toBe("adobe-rgb");
    expect(normalizeColorSpace("adobergb")).toBe("adobe-rgb");
  });

  it("falls back to sRGB for unknown / non-string input", () => {
    expect(normalizeColorSpace(undefined)).toBe(DEFAULT_COLOR_SPACE);
    expect(normalizeColorSpace(null)).toBe(DEFAULT_COLOR_SPACE);
    expect(normalizeColorSpace(42)).toBe(DEFAULT_COLOR_SPACE);
    expect(normalizeColorSpace("cmyk")).toBe(DEFAULT_COLOR_SPACE);
  });

  it("never claims ICC / linear / conversion capability", () => {
    const caps = colorManagementCapabilities("display-p3");
    expect(caps.workingSpace).toBe("sRGB");
    expect(caps.supportedSpaces).toEqual(["sRGB"]);
    expect(caps.declaredSpaces).toEqual(["display-p3"]);
    expect(caps.iccProfiles).toBe(false);
    expect(caps.linearWorkflow).toBe(false);
    expect(caps.colorConversion).toBe(false);
    expect(caps.bitDepth).toBe(8);
  });

  it("exposes labels and a stable registry", () => {
    expect(COLOR_SPACES).toHaveLength(3);
    expect(colorSpaceLabel("sRGB")).toContain("sRGB");
    expect(isBitDepthSupported(8)).toBe(true);
    expect(isBitDepthSupported(16)).toBe(false);
  });
});
