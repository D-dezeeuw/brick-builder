import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import { connectToRoom, disconnectRoom } from '../multiplayer/roomSync';
import { rpcRemoveRoomPassword, rpcSetRoomPassword } from '../multiplayer/roomPassword';
import { roomShareUrl } from '../multiplayer/useRoomRouter';
import { hasSupabase, newRoomId } from '../multiplayer/supabase';

export function RoomControl() {
  const roomId = useEditorStore((s) => s.roomId);
  const status = useEditorStore((s) => s.roomStatus);
  const hasPassword = useEditorStore((s) => s.roomHasPassword);
  const showToast = useToastStore((s) => s.show);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!hasSupabase) return null;

  const onStart = async () => {
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

  const onLeave = async () => {
    await disconnectRoom();
    showToast('Left room', 'info');
  };

  const onCopy = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomShareUrl(roomId));
      showToast('Room link copied', 'success');
    } catch {
      showToast('Copy failed', 'error');
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

  return (
    <>
      <button
        type="button"
        className={`room-chip room-chip--${status}`}
        onClick={onCopy}
        title={`Room ${roomId} — click to copy link`}
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
      <RoomPasswordButton
        roomId={roomId}
        hasPassword={hasPassword}
        open={passwordOpen}
        setOpen={setPasswordOpen}
      />
      <button
        type="button"
        className="icon-btn icon-btn--text"
        onClick={onLeave}
        title="Leave this room and return to solo editing"
      >
        Leave
      </button>
    </>
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

type PasswordButtonProps = {
  roomId: string;
  hasPassword: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
};

function RoomPasswordButton({ roomId, hasPassword, open, setOpen }: PasswordButtonProps) {
  const showToast = useToastStore((s) => s.show);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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
  }, [open, setOpen]);

  const onSet = async (newPassword: string, currentPassword: string | null) => {
    if (newPassword.length === 0) {
      showToast('Password cannot be empty', 'error');
      return;
    }
    const ok = await rpcSetRoomPassword(roomId, newPassword, currentPassword);
    if (!ok) {
      showToast(hasPassword ? 'Wrong current password' : 'Could not set password', 'error');
      return;
    }
    showToast(
      hasPassword ? 'Password changed — others kicked' : 'Password set — others kicked',
      'success',
    );
    setOpen(false);
  };

  const onRemove = async (currentPassword: string) => {
    const ok = await rpcRemoveRoomPassword(roomId, currentPassword);
    if (!ok) {
      showToast('Wrong current password', 'error');
      return;
    }
    showToast('Password removed', 'success');
    setOpen(false);
  };

  return (
    <div className="room-password" ref={ref}>
      <button
        type="button"
        className="icon-btn icon-btn--text"
        onClick={() => setOpen(!open)}
        title={hasPassword ? 'Change or remove password' : 'Set a password for this room'}
        aria-expanded={open}
      >
        {hasPassword ? 'Password' : 'Set password'}
      </button>
      {open && (
        <RoomPasswordPanel
          hasPassword={hasPassword}
          onSet={onSet}
          onRemove={onRemove}
          onClose={() => setOpen(false)}
        />
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
