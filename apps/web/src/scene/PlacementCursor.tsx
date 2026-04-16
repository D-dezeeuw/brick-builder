import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Plane, Vector2, Vector3 } from 'three';
import { SHAPE_FOOTPRINT, STUD_PITCH_MM } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { BASEPLATE_STUDS, BRICK_COLOR_HEX } from '../state/constants';
import { getBrickGeometry } from '../bricks/geometry/studdedBox';

type Cell = { gx: number; gz: number };

const DRAG_THRESHOLD_PX = 5;
const CLICK_MAX_MS = 500;

export function PlacementCursor() {
  const { camera, raycaster, gl } = useThree();
  const [hover, setHover] = useState<Cell | null>(null);
  const hoverRef = useRef<Cell | null>(null);
  hoverRef.current = hover;

  const selectedColor = useEditorStore((s) => s.selectedColor);
  const rotation = useEditorStore((s) => s.rotation);
  const canPlaceAt = useEditorStore((s) => s.canPlaceAt);

  useEffect(() => {
    const dom = gl.domElement;
    const plane = new Plane(new Vector3(0, 1, 0), 0);
    const ndc = new Vector2();
    const hit = new Vector3();
    const halfN = BASEPLATE_STUDS / 2;

    let downX = 0;
    let downY = 0;
    let downT = 0;
    let downBtn = -1;

    const updateHover = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) {
        setHover(null);
        return;
      }
      const gx = Math.floor(hit.x / STUD_PITCH_MM + 0.5);
      const gz = Math.floor(hit.z / STUD_PITCH_MM + 0.5);
      if (gx < -halfN || gx >= halfN || gz < -halfN || gz >= halfN) {
        setHover(null);
        return;
      }
      setHover((prev) => (prev && prev.gx === gx && prev.gz === gz ? prev : { gx, gz }));
    };

    const onMove = (e: PointerEvent) => updateHover(e.clientX, e.clientY);

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
          shape: '1x1',
          color: state.selectedColor,
          gx: h.gx,
          gy: 0,
          gz: h.gz,
          rotation: state.rotation,
        });
      } else if (e.button === 2) {
        state.removeBrickAt(h.gx, 0, h.gz);
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
  }, [gl, camera, raycaster]);

  const geometry = useMemo(() => getBrickGeometry('1x1'), []);
  if (!hover) return null;

  const occupied = !canPlaceAt(hover.gx, 0, hover.gz);
  const footprint = SHAPE_FOOTPRINT['1x1'];
  const cx = (footprint.w * STUD_PITCH_MM) / 2;
  const cz = (footprint.d * STUD_PITCH_MM) / 2;
  const wx = hover.gx * STUD_PITCH_MM;
  const wz = hover.gz * STUD_PITCH_MM;

  return (
    <group position={[wx + cx, 0, wz + cz]} rotation={[0, rotation * (Math.PI / 2), 0]}>
      <mesh position={[-cx, 0, -cz]} geometry={geometry} renderOrder={10}>
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
