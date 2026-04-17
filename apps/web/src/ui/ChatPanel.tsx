import { useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useChatStore } from '../state/chatStore';
import { sendChatMessage } from '../multiplayer/useRoomChat';

/**
 * Floating chat panel. Only rendered when the user is in a room —
 * outside a room there's nobody to chat with.
 *
 * Collapsed state: a pill-shaped button in the bottom-right corner
 * with a chat bubble icon.
 * Expanded state: header (title + name input + collapse), scroll
 * region of messages (oldest on top, latest on bottom), input +
 * send row at the foot.
 *
 * Messages render via `textContent` everywhere — the body is plain
 * user input and we never inject HTML, so XSS is not a concern even
 * with a malicious peer that bypasses the 500-char server check.
 */
export function ChatPanel() {
  const roomId = useEditorStore((s) => s.roomId);
  const open = useChatStore((s) => s.open);
  const displayName = useChatStore((s) => s.displayName);
  const draft = useChatStore((s) => s.draft);
  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const setOpen = useChatStore((s) => s.setOpen);
  const toggleOpen = useChatStore((s) => s.toggleOpen);
  const setDisplayName = useChatStore((s) => s.setDisplayName);
  const setDraft = useChatStore((s) => s.setDraft);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autoscroll to bottom on new messages. If the user has scrolled up
  // to read history we leave them alone — distance-from-bottom check.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!roomId) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const ok = await sendChatMessage(body);
    if (ok) setDraft('');
  };

  if (!open) {
    return (
      <button
        type="button"
        className="chat-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open room chat"
        title="Open room chat"
      >
        <BubbleIcon />
        <span>Chat</span>
      </button>
    );
  }

  return (
    <aside className="chat-panel" role="region" aria-label="Room chat">
      <header className="chat-panel__header">
        <input
          className="chat-panel__name"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          maxLength={64}
          placeholder="Your name"
          aria-label="Display name"
        />
        <button
          type="button"
          className="icon-btn"
          aria-label="Collapse chat"
          onClick={() => toggleOpen()}
        >
          ✕
        </button>
      </header>
      <div className="chat-panel__messages" ref={listRef}>
        {loading && messages.length === 0 && (
          <p className="chat-panel__status">Loading messages…</p>
        )}
        {!loading && messages.length === 0 && (
          <p className="chat-panel__status">No messages yet — say hi 👋</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg">
            <div className="chat-msg__meta">
              <span className="chat-msg__name">{m.authorName}</span>
              <span className="chat-msg__time">{formatTime(m.createdAt)}</span>
            </div>
            <div className="chat-msg__body">{m.body}</div>
          </div>
        ))}
      </div>
      <form className="chat-panel__compose" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="chat-panel__input"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder="Message the room…"
          maxLength={500}
          aria-label="Message"
        />
        <button
          type="submit"
          className="fallback__btn fallback__btn--primary chat-panel__send"
          disabled={draft.trim().length === 0}
        >
          Send
        </button>
      </form>
    </aside>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function BubbleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <path
        d="M4 6c0-1.1.9-2 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 3v-3H6a2 2 0 0 1-2-2V6Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
