import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildComplianceCalendar,
  CALENDAR_DISCLAIMER,
} from "@/lib/compliance/calendar";
import {
  buildRDCalendar,
  type RDCalendarEntry,
} from "@/lib/compliance/rd-calendar";
import type { WGEAResult } from "@/lib/compliance/wgea-threshold";
import type { ModernSlaveryResult } from "@/lib/compliance/modern-slavery-threshold";
import { CalendarViewClient } from "./calendar-view-client";
import { buildSubscribeUrl } from "./calendar-view.helpers";

export const metadata: Metadata = {
  title: "AU compliance calendar | BlockID",
  description:
    "BAS, ASIC annual review, R&D Tax Incentive, WGEA and Modern Slavery deadlines in one subscribable feed.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface GstRow {
  registered_for_gst: boolean | null;
}
interface RdRow {
  fy_label: string;
  registration_status: string | null;
  registration_date: string | null;
}
interface EquityPlanRow {
  incorporation_date: string | null;
}
interface WgeaRow {
  result_json: WGEAResult | null;
}
interface ModernSlaveryRow {
  result_json: ModernSlaveryResult | null;
}

async function loadInputs(userId: string, projectId: string | null) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      gstRegistered: false,
      acnRegistrationDate: undefined as string | undefined,
      rdRegistrations: [] as RdRow[],
      wgea: null as WGEAResult | null,
      modernSlavery: null as ModernSlaveryResult | null,
    };
  }
  const [gstQ, rdQ, equityQ, wgeaQ, msQ] = await Promise.all([
    supabase
      .from("compliance_gst_status")
      .select("registered_for_gst")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle<GstRow>(),
    supabase
      .from("compliance_rd_registrations")
      .select("fy_label, registration_status, registration_date")
      .eq("user_id", userId)
      .eq("project_id", projectId),
    supabase
      .from("equity_plans")
      .select("incorporation_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<EquityPlanRow>(),
    supabase
      .from("compliance_wgea_status")
      .select("result_json")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle<WgeaRow>(),
    supabase
      .from("compliance_modern_slavery_status")
      .select("result_json")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle<ModernSlaveryRow>(),
  ]);
  return {
    gstRegistered: Boolean(gstQ.data?.registered_for_gst),
    acnRegistrationDate: equityQ.data?.incorporation_date ?? undefined,
    rdRegistrations: (rdQ.data ?? []) as RdRow[],
    wgea: wgeaQ.data?.result_json ?? null,
    modernSlavery: msQ.data?.result_json ?? null,
  };
}

export default async function ComplianceCalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/calendar");

  const project = await getActiveProject(user.id);
  const inputs = await loadInputs(user.id, project?.id ?? null);

  const rdCalendar = buildRDCalendar({
    registrations: inputs.rdRegistrations.map(
      (r): {
        fy_label: string;
        registration_status: RDCalendarEntry["registration_status"];
        registration_date: string | null;
      } => ({
        fy_label: r.fy_label,
        registration_status:
          r.registration_status === "registered" ||
          r.registration_status === "not_applicable"
            ? r.registration_status
            : "not_registered",
        registration_date: r.registration_date,
      }),
    ),
  });

  const events = buildComplianceCalendar({
    gstRegistered: inputs.gstRegistered,
    acnRegistrationDate: inputs.acnRegistrationDate,
    rdCalendar,
    wgea: inputs.wgea,
    modernSlavery: inputs.modernSlavery,
  });

  const subscribe = buildSubscribeUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "");

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-4xl p-6">
        <CalendarViewClient
          events={events}
          subscribeWebcal={subscribe.webcal}
          subscribeHttps={subscribe.https}
          disclaimer={CALENDAR_DISCLAIMER}
        />
      </div>
    </div>
  );
}
