import { BufferGeometry, BufferAttribute, Matrix4, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

/**
 * Real model import parsers (three's GLTF/OBJ/STL loaders). *GLB* (binary),
 * *OBJ* and *STL* are fully self-contained. *GLTF* (JSON) parsing is provided
 * but relies on same-directory external buffers/textures, which a single-file
 * importer cannot bundle — that path is PARTIAL (documented in the report).
 */

export async function parseGlbArrayBuffer(buffer: ArrayBuffer): Promise<BufferGeometry> {
  const gltfLoader = new GLTFLoader();
  const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) => {
    gltfLoader.parse(buffer, "", (gltf2) => resolve({ scene: gltf2.scene }), (err) => reject(err));
  });
  return mergeFromScene(gltf.scene);
}

export function parseObjText(text: string): BufferGeometry {
  const objLoader = new OBJLoader();
  return mergeFromScene(objLoader.parse(text));
}

export function parseStlArrayBuffer(buffer: ArrayBuffer): BufferGeometry {
  const stlLoader = new STLLoader();
  return stlLoader.parse(buffer);
}

function mergeFromScene(root: Object3D): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  let base = 0;
  const m = new Matrix4();
  const stack = [...root.children];
  while (stack.length) {
    const node = stack.pop()!;
    stack.push(...node.children);
    if (!(node as unknown as { isMesh?: boolean }).isMesh) continue;
    const mesh = node as { geometry?: BufferGeometry };
    const geo = mesh.geometry as BufferGeometry;
    if (!geo || !geo.attributes.position) continue;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const uv = geo.attributes.uv;
    node.updateWorldMatrix(true, false);
    m.copy(node.matrixWorld);
    const count = pos.count;
    const tmpPos = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      tmpPos[0] = pos.getX(i); tmpPos[1] = pos.getY(i); tmpPos[2] = pos.getZ(i);
      const [wx, wy, wz] = transformPoint(m, tmpPos[0], tmpPos[1], tmpPos[2]);
      positions.push(wx, wy, wz);
      if (nrm) {
        let nx = nrm.getX(i); let ny = nrm.getY(i); let nz = nrm.getZ(i);
        if (!Number.isFinite(nx) && !Number.isFinite(ny) && !Number.isFinite(nz)) { nx = 0; ny = 1; nz = 0; }
        normals.push(nx, ny, nz);
      }
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
    }
    const idx = geo.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) index.push(idx.getX(i) + base);
    } else {
      for (let i = 0; i < count; i++) index.push(base + i);
    }
    base += count;
  }
  const merged = new BufferGeometry();
  if (positions.length) merged.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  else merged.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  if (normals.length) merged.setAttribute("normal", new BufferAttribute(new Float32Array(normals), 3));
  if (uvs.length) merged.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  if (index.length) merged.setIndex(index);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function transformPoint(m: Matrix4, x: number, y: number, z: number): [number, number, number] {
  const e = m.elements;
  const w = e[3] * x + e[7] * y + e[11] * z + e[15];
  const invW = w !== 0 ? 1 / w : 1;
  return [
    (e[0] * x + e[4] * y + e[8] * z + e[12]) * invW,
    (e[1] * x + e[5] * y + e[9] * z + e[13]) * invW,
    (e[2] * x + e[6] * y + e[10] * z + e[14]) * invW,
  ];
}