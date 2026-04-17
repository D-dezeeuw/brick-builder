import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CURRENT_SCHEMA_VERSION,
  isBrick,
  sanitizeTitle,
  validateBaseplateBounds,
  type BaseplateBounds,
  type Brick,
  type BrickColor,
  type BrickShape,
  type Rotation,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { commandStack } from '../state/commandStack';
import { useToastStore } from '../state/toastStore';
import {
  closePasswordPrompt,
  requestPassword,
  usePasswordPrompt,
} from '../state/passwordPromptStore';
import { supabase, type BrickRow, type RoomRow } from './supabase';
import { ensureAnonymousSession } from './auth';
import { checkMembership, rpcJoinRoom } from './roomPassword';

/**
 * Room lifecycle:
 *   connect(id) → status='connecting' → hydrate from DB → status='connected'
 *              → subscribe to realtime → apply inbound events
 *   disconnect() → unsubscribe, clear roomId/status, leave scene as-is
 *
 * Outbound writes are fire-and-forget (see roomWrites.ts). Inbound events
 * are applied via withRemoteApply() so the outbound wrapper can skip them.
 */

type SessionHandle = {
  channel: RealtimeChannel;
  roomId: string;
  userId: string;
};

let session: SessionHandle | null = null;

export async function connectToRoom(roomId: string): Promise<boolean> {
  const client = supabase;
  if (!client) {
    useToastStore.getState().show('Supabase not configured', 'error');
    return false;
  }
  if (session?.roomId === roomId) return true;
  if (session) await disconnectRoom();

  const store = useEditorStore.getState();
  store.setRoomStatus('connecting');

  // 0) Ensure we have an anonymous auth session. RLS policies + RPC execute
  //    grants are keyed to `authenticated`, so every request needs a JWT.
  const userId = await ensureAnonymousSession();
  if (!userId) {
    store.setRoomStatus('error');
    useToastStore.getState().show('Sign-in failed — check your connection', 'error');
    return false;
  }

  // 1) Ensure the room exists. First visitor seeds it with the current local
  //    state; subsequent visitors just read.
  const existing = await client.from('rooms').select('*').eq('id', roomId).maybeSingle();
  let roomRow: RoomRow | null = (existing.data as RoomRow | null) ?? null;

  if (!roomRow) {
    const current = store.serializeCreation();
    const insert = await client
      .from('rooms')
      .insert({
        id: roomId,
        title: current.title,
        baseplate_bounds: current.baseplateBounds,
      })
      .select('*')
      .single();
    if (insert.error || !insert.data) {
      console.warn('[room] create failed:', insert.error);
      store.setRoomStatus('error');
      useToastStore.getState().show('Could not create room', 'error');
      return false;
    }
    roomRow = insert.data as RoomRow;

    // Seed the room with any bricks currently sitting in the local scene so
    // "start sharing a work-in-progress" preserves the player's draft.
    const locals = Array.from(store.bricks.values());
    if (locals.length > 0) {
      const rows = locals.map((b) => brickToRow(b, roomId));
      const bulk = await client.from('bricks').insert(rows);
      if (bulk.error) console.warn('[room] seed bricks failed:', bulk.error);
    }
  }

  // At this point roomRow is non-null — TypeScript needs a final assert
  // because the narrow above is inside a conditional branch.
  if (!roomRow) {
    store.setRoomStatus('error');
    return false;
  }

  // 1.5) Password gate. Room-metadata SELECT is allowed for any authenticated
  // user, but bricks + writes are blocked unless we're in room_members. Prompt
  // until the user enters the right password or cancels.
  if (roomRow.password_hash) {
    const alreadyMember = await checkMembership(roomId, userId);
    if (!alreadyMember) {
      const ok = await promptUntilJoined(roomId);
      if (!ok) {
        store.setRoomStatus('idle');
        return false;
      }
    }
  }

  // 2) Hydrate the scene from room metadata + all its bricks.
  const bricksRes = await client.from('bricks').select('*').eq('room_id', roomId);
  if (bricksRes.error) {
    console.warn('[room] fetch bricks failed:', bricksRes.error);
    store.setRoomStatus('error');
    useToastStore.getState().show('Could not load room', 'error');
    return false;
  }

  const rawRows = (bricksRes.data as BrickRow[] | null) ?? [];
  // Realtime and REST responses are untrusted — filter out anything that
  // doesn't match our schema. A malicious row shouldn't poison the scene.
  const hydrated: Brick[] = [];
  for (const row of rawRows) {
    const brick = rowToBrickSafe(row);
    if (brick) hydrated.push(brick);
  }
  const snapshotTitle = sanitizeTitle(roomRow.title) ?? 'Untitled Creation';
  const snapshotBounds = validateBaseplateBounds(roomRow.baseplate_bounds) ?? store.baseplateBounds;
  const snapshotCreated = Date.parse(roomRow.created_at) || Date.now();

  store.withRemoteApply(() => {
    useEditorStore.getState().loadCreation({
      version: CURRENT_SCHEMA_VERSION,
      title: snapshotTitle,
      createdAt: snapshotCreated,
      bricks: hydrated,
      baseplateBounds: snapshotBounds,
    });
  });
  commandStack.clear();

  // 3) Subscribe to realtime changes filtered by room_id.
  // Payloads are validated against the shared schema before being applied —
  // never trust peer data directly, even though RLS gates writes server-side.
  const channel = client
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bricks', filter: `room_id=eq.${roomId}` },
      (payload) => applyBrickInsert(payload.new),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'bricks', filter: `room_id=eq.${roomId}` },
      (payload) => applyBrickDelete((payload.old as { id?: unknown }).id),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => applyRoomUpdate(payload.new),
    );

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (
        status === 'SUBSCRIBED' ||
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        resolve();
      }
    });
  });

  session = { channel, roomId, userId };
  store.setRoomId(roomId);
  store.setRoomStatus('connected');
  store.setRoomPasswordState(roomRow.password_hash !== null, roomRow.password_set_at);
  useToastStore.getState().show(`Joined room ${roomId}`, 'success');
  return true;
}

