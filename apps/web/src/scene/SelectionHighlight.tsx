import {
  PLATE_HEIGHT_MM,
  SHAPE_CATALOG,
  STUD_PITCH_MM,
  footprintOf,
  rotationOffsetMM,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { getGeometry } from '../bricks/geometry/builders';

/**
 * Renders a yellow, slightly-oversized translucent overlay on top of
 * the currently selected brick — the visual cue for Hand/select mode.
 * Only mounts content when there's a selection; returns null otherwise.
 *
 * Reuses the same `userData.kind = 'ghost'` tag as the placement
 * cursor ghost so the raycaster ignores it (otherwise clicking on a
 * selected brick would hit the highlight first and miss the real mesh).
 */
export function SelectionHighlight() {
  const selectedId = useEditorStore((s) => s.selectedBrickId);
  const bricks = useEditorStore((s) => s.bricks);

  if (!selectedId) return null;
  const brick = bricks.get(selectedId);
  if (!brick) return null;

  const fp = footprintOf(SHAPE_CATALOG[brick.shape]);
  const bodyW = fp.w * STUD_PITCH_MM;
  const bodyD = fp.d * STUD_PITCH_MM;
  const { x: ox, z: oz } = rotationOffsetMM(brick.rotation, bodyW, bodyD);
  const geometry = getGeometry(brick.shape);

  return (
    <group
      position={[
        brick.gx * STUD_PITCH_MM + ox,
        brick.gy * PLATE_HEIGHT_MM,
        brick.gz * STUD_PITCH_MM + oz,
      ]}
      rotation={[0, brick.rotation * (Math.PI / 2), 0]}
      // Slightly larger than the brick so the highlight halos around
      // the silhouette. 1.03 reads as a clear outline without looking
      // cartoonishly inflated.
      scale={[1.03, 1.03, 1.03]}
      userData={{ kind: 'ghost' }}
    >
      <mesh geometry={geometry} renderOrder={10} userData={{ kind: 'ghost' }}>
        <meshBasicMaterial color="#ffcc00" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}
