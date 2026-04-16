import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CURRENT_SCHEMA_VERSION,
  type BaseplateBounds,
  type Brick,
  type BrickColor,
  type BrickShape,
  type Rotation,
} from '@brick/shared';
import { useEditorStore } from '../state/editorStore';
import { commandStack } from '../state/commandStack';
import { useToastStore } from '../state/toastStore';
import { supabase, type BrickRow, type RoomRow } from './supabase';

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

  // 2) Hydrate the scene from room metadata + all its bricks.
  const bricksRes = await client.from('bricks').select('*').eq('room_id', roomId);
  if (bricksRes.error) {
    console.warn('[room] fetch bricks failed:', bricksRes.error);
    store.setRoomStatus('error');
    useToastStore.getState().show('Could not load room', 'error');
    return false;
  }

  const rows = (bricksRes.data as BrickRow[] | null) ?? [];
  const hydrated: Brick[] = rows.map(rowToBrick);
  const snapshotTitle = roomRow.title;
  const snapshotBounds = roomRow.baseplate_bounds;
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
  const channel = client
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bricks', filter: `room_id=eq.${roomId}` },
      (payload) => applyBrickInsert(payload.new as BrickRow),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'bricks', filter: `room_id=eq.${roomId}` },
      (payload) => applyBrickDelete((payload.old as Partial<BrickRow>).id),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload) => applyRoomUpdate(payload.new as RoomRow),
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

  session = { channel, roomId };
  store.setRoomId(roomId);
  store.setRoomStatus('connected');
  useToastStore.getState().show(`Joined room ${roomId}`, 'success');
  return true;
}

export async function disconnectRoom(): Promise<void> {
  if (!session) return;
  const ch = session.channel;
  session = null;
  await ch.unsubscribe();
  const store = useEditorStore.getState();
  store.setRoomId(null);
  store.setRoomStatus('idle');
}

export function currentRoomId(): string | null {
  return session?.roomId ?? null;
}

// -------------------- Event appliers --------------------

function applyBrickInsert(row: BrickRow): void {
  const store = useEditorStore.getState();
  if (store.bricks.has(row.id)) return; // our own echo
  store.withRemoteApply(() => {
    useEditorStore.getState().restoreBrick(rowToBrick(row));
  });
}

function applyBrickDelete(id: string | undefined): void {
  if (!id) return;
  const store = useEditorStore.getState();
  if (!store.bricks.has(id)) return; // already gone locally
  store.withRemoteApply(() => {
    useEditorStore.getState().removeBrickById(id);
  });
}

function applyRoomUpdate(row: RoomRow): void {
  const store = useEditorStore.getState();
  if (store.title !== row.title) {
    store.withRemoteApply(() => {
      useEditorStore.getState().setTitle(row.title);
    });
  }
  const local = store.baseplateBounds;
  const remote = row.baseplate_bounds;
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

// -------------------- Row <-> Brick conversions --------------------

function rowToBrick(row: BrickRow): Brick {
  return {
    id: row.id,
    shape: row.shape as BrickShape,
    color: row.color as BrickColor,
    gx: row.gx,
    gy: row.gy,
    gz: row.gz,
    rotation: row.rotation as Rotation,
  };
}

export function brickToRow(brick: Brick, roomId: string): BrickRow {
  return {
    id: brick.id,
    room_id: roomId,
    shape: brick.shape,
    color: brick.color,
    gx: brick.gx,
    gy: brick.gy,
    gz: brick.gz,
    rotation: brick.rotation,
    // created_at is filled by the DB default — the shape requires it.
    created_at: '',
  };
}

export function boundsMatch(a: BaseplateBounds, b: BaseplateBounds): boolean {
  return a.minGx === b.minGx && a.maxGx === b.maxGx && a.minGz === b.minGz && a.maxGz === b.maxGz;
}
