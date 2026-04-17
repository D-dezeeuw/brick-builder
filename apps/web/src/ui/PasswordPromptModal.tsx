import { useEffect, useRef, useState } from 'react';
import { usePasswordPrompt } from '../state/passwordPromptStore';

/**
 * Renders the password prompt driven by `passwordPromptStore`. Pending
 * verification is the store's problem — this component only collects the
 * string. `submit` stays open so callers can display "wrong password" errors
 * without the modal flashing away; `cancel` closes.
 */
export function PasswordPromptModal() {
  const open = usePasswordPrompt((s) => s.open);
  const roomId = usePasswordPrompt((s) => s.roomId);
  const message = usePasswordPrompt((s) => s.message);
  const error = usePasswordPrompt((s) => s.error);
  const pending = usePasswordPrompt((s) => s.pending);
  const submit = usePasswordPrompt((s) => s.submit);
  const cancel = usePasswordPrompt((s) => s.cancel);

  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const setError = usePasswordPrompt((s) => s.setError);

  useEffect(() => {
    if (!open) return;
    setValue('');
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, roomId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, cancel]);

  if (!open) return null;
  const submitting = pending === null && error === null;

  return (
    <div
      className="settings-backdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="settings-panel" style={{ width: 'min(400px, 100%)' }}>
        <div className="settings-panel__header">
          <h2>Room password</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cancel"
            onClick={cancel}
          >
            ✕
          </button>
        </div>
        <form
          className="settings-panel__body"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.length > 0) submit(value);
          }}
        >
          <p className="hint" style={{ marginBottom: 8 }}>
            {message ??
              (roomId
                ? `Room ${roomId} is password-protected.`
                : 'This room is password-protected.')}
          </p>
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            className="password-input"
            placeholder="Password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            disabled={submitting}
            maxLength={256}
          />
          {error && <p className="password-input__error">{error}</p>}
          <div className="password-input__actions">
            <button
              type="button"
              className="fallback__btn"
              onClick={cancel}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fallback__btn fallback__btn--primary"
              disabled={submitting || value.length === 0}
            >
              {submitting ? 'Checking…' : 'Enter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
