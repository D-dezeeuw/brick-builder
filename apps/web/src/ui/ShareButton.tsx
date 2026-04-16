import { buildShareUrl } from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';

export function ShareButton() {
  const serializeCreation = useEditorStore((s) => s.serializeCreation);
  const showToast = useToastStore((s) => s.show);

  const onShare = async () => {
    const creation = serializeCreation();
    const url = buildShareUrl(creation);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard', 'success');
      } else {
        // Fallback: put the URL in the browser's address bar and let the
        // user copy it manually. This keeps things working in HTTP dev
        // previews where the clipboard API is blocked.
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
      title="Copy shareable link"
      aria-label="Share creation"
    >
      Share
    </button>
  );
}
