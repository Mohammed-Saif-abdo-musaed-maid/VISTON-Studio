import type { TextureSlotName } from "./types3d";

/** Human labels for material texture slots (used by the 3D inspector). */
export const TEXTURE_SLOT_LABELS: Record<TextureSlotName, string> = {
  map: "Base Color",
  normalMap: "Normal",
  roughnessMap: "Roughness",
  metalnessMap: "Metalness",
  emissiveMap: "Emissive",
  aoMap: "Ambient Occlusion",
};