/**
 * Loops the password prompt until the RPC accepts a guess or the user
 * cancels. Wrong attempts keep the modal open with an error; a cancel
 * during an in-flight RPC is caught by the "still open" guard so we don't
 * spuriously re-open the prompt.
 */
async function promptUntilJoined(roomId: string): Promise<boolean> {
  for (;;) {
    const password = await requestPassword(roomId);
    if (password === null) {
      closePasswordPrompt();
      return false;
    }
    const ok = await rpcJoinRoom(roomId, password);
    if (ok) {
      closePasswordPrompt();
      return true;
    }
    // User cancelled while the RPC was running — stop looping.
    if (!usePasswordPrompt.getState().open) return false;
    usePasswordPrompt.getState().setError('Wrong password');
  }
}

export async function disconnectRoom(): Promise<void> {
  if (!session) return;
  const ch = session.channel;
  session = null;
  await ch.unsubscribe();
  const store = useEditorStore.getState();
  store.setRoomId(null);
  store.setRoomStatus('idle');
  store.setRoomPasswordState(false, null);
}

export function currentRoomId(): string | null {
  return session?.roomId ?? null;
}

// -------------------- Event appliers --------------------

function applyBrickInsert(raw: unknown): void {
  const brick = rowToBrickSafe(raw);
  if (!brick) return;
  const store = useEditorStore.getState();
  if (store.bricks.has(brick.id)) return; // our own echo
  store.withRemoteApply(() => {
    useEditorStore.getState().restoreBrick(brick);
  });
}

