import { supabase } from './supabase';

/**
 * Wrappers around the SECURITY DEFINER RPCs installed by migration 002.
 * The server enforces password verification + membership writes — these
 * helpers just translate (ok, error) tuples into booleans the UI can branch
 * on cleanly.
 */

export async function rpcSetRoomPassword(
  roomId: string,
  newPassword: string,
  currentPassword: string | null,
): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  const { data, error } = await client.rpc('set_room_password', {
    p_room_id: roomId,
    p_new_password: newPassword,
    p_current_password: currentPassword,
  });
  if (error) {
    console.warn('[room] set_room_password failed:', error);
    return false;
  }
  return data === true;
}

export async function rpcRemoveRoomPassword(
  roomId: string,
  currentPassword: string,
): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  const { data, error } = await client.rpc('remove_room_password', {
    p_room_id: roomId,
    p_current_password: currentPassword,
  });
  if (error) {
    console.warn('[room] remove_room_password failed:', error);
    return false;
  }
  return data === true;
}

export async function rpcJoinRoom(roomId: string, password: string | null): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  const { data, error } = await client.rpc('join_room', {
    p_room_id: roomId,
    p_password: password,
  });
  if (error) {
    console.warn('[room] join_room failed:', error);
    return false;
  }
  return data === true;
}

/**
 * Did we get kicked since the last UPDATE? Returns the membership record if
 * present, null otherwise. Used by the kick-detection flow when we see the
 * room's password_set_at change.
 */
export async function checkMembership(roomId: string, userId: string): Promise<boolean> {
  const client = supabase;
  if (!client) return false;
  const { data, error } = await client
    .from('room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[room] checkMembership failed:', error);
    return false;
  }
  return data !== null;
}
