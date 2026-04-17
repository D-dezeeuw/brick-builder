import { useEffect } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useChatStore, type ChatMessage } from '../state/chatStore';
import { ensureAnonymousSession } from './auth';
import { supabase } from './supabase';

/**
 * Bind chat state to the active room.
 *
 * On roomId change:
 *   1. Clear the in-memory buffer.
 *   2. Fetch the last 50 messages ordered ASC so the UI renders them
 *      immediately.
 *   3. Subscribe to realtime INSERTs filtered by room_id and append to
 *      the store — both remote messages and our own echo land here,
 *      which means "send" doesn't need to optimistic-insert.
 *
 * Cleanup unsubscribes. Auth is awaited because the row-level
 * security gate requires auth.uid() to match the room's access
 * policy; without a session the select returns an empty list.
 */
export function useRoomChat(): void {
  const roomId = useEditorStore((s) => s.roomId);

  useEffect(() => {
    const client = supabase;
    const chat = useChatStore.getState();
    chat.clear();
    if (!roomId || !client) return;

    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const userId = await ensureAnonymousSession();
      if (!userId || cancelled) return;
      chat.setLoading(true);

      const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (cancelled) return;
      chat.setLoading(false);
      if (error) {
        console.warn('[chat] load failed:', error);
      } else if (data) {
        chat.replaceMessages(data.map(rowToMessage));
      }

      const channel = client
        .channel(`chat:${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const msg = rowToMessage(payload.new as ChatRow);
            if (!msg) return;
            useChatStore.getState().appendMessage(msg);
          },
        )
        .subscribe();

      unsub = () => {
        void channel.unsubscribe();
      };
      if (cancelled && unsub) unsub();
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [roomId]);
}

type ChatRow = {
  id: string;
  room_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

/** Runtime-safe conversion + field validation. Drops malformed rows. */
function rowToMessage(raw: unknown): ChatMessage {
  const row = raw as Partial<ChatRow>;
  return {
    id: String(row.id ?? ''),
    roomId: String(row.room_id ?? ''),
    userId: String(row.user_id ?? ''),
    authorName: String(row.author_name ?? 'anon').slice(0, 64),
    body: String(row.body ?? '').slice(0, 500),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

/**
 * Insert one message into the current room. Empty strings and over-
 * length bodies are rejected client-side; the DB has matching checks
 * as a belt-and-braces guard. Fire-and-forget — realtime will deliver
 * the row back to us.
 */
export async function sendChatMessage(body: string): Promise<boolean> {
  const trimmed = body.trim();
  if (trimmed.length === 0 || trimmed.length > 500) return false;
  const client = supabase;
  if (!client) return false;
  const state = useEditorStore.getState();
  // Admin observe mode is silent — swallow chat sends so nothing is
  // published to the room.
  if (state.observeMode) return false;
  const roomId = state.roomId;
  if (!roomId) return false;
  const userId = await ensureAnonymousSession();
  if (!userId) return false;
  const authorName = useChatStore.getState().displayName;
  const { error } = await client.from('messages').insert({
    room_id: roomId,
    user_id: userId,
    author_name: authorName,
    body: trimmed,
  });
  if (error) {
    console.warn('[chat] send failed:', error);
    return false;
  }
  return true;
}
