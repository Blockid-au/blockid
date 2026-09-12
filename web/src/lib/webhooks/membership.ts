// S20-B review P1 — member-revoke cascade. When a project member is revoked
// (lib/project-members/scope.ts `revokeMember`), every ACTIVE project-level
// endpoint that user created on that project is switched off with
// `disabled_reason = 'creator_not_member'` and the project owner gets one
// `webhook_disabled` notification per endpoint. The dispatcher runs the
// same rule every tick (dispatch.ts) so a row the cascade missed — a
// revoke through a path that bypasses `revokeMember`, a role edit straight
// in the DB — still stops flowing within five minutes.
//
// Never throws: revoking a member must not fail because the webhook tables
// are unreachable (the dispatcher's per-tick check is the backstop).

import { notifyEndpointDisabled, type DisabledNotifier } from "./notify";
import { supabaseWebhookStore, type WebhookStore } from "./store";

export const CREATOR_NOT_MEMBER_REASON = "creator_not_member";

export interface CascadeDeps {
  store?: WebhookStore | null;
  notify?: DisabledNotifier;
  /** Notification recipient; looked up (projects.user_id) when omitted. */
  ownerId?: string | null;
}

export interface CascadeResult {
  deactivated: string[];
  error?: string;
}

/** Deactivate `userId`'s active project-level endpoints on `projectId`. */
export async function deactivateEndpointsForRevokedMember(projectId: string, userId: string, deps: CascadeDeps = {}): Promise<CascadeResult> {
  const out: CascadeResult = { deactivated: [] };
  if (!projectId || !userId) return out;
  try {
    const store = deps.store === undefined ? supabaseWebhookStore() : deps.store;
    if (!store) return { ...out, error: "supabase_unavailable" };
    const notify = deps.notify ?? notifyEndpointDisabled;
    const endpoints = (await store.listEndpoints({ projectId })).filter((e) => e.user_id === userId && e.active);
    if (!endpoints.length) return out;
    let ownerId = deps.ownerId ?? null;
    if (!ownerId) ownerId = (await store.projectOwnerIds([projectId])).get(projectId) ?? null;
    for (const e of endpoints) {
      await store.updateEndpoint(e.id, { active: false, disabled_reason: CREATOR_NOT_MEMBER_REASON });
      out.deactivated.push(e.id);
      // The owner is told (they may want to recreate the integration
      // themselves); the revoked creator is not — they no longer belong
      // to the project.
      if (ownerId && ownerId !== userId) {
        await notify({ userId: ownerId, projectId, endpointId: e.id, url: e.url, reason: "creator_not_member" });
      }
    }
    return out;
  } catch (err) {
    console.error("[blockid:webhooks] revoke cascade failed", { projectId, err: err instanceof Error ? err.message : String(err) });
    return { ...out, error: err instanceof Error ? err.message : String(err) };
  }
}
