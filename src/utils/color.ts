export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string, alpha = 1): RGBA {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length === 8) {
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a,
    };
  }
  const n = parseInt(h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
    a: alpha,
  };
}

export function rgbaToHex(r: number, g: number, b: number, a = 1): string {
  const to = (v: number) => clampByte(v).toString(16).padStart(2, "0");
  if (a < 1) {
    return `#${to(r)}${to(g)}${to(b)}${Math.round(clampByte(a) * 255).toString(16).padStart(2, "0")}`;
  }
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function cssColor(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgba(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}