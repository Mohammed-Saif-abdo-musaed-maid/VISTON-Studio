import type { BufferGeometry } from "three";

export type ImportKind = "glb" | "gltf" | "obj" | "stl";

export interface ImportRegistryEntry {
  assetId: string;
  name: string;
  kind: ImportKind;
  /** Embeddable raw bytes (used for project resources and parsing). */
  bytes: ArrayBuffer;
  /** Parsed geometry — populated asynchronously once a runtime requests it. */
  geometry: BufferGeometry | null;
}

const entries = new Map<string, ImportRegistryEntry>();

export function registerImportBytes(assetId: string, name: string, kind: ImportKind, bytes: ArrayBuffer): void {
  entries.set(assetId, { assetId, name, kind, bytes, geometry: null });
}

export function getImportEntry(assetId: string): ImportRegistryEntry | undefined {
  return entries.get(assetId);
}

export function listImportEntries(): ImportRegistryEntry[] {
  return Array.from(entries.values());
}

export function releaseImport(assetId: string): void {
  const e = entries.get(assetId);
  if (!e) return;
  e.geometry?.dispose();
  entries.delete(assetId);
}

/** Parse (once) and cache the merged BufferGeometry for an asset. */
export async function ensureImportGeometry(assetId: string): Promise<BufferGeometry | null> {
  const e = entries.get(assetId);
  if (!e) return null;
  if (e.geometry) return e.geometry;
  let geo: BufferGeometry | null = null;
  try {
    // Loaded on demand so three.js / the model loaders are not pulled into the
    // initial bundle by this always-imported registry.
    const { parseGlbArrayBuffer, parseObjText, parseStlArrayBuffer } = await import("./loaders3d");
    if (e.kind === "glb") geo = await parseGlbArrayBuffer(e.bytes.slice(0));
    else if (e.kind === "obj") geo = parseObjText(new TextDecoder().decode(e.bytes));
    else if (e.kind === "stl") geo = parseStlArrayBuffer(e.bytes.slice(0));
  } catch {
    geo = null;
  }
  if (geo) {
    e.geometry = geo;
  }
  return geo;
}

export function ensureImportGeometrySync(assetId: string): BufferGeometry | null {
  const e = entries.get(assetId);
  if (!e) return null;
  return e.geometry;
}

export function serializeImportsForProject(): { assetId: string; name: string; kind: ImportKind; dataUrl: string }[] {
  const out: { assetId: string; name: string; kind: ImportKind; dataUrl: string }[] = [];
  for (const e of entries.values()) {
    const mime =
      e.kind === "glb" ? "model/gltf-binary" : e.kind === "gltf" ? "model/gltf+json" : e.kind === "obj" ? "text/plain" : "model/stl";
    const b64 = bytesToBase64(e.bytes);
    out.push({ assetId: e.assetId, name: e.name, kind: e.kind, dataUrl: `data:${mime};base64,${b64}` });
  }
  return out;
}

export function hydrateImportsFromProject(
  items: { assetId?: unknown; name?: unknown; kind?: unknown; dataUrl?: unknown }[],
  register: (assetId: string, name: string, kind: ImportKind, bytes: ArrayBuffer) => void = registerImportBytes
): number {
  let count = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const assetId = item.assetId;
    const dataUrl = item.dataUrl;
    if (typeof assetId !== "string" || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) continue;
    const kind = normalizeKind(item.kind);
    const name = typeof item.name === "string" ? item.name : assetId;
    const bytes = base64ToBytes(dataUrl.slice(dataUrl.indexOf(",") + 1));
    if (bytes.byteLength === 0) continue;
    register(assetId, name, kind, bytes);
    count += 1;
  }
  return count;
}

export function bytesToBase64(bytes: ArrayBuffer): string {
  const buf = new Uint8Array(bytes);
  const parts: string[] = [];
  const piece = 0x8000;
  for (let i = 0; i < buf.length; i += piece) {
    parts.push(String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + piece))));
  }
  return btoa(parts.join(""));
}

function normalizeKind(v: unknown): ImportKind {
  return v === "gltf" || v === "obj" || v === "stl" || v === "glb" ? v : "glb";
}

export function base64ToBytes(b64: string): ArrayBuffer {
  const clean = b64.replace(/\s/g, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}