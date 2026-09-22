import { CanvasTexture, Texture, TextureLoader, SRGBColorSpace } from "three";
import type { TextureSlotName, TextureSlotData } from "../types/types3d";

export type ResourceCanvasResolver = (key: string) => HTMLCanvasElement | null;

const SLOT_KEYS: readonly TextureSlotName[] = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap"];

/**
 * Lean texture manager: builds real Three.js textures from existing project
 * pixel buffers (CanvasTexture) or external URLs (TextureLoader). Each asset
 * key resolves to one cached texture — shared across materials.
 */
export class TextureManager3d {
  private textures = new Map<string, Texture>();
  private slots: Record<string, Record<TextureSlotName, Texture | null>> = {};
  private loader = new TextureLoader();
  private resolveCanvas: ResourceCanvasResolver;

  constructor(resolveCanvas: ResourceCanvasResolver) {
    this.resolveCanvas = resolveCanvas;
  }

  dispose(): void {
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
    this.slots = {};
  }

  /** Drop a cached texture so an edited source buffer is re-read on next use. */
  invalidate(assetKey: string): void {
    const tex = this.textures.get(assetKey);
    if (tex) {
      tex.dispose();
      this.textures.delete(assetKey);
    }
    for (const bucket of Object.values(this.slots)) {
      for (const name of SLOT_KEYS) {
        const slotTex = bucket[name];
        if (slotTex && slotTex === tex) bucket[name] = null;
      }
    }
  }

  /** Drop every cached texture (e.g. when a project image buffer is replaced). */
  invalidateAll(): void {
    this.dispose();
  }

  /** Resolve (and cache) a texture by material+slot asset key. */
  textureFor(materialId: string, slots: Partial<Record<TextureSlotName, TextureSlotData>>): Record<TextureSlotName, Texture | null> {
    const key = `${materialId}`;
    let bucket = this.slots[key];
    if (!bucket) {
      bucket = { map: null, normalMap: null, roughnessMap: null, metalnessMap: null, emissiveMap: null, aoMap: null };
      this.slots[key] = bucket;
    }
    for (const name of SLOT_KEYS) {
      const slot = slots[name];
      if (!slot || slot.sourceKind === "none" || !slot.assetId) {
        if (bucket[name]) {
          bucket[name]!.dispose();
          bucket[name] = null;
        }
        continue;
      }
      bucket[name] = this.loadAsset(slot, name, bucket[name]);
    }
    return bucket;
  }

  private loadAsset(slot: TextureSlotData, _slotName: TextureSlotName, existing: Texture | null): Texture | null {
    const assetKey = slot.assetId!;
    if (slot.sourceKind === "image-resource") {
      const cached = this.textures.get(assetKey);
      if (cached) return cached;
      const canvas = this.resolveCanvas(assetKey);
      if (!canvas) return null;
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      this.textures.set(assetKey, tex);
      return tex;
    }
    // external-url
    if (existing && existing.userData && existing.userData["url"] === assetKey) return existing;
    try {
      const img = new Image();
      const tex = new Texture(img);
      tex.userData = { url: assetKey };
      void tex;
      void this.loader.load(assetKey, (loaded) => {
        loaded.colorSpace = SRGBColorSpace;
        loaded.anisotropy = 4;
        loaded.needsUpdate = true;
        this.textures.set(assetKey, loaded);
      });
      return existing;
    } catch {
      return null;
    }
  }
}

export { CanvasTexture, TextureLoader };