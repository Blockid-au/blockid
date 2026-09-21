"use client";

import * as React from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Download, RefreshCw } from "lucide-react";
import { SandboxScopeChip } from "@/components/admin/sandbox-scope-chip";
import { BTN, FIELD, PAGE, TABLE } from "@/components/admin/dense-table";
// D3-CISO-05: sandbox scope chip is display-only on /admin/sales — leads
// captured from the marketing site have no sandbox flag; a lead is a lead.
// no sandbox column on leads — chip is display-only for future consistency

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";

interface Lead {
  id: string;
  source: string | null;
  email: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  status: LeadStatus | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-ink-400",
  contacted: "bg-action",
  qualified: "bg-warn",
  converted: "bg-bull",
  lost: "bg-bear",
};

const ALL_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
];

type FilterTab = "all" | LeadStatus;

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSource(source: string | null): string {
  if (!source) return "—";
  const map: Record<string, string> = {
    founding50: "Founding50",
    waitlist: "Waitlist",
    contact: "Contact Form",
    demo: "Demo Request",
    organic: "Organic",
    referral: "Referral",
  };
  return map[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normaliseStatus(raw: string | null): LeadStatus {
  if (raw && (ALL_STATUSES as string[]).includes(raw)) {
    return raw as LeadStatus;
  }
  return "new";
}

function exportCsv(leads: Lead[]): void {
  const headers = ["Date", "Email", "Source", "Status", "Notes"];
  const rows = leads.map((l) => [
    l.created_at,
    l.email ?? "",
    formatSource(l.source),
    normaliseStatus(l.status),
    (l.notes ?? "").replace(/"/g, '""'),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminSalesPage() {
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<FilterTab>("all");
  const [saving, setSaving] = React.useState<string | null>(null);

  // Inline edit state keyed by lead id
  const [editStatus, setEditStatus] = React.useState<Record<string, LeadStatus>>({});
  const [editNotes, setEditNotes] = React.useState<Record<string, string>>({});

  async function fetchLeads() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/leads");
      const json = (await res.json()) as { leads: Lead[] };
      setLeads(json.leads ?? []);
    } catch {
      // silently ignore — show empty state
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only fetch; loading flag + async fetch inside the component-scope loader (also used by the Refresh button), the rule cannot see the async boundary through the reference
    void fetchLeads();
  }, []);

  // Initialise local edit state whenever leads load
  const [prevLeads, setPrevLeads] = React.useState(leads);
  if (leads !== prevLeads) {
    setPrevLeads(leads);
    const statusMap: Record<string, LeadStatus> = {};
    const notesMap: Record<string, string> = {};
    for (const l of leads) {
      statusMap[l.id] = normaliseStatus(l.status);
      notesMap[l.id] = l.notes ?? "";
    }
    setEditStatus(statusMap);
    setEditNotes(notesMap);
  }

  async function handleSave(leadId: string) {
    setSaving(leadId);
    try {
      await fetch("/api/admin/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: leadId,
          status: editStatus[leadId] ?? "new",
          notes: editNotes[leadId] ?? "",
        }),
      });
      // Reflect the change locally so the summary cards update
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, status: editStatus[leadId] ?? l.status, notes: editNotes[leadId] ?? l.notes }
            : l,
        ),
      );
    } finally {
      setSaving(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived counts & filtering
  // ---------------------------------------------------------------------------

  const counts = React.useMemo(() => {
    const base = { total: leads.length, new: 0, contacted: 0, converted: 0 };
    for (const l of leads) {
      const s = normaliseStatus(l.status);
      if (s === "new") base.new += 1;
      if (s === "contacted") base.contacted += 1;
      if (s === "converted") base.converted += 1;
    }
    return base;
  }, [leads]);

  const filtered = React.useMemo(
    () =>
      activeTab === "all"
        ? leads
        : leads.filter((l) => normaliseStatus(l.status) === activeTab),
    [leads, activeTab],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const summaryCards = [
    { label: "Total Leads", value: counts.total, color: "text-strong" },
    { label: "New", value: counts.new, color: "text-secondary" },
    { label: "Contacted", value: counts.contacted, color: "text-action" },
    { label: "Converted", value: counts.converted, color: "text-bull" },
  ];

  // AdminLayout requires a user prop — we render without SSR user data since
  // this is a client component. Pass a placeholder; the layout reads the cookie
  // server-side for real pages. Here we use an empty user object to satisfy the
  // prop contract; actual auth is enforced at the API level.
  const fakeUser = { email: "", displayName: null };

  return (
    <AdminLayout user={fakeUser}>
      <div className={`${PAGE.shell} space-y-6`}>
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={PAGE.eyebrow}>CRO</p>
            <h1 className={PAGE.h1}>Sales Pipeline</h1>
            <p className={PAGE.lede}>Lead tracking — view, update status, and export.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void fetchLeads()} className={BTN.secondary}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
            <button type="button" onClick={() => exportCsv(filtered)} className={BTN.secondary}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map(({ label, value, color }) => (
            <div key={label} className={PAGE.card}>
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">{label}</p>
              <p className={`font-mono text-3xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Sandbox scope chip (D3-CISO-05) */}
        <SandboxScopeChip scope="all" note="Chip-only — leads table has no sandbox column." />

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line-subtle" role="tablist" aria-label="Lead status">
          {FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => setActiveTab(value)}
              className={`-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${
 activeTab === value ? "border-brand-navy text-brand-navy" : "border-transparent text-secondary hover:text-primary"
              }`}
            >
              {label}
              {value !== "all" && (
                <span className="ml-1.5 text-xs tabular-nums text-muted">
                  ({leads.filter((l) => normaliseStatus(l.status) === value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className={TABLE.wrap}>
          {loading ? (
            <div className={TABLE.empty}>Loading leads…</div>
          ) : filtered.length === 0 ? (
            <div className={TABLE.empty}>No leads found for this filter.</div>
          ) : (
            <table className={TABLE.table}>
              <thead className={TABLE.thead}>
                <tr>
                  <th scope="col" className={TABLE.th}>Date</th>
                  <th scope="col" className={TABLE.th}>Email</th>
                  <th scope="col" className={TABLE.th}>Source</th>
                  <th scope="col" className={TABLE.th}>Status</th>
                  <th scope="col" className={TABLE.th}>Notes</th>
                  <th scope="col" className={TABLE.thNum}>Actions</th>
                </tr>
              </thead>
              <tbody className={TABLE.tbody}>
                {filtered.map((lead) => {
                  const currentStatus = editStatus[lead.id] ?? normaliseStatus(lead.status);
                  const currentNotes = editNotes[lead.id] ?? "";
                  const isDirty =
                    currentStatus !== normaliseStatus(lead.status) ||
                    currentNotes !== (lead.notes ?? "");

                  return (
                    <tr key={lead.id} className={TABLE.row}>
                      {/* Date */}
                      <td className={`${TABLE.td} whitespace-nowrap text-xs tabular-nums text-secondary`}>
                        {formatDate(lead.created_at)}
                      </td>

                      {/* Email */}
                      <td className={`${TABLE.td} font-mono text-xs text-primary`}>{lead.email ?? "—"}</td>

                      {/* Source */}
                      <td className={`${TABLE.td} text-xs text-secondary`}>{formatSource(lead.source)}</td>

                      {/* Status badge + dropdown */}
                      <td className={TABLE.td}>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[currentStatus]}`}
                            aria-hidden="true"
                          />
                          <label className="sr-only" htmlFor={`status-${lead.id}`}>
                            Status
                          </label>
                          <select
                            id={`status-${lead.id}`}
                            value={currentStatus}
                            onChange={(e) =>
                              setEditStatus((prev) => ({
                                ...prev,
                                [lead.id]: e.target.value as LeadStatus,
                              }))
                            }
                            className={`${FIELD.select} mt-0 w-auto text-xs`}
                          >
                            {ALL_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Notes */}
                      <td className={TABLE.td}>
                        <label className="sr-only" htmlFor={`notes-${lead.id}`}>
                          Notes
                        </label>
                        <input
                          id={`notes-${lead.id}`}
                          type="text"
                          value={currentNotes}
                          onChange={(e) =>
                            setEditNotes((prev) => ({
                              ...prev,
                              [lead.id]: e.target.value,
                            }))
                          }
                          placeholder="Add note…"
                          className={`${FIELD.input} mt-0 min-w-[140px] text-xs`}
                        />
                      </td>

                      {/* Actions */}
                      <td className={TABLE.tdActions}>
                        <button
                          type="button"
                          disabled={!isDirty || saving === lead.id}
                          onClick={() => void handleSave(lead.id)}
                          className={`${BTN.primary} px-3 text-xs`}
                        >
                          {saving === lead.id ? "Saving…" : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
