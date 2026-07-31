/**
 * AuthSyncClient — cross-tab SSO sync via BroadcastChannel.
 *
 * Master Upgrade Plan §8.9 stage 2. Any tab on blockid.au that sees
 * a Supabase auth state change (sign-in, sign-out, token refresh,
 * user update) broadcasts a lightweight message on the `bid-auth`
 * channel. Peer tabs receive the message and call
 * `router.refresh()` — RSCs then re-render with the new session,
 * flipping "Sign in" ↔ "Continue to your Business ID" everywhere
 * without a full page reload.
 *
 * Design constraints:
 *   - Falls back silently if BroadcastChannel isn't available
 *     (Safari private mode, older browsers, SSR pre-hydrate).
 *   - Ignores messages that carry the local tab's random id so we
 *     don't loop-refresh ourselves on our own sign-in.
 *   - Dedupes replayed messages within a 250 ms window.
 *   - Throttles `router.refresh()` to at most once per second so a
 *     burst (sign-in emits SIGNED_IN + TOKEN_REFRESHED in quick
 *     succession) doesn't hammer the RSC layer.
 *   - Pure state-machine logic lives in `auth-sync-logic.ts` for
 *     unit-testability.
 */

"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import {
  handleMessage,
  initialState,
  newTabId,
  openChannel,
  type AuthSyncMessage,
  type AuthSyncState,
} from "./auth-sync-logic";

export function AuthSyncClient(): null {
  const router = useRouter();
  const stateRef = useRef<AuthSyncState | null>(null);

  useEffect(() => {
    if (stateRef.current === null) {
      stateRef.current = initialState(newTabId());
    }

    const channel = openChannel((msg: AuthSyncMessage) => {
      if (!stateRef.current) return;
      const now = Date.now();
      const { decision, nextState } = handleMessage(stateRef.current, msg, now);
      stateRef.current = nextState;
      if (decision.action === "refresh") {
        router.refresh();
      }
    });

    // If BroadcastChannel isn't available we still want to react to
    // *our own* tab's auth changes locally (rerender after sign-in).
    const supabase = getBrowserSupabase();
    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      // Local rerender so this tab reflects the change immediately.
      router.refresh();
      // Broadcast to peer tabs.
      if (channel && stateRef.current) {
        channel.post({
          event: event as AuthSyncMessage["event"],
          at: Date.now(),
          userId: session?.user?.id,
          tabId: stateRef.current.ownTabId,
        });
      }
    });

    return () => {
      channel?.close();
      sub?.data.subscription.unsubscribe();
    };
  }, [router]);

  return null;
}

export default AuthSyncClient;
