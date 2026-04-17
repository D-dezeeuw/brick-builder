import { supabase } from './supabase';

/**
 * Anonymous-session lifecycle.
 *
 * Migration 002 switched room RLS from wide-open `anon` to membership-gated
 * `authenticated`. Every client therefore needs a JWT before it can touch
 * rooms/bricks. We use Supabase's anonymous sign-in which issues a signed
 * token without asking the user for credentials — auth.uid() becomes
 * populated for RLS policies and SECURITY DEFINER RPCs.
 *
 * The promise is memoised so repeated callers share a single sign-in; the
 * Supabase SDK persists the session in localStorage so reloads reuse it.
 */

let ready: Promise<string | null> | null = null;

export function ensureAnonymousSession(): Promise<string | null> {
  if (ready) return ready;
  ready = (async () => {
    const client = supabase;
    if (!client) return null;
    const existing = await client.auth.getSession();
    const existingId = existing.data.session?.user?.id;
    if (existingId) return existingId;
    const signed = await client.auth.signInAnonymously();
    if (signed.error || !signed.data.user) {
      console.warn('[auth] anonymous sign-in failed:', signed.error);
      return null;
    }
    return signed.data.user.id;
  })();
  return ready;
}

export async function currentUserId(): Promise<string | null> {
  const client = supabase;
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user?.id ?? null;
}
