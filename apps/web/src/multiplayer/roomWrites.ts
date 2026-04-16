import { useEffect } from 'react';
import type { Brick } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { supabase } from './supabase';
import { boundsMatch, brickToRow } from './roomSync';

/**
 * Diff local state against the previous snapshot on every zustand update
 * and push add/remove/title/bounds changes to Supabase. Inbound events set
 * `isRemoteApplying` while they mutate state, so the diff here skips those
 * ticks — no echo.
 *
 * Brick UPDATE (i.e. move) isn't modelled yet — the editor only places and
 * removes. Add a diff branch here when move lands.
 */
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
      for (const [id, brick] of next.bricks) {
        if (!prev.bricks.has(id)) added.push(brick);
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
