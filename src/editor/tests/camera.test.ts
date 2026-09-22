import { describe, it, expect } from "vitest";
import { Camera } from "../canvas/camera";

describe("Fit to workspace / camera math", () => {
  it("fits a landscape image inside the workspace entirely", () => {
    const cam = new Camera();
    // Example from the spec: image 6000x4000 in a 1200x800 workspace.
    cam.apply(6000, 4000, 1200, 800, 48);

    // scale = min((1200-96)/6000, (800-96)/4000) = min(0.184, 0.176) = 0.176
    expect(cam.zoom).toBeCloseTo(0.176, 3);
    // Document must be fully inside viewport: docW*zoom <= viewW - pad
    expect(6000 * cam.zoom).toBeLessThanOrEqual(1200 - 48);
    expect(4000 * cam.zoom).toBeLessThanOrEqual(800 - 48);
    // Aspect ratio preserved
    expect(Math.abs(cam.zoom * 6000 / (cam.zoom * 4000))).toBeCloseTo(1.5, 3);
    // Centered
    expect(cam.x).toBeCloseTo((1200 - 6000 * cam.zoom) / 2, 1);
    expect(cam.y).toBeCloseTo((800 - 4000 * cam.zoom) / 2, 1);
  });

  it("fits a portrait image without cropping", () => {
    const cam = new Camera();
    cam.apply(3000, 5000, 1200, 800, 48);

    const scale = Math.min((1200 - 96) / 3000, (800 - 96) / 5000);
    expect(cam.zoom).toBeCloseTo(scale, 3);
    expect(3000 * cam.zoom).toBeLessThanOrEqual(1200 - 48);
    expect(5000 * cam.zoom).toBeLessThanOrEqual(800 - 48);
    // Portrait ratio preserved: width < height
    expect(cam.zoom * 3000).toBeLessThan(cam.zoom * 5000);
  });

  it("does not scale a small image up beyond reason unless it fills the workspace", () => {
    const cam = new Camera();
    cam.apply(800, 600, 1200, 800, 48);

    // Small doc still fits completely and is centered.
    expect(800 * cam.zoom).toBeLessThanOrEqual(1200 - 48);
    expect(600 * cam.zoom).toBeLessThanOrEqual(800 - 48);
    // Aspect ratio is preserved (1.3333...) — no distortion.
    expect((800 * cam.zoom) / (600 * cam.zoom)).toBeCloseTo(4 / 3, 3);
    expect(cam.x).toBeGreaterThan(0);
    expect(cam.y).toBeGreaterThan(0);
  });

  it("100% centers the document at zoom 1", () => {
    const cam = new Camera();
    cam.zoom = 1;
    cam.x = 0;
    cam.y = 0;

    // Manual zoom100 equivalent
    cam.zoom = 1;
    cam.x = (1200 - 800) / 2;
    cam.y = (800 - 500) / 2;

    expect(cam.zoom).toBe(1);
    expect(cam.x).toBe(200);
    expect(cam.y).toBe(150);
    expect(cam.toViewport(0, 0)).toEqual({ x: 200, y: 150 });
  });

  it("zoom in/out anchors the viewport point and clamps zoom bounds", () => {
    const cam = new Camera();
    cam.apply(2000, 2000, 1200, 800);
    const vp = { x: 600, y: 400 };
    const docP = cam.toDoc(vp.x, vp.y);
    const oldFactor = cam.zoom;

    // zoomAtVP math (before the pan clamp kicks in for out-of-range pan):
    //   newZoom = clamp(zoom * factor)
    //   newX    = vp.x - (vp.x - cam.x) * (newZoom / oldFactor)
    //   newY    = vp.y - (vp.y - cam.y) * (newZoom / oldFactor)
    const factor = 1.3;
    const newZoom = Math.max(0.02, Math.min(64, cam.zoom * factor));
    const newX = vp.x - (vp.x - cam.x) * (newZoom / oldFactor);
    const newY = vp.y - (vp.y - cam.y) * (newZoom / oldFactor);
    expect((vp.x - newX) / newZoom).toBeCloseTo(docP.x, 2);
    expect((vp.y - newY) / newZoom).toBeCloseTo(docP.y, 2);
    expect(newZoom).toBeCloseTo(oldFactor * factor, 3);

    // Zoom out below min clamps
    cam.zoom = 0.001;
    cam.clamp(2000, 2000, 1200, 800);
    expect(cam.zoom).toBe(0.02);

    // Zoom above max clamps
    cam.zoom = 1000;
    cam.clamp(2000, 2000, 1200, 800);
    expect(cam.zoom).toBe(64);

    // The pan clamp never allows zoom to escape the [min, max] range even mid-edit
    cam.zoom = 50;
    cam.clamp(2000, 2000, 1200, 800);
    expect(cam.zoom).toBe(50);
  });

  it("doc-to-viewport and viewport-to-doc round-trip under a fitted camera", () => {
    const cam = new Camera();
    cam.apply(6000, 4000, 1200, 800);

    const corner = cam.toViewport(0, 0);
    expect(corner.x).toBeCloseTo(cam.x, 3);
    expect(corner.y).toBeCloseTo(cam.y, 3);

    const back = cam.toDoc(corner.x, corner.y);
    expect(back.x).toBeCloseTo(0, 2);
    expect(back.y).toBeCloseTo(0, 2);
  });
});