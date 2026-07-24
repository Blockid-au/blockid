// Compliance status resolver — reads the four compliance_* tables added
// by migration 0108 and returns a compact NudgeComplianceStatus that the
// pure nudge engine (`computeNextSteps`) can enrich its `missing[]` array
// with. Kept in a separate module because it does I/O — the pure
// engine stays testable in isolation.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NudgeComplianceStatus } from "@/lib/nudge/next-steps";

interface EsicRow {
  is_esic: boolean | null;
}
interface S708Row {
  expiry_date: string | null;
}
interface GstRow {
  urgency: string | null;
  registered_for_gst: boolean | null;
}
interface RdRow {
  fy_label: string | null;
  registration_deadline: string | null;
  registration_status: string | null;
}

function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso + "T00:00:00Z");
  const toUtc = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  return Math.round(
    (from.getTime() - toUtc.getTime()) / (24 * 60 * 60 * 1000),
  );
}

export async function computeComplianceMissing(
  supabase: SupabaseClient,
  userId: string,
  projectId: string | null,
  now: Date = new Date(),
): Promise<NudgeComplianceStatus> {
  const status: NudgeComplianceStatus = {
    hasEsicAssessment: false,
    hasValidOrExpiringS708: false,
    hasGstAssessment: false,
    rdMinDaysUntilDeadline: null,
    rdMinDeadlineFy: null,
    rdHasOverdue: false,
  };

  // --- ESIC: latest row ---
  // TODO(verify-col): confirm compliance_esic_assessments.assessed_at exists —
  // migration 0108 defines it, but a later migration could rename it.
  {
    const { data } = await supabase
      .from("compliance_esic_assessments")
      .select("is_esic")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle<EsicRow>();
    if (data) {
      status.hasEsicAssessment = true;
      status.isEsic = Boolean(data.is_esic);
    }
  }

  // --- s708(8) certs ---
  {
    const { data } = await supabase
      .from("compliance_s708_certs")
      .select("expiry_date")
      .eq("user_id", userId)
      .eq("project_id", projectId);
    const rows = (data ?? []) as S708Row[];
    for (const r of rows) {
      if (!r.expiry_date) continue;
      const days = daysBetween(r.expiry_date, now);
      // Valid or expiring-soon (<= 60 days but not expired): count as "on file".
      if (days >= 0) {
        status.hasValidOrExpiringS708 = true;
        break;
      }
    }
  }

  // --- GST snapshot: latest row ---
  {
    const { data } = await supabase
      .from("compliance_gst_status")
      .select("urgency, registered_for_gst")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle<GstRow>();
    if (data) {
      status.hasGstAssessment = true;
      status.gstUrgency = (data.urgency as NudgeComplianceStatus["gstUrgency"]) ?? "ok";
      status.gstRegistered = Boolean(data.registered_for_gst);
    }
  }

  // --- R&D calendar: minimum non-registered days-to-deadline + overdue flag ---
  {
    const { data } = await supabase
      .from("compliance_rd_registrations")
      .select("fy_label, registration_deadline, registration_status")
      .eq("user_id", userId)
      .eq("project_id", projectId);
    const rows = (data ?? []) as RdRow[];
    let minDays: number | null = null;
    let minFy: string | null = null;
    for (const r of rows) {
      if (!r.registration_deadline) continue;
      if (r.registration_status === "registered") continue;
      if (r.registration_status === "not_applicable") continue;
      const days = daysBetween(r.registration_deadline, now);
      if (days < 0) {
        status.rdHasOverdue = true;
      }
      if (minDays === null || days < minDays) {
        // Track the *smallest* positive gap (i.e. the nearest upcoming
        // deadline). Overdue rows go through the rdHasOverdue flag.
        if (days >= 0) {
          minDays = days;
          minFy = r.fy_label ?? null;
        }
      }
    }
    status.rdMinDaysUntilDeadline = minDays;
    status.rdMinDeadlineFy = minFy;
  }

  return status;
}
