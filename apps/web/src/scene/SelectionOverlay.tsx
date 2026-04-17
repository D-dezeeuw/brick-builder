import { useMemo } from 'react';
import {
  PLATE_HEIGHT_MM,
  SHAPE_CATALOG,
  STUD_PITCH_MM,
  footprintOf,
  rotationOffsetMM,
  type Brick,
} from '@brick/shared';
import { BoxGeometry, EdgesGeometry } from 'three';
import { useEditorStore } from '../state/editorStore';

/**
 * Draws a thin wireframe box around each selected brick so multi-
 * selection is visible in the scene. Built from EdgesGeometry of a
 * unit cube scaled per brick — depth-tested false so the outline
 * pokes through neighbouring bricks and stays readable in dense
 * builds. Cheap: up to a few hundred small line-segment meshes.
 */
export function SelectionOverlay() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const bricks = useEditorStore((s) => s.bricks);

  const entries = useMemo(() => {
    const out: Brick[] = [];
    for (const id of selectedIds) {
      const b = bricks.get(id);
      if (b) out.push(b);
    }
    return out;
  }, [selectedIds, bricks]);

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((b) => (
        <SelectionBox key={b.id} brick={b} />
      ))}
    </>
  );
}

function SelectionBox({ brick }: { brick: Brick }) {
  const fp = footprintOf(SHAPE_CATALOG[brick.shape]);
  // Effective (post-rotation) footprint for the bounding box. Slope
  // and window shapes use their nominal body extent — the outline
  // over-generously covers the shape but reads clearly as a selector.
  const bodyW = fp.w * STUD_PITCH_MM;
  const bodyD = fp.d * STUD_PITCH_MM;
  const bodyH = fp.layers * PLATE_HEIGHT_MM;

  const { x: ox, z: oz } = rotationOffsetMM(brick.rotation, bodyW, bodyD);

  // Slight inflate so the line doesn't z-fight with the brick face.
  const pad = 0.25;
  const edges = useMemo(() => {
    const box = new BoxGeometry(bodyW + pad * 2, bodyH + pad * 2, bodyD + pad * 2);
    const e = new EdgesGeometry(box);
    box.dispose();
    return e;
  }, [bodyW, bodyH, bodyD]);

  // Re-center: the box geometry is centred on origin; our brick's
  // origin is the min corner. Offset by half the body extent so the
  // outline sits over the brick.
  return (
    <group
      position={[
        brick.gx * STUD_PITCH_MM + ox,
        brick.gy * PLATE_HEIGHT_MM,
        brick.gz * STUD_PITCH_MM + oz,
      ]}
      rotation={[0, brick.rotation * (Math.PI / 2), 0]}
      userData={{ kind: 'ghost' }}
    >
      <lineSegments
        geometry={edges}
        position={[bodyW / 2, bodyH / 2, bodyD / 2]}
        renderOrder={20}
        userData={{ kind: 'ghost' }}
      >
        <lineBasicMaterial color="#58a6ff" depthTest={false} transparent opacity={0.95} />
      </lineSegments>
    </group>
  );
}
