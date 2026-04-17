import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminJoinRoom,
  deleteRoom,
  endAdminSession,
  listRooms,
  type AdminRoomSummary,
} from '../multiplayer/admin';
import { RoomThumbnail } from './RoomThumbnail';

type DeletePrompt = { roomId: string; title: string } | null;

/**
 * The authenticated view. Lists every room with a few useful columns
 * and per-row actions:
 *   - Observe → navigates to the room (currently equivalent to a
 *     normal join; "read-only" mode is Phase B).
 *   - Take over → same navigation; "lock out peers" is Phase B.
 *   - Delete → confirm modal, then admin_delete_room.
 */
export function AdminPanel({
  token,
  expiresAt,
  onLoggedOut,
}: {
  token: string;
  expiresAt: string;
  onLoggedOut: () => void;
}) {
  const [rooms, setRooms] = useState<AdminRoomSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [prompt, setPrompt] = useState<DeletePrompt>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await listRooms(token);
    if (!data) {
      setError('Could not load rooms. Your session may have expired.');
      setRooms([]);
      setLoading(false);
      return;
    }
    setRooms(data);
    setError(null);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q || !rooms) return rooms ?? [];
    return rooms.filter(
      (r) => r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q),
    );
  }, [rooms, filter]);

  const totalBricks = useMemo(() => {
    if (!rooms) return 0;
    return rooms.reduce((acc, r) => acc + r.brickCount, 0);
  }, [rooms]);

  const onConfirmDelete = async (roomId: string) => {
    const ok = await deleteRoom(token, roomId);
    setPrompt(null);
    if (ok) {
      await refresh();
    } else {
      setError('Delete failed. Your session may have expired — sign in again.');
    }
  };

  const onLogout = async () => {
    await endAdminSession(token);
    onLoggedOut();
  };

  return (
    <div className="admin-shell admin-shell--panel">
      <header className="admin-panel-header">
        <div>
          <h1 className="admin-title">Rooms</h1>
          <p className="admin-muted">
            {rooms ? `${rooms.length} room${rooms.length === 1 ? '' : 's'}` : '—'}
            {' · '}
            {totalBricks.toLocaleString()} brick{totalBricks === 1 ? '' : 's'} total
            {' · '}
            session expires {formatRelative(expiresAt)}
          </p>
        </div>
        <div className="admin-panel-header__actions">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <a className="admin-btn admin-btn--ghost" href={adminRootUrl()}>
            Back to app
          </a>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </header>

      <div className="admin-filter-row">
        <input
          type="search"
          className="admin-input"
          placeholder="Filter by title or id…"
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
          aria-label="Filter rooms"
        />
      </div>

      {error && <p className="admin-error admin-error--banner">{error}</p>}

      {rooms === null ? (
        <p className="admin-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="admin-muted">
          {rooms.length === 0
            ? 'No rooms yet. Create one from the main app and it will appear here.'
            : 'No rooms match the filter.'}
        </p>
      ) : (
        <ul className="admin-room-list">
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              token={token}
              onDelete={() => setPrompt({ roomId: room.id, title: room.title })}
            />
          ))}
        </ul>
      )}

      {prompt && (
        <ConfirmDeleteModal
          title={prompt.title}
          roomId={prompt.roomId}
          onCancel={() => setPrompt(null)}
          onConfirm={() => void onConfirmDelete(prompt.roomId)}
        />
      )}
    </div>
  );
}

function RoomCard({
  room,
  token,
  onDelete,
}: {
  room: AdminRoomSummary;
  token: string;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState<'observe' | 'takeover' | null>(null);

  // Both actions first grant the admin's anonymous user membership of
  // the room (bypassing any password), then navigate. Observe adds
  // `observe=1` so the editor mounts in silent read-only mode; Take
  // over just joins normally.
  const go = async (mode: 'observe' | 'takeover') => {
    if (busy) return;
    setBusy(mode);
    const ok = await adminJoinRoom(token, room.id);
    if (!ok) {
      setBusy(null);
      alert('Could not grant membership. Your session may have expired.');
      return;
    }
    const url = buildRoomUrl(room.id, mode === 'observe');
    window.location.href = url;
  };

  return (
    <li className="admin-room">
      <div className="admin-room__thumb" aria-hidden="true">
        <RoomThumbnail
          token={token}
          roomId={room.id}
          updatedAt={room.updatedAt}
          brickCount={room.brickCount}
          fallbackColor={deriveThumbColor(room.id)}
        />
      </div>
      <div className="admin-room__body">
        <div className="admin-room__title-row">
          <h2 className="admin-room__title" title={room.title}>{room.title}</h2>
          {room.hasPassword && (
            <span className="admin-pill" title="This room has a password set">🔒</span>
          )}
        </div>
        <div className="admin-room__meta">
          <span className="admin-room__id" title="Room id">{room.id}</span>
          <span>·</span>
          <span>{room.brickCount.toLocaleString()} brick{room.brickCount === 1 ? '' : 's'}</span>
          <span>·</span>
          <span title={`Created ${new Date(room.createdAt).toLocaleString()}`}>
            updated {formatRelative(room.updatedAt)}
          </span>
        </div>
      </div>
      <div className="admin-room__actions">
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={() => void go('observe')}
          disabled={busy !== null}
          title="Join silently — no writes leave the client"
        >
          {busy === 'observe' ? 'Joining…' : 'Observe'}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={() => void go('takeover')}
          disabled={busy !== null}
          title="Join as an editor, overriding any password"
        >
          {busy === 'takeover' ? 'Joining…' : 'Take over'}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--danger"
          onClick={onDelete}
          disabled={busy !== null}
          aria-label={`Delete room ${room.title}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function ConfirmDeleteModal({
  title,
  roomId,
  onCancel,
  onConfirm,
}: {
  title: string;
  roomId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="admin-modal-backdrop" onClick={onCancel}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="admin-modal__title">Delete room?</h2>
        <p className="admin-modal__body">
          This removes <strong>{title}</strong> <span className="admin-muted">({roomId})</span> and
          every brick inside it. This cannot be undone.
        </p>
        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="admin-btn admin-btn--danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Deterministic colour from the room id so each thumbnail is consistent
 * across reloads without any server-side state. A hash → HSL conversion
 * gives us 360° of variety; saturation/lightness are pinned for a
 * pleasant palette.
 */
function deriveThumbColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  const hue = ((h >>> 0) % 360);
  return `hsl(${hue}, 55%, 42%)`;
}

function buildRoomUrl(roomId: string, observe: boolean): string {
  if (typeof location === 'undefined') return `?r=${encodeURIComponent(roomId)}`;
  const url = new URL(location.href);
  url.searchParams.delete('admin');
  url.searchParams.set('r', roomId);
  if (observe) url.searchParams.set('observe', '1');
  else url.searchParams.delete('observe');
  return url.toString();
}

function adminRootUrl(): string {
  if (typeof location === 'undefined') return '/';
  const url = new URL(location.href);
  url.searchParams.delete('admin');
  return url.toString();
}

/** Short "in 47m" / "12m ago" style. Swallows invalid inputs gracefully. */
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.round((t - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const suffix = diffSec >= 0 ? 'in ' : '';
  const ago = diffSec >= 0 ? '' : ' ago';
  if (abs < 60) return `${suffix}${abs}s${ago}`;
  if (abs < 3600) return `${suffix}${Math.round(abs / 60)}m${ago}`;
  if (abs < 86400) return `${suffix}${Math.round(abs / 3600)}h${ago}`;
  return `${suffix}${Math.round(abs / 86400)}d${ago}`;
}
