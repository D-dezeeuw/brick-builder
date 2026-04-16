import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector2 } from 'three';
import {
  PLATE_HEIGHT_MM,
  SHAPE_FOOTPRINT,
  STUD_PITCH_MM,
  type Brick,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { BASEPLATE_STUDS, BRICK_COLOR_HEX } from '../state/constants';
import { getBrickGeometry } from '../bricks/geometry/studdedBox';

type HoverTarget = {
  gx: number;
  gy: number;
  gz: number;
  /** Brick directly under the cursor (on whose top face we'd stack) — right-click target. */
  underBrickId: string | null;
};

const DRAG_THRESHOLD_PX = 5;
const CLICK_MAX_MS = 500;
/** Minimum Y component of a face normal to count as a "top" surface. */
const TOP_NORMAL_THRESHOLD = 0.5;

export function PlacementCursor() {
  const { camera, raycaster, gl, scene } = useThree();
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  hoverRef.current = hover;

  const selectedColor = useEditorStore((s) => s.selectedColor);
  const selectedShape = useEditorStore((s) => s.selectedShape);
  const rotation = useEditorStore((s) => s.rotation);
  const canPlaceAt = useEditorStore((s) => s.canPlaceAt);

  useEffect(() => {
    const dom = gl.domElement;
    const ndc = new Vector2();
    const halfN = BASEPLATE_STUDS / 2;

    let downX = 0;
    let downY = 0;
    let downT = 0;
    let downBtn = -1;

    const computeHover = (clientX: number, clientY: number): HoverTarget | null => {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);

      for (const h of hits) {
        const kind = h.object.userData.kind;
        if (kind === 'ghost') continue;

        // Only accept top-facing surfaces. Side faces fall through to the next hit
        // (or nothing), which avoids placing when you skim past a brick wall.
        const normalY = h.face?.normal.y ?? 0;
        if (normalY < TOP_NORMAL_THRESHOLD) continue;

        if (kind === 'baseplate') {
          const gx = Math.floor(h.point.x / STUD_PITCH_MM);
          const gz = Math.floor(h.point.z / STUD_PITCH_MM);
          if (gx < -halfN || gx >= halfN || gz < -halfN || gz >= halfN) return null;
          return { gx, gy: 0, gz, underBrickId: null };
        }

        if (kind === 'brick-bucket' && h.instanceId !== undefined) {
          const items = h.object.userData.items as Brick[] | undefined;
          const brick = items?.[h.instanceId];
          if (!brick) continue;
          const layers = SHAPE_FOOTPRINT[brick.shape].layers;
          const gx = Math.floor(h.point.x / STUD_PITCH_MM);
          const gz = Math.floor(h.point.z / STUD_PITCH_MM);
          if (gx < -halfN || gx >= halfN || gz < -halfN || gz >= halfN) return null;
          return { gx, gy: brick.gy + layers, gz, underBrickId: brick.id };
        }
      }
      return null;
    };

    const onMove = (e: PointerEvent) => {
      const next = computeHover(e.clientX, e.clientY);
      setHover((prev) => {
        if (!prev && !next) return prev;
        if (
          prev &&
          next &&
          prev.gx === next.gx &&
          prev.gy === next.gy &&
          prev.gz === next.gz &&
          prev.underBrickId === next.underBrickId
        ) {
          return prev;
        }
        return next;
      });
    };

    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
      downBtn = e.button;
    };

    const onUp = (e: PointerEvent) => {
      if (e.button !== downBtn) return;
      const dt = performance.now() - downT;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      downBtn = -1;
      if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) return;
      if (dt > CLICK_MAX_MS) return;

      const h = hoverRef.current;
      if (!h) return;
      const state = useEditorStore.getState();
      if (e.button === 0) {
        state.addBrick({
          shape: state.selectedShape,
          color: state.selectedColor,
          gx: h.gx,
          gy: h.gy,
          gz: h.gz,
          rotation: state.rotation,
        });
      } else if (e.button === 2) {
        if (h.underBrickId) state.removeBrickById(h.underBrickId);
      }
    };

    const onContext = (e: Event) => e.preventDefault();

    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('contextmenu', onContext);
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('contextmenu', onContext);
    };
  }, [gl, camera, raycaster, scene]);

  const geometry = useMemo(() => getBrickGeometry(selectedShape), [selectedShape]);
  if (!hover) return null;

  const occupied = !canPlaceAt(selectedShape, hover.gx, hover.gy, hover.gz, rotation);
  const footprint = SHAPE_FOOTPRINT[selectedShape];
  const cx = (footprint.w * STUD_PITCH_MM) / 2;
  const cz = (footprint.d * STUD_PITCH_MM) / 2;
  const wx = hover.gx * STUD_PITCH_MM;
  const wy = hover.gy * PLATE_HEIGHT_MM;
  const wz = hover.gz * STUD_PITCH_MM;

  return (
    <group
      position={[wx + cx, wy, wz + cz]}
      rotation={[0, rotation * (Math.PI / 2), 0]}
      userData={{ kind: 'ghost' }}
    >
      <mesh
        position={[-cx, 0, -cz]}
        geometry={geometry}
        renderOrder={10}
        userData={{ kind: 'ghost' }}
      >
        <meshStandardMaterial
          color={occupied ? '#ff3333' : BRICK_COLOR_HEX[selectedColor]}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
