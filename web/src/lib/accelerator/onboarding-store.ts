// accelerator/onboarding-store — read / write the Cohort onboarding success
// metrics of ONE organisation (G25, 2026-09-21). Column
// `org_settings.onboarding_metrics` (migration 0438, jsonb). The pilot kit
// kept the same shape on `pilot_orders.metrics`; with the paid pilot retired
// the metrics belong to the program's organisation, not to an order.
//
//   readOnboardingMetricsForOrg(orgId)   → { available, metrics, updatedAt }
//   writeOnboardingMetricsForOrg(orgId, patch, actor)
//        → merges the sent keys only (lib/accelerator/onboarding-metrics
//          mergeOnboardingMetrics), upserts the org_settings row, audits
//          `accelerator.onboarding_metrics_updated` with the changed keys
//          (never the free-text notes). The owner check is the caller's
//          (resolveOrgAdmin → isOwner) — this module trusts its orgId.
//
// Fail-soft: before 0428 / 0438 (42P01 / 42703 / PGRST204) `available`
// is false and the page renders the form read-only with a note.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { isMissingRelation } from "@/lib/investors/mandates";
import { ONBOARDING_METRIC_KEYS, mergeOnboardingMetrics, readOnboardingMetrics, type OnboardingMetrics } from "./onboarding-metrics";

type Row = Record<string, unknown>;

export interface OrgOnboardingMetrics {
  orgId: string;
  /** False before migrations 0428 / 0438 or without a DB. */
  available: boolean;
  metrics: OnboardingMetrics;
  updatedAt: string | null;
}

export type WriteOnboardingResult = { ok: true; value: OrgOnboardingMetrics } | { ok: false; error: "unavailable" | "db_error"; message: string };

function isMissingColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(String(e.message ?? ""));
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function readRaw(orgId: string): Promise<{ available: boolean; stored: Record<string, unknown> }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { available: false, stored: {} };
  try {
    const { data, error } = await supabase.from("org_settings").select("org_id, onboarding_metrics").eq("org_id", orgId).maybeSingle();
    if (error) {
      if (!isMissingRelation(error) && !isMissingColumn(error)) console.error("[blockid:onboarding] metrics read failed", { code: error.code, message: error.message });
      return { available: false, stored: {} };
    }
    return { available: true, stored: asRecord((data as Row | null)?.onboarding_metrics) };
  } catch (err) {
    console.error("[blockid:onboarding] metrics read threw", err instanceof Error ? err.message : String(err));
    return { available: false, stored: {} };
  }
}

function view(orgId: string, available: boolean, stored: Record<string, unknown>): OrgOnboardingMetrics {
  return { orgId, available, metrics: readOnboardingMetrics(stored), updatedAt: typeof stored.updated_at === "string" ? stored.updated_at : null };
}

/** The org's onboarding metrics (empty + `available:false` before the migrations). */
export async function readOnboardingMetricsForOrg(orgId: string): Promise<OrgOnboardingMetrics> {
  const { available, stored } = await readRaw(orgId);
  return view(orgId, available, stored);
}

/** Merge a validated patch onto the org's stored metrics; audit the changed keys. */
export async function writeOnboardingMetricsForOrg(orgId: string, patch: OnboardingMetrics, actor: { id: string }, now: Date = new Date()): Promise<WriteOnboardingResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "unavailable", message: "Onboarding metrics are not available on this deployment." };
  const { available, stored } = await readRaw(orgId);
  if (!available) return { ok: false, error: "unavailable", message: "Onboarding metrics are not available yet (migration 0438)." };
  const nowIso = now.toISOString();
  const merged = mergeOnboardingMetrics(stored, patch, nowIso);
  const { error } = await supabase.from("org_settings").upsert({ org_id: orgId, onboarding_metrics: merged }, { onConflict: "org_id" });
  if (error) {
    console.error("[blockid:onboarding] metrics write failed", { code: error.code, message: error.message });
    return { ok: false, error: "db_error", message: "Could not save the onboarding metrics. Please try again." };
  }
  const changed = ONBOARDING_METRIC_KEYS.filter((k) => k in patch && k !== "notes");
  try {
    await appendAudit({
      user_id: actor.id,
      actor: "user",
      action: "accelerator.onboarding_metrics_updated",
      resource_type: "investor_organisation",
      resource_id: orgId,
      detail: { keys: changed, case_study_consent: typeof patch.case_study_consent === "boolean" ? patch.case_study_consent : undefined },
    });
  } catch (err) {
    console.error("[blockid:onboarding] metrics audit failed", err instanceof Error ? err.message : String(err));
  }
  return { ok: true, value: view(orgId, true, merged) };
}
