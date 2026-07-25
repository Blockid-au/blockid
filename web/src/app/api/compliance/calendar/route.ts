// GET /api/compliance/calendar — serve the AU compliance calendar as
// RFC 5545 text/calendar so a founder can subscribe from Google
// Calendar / iCal / Outlook. Passes ?download=1 to force a `.ics` file
// attachment.
//
// Composed from three sources:
//   1. compliance_gst_status.registered_for_gst — gate BAS events
//   2. equity_plans.incorporation_date — anchor ASIC annual review
//      (closest column we have to an ACN registration date; falls back
//      to skipping ASIC events when absent)
//   3. compliance_rd_registrations — R&D Tax Incentive deadlines,
//      reusing the exact same rows the /api/compliance/rd-calendar
//      route seeds so the two surfaces never drift.
//
// Chapter 11 of the guide already promises this feed
// (web/src/lib/guide/startup-journey.ts:870).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  buildRDCalendar,
  type RDCalendarEntry,
} from "@/lib/compliance/rd-calendar";
import {
  buildComplianceCalendar,
  renderIcs,
  CALENDAR_DISCLAIMER,
} from "@/lib/compliance/calendar";
import {
  buildSubscribeUrl,
  pickNextEvent,
} from "@/app/compliance/calendar/calendar-view.helpers";
import type { WGEAResult } from "@/lib/compliance/wgea-threshold";
import type { ModernSlaveryResult } from "@/lib/compliance/modern-slavery-threshold";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: CALENDAR_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  const project = supabase ? await getActiveProject(user.id) : null;
  const projectId = project?.id ?? null;

  let gstRegistered = false;
  let acnRegistrationDate: string | undefined;
  let rdRegistrations: Array<{
    fy_label: string;
    registration_status?: RDCalendarEntry["registration_status"];
    registration_date?: string | null;
  }> = [];
  let wgea: WGEAResult | null = null;
  let modernSlavery: ModernSlaveryResult | null = null;

  if (supabase) {
    const [gstQ, rdQ, equityQ, wgeaQ, msQ] = await Promise.all([
      supabase
        .from("compliance_gst_status")
        .select("registered_for_gst")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle<GstRow>(),
      supabase
        .from("compliance_rd_registrations")
        .select("fy_label, registration_status, registration_date")
        .eq("user_id", user.id)
        .eq("project_id", projectId),
      supabase
        .from("equity_plans")
        .select("incorporation_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<EquityPlanRow>(),
      supabase
        .from("compliance_wgea_status")
        .select("result_json")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle<WgeaRow>(),
      supabase
        .from("compliance_modern_slavery_status")
        .select("result_json")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle<ModernSlaveryRow>(),
    ]);

    gstRegistered = Boolean(gstQ.data?.registered_for_gst);
    if (equityQ.data?.incorporation_date) {
      acnRegistrationDate = equityQ.data.incorporation_date;
    }
    rdRegistrations = ((rdQ.data ?? []) as RdRow[]).map((r) => ({
      fy_label: r.fy_label,
      registration_status:
        r.registration_status === "registered" ||
        r.registration_status === "not_applicable"
          ? r.registration_status
          : "not_registered",
      registration_date: r.registration_date,
    }));
    wgea = wgeaQ.data?.result_json ?? null;
    modernSlavery = msQ.data?.result_json ?? null;
  }

  const rdCalendar = buildRDCalendar({ registrations: rdRegistrations });
  const events = buildComplianceCalendar({
    gstRegistered,
    acnRegistrationDate,
    rdCalendar,
    wgea,
    modernSlavery,
  });

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format === "json") {
    const now = new Date();
    const origin = request.headers.get("x-forwarded-host") ?? url.host;
    const subscribe = buildSubscribeUrl(origin ? `https://${origin}` : "");
    return NextResponse.json(
      {
        ok: true,
        total: events.length,
        next_event: pickNextEvent(events, now),
        events,
        subscribe,
        disclaimer: CALENDAR_DISCLAIMER,
      },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  }

  const ics = renderIcs(events);
  const download = url.searchParams.get("download") === "1";
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    // Short cache — recompute so freshly-added registrations flow in.
    "Cache-Control": "private, max-age=300",
  };
  if (download) {
    headers["Content-Disposition"] =
      'attachment; filename="compliance-calendar.ics"';
  }

  return new NextResponse(ics, { status: 200, headers });
}
