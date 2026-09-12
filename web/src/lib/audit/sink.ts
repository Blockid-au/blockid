// S20-A — default audit writer: one hash-chained `audit_events` row.
//
// The BEFORE INSERT trigger `audit_events_hash_chain` (migration 0076,
// serialised under an advisory lock by 0335) fills `prev_hash`/`curr_hash`
// server-side, so this module only inserts the payload. `curr_hash` is NOT
// NULL — the empty placeholder is overwritten by the trigger.
//
// Loaded lazily by ./api-route.ts so route modules never gain a static
// Supabase import through the wrapper.

import { getSupabaseAdmin } from "@/lib/supabase";
import type { AuditRecord } from "./api-route";

export async function writeAuditEvent(record: AuditRecord): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn("[blockid:audit] supabase admin not configured — audit row skipped", {
      action: record.action,
    });
    return;
  }
  const { error } = await admin.from("audit_events").insert({
    user_id: record.user_id,
    actor: record.actor,
    action: record.action,
    resource_type: record.resource_type,
    resource_id: record.resource_id,
    detail: record.detail,
    curr_hash: "",
  });
  if (error) {
    console.error("[blockid:audit] audit_events insert failed", {
      action: record.action,
      code: error.code,
      message: error.message,
    });
  }
}