function applyBrickDelete(id: unknown): void {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return;
  const store = useEditorStore.getState();
  if (!store.bricks.has(id)) return; // already gone locally
  store.withRemoteApply(() => {
    useEditorStore.getState().removeBrickById(id);
  });
}

function applyRoomUpdate(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const row = raw as Partial<RoomRow>;
  const store = useEditorStore.getState();
  const nextTitle = sanitizeTitle(row.title);
  if (nextTitle !== null && store.title !== nextTitle) {
    store.withRemoteApply(() => {
      useEditorStore.getState().setTitle(nextTitle);
    });
  }
  const remote = validateBaseplateBounds(row.baseplate_bounds);
  if (remote) {
    const local = store.baseplateBounds;
    if (
      local.minGx !== remote.minGx ||
      local.maxGx !== remote.maxGx ||
      local.minGz !== remote.minGz ||
      local.maxGz !== remote.maxGz
    ) {
      store.withRemoteApply(() => {
        useEditorStore.setState({ baseplateBounds: remote });
      });
    }
  }

  // Password rotation = kick signal. Re-check membership; if we were removed
  // while the password is still set, the modal comes up again. Pre-existing
  // members keep their access through the rotation.
  const nextPwSetAt = typeof row.password_set_at === 'string' ? row.password_set_at : null;
  const nextHasPw = row.password_hash !== null && row.password_hash !== undefined;
  if (nextPwSetAt !== store.roomPasswordSetAt) {
    store.setRoomPasswordState(nextHasPw, nextPwSetAt);
    void handlePasswordRotation(nextHasPw);
  }
}

/**
 * Triggered when the room's password_set_at timestamp changes. If the room
 * is still protected we re-check our membership; losing it means we've been
 * kicked and must re-authenticate. A rotation that simply removes the
 * password leaves our session intact.
 */
async function handlePasswordRotation(hasPassword: boolean): Promise<void> {
  const current = session;
  if (!current) return;
  if (!hasPassword) return; // password was removed; still in the room, no action.
  const stillMember = await checkMembership(current.roomId, current.userId);
  if (stillMember) return;
  // We've been removed. Unsubscribe + clear scene, then loop the prompt.
  const roomId = current.roomId;
  useToastStore.getState().show('Room password changed — re-enter to rejoin', 'info');
  await disconnectRoom();
  void connectToRoom(roomId);
}

// -------------------- Row <-> Brick conversions --------------------

/**
 * Coerce an untrusted row into a Brick. Returns null for anything that
 * doesn't pass the shared-schema validator — colour outside the palette,
 * unknown shape, non-finite coords, etc. Protects against a peer that
 * ignores the client and writes garbage straight to the DB.
 */
function rowToBrickSafe(raw: unknown): Brick | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<BrickRow>;
  const candidate = {
    id: row.id,
    shape: row.shape as BrickShape | undefined,
    color: row.color as BrickColor | undefined,
    gx: row.gx,
    gy: row.gy,
    gz: row.gz,
    rotation: row.rotation as Rotation | undefined,
    transparent: row.transparent === true ? true : undefined,
  };
  return isBrick(candidate) ? candidate : null;
}

/**
 * Row payload for INSERT. `created_at` is deliberately omitted so the DB
 * `default now()` fills it — passing an empty string makes Postgres try
 * to parse '' as a timestamptz and explode with SQLSTATE 22007.
 */
export function brickToRow(brick: Brick, roomId: string): Omit<BrickRow, 'created_at'> {
  return {
    id: brick.id,
    room_id: roomId,
    shape: brick.shape,
    color: brick.color,
    gx: brick.gx,
    gy: brick.gy,
    gz: brick.gz,
    rotation: brick.rotation,
    transparent: brick.transparent === true,
  };
}

export function boundsMatch(a: BaseplateBounds, b: BaseplateBounds): boolean {
  return a.minGx === b.minGx && a.maxGx === b.maxGx && a.minGz === b.minGz && a.maxGz === b.maxGz;
}
