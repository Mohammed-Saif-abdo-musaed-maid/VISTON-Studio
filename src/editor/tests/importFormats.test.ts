import { describe, it, expect } from "vitest";
import {
  IMPORT_FORMATS,
  importAcceptString,
  importFormatFor,
  assertImportable,
} from "../import/importFormats";

describe("Import format capabilities", () => {
  it("classifies each format honestly", () => {
    const byId = Object.fromEntries(IMPORT_FORMATS.map((f) => [f.id, f.support]));
    expect(byId.png).toBe("native");
    expect(byId.jpeg).toBe("native");
    expect(byId.webp).toBe("native");
    expect(byId.gif).toBe("native");
    expect(byId.bmp).toBe("native");
    expect(byId.svg).toBe("rasterized");
    expect(byId.tiff).toBe("unsupported");
  });

  it("builds an accept string containing both MIME types and extensions", () => {
    const accept = importAcceptString();
    expect(accept).toContain("image/png");
    expect(accept).toContain(".svg");
    expect(accept).toContain(".tiff");
  });

  it("matches formats by extension and by MIME type", () => {
    expect(importFormatFor({ name: "photo.PNG", type: "" })?.id).toBe("png");
    expect(importFormatFor({ name: "noext", type: "image/webp" })?.id).toBe("webp");
    expect(importFormatFor({ name: "scan.tif", type: "" })?.id).toBe("tiff");
    expect(importFormatFor({ name: "unknown.xyz", type: "" })).toBeNull();
  });

  it("throws a clear error only for genuinely unsupported formats", () => {
    expect(() => assertImportable({ name: "scan.tiff", type: "" })).toThrow(/not supported/i);
    expect(() => assertImportable({ name: "photo.png", type: "" })).not.toThrow();
    // Unknown formats are allowed through so the browser decoder can try.
    expect(() => assertImportable({ name: "mystery.xyz", type: "" })).not.toThrow();
  });
});
