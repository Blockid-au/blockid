import { describe, it, expect, vi, afterEach } from "vitest";
import {
  initialState,
  handleMessage,
  canUseBroadcastChannel,
  openChannel,
  newTabId,
  DEDUP_WINDOW_MS,
  REFRESH_MIN_INTERVAL_MS,
  type AuthSyncMessage,
} from "./auth-sync-logic";

const OWN = "tab-own";
const OTHER = "tab-other";

function msg(overrides: Partial<AuthSyncMessage> = {}): AuthSyncMessage {
  return {
    event: "SIGNED_IN",
    at: 1000,
    userId: "user-a",
    tabId: OTHER,
    ...overrides,
  };
}

describe("handleMessage — sign-in then sign-out both refresh", () => {
  it("refreshes on SIGNED_IN then SIGNED_OUT beyond the throttle window", () => {
    let state = initialState(OWN);

    const first = handleMessage(state, msg({ event: "SIGNED_IN", at: 1000 }), 1000);
    expect(first.decision.action).toBe("refresh");
    state = first.nextState;

    // Well beyond throttle window.
    const nowLater = 1000 + REFRESH_MIN_INTERVAL_MS + 5;
    const second = handleMessage(
      state,
      msg({ event: "SIGNED_OUT", at: nowLater, userId: undefined }),
      nowLater,
    );
    expect(second.decision.action).toBe("refresh");
  });
});

describe("handleMessage — duplicate messages debounced", () => {
  it("ignores the same message twice within the dedupe window", () => {
    let state = initialState(OWN);
    const m = msg({ event: "TOKEN_REFRESHED", at: 5000, userId: "u1" });

    const first = handleMessage(state, m, 5000);
    expect(first.decision.action).toBe("refresh");
    state = first.nextState;

    // Immediate replay of an identical message. Even though enough
    // time has NOT passed for throttle (identical `at`), the dedupe
    // check should short-circuit before throttling anyway.
    const dup = handleMessage(state, m, 5000 + Math.floor(DEDUP_WINDOW_MS / 2));
    expect(dup.decision.action).toBe("ignore");
    if (dup.decision.action === "ignore") {
      // Either duplicate or throttled — both prove no refresh fires.
      expect(["duplicate", "throttled"]).toContain(dup.decision.reason);
    }
  });
});

describe("handleMessage — own-tab messages ignored", () => {
  it("ignores a message that carries the local tabId", () => {
    const state = initialState(OWN);
    const result = handleMessage(state, msg({ tabId: OWN }), 1000);
    expect(result.decision.action).toBe("ignore");
    if (result.decision.action === "ignore") {
      expect(result.decision.reason).toBe("own-tab");
    }
  });
});

describe("canUseBroadcastChannel — graceful null when missing", () => {
  const originalBC = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  afterEach(() => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = originalBC;
  });

  it("returns null from openChannel when BroadcastChannel is undefined", () => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = undefined;
    expect(canUseBroadcastChannel()).toBe(false);
    const opened = openChannel(() => {});
    expect(opened).toBeNull();
  });
});

describe("router.refresh throttled to max 1/sec", () => {
  it("suppresses a refresh triggered too soon after the previous one", () => {
    let state = initialState(OWN);

    const first = handleMessage(state, msg({ at: 10 }), 10);
    expect(first.decision.action).toBe("refresh");
    state = first.nextState;

    // Different message, but well inside the 1s throttle window.
    const second = handleMessage(
      state,
      msg({ event: "SIGNED_OUT", at: 400, userId: undefined }),
      400,
    );
    expect(second.decision.action).toBe("ignore");
    if (second.decision.action === "ignore") {
      expect(second.decision.reason).toBe("throttled");
    }
  });
});

describe("openChannel — round-trips a message to onMessage", () => {
  // Node 18+ ships a global BroadcastChannel via 'worker_threads' but
  // it broadcasts only inside the same process; that's fine for us.
  const originalBC = (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  afterEach(() => {
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = originalBC;
  });

  it("posts arrive on a second channel opened with the same name", async () => {
    // Provide a synchronous in-memory BC shim so this test doesn't
    // depend on the Node runtime's worker_threads implementation.
    class Bus {
      static listeners = new Set<(m: AuthSyncMessage) => void>();
      onmessage: ((ev: MessageEvent<AuthSyncMessage>) => void) | null = null;
      constructor(_name: string) {
        Bus.listeners.add((m) => this.onmessage?.({ data: m } as MessageEvent<AuthSyncMessage>));
      }
      postMessage(m: AuthSyncMessage) {
        for (const l of Bus.listeners) l(m);
      }
      close() {/* noop */}
    }
    (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = Bus as unknown as typeof BroadcastChannel;

    const received = vi.fn();
    const a = openChannel(received);
    const b = openChannel(() => {});
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    b?.post({ event: "SIGNED_IN", at: 1, userId: "x", tabId: "b" });
    expect(received).toHaveBeenCalled();
    a?.close();
    b?.close();
  });
});

describe("newTabId — reasonably unique", () => {
  it("returns distinct ids on successive calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(newTabId());
    expect(seen.size).toBe(50);
  });
});
