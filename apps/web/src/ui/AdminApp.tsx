import { useCallback, useEffect, useState } from 'react';
import { hasSupabase } from '../multiplayer/supabase';
import {
  checkAdminSession,
  clearStoredSession,
  loadStoredSession,
  verifyAdminPassword,
} from '../multiplayer/admin';
import { AdminPanel } from './AdminPanel';

/**
 * Top-level admin page. Mounted by main.tsx when the URL carries
 * `?admin=1`. Owns the "logged in or not" state — renders the login
 * form until a valid session token is in hand, then hands off to
 * AdminPanel.
 *
 * The session token lives in sessionStorage (see multiplayer/admin.ts);
 * closing the tab ends the session. On mount we probe the server with
 * `admin_check_session` so a stale token (e.g. after an admin password
 * rotation) kicks the user back to the login form immediately.
 */
export function AdminApp() {
  const [status, setStatus] = useState<'loading' | 'login' | 'panel'>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = loadStoredSession();
      if (!stored) {
        if (!cancelled) setStatus('login');
        return;
      }
      const ok = await checkAdminSession(stored.token);
      if (cancelled) return;
      if (ok) {
        setToken(stored.token);
        setExpiresAt(stored.expiresAt);
        setStatus('panel');
      } else {
        clearStoredSession();
        setStatus('login');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLoggedOut = useCallback(() => {
    setToken(null);
    setExpiresAt(null);
    setErrorMsg(null);
    setStatus('login');
  }, []);

  if (status === 'loading') {
    return (
      <div className="admin-shell">
        <div className="admin-card admin-card--thin">
          <p className="admin-muted">Checking session…</p>
        </div>
      </div>
    );
  }

  if (status === 'login' || !token || !expiresAt) {
    return (
      <AdminLogin
        errorMsg={errorMsg}
        onError={setErrorMsg}
        onSuccess={(tok, exp) => {
          setErrorMsg(null);
          setToken(tok);
          setExpiresAt(exp);
          setStatus('panel');
        }}
      />
    );
  }

  return <AdminPanel token={token} expiresAt={expiresAt} onLoggedOut={onLoggedOut} />;
}

function AdminLogin({
  errorMsg,
  onError,
  onSuccess,
}: {
  errorMsg: string | null;
  onError: (msg: string | null) => void;
  onSuccess: (token: string, expiresAt: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    try {
      const result = await verifyAdminPassword(password);
      if (result.ok) {
        onSuccess(result.token, result.expiresAt);
        setPassword('');
        return;
      }
      onError(
        result.reason === 'no-supabase'
          ? 'Supabase is not configured for this deploy.'
          : result.reason === 'bad-password'
            ? 'Incorrect password.'
            : 'Something went wrong. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-shell">
      <form className="admin-card" onSubmit={onSubmit}>
        <h1 className="admin-title">Admin</h1>
        <p className="admin-muted">
          Enter the admin password to manage rooms.
          {!hasSupabase && (
            <>
              <br />
              <strong className="admin-error">
                Supabase is not configured — set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
              </strong>
            </>
          )}
        </p>
        <label className="admin-field">
          <span className="admin-label">Password</span>
          <input
            type="password"
            className="admin-input"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoFocus
            autoComplete="current-password"
            disabled={submitting || !hasSupabase}
          />
        </label>
        {errorMsg && <p className="admin-error">{errorMsg}</p>}
        <div className="admin-actions">
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={submitting || !password || !hasSupabase}
          >
            {submitting ? 'Verifying…' : 'Sign in'}
          </button>
          <a className="admin-btn admin-btn--ghost" href={adminRootUrl()}>
            Back to app
          </a>
        </div>
      </form>
    </div>
  );
}

/** Build a URL that drops the ?admin=1 flag, used by "back to app". */
function adminRootUrl(): string {
  if (typeof location === 'undefined') return '/';
  const url = new URL(location.href);
  url.searchParams.delete('admin');
  return url.toString();
}
