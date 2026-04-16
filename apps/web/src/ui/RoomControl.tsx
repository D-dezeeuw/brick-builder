import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import { connectToRoom, disconnectRoom } from '../multiplayer/roomSync';
import { roomShareUrl } from '../multiplayer/useRoomRouter';
import { hasSupabase, newRoomId } from '../multiplayer/supabase';

export function RoomControl() {
  const roomId = useEditorStore((s) => s.roomId);
  const status = useEditorStore((s) => s.roomStatus);
  const showToast = useToastStore((s) => s.show);

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
      <button
        type="button"
        className="icon-btn icon-btn--text"
        onClick={onStart}
        disabled={status === 'connecting'}
        title="Create a room and share the link with collaborators"
      >
        {status === 'connecting' ? 'Starting…' : 'Start room'}
      </button>
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
      </button>
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
