import { buildShareUrl } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';

export function ShareButton() {
  const serializeCreation = useEditorStore((s) => s.serializeCreation);
  const roomId = useEditorStore((s) => s.roomId);
  const showToast = useToastStore((s) => s.show);

  const onShare = async () => {
    // Room link wins when connected — collaborators should arrive in the
    // live session, not a frozen snapshot.
    let url: string;
    if (roomId) {
      const { roomShareUrl } = await import('../multiplayer/useRoomRouter');
      url = roomShareUrl(roomId);
    } else {
      url = buildShareUrl(serializeCreation());
    }
    const label = roomId ? 'Room link copied' : 'Snapshot link copied';
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        showToast(label, 'success');
      } else {
        history.replaceState(null, '', url);
        showToast('Share URL updated — copy from the address bar', 'info', 4000);
      }
    } catch (err) {
      console.warn('[share] clipboard failed, falling back to URL hash:', err);
      history.replaceState(null, '', url);
      showToast('Share URL in address bar — clipboard blocked', 'info', 4000);
    }
  };

  return (
    <button
      type="button"
      className="icon-btn icon-btn--text"
      onClick={onShare}
      title={roomId ? 'Copy room link' : 'Copy shareable snapshot link'}
      aria-label="Share creation"
    >
      Share
    </button>
  );
}
