import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';

// Config-only test — this stays a compile-time boolean and doesn't
// force the supabase.ts module (which instantiates the heavy client)
// into the main bundle. All live multiplayer modules are imported
// lazily inside button handlers.
const SUPABASE_CONFIGURED = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export function RoomControl() {
  const roomId = useEditorStore((s) => s.roomId);
  const status = useEditorStore((s) => s.roomStatus);
  const hasPassword = useEditorStore((s) => s.roomHasPassword);
  const showToast = useToastStore((s) => s.show);

  if (!SUPABASE_CONFIGURED) return null;

  const onStart = async () => {
    // Mount the runtime first so the router hook is ready to drive
    // the URL once the connect succeeds.
    useEditorStore.getState().setMultiplayerActive(true);
    const [{ connectToRoom }, { newRoomId }, { roomShareUrl }] = await Promise.all([
      import('../multiplayer/roomSync'),
      import('../multiplayer/supabase'),
      import('../multiplayer/useRoomRouter'),
    ]);
    const id = newRoomId();
    const ok = await connectToRoom(id);
    if (ok) {
      const url = roomShareUrl(id);
      try {
        await navigator.clipboard.writeText(url);
        showToast('Room created — link copied', 'success');
      } catch {
        showToast('Room created — URL in address bar', 'info');
      }
    }
  };

  if (!roomId) {
    return (
      <>
        <button
          type="button"
          className="icon-btn icon-btn--text"
          onClick={onStart}
          disabled={status === 'connecting'}
          title="Create a room and share the link with collaborators"
        >
          {status === 'connecting' ? 'Starting…' : 'Start room'}
        </button>
        <RoomJoinButton disabled={status === 'connecting'} />
      </>
    );
  }

  return <RoomMenu roomId={roomId} status={status} hasPassword={hasPassword} />;
}

type RoomMenuProps = {
  roomId: string;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  hasPassword: boolean;
};

/**
 * In-room menu — collapses copy / password / leave behind a single
 * chip-button popover so the top bar isn't carrying three room
 * controls at once. The chip itself still shows status + lock
 * state at a glance; clicking it reveals the actions.
 */
function RoomMenu({ roomId, status, hasPassword }: RoomMenuProps) {
  const showToast = useToastStore((s) => s.show);
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setPwOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPwOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const closeAll = () => {
    setOpen(false);
    setPwOpen(false);
  };

  const onCopy = async () => {
    const { roomShareUrl } = await import('../multiplayer/useRoomRouter');
    try {
      await navigator.clipboard.writeText(roomShareUrl(roomId));
      showToast('Room link copied', 'success');
    } catch {
      showToast('Copy failed', 'error');
    }
    closeAll();
  };

  const onLeave = async () => {
    closeAll();
    const { disconnectRoom } = await import('../multiplayer/roomSync');
    await disconnectRoom();
    showToast('Left room', 'info');
  };

  const onSetPassword = async (newPassword: string, currentPassword: string | null) => {
    if (newPassword.length === 0) {
      showToast('Password cannot be empty', 'error');
      return;
    }
    const { rpcSetRoomPassword } = await import('../multiplayer/roomPassword');
    const ok = await rpcSetRoomPassword(roomId, newPassword, currentPassword);
    if (!ok) {
      showToast(hasPassword ? 'Wrong current password' : 'Could not set password', 'error');
      return;
    }
    showToast(
      hasPassword ? 'Password changed — others kicked' : 'Password set — others kicked',
      'success',
    );
    closeAll();
  };

  const onRemovePassword = async (currentPassword: string) => {
    const { rpcRemoveRoomPassword } = await import('../multiplayer/roomPassword');
    const ok = await rpcRemoveRoomPassword(roomId, currentPassword);
    if (!ok) {
      showToast('Wrong current password', 'error');
      return;
    }
    showToast('Password removed', 'success');
    closeAll();
  };

  return (
    <div className="room-menu" ref={ref}>
      <button
        type="button"
        className={`room-chip room-chip--${status}`}
        onClick={() => setOpen((v) => !v)}
        title={`Room ${roomId} — actions`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={`room-chip__dot room-chip__dot--${status}`} aria-hidden="true" />
        <span className="room-chip__id">Room {roomId}</span>
        {hasPassword && (
          <span
            className="room-chip__lock"
            aria-label="password protected"
            title="Password protected"
          >
            🔒
          </span>
        )}
      </button>
      {open && (
        <div className="room-menu__panel" role="menu">
          <button type="button" className="room-menu__item" onClick={onCopy} role="menuitem">
            Copy link
          </button>
          <button
            type="button"
            className="room-menu__item"
            onClick={() => setPwOpen((v) => !v)}
            aria-expanded={pwOpen}
            role="menuitem"
          >
            {hasPassword ? 'Change password' : 'Set password'}
          </button>
          {pwOpen && (
            <RoomPasswordPanel
              hasPassword={hasPassword}
              onSet={onSetPassword}
              onRemove={onRemovePassword}
              onClose={() => setPwOpen(false)}
            />
          )}
          <button
            type="button"
            className="room-menu__item room-menu__item--danger"
            onClick={onLeave}
            role="menuitem"
          >
            Leave room
          </button>
        </div>
      )}
    </div>
  );
}

// Room ids come from the newRoomId() alphabet in multiplayer/supabase.ts
// (lowercase alnum minus look-alikes: l, o, 0, 1) and are always 8
// chars. We accept either a bare id or a full share URL containing
// `?r=<id>` — users paste whichever is on their clipboard.
const ROOM_ID_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

function extractRoomId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get('r');
    if (fromQuery && ROOM_ID_RE.test(fromQuery)) return fromQuery;
  } catch {
    // Not a URL — fall through to bare-id check.
  }
  return ROOM_ID_RE.test(trimmed) ? trimmed : null;
}

