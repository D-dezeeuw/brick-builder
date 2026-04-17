import { useEffect } from 'react';
import type { Brick } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { supabase } from './supabase';
import { boundsMatch, brickToRow } from './roomSync';

/**
 * Diff local state against the previous snapshot on every zustand update
 * and push add / remove / update / title / bounds changes to Supabase.
 * Inbound events set `isRemoteApplying` while they mutate state, so the
 * diff here skips those ticks — no echo.
 *
 * UPDATE covers coord / rotation / colour / shape / transparent changes
 * on a surviving brick id — i.e. everything select-mode can mutate.
 */
function brickFieldsDiffer(a: Brick, b: Brick): boolean {
  return (
    a.gx !== b.gx ||
    a.gy !== b.gy ||
    a.gz !== b.gz ||
    a.rotation !== b.rotation ||
    a.color !== b.color ||
    a.shape !== b.shape ||
    (a.transparent === true) !== (b.transparent === true)
  );
}
export function useRoomWrites(): void {
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    let prev = snapshot();

    const unsub = useEditorStore.subscribe((state) => {
      // Inbound apply: refresh baseline and skip the outbound push.
      if (state.isRemoteApplying) {
        prev = snapshot();
        return;
      }
      // Admin observe: silent read-only client. Keep the baseline fresh
      // so if the user later flips out of observe mode, the first push
      // doesn't replay every local change accumulated meanwhile.
      if (state.observeMode) {
        prev = snapshot();
        return;
      }
      const roomId = state.roomId;
      if (!roomId) {
        // Not connected — keep the baseline fresh so a later room-join
        // doesn't resend everything typed before the connection.
        prev = snapshot();
        return;
      }

      const next = snapshot();

      if (next.title !== prev.title) {
        void client
          .from('rooms')
          .update({ title: next.title })
          .eq('id', roomId)
          .then(({ error }) => {
            if (error) console.warn('[room] title push failed:', error);
          });
      }

      if (!boundsMatch(prev.bounds, next.bounds)) {
        void client
          .from('rooms')
          .update({ baseplate_bounds: next.bounds })
          .eq('id', roomId)
          .then(({ error }) => {
            if (error) console.warn('[room] bounds push failed:', error);
          });
      }

      const added: Brick[] = [];
      const removed: string[] = [];
      const updated: Brick[] = [];
      for (const [id, brick] of next.bricks) {
        const prevBrick = prev.bricks.get(id);
        if (!prevBrick) {
          added.push(brick);
        } else if (brickFieldsDiffer(prevBrick, brick)) {
          updated.push(brick);
        }
      }
      for (const id of prev.bricks.keys()) {
        if (!next.bricks.has(id)) removed.push(id);
      }

      if (added.length > 0) {
        const rows = added.map((b) => brickToRow(b, roomId));
        void client
          .from('bricks')
          .insert(rows)
          .then(({ error }) => {
            if (error) console.warn('[room] insert bricks failed:', error);
          });
      }
      if (removed.length > 0) {
        void client
          .from('bricks')
          .delete()
          .in('id', removed)
          .then(({ error }) => {
            if (error) console.warn('[room] delete bricks failed:', error);
          });
      }
      for (const brick of updated) {
        // One row per update — Supabase's .update().eq() is per-id and
        // we don't have many simultaneous moves to justify batching.
        void client
          .from('bricks')
          .update({
            gx: brick.gx,
            gy: brick.gy,
            gz: brick.gz,
            rotation: brick.rotation,
            color: brick.color,
            shape: brick.shape,
            transparent: brick.transparent === true,
          })
          .eq('id', brick.id)
          .then(({ error }) => {
            if (error) console.warn('[room] update brick failed:', error);
          });
      }

      prev = next;
    });
    return unsub;
  }, []);
}

function snapshot() {
  const s = useEditorStore.getState();
  return {
    title: s.title,
    bounds: s.baseplateBounds,
    bricks: new Map(s.bricks),
  };
}
