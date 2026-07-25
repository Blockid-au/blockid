"use client";

// Compliance panel — 6-tile summary of AU compliance checks:
//   ESIC (Div 360 ITAA97), s708(8) wholesale certs, GST A$75k threshold,
//   R&D Tax Incentive 10-month registration deadline, WGEA 100-employee
//   threshold (WGE Act 2012 (Cth) s3), Modern Slavery A$100M consolidated-
//   revenue threshold (MSA 2018 (Cth) s5).
//
// Fetches all six endpoints in parallel and deep-links each tile to a
// detail route (/compliance/{esic|s708|gst|rd|wgea|modern-slavery}) that a
// follow-up milestone will build out.

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { TaxInvoiceHistoryTile } from "./tax-invoice-history-tile";
import { ComplianceCalendarTile } from "./compliance-calendar-tile";

interface EsicPayload {
  ok: boolean;
  result: {
    is_esic?: boolean;
    points_100?: number;
    assessed_at?: string;
  } | null;
}

interface S708Payload {
  ok: boolean;
  summary?: {
    total: number;
    valid: number;
    expiring_soon: number;
    expired: number;
    has_valid_or_expiring: boolean;
  };
  certs?: Array<{ status: string; days_to_expiry: number }>;
}

interface GstPayload {
  ok: boolean;
  result: {
    is_above_threshold?: boolean;
    registered_for_gst?: boolean;
    urgency?: "ok" | "warning" | "critical";
    result_json?: {
      urgency?: "ok" | "warning" | "critical";
      is_above_threshold?: boolean;
      action_required?: string;
    };
  } | null;
}

interface RdEntry {
  fy_label: string;
  registration_deadline: string;
  days_until_deadline: number;
  status: string;
}
interface RdPayload {
  ok: boolean;
  calendar: RdEntry[];
}

interface WgeaPayload {
  ok: boolean;
  result: {
    is_relevant_employer?: boolean;
    is_above_threshold?: boolean;
    urgency?: "ok" | "warning" | "critical";
    action_required?: string;
    result_json?: {
      urgency?: "ok" | "warning" | "critical";
      action_required?: string;
      current_headcount_au?: number;
      peak_headcount_last_12_months?: number;
    };
  } | null;
}

interface ModernSlaveryPayload {
  ok: boolean;
  result: {
    is_reporting_entity?: boolean;
    is_above_threshold?: boolean;
    urgency?: "ok" | "warning" | "critical";
    action_required?: string;
    result_json?: {
      urgency?: "ok" | "warning" | "critical";
      action_required?: string;
      days_until_statement_due?: number;
      statement_due_iso?: string;
    };
  } | null;
}

type LoadState = "loading" | "ready" | "error";

interface PanelState {
  esic: EsicPayload | null;
  s708: S708Payload | null;
  gst: GstPayload | null;
  rd: RdPayload | null;
  wgea: WgeaPayload | null;
  modernSlavery: ModernSlaveryPayload | null;
  state: LoadState;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function pill(color: "red" | "amber" | "emerald" | "slate", label: string) {
  const map: Record<typeof color, string> = {
    red: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300",
    amber:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    emerald:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    slate:
      "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        map[color],
      )}
    >
      {label}
    </span>
  );
}

function Tile({
  href,
  title,
  subtitle,
  status,
  children,
}: {
  href: string;
  title: string;
  subtitle: string;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="shrink-0">{status}</div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{children}</div>
    </Link>
  );
}

function EsicTile({ data }: { data: EsicPayload | null }) {
  const r = data?.result;
  let status: React.ReactNode;
  let body: React.ReactNode;
  if (!r) {
    status = pill("slate", "Not run");
    body = "Run the Div 360 ITAA97 self-check to see if you qualify.";
  } else if (r.is_esic) {
    status = pill("emerald", "ESIC");
    body = `100-point score: ${r.points_100 ?? 0}. Investors get the tax offset.`;
  } else {
    status = pill("amber", "Not yet");
    body = `100-point score: ${r.points_100 ?? 0}. See recommendations to close the gap.`;
  }
  return (
    <Tile
      href="/compliance/esic"
      title="ESIC eligibility"
      subtitle="Div 360 ITAA97"
      status={status}
    >
      {body}
    </Tile>
  );
}

