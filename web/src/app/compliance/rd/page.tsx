import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildRDCalendar,
  RD_DISCLAIMER,
  type RDCalendarEntry,
} from "@/lib/compliance/rd-calendar";

export const metadata: Metadata = {
  title: "R&D Tax Incentive calendar | BlockID",
  description:
    "AusIndustry R&D Tax Incentive registration deadlines — the 10-month post-FY window under the Industry Research and Development Act 1986.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface RegRow {
  fy_label: string;
  registration_status: string | null;
  registration_date: string | null;
}

async function loadCalendar(
  userId: string,
  projectId: string | null,
): Promise<RDCalendarEntry[]> {
  const supabase = getSupabaseAdmin();
  let registrations: RegRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("compliance_rd_registrations")
      .select("fy_label, registration_status, registration_date")
      .eq("user_id", userId)
      .eq("project_id", projectId);
    registrations = (data as RegRow[] | null) ?? [];
  }
  return buildRDCalendar({
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
}

const STATUS_LABEL: Record<RDCalendarEntry["status"], string> = {
  future: "Future",
  open: "Open",
  closing_soon: "Closing soon",
  last_call: "Last call",
  overdue: "Overdue",
};

export default async function RdCompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/rd");

  const project = await getActiveProject(user.id);
  const calendar = await loadCalendar(user.id, project?.id ?? null);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            AU compliance
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            R&amp;D Tax Incentive calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            <em>Industry Research and Development Act 1986</em> — AusIndustry
            registration is due 10 months after the end of the FY the R&amp;D
            activities were conducted (e.g. FY ending 30-Jun → registration due
            30-Apr). Miss the window and the 43.5% refundable offset is
            unavailable for that year.
          </p>
        </header>

        {calendar.length === 0 ? (
          <section
            data-testid="rd-empty-state"
            className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground"
          >
            No R&amp;D calendar entries yet. Registrations are seeded when you
            first log activity for a financial year.
          </section>
        ) : (
          <section
            aria-label="R&D registration windows"
            data-testid="rd-calendar-list"
            className="rounded-2xl border border-border bg-background p-4"
          >
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left font-medium">FY</th>
                  <th className="pb-2 text-left font-medium">Deadline</th>
                  <th className="pb-2 text-left font-medium">Days</th>
                  <th className="pb-2 text-left font-medium">Status</th>
                  <th className="pb-2 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calendar.map((entry) => (
                  <tr key={entry.fy_label} className="text-foreground">
                    <td className="py-2 font-medium">{entry.fy_label}</td>
                    <td className="py-2">{entry.registration_deadline}</td>
                    <td className="py-2">{entry.days_until_deadline}</td>
                    <td className="py-2">{STATUS_LABEL[entry.status]}</td>
                    <td className="py-2 text-muted-foreground">
                      {entry.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/guide/06-revenue"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Read Chapter 6 — Revenue &amp; R&amp;D
          </Link>
          <a
            href="https://business.gov.au/grants-and-programs/research-and-development-tax-incentive"
            rel="noopener noreferrer"
            target="_blank"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-100"
          >
            business.gov.au — R&amp;D Tax Incentive
          </a>
        </div>

        <p className="text-xs text-muted-foreground">{RD_DISCLAIMER}</p>
      </div>
    </div>
  );
}
