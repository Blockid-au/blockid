/**
 * auth-sync-logic — pure state machine for cross-tab SSO sync.
 *
 * Master Upgrade Plan §8.9 stage 2. Extracted from
 * `AuthSyncClient.tsx` so the interesting logic (debouncing,
 * own-tab filtering, refresh throttling) is unit-testable without
 * DOM / Supabase / React.
 *
 * Message contract on the BroadcastChannel:
 *   {
 *     event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | ...,
 *     at:   epoch millis (used to dedupe duplicates),
 *     userId?: string,
 *     tabId: string   // this tab's random id — used to ignore echoes
 *   }
 */

export const CHANNEL_NAME = "bid-auth";
export const REFRESH_MIN_INTERVAL_MS = 1000;
export const DEDUP_WINDOW_MS = 250;

export type AuthEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY";

export interface AuthSyncMessage {
  event: AuthEvent;
  at: number;
  userId?: string;
  tabId: string;
}

export interface AuthSyncState {
  /** Random id for this tab; messages carrying this id are ignored. */
  ownTabId: string;
  /** Signature of the last message we acted on, for dedupe. */
  lastMessageKey: string | null;
  lastMessageAt: number;
  /** Timestamp of the last triggered refresh, for throttling. */
  lastRefreshAt: number;
}

export function initialState(ownTabId: string): AuthSyncState {
  return {
    ownTabId,
    lastMessageKey: null,
    lastMessageAt: 0,
    lastRefreshAt: 0,
  };
}

export type Decision =
  | { action: "ignore"; reason: string }
  | { action: "refresh" };

/**
 * Given the current state and an incoming message, decide whether
 * to call `router.refresh()`. Never mutates the input state; the
 * returned state is what the caller should install afterwards.
 */
export function handleMessage(
  state: AuthSyncState,
  msg: AuthSyncMessage,
  now: number,
): { decision: Decision; nextState: AuthSyncState } {
  if (!msg || typeof msg !== "object") {
    return { decision: { action: "ignore", reason: "bad-message" }, nextState: state };
  }
  if (msg.tabId === state.ownTabId) {
    return { decision: { action: "ignore", reason: "own-tab" }, nextState: state };
  }
  const key = `${msg.event}:${msg.userId ?? ""}:${msg.at}`;
  if (
    state.lastMessageKey === key &&
    now - state.lastMessageAt < DEDUP_WINDOW_MS
  ) {
    return { decision: { action: "ignore", reason: "duplicate" }, nextState: state };
  }
  if (now - state.lastRefreshAt < REFRESH_MIN_INTERVAL_MS) {
    // Still record the message for dedupe, but don't refresh yet.
    return {
      decision: { action: "ignore", reason: "throttled" },
      nextState: { ...state, lastMessageKey: key, lastMessageAt: now },
    };
  }
  return {
    decision: { action: "refresh" },
    nextState: {
      ...state,
      lastMessageKey: key,
      lastMessageAt: now,
      lastRefreshAt: now,
    },
  };
}

/**
 * True if the current environment can construct a BroadcastChannel.
 * Safari private mode / older browsers / SSR return false.
 */
export function canUseBroadcastChannel(): boolean {
  return typeof globalThis !== "undefined" &&
    typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === "function";
}

/** Shape returned to callers so they can post + tear down cleanly. */
export interface OpenedChannel {
  post(message: AuthSyncMessage): void;
  close(): void;
}

/**
 * Open the channel. Callers pass an `onMessage` handler that will be
 * invoked with every raw incoming message (they run it through
 * `handleMessage` to decide whether to act).
 */
export function openChannel(
  onMessage: (msg: AuthSyncMessage) => void,
): OpenedChannel | null {
  if (!canUseBroadcastChannel()) return null;
  const BC = (globalThis as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel;
  const channel = new BC(CHANNEL_NAME);
  channel.onmessage = (ev: MessageEvent<AuthSyncMessage>) => {
    onMessage(ev.data);
  };
  return {
    post(message: AuthSyncMessage) {
      try {
        channel.postMessage(message);
      } catch {
        // Channel closed mid-post — nothing we can do.
      }
    },
    close() {
      try {
        channel.close();
      } catch {
        /* noop */
      }
    },
  };
}

/** Random tab id — timestamp + Math.random is plenty for dedupe. */
export function newTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
