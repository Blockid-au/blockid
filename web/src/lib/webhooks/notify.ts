// S20-B — the ONE in-app notification an endpoint owner gets when their
// webhook stops: `webhook_disabled` (lib/notification-kinds.ts), deduped per
// endpoint with a 24 h throttle. Written by the dispatcher (auto-disable at
// 20 consecutive failures, creator lost project membership, secret
// unreadable) and by the member-revoke cascade (lib/webhooks/membership.ts).
//
// `insertNotification` is `server-only`, so it is imported lazily — this
// module stays importable from colocated tests.

import { MAX_CONSECUTIVE_FAILURES } from "./store";

export type EndpointDisabledReason = "auto_disabled" | "creator_not_member" | "secret_unreadable";

export interface DisabledNotifyArgs {
  /** Recipient — the endpoint's creator for auto-disable, the PROJECT OWNER for creator_not_member. */
  userId: string;
  projectId: string | null;
  endpointId: string;
  url: string;
  reason: EndpointDisabledReason;
}

export type DisabledNotifier = (args: DisabledNotifyArgs) => Promise<void>;

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Write the `webhook_disabled` notification (dedupe key = endpoint id, 24 h). Never throws. */
export const notifyEndpointDisabled: DisabledNotifier = async (args) => {
  try {
    const { insertNotification } = await import("@/lib/notifications");
    await insertNotification({
      userId: args.userId,
      projectId: args.projectId,
      kind: "webhook_disabled",
      payload: {
        endpoint_id: args.endpointId,
        host: hostOf(args.url),
        reason: args.reason,
        failures: args.reason === "auto_disabled" ? MAX_CONSECUTIVE_FAILURES : null,
        href: "/workspace/integrations",
      },
      dedupeKey: `webhook_disabled:${args.endpointId}`,
      throttleMs: 24 * 60 * 60_000,
    });
  } catch (err) {
    console.error("[blockid:webhooks] disable notification failed", { endpoint: args.endpointId, reason: args.reason, err: String(err) });
  }
};
