import { describe, it, expect } from "vitest";
import {
  makeArtboard,
  sanitizeArtboards,
  findArtboardAt,
  artboardContains,
  clampArtboardToDoc,
  normalizeArtboardRect,
} from "../core/artboards";
import { DEFAULT_GRID_SETTINGS, gridLinePositions, gridStep, sanitizeGridSettings } from "../core/gridSettings";

describe("Artboards model (Phase 29)", () => {
  it("creates a named, bounded artboard with a stable id", () => {
    const ab = makeArtboard({ x: 10, y: 20, width: 300, height: 200, name: "Hero" });
    expect(ab.id.startsWith("artboard-")).toBe(true);
    expect(ab.name).toBe("Hero");
    expect(ab.background).toBeNull();
    expect(ab.visible).toBe(true);
    expect(ab.width).toBe(300);
  });

  it("normalizes invalid rects to a minimum size of 1", () => {
    const r = normalizeArtboardRect({ x: 1.4, y: 2.6, width: -5, height: 0 });
    expect(r).toEqual({ x: 1, y: 3, width: 1, height: 1 });
  });

  it("round-trips through sanitize (save/load fidelity)", () => {
    const original = [makeArtboard({ x: 5, y: 6, width: 100, height: 80, name: "A", background: "#ff0000" })];
    const parsed = JSON.parse(JSON.stringify(original)) as unknown;
    const loaded = sanitizeArtboards(parsed, 1280, 800);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(original[0]);
  });

  it("drops malformed entries and de-dupes ids", () => {
    const raw = [
      null,
      "nope",
      { id: "dup", x: 0, y: 0, width: 10, height: 10 },
      { id: "dup", x: 1, y: 1, width: 10, height: 10 },
      { id: "ok", x: 2, y: 2, width: 30, height: 40, name: "B" },
    ];
    const loaded = sanitizeArtboards(raw, 1280, 800);
    expect(loaded.map((a) => a.id)).toEqual(["dup", "ok"]);
  });

  it("returns an empty list for missing artboards (old projects)", () => {
    expect(sanitizeArtboards(undefined, 1280, 800)).toEqual([]);
    expect(sanitizeArtboards({}, 1280, 800)).toEqual([]);
  });

  it("hit-tests and finds the topmost artboard", () => {
    const a = makeArtboard({ x: 0, y: 0, width: 100, height: 100, name: "A" });
    const b = makeArtboard({ x: 50, y: 50, width: 100, height: 100, name: "B" });
    expect(artboardContains(a, 10, 10)).toBe(true);
    expect(findArtboardAt([a, b], 60, 60)?.name).toBe("B");
    expect(findArtboardAt([a, b], 500, 500)).toBeNull();
  });

  it("clamps artboards inside the document", () => {
    const r = clampArtboardToDoc({ x: 1200, y: 900, width: 400, height: 300 }, 1280, 800);
    expect(r).toEqual({ x: 880, y: 500, width: 400, height: 300 });
  });
});

describe("Grid settings (Phase 30)", () => {
  it("sanitizes to safe values", () => {
    expect(sanitizeGridSettings(undefined)).toEqual(DEFAULT_GRID_SETTINGS);
    expect(sanitizeGridSettings({ spacing: -1, subdivisions: 0, color: "nope" })).toEqual({
      ...DEFAULT_GRID_SETTINGS,
      subdivisions: 1,
    });
    expect(sanitizeGridSettings({ spacing: 32, subdivisions: 2, color: "#112233" })).toEqual({
      spacing: 32,
      subdivisions: 2,
      color: "#112233",
    });
  });

  it("derives the snap step from spacing / subdivisions", () => {
    expect(gridStep({ spacing: 64, subdivisions: 4, color: "#000000" })).toBe(16);
    expect(gridStep({ spacing: 64, subdivisions: 1, color: "#000000" })).toBe(64);
  });

  it("produces major and minor line positions within the extent", () => {
    const { major, minor } = gridLinePositions({ spacing: 64, subdivisions: 4, color: "#000" }, 130);
    expect(major).toEqual([0, 64, 128]);
    expect(minor).toContain(16);
    expect(minor).toContain(48);
    expect(Math.max(...major, ...minor)).toBeLessThanOrEqual(130);
  });
});