function S708Tile({ data }: { data: S708Payload | null }) {
  const s = data?.summary;
  let status: React.ReactNode;
  let body: React.ReactNode;
  if (!s || s.total === 0) {
    status = pill("slate", "0 on file");
    body = "Upload accountant certificates before your wholesale round closes.";
  } else if (s.expired > 0 && s.valid === 0 && s.expiring_soon === 0) {
    status = pill("red", `${s.expired} expired`);
    body = "All s708(8) certs on file have expired — the wholesale exemption is currently unavailable.";
  } else if (s.expiring_soon > 0) {
    status = pill("amber", `${s.expiring_soon} expiring`);
    body = `${s.valid} valid, ${s.expiring_soon} expiring within 60 days.`;
  } else {
    status = pill("emerald", `${s.valid} valid`);
    body = "Wholesale exemption on solid footing — keep refreshing before the 2-year cap.";
  }
  return (
    <Tile
      href="/compliance/s708"
      title="s708(8) certs"
      subtitle="Corporations Act 2001"
      status={status}
    >
      {body}
    </Tile>
  );
}

function GstTile({ data }: { data: GstPayload | null }) {
  const r = data?.result;
  // Result may be persisted (result_json wrapper) or fresh.
  const derived = r?.result_json ?? {
    urgency: r?.urgency,
    is_above_threshold: r?.is_above_threshold,
    action_required: undefined,
  };
  let status: React.ReactNode;
  let body: React.ReactNode;
  if (!r) {
    status = pill("slate", "Not checked");
    body = "Add your monthly turnover to see if you must register within 21 days.";
  } else if (derived.urgency === "critical") {
    status = pill("red", "Register now");
    body = "Actual 12-month turnover ≥ A$75,000 — ATO gives 21 days from realising.";
  } else if (derived.urgency === "warning") {
    status = pill("amber", "Crossing soon");
    body = "Projected 12-month turnover will cross A$75,000 — plan the ABN + GST registration.";
  } else {
    status = pill("emerald", "Under threshold");
    body = "Turnover below the A$75,000 GST threshold — no immediate action.";
  }
  return (
    <Tile
      href="/compliance/gst"
      title="GST threshold"
      subtitle="A$75,000 (ATO)"
      status={status}
    >
      {body}
    </Tile>
  );
}

function RdTile({ data }: { data: RdPayload | null }) {
  const upcoming = (data?.calendar ?? []).find(
    (e) => e.status === "last_call" || e.status === "closing_soon",
  );
  const overdue = (data?.calendar ?? []).find((e) => e.status === "overdue");
  let status: React.ReactNode;
  let body: React.ReactNode;
  if (!data || data.calendar.length === 0) {
    status = pill("slate", "Not tracked");
    body = "Log your R&D activities to unlock the 10-month AusIndustry deadline calendar.";
  } else if (overdue) {
    status = pill("red", "Overdue");
    body = `${overdue.fy_label} registration window closed — file for extension of time.`;
  } else if (upcoming) {
    const days = upcoming.days_until_deadline;
    status = pill(days <= 30 ? "red" : "amber", `${days}d left`);
    body = `${upcoming.fy_label} AusIndustry registration due ${upcoming.registration_deadline}.`;
  } else {
    const next = data.calendar[0];
    status = pill("emerald", "On track");
    body = `${next.fy_label} deadline ${next.registration_deadline} (${next.days_until_deadline}d).`;
  }
  return (
    <Tile
      href="/compliance/rd"
      title="R&D Tax Incentive"
      subtitle="10-month registration deadline"
      status={status}
    >
      {body}
    </Tile>
  );
}

function WgeaTile({ data }: { data: WgeaPayload | null }) {
  const r = data?.result;
  const derived = r?.result_json ?? {
    urgency: r?.urgency,
    action_required: r?.action_required,
    current_headcount_au: undefined,
    peak_headcount_last_12_months: undefined,
  };
  let status: React.ReactNode;
  let body: React.ReactNode;
  if (!r) {
    status = pill("slate", "Not tracked");
    body = "Log your Australian headcount to detect the 100-employee WGEA trigger.";
  } else if (derived.action_required === "report_required") {
    status = pill("red", "Report due");
    body = "Headcount at or above 100 — register with WGEA and lodge by 31-May-following.";
  } else if (derived.action_required === "statement_overdue") {
    status = pill("red", "Overdue");
    body = "WGEA report window has passed — lodge immediately.";
  } else if (derived.urgency === "warning") {
    status = pill("amber", derived.action_required === "grace_period" ? "Grace period" : "Approaching");
    body =
      derived.action_required === "grace_period"
        ? "Dropped below 100 employees — WGEA s3B(2) keeps you reporting for 2 more periods."
        : "Within striking distance of the 100-employee WGEA trigger — start the six-indicator dataset now.";
  } else if (derived.action_required === "already_reporting") {
    status = pill("emerald", "Lodging");
    body = "Report on file — keep lodging annually.";
  } else {
    status = pill("emerald", "Under threshold");
    body = "Headcount well below the 100-employee WGEA trigger.";
  }
  return (
    <Tile
      href="/compliance/wgea"
      title="WGEA reporting"
      subtitle="WGE Act 2012 (Cth) s3 — 100 employees"
      status={status}
    >
      {body}
    </Tile>
  );
}

