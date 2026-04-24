import { useEffect } from 'react';
import { ensureAnonymousSession } from './auth';
import { useRoomChat } from './useRoomChat';
import { useRoomRouter } from './useRoomRouter';
import { useRoomWrites } from './roomWrites';

/**
 * Bundles every multiplayer hook + side-effect into one component so
 * App.tsx can load the whole subsystem via `React.lazy()` on demand
 * — either when the URL carries `?r=<id>` or when the user first
 * clicks Start / Join room. Landing solo stays free of the Supabase
 * client, realtime subscriptions, auth round-trip, and the rest of
 * the multiplayer code path.
 *
 * Mounts once and stays mounted; unmounting would terminate the
 * realtime channel and force an unnecessary re-load on the next
 * connect. The host (App.tsx) gates this component on a store flag
 * that only flips true, never back.
 */
export function MultiplayerRuntime() {
  useRoomRouter();
  useRoomWrites();
  useRoomChat();

  useEffect(() => {
    // Pre-warm the anonymous sign-in so the first connectToRoom call
    // doesn't eat an extra auth round-trip. Idempotent + memoised
    // inside auth.ts.
    void ensureAnonymousSession();
  }, []);

  return null;
}

export default MultiplayerRuntime;
