import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector2, Vector3 } from 'three';
import {
  PLATE_HEIGHT_MM,
  SHAPE_CATALOG,
  STUD_PITCH_MM,
  footprintOf,
  mirrorPlacement,
  rotationOffsetMM,
  type Brick,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { dropCarriedBrick, eraseBrick, pickUpBrick, placeBrick } from '../state/commandStack';
import { BRICK_COLOR_HEX } from '../state/constants';
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
  const layerOffset = useEditorStore((s) => s.layerOffset);
  const placementOffset = useEditorStore((s) => s.placementOffset);
  const mirrorAxis = useEditorStore((s) => s.mirrorAxis);
  const canPlaceAt = useEditorStore((s) => s.canPlaceAt);

  useEffect(() => {
    const dom = gl.domElement;
    const ndc = new Vector2();

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
    // Eyedropper: Alt held at pointerdown copies the hovered brick's
    // properties instead of placing. Captured on down so briefly
    // releasing Alt between down and up doesn't swallow the pick.
    let downAlt = false;

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
          const bounds = useEditorStore.getState().baseplateBounds;
          const gx = Math.floor(h.point.x / STUD_PITCH_MM);
          const gz = Math.floor(h.point.z / STUD_PITCH_MM);
          if (gx < bounds.minGx || gx >= bounds.maxGx || gz < bounds.minGz || gz >= bounds.maxGz)
            return null;
          return { gx, gy: 0, gz, underBrickId: null };
        }

        if (kind === 'brick-bucket' && h.instanceId !== undefined) {
          const items = h.object.userData.items as Brick[] | undefined;
          const brick = items?.[h.instanceId];
          if (!brick) continue;
          const layers = footprintOf(SHAPE_CATALOG[brick.shape]).layers;
          const gx = Math.floor(h.point.x / STUD_PITCH_MM);
          const gz = Math.floor(h.point.z / STUD_PITCH_MM);
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
      // Any real pointer motion invalidates the arrow-key nudge — the mouse
      // is now the source of truth again.
      useEditorStore.getState().resetPlacementOffset();
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
      downAlt = e.altKey;
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
      const wasAlt = downAlt;
      activePointerId = null;
      cancelled = false;
      downBtn = -1;
      downAlt = false;

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

      // Eyedropper beats everything else (except right-click delete).
      // Copies shape + color + transparent from the brick under the
      // cursor into the current selection, ready for the next click.
      if (wasAlt && btn !== 2 && h.underBrickId) {
        const picked = state.bricks.get(h.underBrickId);
        if (picked) {
          state.setShape(picked.shape);
          state.setColor(picked.color);
          state.setTransparentMode(picked.transparent === true);
        }
        return;
      }

      if (btn === 2) {
        // Desktop right-click always deletes, regardless of mode.
        if (h.underBrickId) eraseBrick(h.underBrickId);
        return;
      }

      if (state.mode === 'erase') {
        if (h.underBrickId) eraseBrick(h.underBrickId);
        return;
      }

      if (state.mode === 'select') {
        // "Grab" behaviour — click a brick to pick it up. The brick
        // is removed and the editor flips into Build mode carrying
        // its shape/colour/rotation/transparent flag. Next click
        // drops the copy at the cursor. Click on empty space does
        // nothing.
        if (h.underBrickId) pickUpBrick(h.underBrickId);
        return;
      }

      const primaryGx = h.gx + state.placementOffset.gx;
      const primaryGy = h.gy + state.layerOffset;
      const primaryGz = h.gz + state.placementOffset.gz;

      // Carrying a picked-up brick? Commit the move as one atomic
      // undo step and skip both the fresh-place and mirror paths —
      // those don't make sense for a relocation.
      if (state.carrying) {
        dropCarriedBrick({
          shape: state.selectedShape,
          color: state.selectedColor,
          gx: primaryGx,
          gy: primaryGy,
          gz: primaryGz,
          rotation: state.rotation,
          transparent: state.transparentMode,
        });
        state.resetPlacementOffset();
        return;
      }

      placeBrick({
        shape: state.selectedShape,
        color: state.selectedColor,
        gx: primaryGx,
        gy: primaryGy,
        gz: primaryGz,
        rotation: state.rotation,
        transparent: state.transparentMode,
      });
      // Mirror mode: drop the reflected twin too. Undo treats them as
      // two separate ops, which is fine — the user rarely needs to keep
      // one half of a symmetric pair.
      if (state.mirrorAxis !== 'off') {
        const m = mirrorPlacement(
          state.selectedShape,
          primaryGx,
          primaryGz,
          state.rotation,
          state.mirrorAxis,
        );
        if (m) {
          placeBrick({
            shape: state.selectedShape,
            color: state.selectedColor,
            gx: m.gx,
            gy: primaryGy,
            gz: m.gz,
            rotation: m.rotation,
            transparent: state.transparentMode,
          });
        }
      }
      state.resetPlacementOffset();
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

  // Arrow-key nudge. Step direction is camera-relative so "→" always moves
  // the ghost toward the right edge of the screen, regardless of how the
  // user has orbited. We pick the dominant world axis of the projected
  // camera-right / camera-forward vectors so each press is exactly one stud
  // along one of ±X / ±Z.
  useEffect(() => {
    const fwdTmp = new Vector3();
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown'
      )
        return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
      }
      if (useEditorStore.getState().mode === 'erase') return;

      camera.getWorldDirection(fwdTmp);
      fwdTmp.y = 0;
      if (fwdTmp.lengthSq() < 1e-6) return;
      fwdTmp.normalize();
      // screen-right in XZ = fwd cross world-up (Y). Hand-computed for speed.
      const rx = -fwdTmp.z;
      const rz = fwdTmp.x;

      const pick = (x: number, z: number): { dgx: number; dgz: number } =>
        Math.abs(x) >= Math.abs(z) ? { dgx: Math.sign(x), dgz: 0 } : { dgx: 0, dgz: Math.sign(z) };

      let step: { dgx: number; dgz: number };
      switch (e.key) {
        case 'ArrowRight':
          step = pick(rx, rz);
          break;
        case 'ArrowLeft': {
          const a = pick(rx, rz);
          step = { dgx: -a.dgx, dgz: -a.dgz };
          break;
        }
        case 'ArrowUp':
          step = pick(fwdTmp.x, fwdTmp.z);
          break;
        case 'ArrowDown':
        default: {
          const a = pick(fwdTmp.x, fwdTmp.z);
          step = { dgx: -a.dgx, dgz: -a.dgz };
          break;
        }
      }

      if (step.dgx === 0 && step.dgz === 0) return;
      e.preventDefault();
      useEditorStore.getState().bumpPlacementOffset(step.dgx, step.dgz);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera]);

  const geometry = useMemo(() => getGeometry(selectedShape), [selectedShape]);
  // Select/Hand mode shows no cursor ghost — the mode is a one-shot
  // click-to-pickup and flips into build immediately.
  if (mode === 'select') return null;
  if (!hover) return null;

  // In erase mode, the ghost is a semi-transparent red outline of the brick
  // that would be deleted. If nothing is under the cursor, no ghost.
  if (mode === 'erase') {
    if (!hover.underBrickId) return null;
    const state = useEditorStore.getState();
    const target = state.bricks.get(hover.underBrickId);
    if (!target) return null;
    const fp = footprintOf(SHAPE_CATALOG[target.shape]);
    const bodyW = fp.w * STUD_PITCH_MM;
    const bodyD = fp.d * STUD_PITCH_MM;
    const { x: ox, z: oz } = rotationOffsetMM(target.rotation, bodyW, bodyD);
    const targetGeom = getGeometry(target.shape);
    return (
      <group
        position={[
          target.gx * STUD_PITCH_MM + ox,
          target.gy * PLATE_HEIGHT_MM,
          target.gz * STUD_PITCH_MM + oz,
        ]}
        rotation={[0, target.rotation * (Math.PI / 2), 0]}
        userData={{ kind: 'ghost' }}
      >
        <mesh geometry={targetGeom} renderOrder={10} userData={{ kind: 'ghost' }}>
          <meshStandardMaterial color="#ff3b3b" transparent opacity={0.55} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  // Build mode — preview brick at target cell. Apply the user's Q/E layer
  // offset on top of raycast gy, and the arrow-key nudge on top of gx/gz.
  const effectiveGx = hover.gx + placementOffset.gx;
  const effectiveGz = hover.gz + placementOffset.gz;
  const effectiveGy = hover.gy + layerOffset;
  const occupied = !canPlaceAt(selectedShape, effectiveGx, effectiveGy, effectiveGz, rotation);
  const footprint = footprintOf(SHAPE_CATALOG[selectedShape]);
  const bodyW = footprint.w * STUD_PITCH_MM;
  const bodyD = footprint.d * STUD_PITCH_MM;
  const { x: ox, z: oz } = rotationOffsetMM(rotation, bodyW, bodyD);

  const mirror =
    mirrorAxis === 'off'
      ? null
      : mirrorPlacement(selectedShape, effectiveGx, effectiveGz, rotation, mirrorAxis);
  const mirrorBodyW = (rotation % 2 === 1 ? footprint.d : footprint.w) * STUD_PITCH_MM;
  const mirrorBodyD = (rotation % 2 === 1 ? footprint.w : footprint.d) * STUD_PITCH_MM;
  const mirrorOff = mirror
    ? rotationOffsetMM(mirror.rotation, mirrorBodyW, mirrorBodyD)
    : { x: 0, z: 0 };
  const ghostColor = occupied ? '#ff3333' : BRICK_COLOR_HEX[selectedColor];

  return (
    <>
      <group
        position={[
          effectiveGx * STUD_PITCH_MM + ox,
          effectiveGy * PLATE_HEIGHT_MM,
          effectiveGz * STUD_PITCH_MM + oz,
        ]}
        rotation={[0, rotation * (Math.PI / 2), 0]}
        userData={{ kind: 'ghost' }}
      >
        <mesh geometry={geometry} renderOrder={10} userData={{ kind: 'ghost' }}>
          <meshStandardMaterial color={ghostColor} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      </group>
      {mirror && (
        <group
          position={[
            mirror.gx * STUD_PITCH_MM + mirrorOff.x,
            effectiveGy * PLATE_HEIGHT_MM,
            mirror.gz * STUD_PITCH_MM + mirrorOff.z,
          ]}
          rotation={[0, mirror.rotation * (Math.PI / 2), 0]}
          userData={{ kind: 'ghost' }}
        >
          <mesh geometry={geometry} renderOrder={10} userData={{ kind: 'ghost' }}>
            <meshStandardMaterial
              color={ghostColor}
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </>
  );
}
