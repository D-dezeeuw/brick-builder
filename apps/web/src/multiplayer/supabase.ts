import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Row shapes for the two tables provisioned by
 * supabase/migrations/001_rooms_and_bricks.sql. Kept here (not in shared)
 * because only the web app talks to the database.
 *
 * We intentionally don't parameterise SupabaseClient with a Database
 * generic — writing one that matches the library's expected shape for
 * insert/select/update overloads is fiddly, and our schema is tiny. Row
 * types are applied at call sites via `as RoomRow` / `as BrickRow`.
 */
export type RoomRow = {
  id: string;
  title: string;
  baseplate_bounds: {
    minGx: number;
    maxGx: number;
    minGz: number;
    maxGz: number;
  };
  created_at: string;
  updated_at: string;
  /** Null when the room is public. Set by the set_room_password RPC. */
  password_hash: string | null;
  /** Bumped every time a password is set/changed/removed — clients diff this to detect kicks. */
  password_set_at: string | null;
};

export type RoomMemberRow = {
  room_id: string;
  user_id: string;
  joined_at: string;
};

export type BrickRow = {
  id: string;
  room_id: string;
  shape: string;
  color: string;
  gx: number;
  gy: number;
  gz: number;
  rotation: number;
  /** Clear-plastic modifier. Default false for rows pre migration 003. */
  transparent: boolean;
  created_at: string;
};

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Single shared client. `null` when env vars are missing. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } }) : null;

export const hasSupabase = supabase !== null;

/** Short random room id safe to type / share. Not guessable. */
export function newRoomId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