function ModernSlaveryTile({ data }: { data: ModernSlaveryPayload | null }) {
  const r = data?.result;
  const derived = r?.result_json ?? {
    urgency: r?.urgency,
    action_required: r?.action_required,
    days_until_statement_due: undefined,
    statement_due_iso: undefined,
  };
  let status: React.ReactNode;
  let body: React.ReactNode;
  if (!r) {
    status = pill("slate", "Not tracked");
    body = "Log consolidated revenue to detect the A$100M Modern Slavery trigger.";
  } else if (derived.action_required === "statement_overdue") {
    status = pill("red", "Overdue");
    body = "Modern Slavery statement window closed — lodge with the AG's register immediately.";
  } else if (derived.action_required === "statement_due_soon") {
    const days = derived.days_until_statement_due;
    status = pill(typeof days === "number" && days <= 30 ? "red" : "amber", "Due soon");
    body = derived.statement_due_iso
      ? `Statement due ${derived.statement_due_iso} — governing-body approval + signature required (s13(2)).`
      : "Statement due within 6 months of FY end — governing-body approval required.";
  } else if (derived.action_required === "statement_required") {
    status = pill("amber", "Prepare");
    body = "Projected revenue at or above A$100M — start building the seven mandatory reporting criteria (s16).";
  } else if (derived.urgency === "warning") {
    status = pill("amber", "Approaching");
    body = "Revenue nearing the A$100M threshold — voluntary opt-in (s6) shows well to acquirers.";
  } else if (derived.action_required === "already_lodged") {
    status = pill("emerald", "Lodged");
    body = "Statement on file — keep lodging annually within 6 months of FY end.";
  } else {
    status = pill("emerald", "Under threshold");
    body = "Consolidated revenue well below the A$100M Modern Slavery trigger.";
  }
  return (
    <Tile
      href="/compliance/modern-slavery"
      title="Modern Slavery"
      subtitle="MSA 2018 (Cth) s5 — A$100M revenue"
      status={status}
    >
      {body}
    </Tile>
  );
}

function CompliancePanelInner() {
  const [state, setState] = React.useState<PanelState>({
    esic: null,
    s708: null,
    gst: null,
    rd: null,
    wgea: null,
    modernSlavery: null,
    state: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [esic, s708, gst, rd, wgea, modernSlavery] = await Promise.all([
        fetchJson<EsicPayload>("/api/compliance/esic"),
        fetchJson<S708Payload>("/api/compliance/s708"),
        fetchJson<GstPayload>("/api/compliance/gst-threshold"),
        fetchJson<RdPayload>("/api/compliance/rd-calendar"),
        fetchJson<WgeaPayload>("/api/compliance/wgea-threshold"),
        fetchJson<ModernSlaveryPayload>("/api/compliance/modern-slavery-threshold"),
      ]);
      if (cancelled) return;
      setState({
        esic,
        s708,
        gst,
        rd,
        wgea,
        modernSlavery,
        state: "ready",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-label="AU compliance status"
      className="rounded-2xl border border-border bg-background p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            AU compliance
          </h2>
          <p className="text-xs text-muted-foreground">
            Raise-blocker checks. Not tax or legal advice — confirm with your
            registered agent.
          </p>
        </div>
        {state.state === "loading" ? (
          <span className="text-xs text-muted-foreground">Loading…</span>
        ) : null}
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <EsicTile data={state.esic} />
        <S708Tile data={state.s708} />
        <GstTile data={state.gst} />
        <RdTile data={state.rd} />
        <WgeaTile data={state.wgea} />
        <ModernSlaveryTile data={state.modernSlavery} />
        <TaxInvoiceHistoryTile />
        <ComplianceCalendarTile />
      </div>
    </section>
  );
}

export function CompliancePanel() {
  return (
    <React.Suspense
      fallback={
        <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
          Loading compliance status…
        </div>
      }
    >
      <CompliancePanelInner />
    </React.Suspense>
  );
}

export default CompliancePanel;
