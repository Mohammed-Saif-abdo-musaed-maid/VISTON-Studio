import { describe, it, expect } from "vitest";
import { aiSelectionFromEditor, applyAiSelectionToEditor, aiMaskFromEngine } from "../image/maskConversion";
import { selectionEngine } from "../../editor/selection/selectionEngine";
import type { AISelection } from "../types";

describe("mask conversion", () => {
  it("round-trips a full-document mask", () => {
    selectionEngine.resize(8, 6);
    const mask = new Uint8ClampedArray(48);
    for (let i = 0; i < 48; i++) mask[i] = i % 7 === 0 ? 1 : 0;
    selectionEngine.setMask(mask);

    const aiSel = aiSelectionFromEditor();
    expect(aiSel).not.toBeNull();
    expect(aiSel!.kind).toBe("raster-mask");
    expect(aiSel!.bounds).not.toBeNull();
    expect(aiSel!.bounds!.width).toBeGreaterThan(0);

    // Round-trip into a fresh engine state.
    selectionEngine.clear();
    applyAiSelectionToEditor(aiSel);
    expect(selectionEngine.hasSelection).toBe(true);
    const back = aiMaskFromEngine();
    expect(back!.width).toBe(8);
    expect(back!.height).toBe(6);
    for (let i = 0; i < 48; i++) {
      expect(back!.data[i]).toBe(mask[i]);
    }
    selectionEngine.clear();
  });

  it("rectangle selection without mask fills bounds", () => {
    selectionEngine.resize(10, 10);
    selectionEngine.clear();
    const sel: AISelection = { kind: "rectangle", bounds: { x: 2, y: 2, width: 3, height: 3 }, mask: null };
    applyAiSelectionToEditor(sel);
    const m = selectionEngine.getMask();
    expect(m).not.toBeNull();
    if (m) {
      expect(m[22]).toBe(1);
      expect(m[2 * 10 + 2]).toBe(1);
      expect(m[0]).toBe(0);
      expect(m[5 * 10 + 5]).toBe(0);
    }
    selectionEngine.clear();
  });

  it("empty selection clears the engine", () => {
    selectionEngine.resize(4, 4);
    selectionEngine.makeAll();
    expect(selectionEngine.hasSelection).toBe(true);
    applyAiSelectionToEditor(null);
    expect(selectionEngine.hasSelection).toBe(false);
  });
});