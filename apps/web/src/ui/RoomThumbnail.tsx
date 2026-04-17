import { useEffect, useState } from 'react';
import { adminFetchBricks } from '../multiplayer/admin';
import {
  loadCachedThumb,
  renderRoomThumbnail,
  storeCachedThumb,
} from '../multiplayer/thumbnailRenderer';

/**
 * Lazy 3D thumbnail for an admin room card. On mount:
 *   1. Check sessionStorage for a cached PNG keyed by (roomId, updatedAt).
 *   2. Otherwise fetch bricks via admin_list_bricks, render via the
 *      shared offscreen WebGLRenderer, persist to sessionStorage.
 *
 * Renders are serialised in the renderer module so listing 50 rooms
 * schedules 50 queued jobs rather than blowing up the GPU. Empty rooms
 * fall back to the placeholder swatch supplied by the parent.
 */
export function RoomThumbnail({
  token,
  roomId,
  updatedAt,
  brickCount,
  fallbackColor,
}: {
  token: string;
  roomId: string;
  updatedAt: string;
  brickCount: number;
  fallbackColor: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    loadCachedThumb(roomId, updatedAt),
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'empty' | 'error'>(() => {
    if (loadCachedThumb(roomId, updatedAt)) return 'idle';
    if (brickCount === 0) return 'empty';
    return 'loading';
  });

  useEffect(() => {
    if (status !== 'loading') return;
    let cancelled = false;
    void (async () => {
      const bricks = await adminFetchBricks(token, roomId);
      if (cancelled) return;
      if (!bricks || bricks.length === 0) {
        setStatus('empty');
        return;
      }
      const png = await renderRoomThumbnail(bricks);
      if (cancelled) return;
      if (!png) {
        setStatus('error');
        return;
      }
      setDataUrl(png);
      storeCachedThumb(roomId, updatedAt, png);
      setStatus('idle');
    })();
    return () => {
      cancelled = true;
    };
  }, [status, token, roomId, updatedAt]);

  if (dataUrl) {
    return <img className="admin-room__thumb-img" src={dataUrl} alt="" />;
  }

  // Placeholder swatch for empty rooms + while rendering.
  return (
    <div
      className="admin-room__thumb-swatch"
      style={{ background: fallbackColor }}
    >
      {status === 'loading' ? (
        <span className="admin-room__thumb-count">…</span>
      ) : (
        <span className="admin-room__thumb-count">
          {brickCount.toLocaleString()}
        </span>
      )}
    </div>
  );
}
