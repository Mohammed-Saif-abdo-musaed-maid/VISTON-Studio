import { describe, it, expect } from "vitest";
import { AIError } from "../core/AIError";

describe("AIError", () => {
  it("exposes a stable code", () => {
    const e = new AIError("timeout", "took too long", "upscale");
    expect(e.code).toBe("timeout");
    expect(e.operation).toBe("upscale");
  });

  it("userMessage() produces a human-safe string", () => {
    const e = new AIError("network", "boom", "upscale");
    expect(typeof AIError.userMessage(e)).toBe("string");
    expect(AIError.userMessage(e).length).toBeGreaterThan(0);
  });

  it("userSafe() never leaks internal errors verbatim", () => {
    const e = new AIError("unknown", "internal: TypeError", "denoise");
    const msg = AIError.userSafe(e);
    expect(msg).toBeTruthy();
    expect(typeof msg).toBe("string");
  });

  it("isCancellation() detects cancelled", () => {
    const e = new AIError("cancelled");
    expect(AIError.isCancellation(e)).toBe(true);
    expect(AIError.isCancellation({ message: "x" })).toBe(false);
  });
});