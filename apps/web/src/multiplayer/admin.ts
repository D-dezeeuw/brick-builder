/**
 * Admin-panel API layer. Thin wrappers around the `admin_*` RPCs defined
 * in supabase/migrations/006_admin.sql, plus a sessionStorage cache so
 * a valid token survives page re-renders (but NOT tab close — that's the
 * point of sessionStorage over localStorage).
 *
 * Every RPC requires an anonymous Supabase session (see auth.ts) because
 * EXECUTE is granted to `authenticated`, not `anon`. The client app signs
 * in on mount, so by the time anyone opens the admin route the JWT is
 * already in place.
 */

import { supabase } from './supabase';
import { ensureAnonymousSession } from './auth';

const TOKEN_KEY = 'bb-admin-session';

type StoredSession = {
  token: string;
  expiresAt: string; // ISO
};

export function loadStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).token !== 'string' ||
      typeof (parsed as Record<string, unknown>).expiresAt !== 'string'
    ) {
      return null;
    }
    const { token, expiresAt } = parsed as StoredSession;
    // Drop locally-expired tokens without hitting the network — the server
    // also enforces this, but there's no point sending a stale token.
    if (Date.parse(expiresAt) <= Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return { token, expiresAt };
  } catch {
    return null;
  }
}

export function storeSession(session: StoredSession): void {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export type AdminRoomSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  brickCount: number;
  hasPassword: boolean;
};

type VerifyResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; reason: 'no-supabase' | 'bad-password' | 'error' };

/**
 * Call admin_verify_password. On success the returned token is persisted
 * to sessionStorage automatically — callers don't need to remember to
 * stash it.
 */
export async function verifyAdminPassword(password: string): Promise<VerifyResult> {
  const client = supabase;
  if (!client) return { ok: false, reason: 'no-supabase' };
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_verify_password', { p_password: password });
  if (error) {
    console.warn('[admin] verify failed:', error);
    return { ok: false, reason: 'error' };
  }
  // The RPC returns `table(token, expires_at)`. On a mismatch both fields
  // are null — treat that as bad-password, not error.
  const row = Array.isArray(data) ? data[0] : undefined;
  const token = row?.token as string | null | undefined;
  const expiresAt = row?.expires_at as string | null | undefined;
  if (!token || !expiresAt) return { ok: false, reason: 'bad-password' };
  storeSession({ token, expiresAt });
  return { ok: true, token, expiresAt };
}

/** Probe the server — returns true iff the token is still valid. */
export async function checkAdminSession(token: string): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_check_session', { p_token: token });
  if (error) {
    console.warn('[admin] check failed:', error);
    return false;
  }
  return data === true;
}

/** Log out — server-side deletes the session row, client clears storage. */
export async function endAdminSession(token: string): Promise<void> {
  const client = supabase;
  if (!client) {
    clearStoredSession();
    return;
  }
  await ensureAnonymousSession();
  await client.rpc('admin_end_session', { p_token: token });
  clearStoredSession();
}

export async function listRooms(token: string): Promise<AdminRoomSummary[] | null> {
  const client = supabase;
  if (!client) return null;
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_list_rooms', { p_token: token });
  if (error) {
    console.warn('[admin] list_rooms failed:', error);
    return null;
  }
  if (!Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    brickCount: Number(row.brick_count) || 0,
    hasPassword: row.has_password === true,
  }));
}

export async function deleteRoom(token: string, roomId: string): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_delete_room', {
    p_token: token,
    p_room_id: roomId,
  });
  if (error) {
    console.warn('[admin] delete_room failed:', error);
    return false;
  }
  return data === true;
}

export async function rotateAdminPassword(
  token: string,
  oldPassword: string,
  newPassword: string,
): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_rotate_password', {
    p_token: token,
    p_old_password: oldPassword,
    p_new_password: newPassword,
  });
  if (error) {
    console.warn('[admin] rotate failed:', error);
    return false;
  }
  return data === true;
}

/**
 * Grant the admin's anonymous user_id membership of a password-protected
 * room so normal RLS lets them in. Safe to call on public rooms too —
 * the RPC is a no-op when the room has no password.
 */
export async function adminJoinRoom(token: string, roomId: string): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_join_room', {
    p_token: token,
    p_room_id: roomId,
  });
  if (error) {
    console.warn('[admin] join_room failed:', error);
    return false;
  }
  return data === true;
}

export type AdminBrickRow = {
  id: string;
  room_id: string;
  shape: string;
  color: string;
  gx: number;
  gy: number;
  gz: number;
  rotation: number;
  transparent: boolean;
  created_at: string;
};

/**
 * Fetch every brick for a room, bypassing RLS. Used by the admin panel
 * to render thumbnails without forcing a membership join per room.
 */
export async function adminFetchBricks(
  token: string,
  roomId: string,
): Promise<AdminBrickRow[] | null> {
  const client = supabase;
  if (!client) return null;
  await ensureAnonymousSession();
  const { data, error } = await client.rpc('admin_list_bricks', {
    p_token: token,
    p_room_id: roomId,
  });
  if (error) {
    console.warn('[admin] list_bricks failed:', error);
    return null;
  }
  if (!Array.isArray(data)) return [];
  return data as AdminBrickRow[];
}
