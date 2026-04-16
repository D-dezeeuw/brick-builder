import { useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';
import { connectToRoom, disconnectRoom } from './roomSync';

const ROOM_PARAM = 'r';

/**
 * URL ↔ room id bridge.
 * - On mount, if the URL has `?r=<id>`, joins that room.
 * - When the room id in the store changes, rewrites the URL (replaceState
 *   so back-button doesn't rewind room joins one-at-a-time).
 */
export function useRoomRouter(): void {
  useEffect(() => {
    // Initial join from URL.
    const params = new URLSearchParams(location.search);
    const initial = params.get(ROOM_PARAM);
    if (initial) {
      void connectToRoom(initial);
    }

    const unsub = useEditorStore.subscribe((state, prev) => {
      if (state.roomId === prev.roomId) return;
      const url = new URL(location.href);
      if (state.roomId) {
        url.searchParams.set(ROOM_PARAM, state.roomId);
      } else {
        url.searchParams.delete(ROOM_PARAM);
      }
      history.replaceState(null, '', url.toString());
    });

    return () => {
      unsub();
      void disconnectRoom();
    };
  }, []);
}

export function roomShareUrl(roomId: string): string {
  const url = new URL(location.href);
  url.hash = ''; // strip any compressed-hash creation share
  url.searchParams.set(ROOM_PARAM, roomId);
  return url.toString();
}
