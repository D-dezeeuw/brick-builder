import { create } from 'zustand';

/**
 * Single-in-flight password prompt. `requestPassword` returns a promise that
 * resolves with the entered password (or null on cancel). The PasswordPrompt
 * modal component reads this store and renders the UI.
 *
 * Any new request while one is pending cancels the previous — in practice
 * that happens only if the user somehow triggers two reconnect flows at the
 * same time. Simpler than queuing.
 */

type Waiter = (password: string | null) => void;

type PasswordPromptState = {
  open: boolean;
  roomId: string | null;
  message: string | null;
  error: string | null;
  pending: Waiter | null;
  submit: (password: string) => void;
  cancel: () => void;
  setError: (message: string | null) => void;
};

export const usePasswordPrompt = create<PasswordPromptState>((set, get) => ({
  open: false,
  roomId: null,
  message: null,
  error: null,
  pending: null,
  submit: (password) => {
    const p = get().pending;
    if (!p) return;
    // Stay open — the caller may call setError('wrong password') and keep
    // the modal up. Closing is the caller's responsibility via close().
    p(password);
    set({ pending: null });
  },
  cancel: () => {
    const p = get().pending;
    set({ open: false, roomId: null, message: null, error: null, pending: null });
    p?.(null);
  },
  setError: (message) => set({ error: message, pending: null }),
}));

export function requestPassword(roomId: string, message?: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const prev = usePasswordPrompt.getState().pending;
    prev?.(null);
    // Deliberately preserve `error` across re-requests so a "Wrong password"
    // message from the previous attempt stays visible while the user retypes.
    // Cleared only by cancel() or by the modal's onChange.
    usePasswordPrompt.setState({
      open: true,
      roomId,
      message: message ?? null,
      pending: resolve,
    });
  });
}

export function closePasswordPrompt(): void {
  const prev = usePasswordPrompt.getState().pending;
  prev?.(null);
  usePasswordPrompt.setState({
    open: false,
    roomId: null,
    message: null,
    error: null,
    pending: null,
  });
}