function RoomJoinButton({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const showToast = useToastStore((s) => s.show);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractRoomId(value);
    if (!id) {
      showToast('Enter a room code or paste a share link', 'error');
      return;
    }
    setBusy(true);
    try {
      useEditorStore.getState().setMultiplayerActive(true);
      const { connectToRoom } = await import('../multiplayer/roomSync');
      const ok = await connectToRoom(id);
      if (ok) {
        showToast('Joined room', 'success');
        setOpen(false);
        setValue('');
      } else {
        showToast('Could not join — check the code and try again', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="room-password" ref={panelRef}>
      <button
        type="button"
        className="icon-btn icon-btn--text"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        title="Join an existing room by code or link"
        aria-expanded={open}
      >
        Join room
      </button>
      {open && (
        <form className="room-password__panel" onSubmit={onSubmit}>
          <input
            type="text"
            className="password-input"
            placeholder="Room code or share link"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={512}
            disabled={busy}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <p className="room-password__hint">
            Paste the 8-character code or the full share URL you were sent.
          </p>
          <div className="room-password__actions">
            <button
              type="submit"
              className="fallback__btn fallback__btn--primary"
              disabled={busy || value.trim().length === 0}
            >
              {busy ? 'Joining…' : 'Join'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

type PanelProps = {
  hasPassword: boolean;
  onSet: (newPassword: string, currentPassword: string | null) => Promise<void>;
  onRemove: (currentPassword: string) => Promise<void>;
  onClose: () => void;
};

function RoomPasswordPanel({ hasPassword, onSet, onRemove, onClose: _onClose }: PanelProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const disabled = busy || next.length === 0 || (hasPassword && current.length === 0);

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSet(next, hasPassword ? current : null);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await onRemove(current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="room-password__panel" onSubmit={handleSet}>
      {hasPassword && (
        <input
          type="password"
          className="password-input"
          placeholder="Current password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          maxLength={256}
          disabled={busy}
          autoFocus
        />
      )}
      <input
        type="password"
        className="password-input"
        placeholder={hasPassword ? 'New password' : 'New password'}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        maxLength={256}
        disabled={busy}
        autoFocus={!hasPassword}
      />
      <p className="room-password__hint">
        {hasPassword
          ? 'Changing the password kicks everyone else out of the room.'
          : 'Setting a password kicks everyone else out until they re-enter it.'}
      </p>
      <div className="room-password__actions">
        {hasPassword && (
          <button
            type="button"
            className="fallback__btn"
            onClick={handleRemove}
            disabled={busy || current.length === 0}
          >
            Remove
          </button>
        )}
        <button type="submit" className="fallback__btn fallback__btn--primary" disabled={disabled}>
          {hasPassword ? 'Change' : 'Set'}
        </button>
      </div>
    </form>
  );
}
