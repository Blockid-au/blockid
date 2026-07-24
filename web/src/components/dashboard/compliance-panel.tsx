"use client";

// Compliance panel — 4-tile summary of the P0 AU raise-blocker checks:
//   ESIC (Div 360 ITAA97), s708(8) wholesale certs, GST A$75k threshold,
//   R&D Tax Incentive 10-month registration deadline.
//
// Fetches all four endpoints in parallel and deep-links each tile to a
// detail route (/compliance/{esic|s708|gst|rd}) that a follow-up
// milestone will build out.

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

type LoadState = "loading" | "ready" | "error";

interface PanelState {
  esic: EsicPayload | null;
  s708: S708Payload | null;
  gst: GstPayload | null;
  rd: RdPayload | null;
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

function CompliancePanelInner() {
  const [state, setState] = React.useState<PanelState>({
    esic: null,
    s708: null,
    gst: null,
    rd: null,
    state: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [esic, s708, gst, rd] = await Promise.all([
        fetchJson<EsicPayload>("/api/compliance/esic"),
        fetchJson<S708Payload>("/api/compliance/s708"),
        fetchJson<GstPayload>("/api/compliance/gst-threshold"),
        fetchJson<RdPayload>("/api/compliance/rd-calendar"),
      ]);
      if (cancelled) return;
      setState({
        esic,
        s708,
        gst,
        rd,
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EsicTile data={state.esic} />
        <S708Tile data={state.s708} />
        <GstTile data={state.gst} />
        <RdTile data={state.rd} />
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
