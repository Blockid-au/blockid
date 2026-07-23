"use client";

import * as React from "react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { Download, RefreshCw } from "lucide-react";
import { SandboxScopeChip } from "@/components/admin/sandbox-scope-chip";
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
  new: "bg-gray-600",
  contacted: "bg-blue-600",
  qualified: "bg-yellow-600",
  converted: "bg-green-600",
  lost: "bg-red-600",
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
    void fetchLeads();
  }, []);

  // Initialise local edit state whenever leads load
  React.useEffect(() => {
    const statusMap: Record<string, LeadStatus> = {};
    const notesMap: Record<string, string> = {};
    for (const l of leads) {
      statusMap[l.id] = normaliseStatus(l.status);
      notesMap[l.id] = l.notes ?? "";
    }
    setEditStatus(statusMap);
    setEditNotes(notesMap);
  }, [leads]);

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
    { label: "Total Leads", value: counts.total, color: "text-white" },
    { label: "New", value: counts.new, color: "text-gray-300" },
    { label: "Contacted", value: counts.contacted, color: "text-blue-400" },
    { label: "Converted", value: counts.converted, color: "text-green-400" },
  ];

  // AdminLayout requires a user prop — we render without SSR user data since
  // this is a client component. Pass a placeholder; the layout reads the cookie
  // server-side for real pages. Here we use an empty user object to satisfy the
  // prop contract; actual auth is enforced at the API level.
  const fakeUser = { email: "", displayName: null };

  return (
    <AdminLayout user={fakeUser}>
      <div className="min-h-full bg-gray-900 px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Sales Pipeline</h1>
            <p className="text-sm text-gray-400 mt-1">
              CRO lead tracking — view, update status, and export.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void fetchLeads()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => exportCsv(filtered)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-sm hover:bg-gray-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map(({ label, value, color }) => (
            <div
              key={label}
              className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4"
            >
              <p className="text-xs uppercase tracking-widest text-gray-400 font-medium mb-2">
                {label}
              </p>
              <p className={`text-3xl font-bold font-mono ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Sandbox scope chip (D3-CISO-05) */}
        <SandboxScopeChip
          scope="all"
          theme="dark"
          note="Chip-only — leads table has no sandbox column."
        />

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-gray-700">
          {FILTER_TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === value
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              {label}
              {value !== "all" && (
                <span className="ml-1.5 text-xs text-gray-500">
                  ({leads.filter((l) => normaliseStatus(l.status) === value).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          {loading ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              Loading leads…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">
              No leads found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-900/50">
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Email
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Source
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="text-right px-4 py-3 text-xs text-gray-400 font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filtered.map((lead) => {
                    const currentStatus = editStatus[lead.id] ?? normaliseStatus(lead.status);
                    const currentNotes = editNotes[lead.id] ?? "";
                    const isDirty =
                      currentStatus !== normaliseStatus(lead.status) ||
                      currentNotes !== (lead.notes ?? "");

                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-gray-700/30 transition-colors"
                      >
                        {/* Date */}
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {formatDate(lead.created_at)}
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3 text-gray-200 font-mono text-xs">
                          {lead.email ?? "—"}
                        </td>

                        {/* Source */}
                        <td className="px-4 py-3 text-gray-300 text-xs">
                          {formatSource(lead.source)}
                        </td>

                        {/* Status badge + dropdown */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[currentStatus]}`}
                            />
                            <select
                              value={currentStatus}
                              onChange={(e) =>
                                setEditStatus((prev) => ({
                                  ...prev,
                                  [lead.id]: e.target.value as LeadStatus,
                                }))
                              }
                              className="bg-gray-900 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={currentNotes}
                            onChange={(e) =>
                              setEditNotes((prev) => ({
                                ...prev,
                                [lead.id]: e.target.value,
                              }))
                            }
                            placeholder="Add note…"
                            className="w-full bg-gray-900 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-600 min-w-[140px]"
                          />
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={!isDirty || saving === lead.id}
                            onClick={() => void handleSave(lead.id)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              isDirty
                                ? "bg-blue-600 hover:bg-blue-500 text-white"
                                : "bg-gray-700 text-gray-500 cursor-not-allowed"
                            }`}
                          >
                            {saving === lead.id ? "Saving…" : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
