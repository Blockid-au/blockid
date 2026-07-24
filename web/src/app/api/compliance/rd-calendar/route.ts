// GET /api/compliance/rd-calendar — returns the R&D Tax Incentive
// registration calendar for the founder's active project: current FY plus
// the prior 3 FYs, each with the 10-month AusIndustry deadline and derived
// status.
//
// Legal ref: https://business.gov.au/grants-and-programs/research-and-development-tax-incentive
// Every response carries RD_DISCLAIMER — not tax advice.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  buildRDCalendar,
  RD_DISCLAIMER,
  type RDCalendarEntry,
} from "@/lib/compliance/rd-calendar";

export const dynamic = "force-dynamic";

interface RDRegRow {
  fy_label: string;
  registration_status: string | null;
  registration_date: string | null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: RD_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  let registrations: RDRegRow[] = [];

  if (supabase) {
    const project = await getActiveProject(user.id);
    const { data } = await supabase
      .from("compliance_rd_registrations")
      .select("fy_label, registration_status, registration_date")
      .eq("user_id", user.id)
      .eq("project_id", project?.id ?? null);
    registrations = (data ?? []) as RDRegRow[];
  }

  const calendar: RDCalendarEntry[] = buildRDCalendar({
    registrations: registrations.map((r) => ({
      fy_label: r.fy_label,
      registration_status:
        r.registration_status === "registered" ||
        r.registration_status === "not_applicable"
          ? r.registration_status
          : "not_registered",
      registration_date: r.registration_date,
    })),
  });

  // Best-effort backfill so subsequent GETs surface founder-driven updates.
  if (supabase) {
    const project = await getActiveProject(user.id);
    for (const entry of calendar) {
      await supabase
        .from("compliance_rd_registrations")
        .upsert(
          {
            user_id: user.id,
            project_id: project?.id ?? null,
            fy_label: entry.fy_label,
            activity_start: entry.activity_start,
            activity_end: entry.activity_end,
            registration_deadline: entry.registration_deadline,
            registration_status:
              entry.registration_status ??
              (entry.status === "overdue" ? "overdue" : "not_registered"),
          },
          { onConflict: "user_id,project_id,fy_label" },
        );
    }
  }

  return NextResponse.json({
    ok: true,
    calendar,
    disclaimer: RD_DISCLAIMER,
  });
}
