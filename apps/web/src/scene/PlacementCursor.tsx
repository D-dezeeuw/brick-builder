import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector2 } from 'three';
import {
  PLATE_HEIGHT_MM,
  SHAPE_CATALOG,
  STUD_PITCH_MM,
  footprintOf,
  type Brick,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { BASEPLATE_STUDS, BRICK_COLOR_HEX } from '../state/constants';
import { getGeometry } from '../bricks/geometry/builders';

type HoverTarget = {
  gx: number;
  gy: number;
  gz: number;
  /** Brick directly under the cursor (on whose top face we'd stack) — right-click / erase target. */
  underBrickId: string | null;
};

const DRAG_THRESHOLD_PX = 5;
const CLICK_MAX_MS = 500;
const TOUCH_CLICK_MAX_MS = 1500;
const TOP_NORMAL_THRESHOLD = 0.5;

export function PlacementCursor() {
  const { camera, raycaster, gl, scene } = useThree();
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  hoverRef.current = hover;

  const selectedColor = useEditorStore((s) => s.selectedColor);
  const selectedShape = useEditorStore((s) => s.selectedShape);
  const rotation = useEditorStore((s) => s.rotation);
  const mode = useEditorStore((s) => s.mode);
  const canPlaceAt = useEditorStore((s) => s.canPlaceAt);

  useEffect(() => {
    const dom = gl.domElement;
    const ndc = new Vector2();
    const halfN = BASEPLATE_STUDS / 2;

    // Single-gesture tracker: only one pointer drives the ghost at a time.
    // A second pointer (e.g. a 2nd finger for camera) cancels the gesture so
    // we don't drop a brick when the user actually meant to orbit.
    let activePointerId: number | null = null;
    let cancelled = false;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let downBtn = -1;
    let downType: string = 'mouse';

    const computeHover = (clientX: number, clientY: number): HoverTarget | null => {
      const rect = dom.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);

      for (const h of hits) {
        const kind = h.object.userData.kind;
        if (kind === 'ghost') continue;
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
          const layers = footprintOf(SHAPE_CATALOG[brick.shape]).layers;
          const gx = Math.floor(h.point.x / STUD_PITCH_MM);
          const gz = Math.floor(h.point.z / STUD_PITCH_MM);
          if (gx < -halfN || gx >= halfN || gz < -halfN || gz >= halfN) return null;
          return { gx, gy: brick.gy + layers, gz, underBrickId: brick.id };
        }
      }
      return null;
    };

    const updateHoverFromEvent = (e: PointerEvent) => {
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

    const onMove = (e: PointerEvent) => {
      // For mouse, track hover regardless of button state (hover preview).
      // For touch/pen, only follow the active pointer to avoid confusing
      // the ghost with a 2nd finger's path.
      if (e.pointerType === 'mouse') {
        updateHoverFromEvent(e);
        return;
      }
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      updateHoverFromEvent(e);
    };

    const onDown = (e: PointerEvent) => {
      if (activePointerId !== null) {
        // Second pointer (e.g. 2nd finger) — user is starting a camera gesture.
        // Cancel in-flight placement so we don't drop a brick on release.
        cancelled = true;
        return;
      }
      activePointerId = e.pointerId;
      cancelled = false;
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
      downBtn = e.button;
      downType = e.pointerType;
      // Touch has no hover — update ghost immediately on touchdown so the
      // user sees where their tap landed.
      if (e.pointerType !== 'mouse') updateHoverFromEvent(e);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      const dt = performance.now() - downT;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      const wasCancelled = cancelled;
      const btn = downBtn;
      const type = downType;
      activePointerId = null;
      cancelled = false;
      downBtn = -1;

      if (wasCancelled) return;

      // Mouse drag-threshold distinguishes click from orbit-drag. Touch has no
      // hover, and any tap naturally has ≥ a few pixels of drift — don't cancel.
      if (type === 'mouse') {
        if (dx > DRAG_THRESHOLD_PX || dy > DRAG_THRESHOLD_PX) return;
        if (dt > CLICK_MAX_MS) return;
      } else {
        if (dt > TOUCH_CLICK_MAX_MS) return;
      }

      const h = hoverRef.current;
      if (!h) return;
      const state = useEditorStore.getState();

      if (btn === 2) {
        // Desktop right-click always deletes, regardless of mode.
        if (h.underBrickId) state.removeBrickById(h.underBrickId);
        return;
      }

      if (state.mode === 'erase') {
        if (h.underBrickId) state.removeBrickById(h.underBrickId);
        return;
      }

      state.addBrick({
        shape: state.selectedShape,
        color: state.selectedColor,
        gx: h.gx,
        gy: h.gy,
        gz: h.gz,
        rotation: state.rotation,
      });
    };

    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === activePointerId) {
        activePointerId = null;
        cancelled = false;
        downBtn = -1;
      }
    };

    const onContext = (e: Event) => e.preventDefault();

    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onCancel);
    dom.addEventListener('contextmenu', onContext);
    return () => {
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('pointercancel', onCancel);
      dom.removeEventListener('contextmenu', onContext);
    };
  }, [gl, camera, raycaster, scene]);

  const geometry = useMemo(() => getGeometry(selectedShape), [selectedShape]);
  if (!hover) return null;

  // In erase mode, the ghost is a semi-transparent red outline of the brick
  // that would be deleted. If nothing is under the cursor, no ghost.
  if (mode === 'erase') {
    if (!hover.underBrickId) return null;
    const state = useEditorStore.getState();
    const target = state.bricks.get(hover.underBrickId);
    if (!target) return null;
    const fp = footprintOf(SHAPE_CATALOG[target.shape]);
    const cx = (fp.w * STUD_PITCH_MM) / 2;
    const cz = (fp.d * STUD_PITCH_MM) / 2;
    const targetGeom = getGeometry(target.shape);
    return (
      <group
        position={[
          target.gx * STUD_PITCH_MM + cx,
          target.gy * PLATE_HEIGHT_MM,
          target.gz * STUD_PITCH_MM + cz,
        ]}
        rotation={[0, target.rotation * (Math.PI / 2), 0]}
        userData={{ kind: 'ghost' }}
      >
        <mesh
          position={[-cx, 0, -cz]}
          geometry={targetGeom}
          renderOrder={10}
          userData={{ kind: 'ghost' }}
        >
          <meshStandardMaterial color="#ff3b3b" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Build mode — preview brick at target cell.
  const occupied = !canPlaceAt(selectedShape, hover.gx, hover.gy, hover.gz, rotation);
  const footprint = footprintOf(SHAPE_CATALOG[selectedShape]);
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
