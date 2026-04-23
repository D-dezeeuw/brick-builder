import { BufferAttribute, BufferGeometry, Matrix3, type Matrix4, Vector3 } from 'three';

/**
 * Build one BufferGeometry from many instances of a source geometry,
 * baking each instance's transform into the output vertices.
 *
 * Why not three's BufferGeometryUtils.mergeGeometries: it needs each
 * input to already be its own BufferGeometry, which in our use case
 * would mean cloning the source geometry once per instance (10k+
 * clones for a large scene). This helper reads from the source
 * attributes directly in one pass — O(total_verts) work, zero
 * intermediate geometry allocations.
 *
 * Keeps position, normal, and uv attributes. Drops everything else
 * (color attributes were per-instance anyway — see PathtracingExpansion
 * for why brick-bucket colour jitter is already gone in PT mode).
 */
export function mergeInstances(source: BufferGeometry, matrices: Matrix4[]): BufferGeometry {
  const posAttr = source.getAttribute('position');
  const normAttr = source.getAttribute('normal');
  const uvAttr = source.getAttribute('uv');
  const index = source.getIndex();

  const vertsPer = posAttr.count;
  const indicesPer = index ? index.count : 0;
  const totalVerts = vertsPer * matrices.length;
  const totalIndices = indicesPer * matrices.length;

  const positions = new Float32Array(totalVerts * 3);
  const normals = normAttr ? new Float32Array(totalVerts * 3) : null;
  const uvs = uvAttr ? new Float32Array(totalVerts * 2) : null;
  const indices = index
    ? totalVerts <= 65535
      ? new Uint16Array(totalIndices)
      : new Uint32Array(totalIndices)
    : null;

  const v = new Vector3();
  const n = new Vector3();
  const normalMatrix = new Matrix3();

  for (let mi = 0; mi < matrices.length; mi++) {
    const mat = matrices[mi];
    const vertOffset = mi * vertsPer;
    const idxOffset = mi * indicesPer;

    for (let i = 0; i < vertsPer; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
      const po = (vertOffset + i) * 3;
      positions[po] = v.x;
      positions[po + 1] = v.y;
      positions[po + 2] = v.z;
    }

    if (normals && normAttr) {
      normalMatrix.getNormalMatrix(mat);
      for (let i = 0; i < vertsPer; i++) {
        n.fromBufferAttribute(normAttr, i).applyMatrix3(normalMatrix).normalize();
        const no = (vertOffset + i) * 3;
        normals[no] = n.x;
        normals[no + 1] = n.y;
        normals[no + 2] = n.z;
      }
    }

    if (uvs && uvAttr) {
      for (let i = 0; i < vertsPer; i++) {
        const uo = (vertOffset + i) * 2;
        uvs[uo] = uvAttr.getX(i);
        uvs[uo + 1] = uvAttr.getY(i);
      }
    }

    if (indices && index) {
      for (let i = 0; i < indicesPer; i++) {
        indices[idxOffset + i] = index.getX(i) + vertOffset;
      }
    }
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  if (normals) merged.setAttribute('normal', new BufferAttribute(normals, 3));
  if (uvs) merged.setAttribute('uv', new BufferAttribute(uvs, 2));
  if (indices) merged.setIndex(new BufferAttribute(indices, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
