"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types — mirror engine/api shapes
// ---------------------------------------------------------------------------

type Role =
  | "founder"
  | "cofounder"
  | "employee"
  | "advisor"
  | "investor"
  | "option_holder";

interface Plan {
  id: string;
  startup_name: string;
  total_shares: number;
  pre_money_valuation: number | null;
  incorporation_date: string | null;
  jurisdiction: string;
}

interface Member {
  id: string;
  name: string;
  email?: string | null;
  role: Role;
  share_class: string;
  shares_issued: number;
  options_granted: number;
  join_date: string;
  vesting?: VestingForm;
}

interface VestingForm {
  total_shares: number;
  cliff_months: number;
  vest_months: number;
  schedule_type: "monthly" | "quarterly" | "annual";
  start_date: string;
}

interface CapTableRow {
  name: string;
  role: Role;
  shareClass: string;
  shares: number;
  options: number;
  fullyDilutedShares: number;
  ownershipPct: number;
  fullyDilutedPct: number;
  valueAud: number;
}

interface VestingEvent {
  eventDate: string;
  sharesVested: number;
  cumulativeVested: number;
  isCliff: boolean;
}

interface EsopState {
  pool_size_shares: number;
  scheme_type: "ESS" | "ESOP" | "SAR" | "phantom" | "direct";
  au_tax_concession: boolean;
}

// Grant Register types
interface Grant {
  memberId: string;
  name: string;
  email: string | null;
  role: string;
  grantDate: string;
  shares: number;
  vestingMonths: number | null;
  cliffMonths: number | null;
  scheduleType: string | null;
  vestedPct: number;
  vestedShares: number;
  unvestedShares: number;
  valueAud: number | null;
  vestedValueAud: number | null;
  scheduleId: string | null;
}

interface PoolSummary {
  poolId: string;
  poolSize: number;
  totalGranted: number;
  available: number;
  utilizationPct: number;
  schemeType: string;
  auTaxConcession: boolean;
  avgGrantSize: number;
  health: {
    utilization: number;
    utilizationStatus: "healthy" | "warning" | "critical";
    needsRefresh: boolean;
    refreshRecommended: boolean;
    industryBenchmarkGrantSize: number;
    grantVsIndustry: "above_benchmark" | "at_benchmark" | "below_benchmark" | null;
  };
}

interface AddGrantForm {
  memberName: string;
  memberEmail: string;
  memberRole: string;
  grantDate: string;
  shares: number;
  vestingMonths: number;
  cliffMonths: number;
  scheduleType: "monthly" | "quarterly" | "annual";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EquityEsopClient() {
  const [activeTab, setActiveTab] = React.useState<"captable" | "esop" | "vesting" | "grants" | "documents">("captable");
  const [plan, setPlan] = React.useState<Plan>(() => emptyPlan());
  const [members, setMembers] = React.useState<Member[]>([]);
  const [esop, setEsop] = React.useState<EsopState>({
    pool_size_shares: 1_000_000,
    scheme_type: "ESS",
    au_tax_concession: true,
  });
  const [addOpen, setAddOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [docsLog, setDocsLog] = React.useState<Array<{ kind: string; markdown: string; ts: number }>>([]);

  // Grant Register state
  const [grants, setGrants] = React.useState<Grant[]>([]);
  const [poolSummary, setPoolSummary] = React.useState<PoolSummary | null>(null);
  const [grantsLoading, setGrantsLoading] = React.useState(false);
  const [grantsError, setGrantsError] = React.useState<string | null>(null);
  const [addGrantOpen, setAddGrantOpen] = React.useState(false);
  const [addingGrant, setAddingGrant] = React.useState(false);
  const [selectedGrantId, setSelectedGrantId] = React.useState<string | null>(null);

  // Cap table — derived
  const capTable: CapTableRow[] = React.useMemo(() => {
    if (members.length === 0) return [];
    const totalShares = Math.max(plan.total_shares, 1);
    const fullyDilutedTotal =
      members.reduce((s, m) => s + m.shares_issued + m.options_granted, 0) || totalShares;
    const pps =
      plan.pre_money_valuation && plan.pre_money_valuation > 0
        ? plan.pre_money_valuation / totalShares
        : 0;
    return members.map((m) => {
      const fd = m.shares_issued + m.options_granted;
      return {
        name: m.name,
        role: m.role,
        shareClass: m.share_class,
        shares: m.shares_issued,
        options: m.options_granted,
        fullyDilutedShares: fd,
        ownershipPct: round2((m.shares_issued / totalShares) * 100),
        fullyDilutedPct: round2((fd / fullyDilutedTotal) * 100),
        valueAud: round2(m.shares_issued * pps),
      };
    });
  }, [members, plan.total_shares, plan.pre_money_valuation]);

  // Vesting timeline — derived per member from /api/equity/calculate
  const [timelinesByMember, setTimelinesByMember] = React.useState<
    Record<string, VestingEvent[]>
  >({});

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const next: Record<string, VestingEvent[]> = {};
      for (const m of members) {
        if (!m.vesting) continue;
        try {
          const r = await fetch("/api/equity/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "calculate_vesting",
              data: {
                totalShares: m.vesting.total_shares,
                cliffMonths: m.vesting.cliff_months,
                vestMonths: m.vesting.vest_months,
                scheduleType: m.vesting.schedule_type,
                startDate: m.vesting.start_date,
              },
            }),
          });
          const j = (await r.json()) as { ok: boolean; events?: VestingEvent[] };
          if (j.ok && j.events) next[m.id] = j.events;
        } catch {
          // ignore individual failures
        }
      }
      if (!cancelled) setTimelinesByMember(next);
    }
    if (members.some((m) => m.vesting)) load();
    return () => {
      cancelled = true;
    };
  }, [members]);

  // Load grants when grants tab is activated and plan has an id
  React.useEffect(() => {
    if (activeTab !== "grants" || !plan.id) return;
    let cancelled = false;
    async function loadGrants() {
      setGrantsLoading(true);
      setGrantsError(null);
      try {
        const r = await fetch(`/api/equity/grants?planId=${encodeURIComponent(plan.id)}`);
        const j = (await r.json()) as {
          ok: boolean;
          grants?: Grant[];
          poolSummary?: PoolSummary | null;
          error?: string;
        };
        if (!cancelled) {
          if (j.ok) {
            setGrants(j.grants ?? []);
            setPoolSummary(j.poolSummary ?? null);
          } else {
            setGrantsError(j.error ?? "Failed to load grants");
          }
        }
      } catch {
        if (!cancelled) setGrantsError("Failed to load grants");
      } finally {
        if (!cancelled) setGrantsLoading(false);
      }
    }
    loadGrants();
    return () => { cancelled = true; };
  }, [activeTab, plan.id]);

  async function handleAddGrant(form: AddGrantForm) {
    if (!plan.id) {
      alert("Save the plan first (plan ID is required to create grants)");
      return;
    }
    setAddingGrant(true);
    try {
      const r = await fetch("/api/equity/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          memberName: form.memberName,
          memberEmail: form.memberEmail || undefined,
          memberRole: form.memberRole,
          grantDate: form.grantDate,
          shares: form.shares,
          vestingMonths: form.vestingMonths,
          cliffMonths: form.cliffMonths,
          scheduleType: form.scheduleType,
        }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (j.ok) {
        setAddGrantOpen(false);
        // Reload grants
        const r2 = await fetch(`/api/equity/grants?planId=${encodeURIComponent(plan.id)}`);
        const j2 = (await r2.json()) as { ok: boolean; grants?: Grant[]; poolSummary?: PoolSummary | null };
        if (j2.ok) {
          setGrants(j2.grants ?? []);
          setPoolSummary(j2.poolSummary ?? null);
        }
      } else {
        alert(j.error ?? "Failed to create grant");
      }
    } catch {
      alert("Failed to create grant");
    } finally {
      setAddingGrant(false);
    }
  }

  // Total allocated for ESOP
  const allocatedOptions = members
    .filter((m) => m.role === "option_holder" || m.options_granted > 0)
    .reduce((s, m) => s + m.options_granted, 0);

  const esopPct =
    plan.total_shares > 0 ? (esop.pool_size_shares / plan.total_shares) * 100 : 0;
  const unallocated = Math.max(esop.pool_size_shares - allocatedOptions, 0);

  // ─── Handlers ────────────────────────────────────────────────────────────

  function addMember(m: Omit<Member, "id">) {
    setMembers((cur) => [...cur, { ...m, id: cryptoRandomId() }]);
    setAddOpen(false);
  }

  function removeMember(id: string) {
    setMembers((cur) => cur.filter((m) => m.id !== id));
  }

  async function generateDoc(kind: string) {
    setGenerating(kind);
    try {
      const r = await fetch("/api/equity/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, plan, members, cap: capTable, esopPct: round2(esopPct) }),
      });
      const j = (await r.json()) as { ok: boolean; markdown?: string; error?: string };
      if (j.ok && j.markdown) {
        setDocsLog((cur) => [{ kind, markdown: j.markdown!, ts: Date.now() }, ...cur].slice(0, 8));
        downloadText(`${kind}-${plan.startup_name || "draft"}.md`, j.markdown);
      } else {
        alert(j.error ?? "Failed to generate document");
      }
    } finally {
      setGenerating(null);
    }
  }

  function exportCsv() {
    const headers = [
      "Name",
      "Role",
      "Share class",
      "Shares",
      "Options",
      "Ownership %",
      "Fully-diluted %",
      "Value (AUD)",
    ];
    const rows = capTable.map((r) => [
      r.name,
      r.role,
      r.shareClass,
      r.shares,
      r.options,
      r.ownershipPct,
      r.fullyDilutedPct,
      r.valueAud,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    downloadText(`cap-table-${plan.startup_name || "draft"}.csv`, csv);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Equity &amp; ESOP</h1>
          <p className="text-sm text-ink-600 mt-1">
            AU-native equity planning, ESOP design, and vesting management — stored as
            permanent institutional memory for your startup.
          </p>
        </div>
      </header>

      <PlanCard plan={plan} onChange={setPlan} />

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-surface-200 overflow-x-auto">
        {(
          [
            { id: "captable", label: "Cap Table" },
            { id: "esop", label: "ESOP Pool" },
            { id: "grants", label: "Grant Register" },
            { id: "vesting", label: "Vesting Timeline" },
            { id: "documents", label: "Documents" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-ink-600 hover:text-ink-800 hover:border-surface-300"
            }`}
          >
            {tab.label}
            {tab.id === "grants" && grants.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold px-1">
                {grants.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Section 1: Cap Table */}
      {activeTab === "captable" && <Section

        title="Cap Table"
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="size-4" /> Add Member
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={capTable.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-300 bg-white px-3 text-sm font-semibold text-ink-800 hover:bg-surface-50 disabled:opacity-50"
            >
              <Download className="size-4" /> Export CSV
            </button>
          </div>
        }
      >
        {capTable.length === 0 ? (
          <EmptyHint text="No members yet. Add founders, employees, advisors or investors to build your cap table." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-ink-600">
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Share class</Th>
                  <Th className="text-right">Shares</Th>
                  <Th className="text-right">Options</Th>
                  <Th className="text-right">Ownership %</Th>
                  <Th className="text-right">FD %</Th>
                  <Th className="text-right">Value (AUD)</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {capTable.map((r, i) => (
                  <tr key={i} className="border-t border-surface-100">
                    <Td className="font-medium text-ink-900">{r.name}</Td>
                    <Td className="capitalize">{r.role.replace("_", " ")}</Td>
                    <Td>{r.shareClass}</Td>
                    <Td className="text-right tabular-nums">{fmtInt(r.shares)}</Td>
                    <Td className="text-right tabular-nums">{fmtInt(r.options)}</Td>
                    <Td className="text-right tabular-nums">{r.ownershipPct.toFixed(2)}%</Td>
                    <Td className="text-right tabular-nums">{r.fullyDilutedPct.toFixed(2)}%</Td>
                    <Td className="text-right tabular-nums">{fmtAud(r.valueAud)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => removeMember(members[i].id)}
                        className="text-ink-500 hover:text-red-600"
                        aria-label="Remove member"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-surface-200 bg-surface-50/50 font-semibold">
                  <Td colSpan={3}>Totals</Td>
                  <Td className="text-right tabular-nums">
                    {fmtInt(capTable.reduce((s, r) => s + r.shares, 0))}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {fmtInt(capTable.reduce((s, r) => s + r.options, 0))}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {capTable.reduce((s, r) => s + r.ownershipPct, 0).toFixed(2)}%
                  </Td>
                  <Td className="text-right tabular-nums">
                    {capTable.reduce((s, r) => s + r.fullyDilutedPct, 0).toFixed(2)}%
                  </Td>
                  <Td className="text-right tabular-nums">
                    {fmtAud(capTable.reduce((s, r) => s + r.valueAud, 0))}
                  </Td>
                  <Td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Section>}

      {/* Section 2: ESOP Pool */}
      {activeTab === "esop" && <Section title="ESOP Pool">
        <div className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Pool size (shares)"
            value={fmtInt(esop.pool_size_shares)}
            sub={`${esopPct.toFixed(2)}% of total`}
          />
          <Stat label="Allocated (options granted)" value={fmtInt(allocatedOptions)} />
          <Stat label="Unallocated" value={fmtInt(unallocated)} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Field label="Pool size (shares)">
            <input
              type="number"
              min={0}
              value={esop.pool_size_shares}
              onChange={(e) =>
                setEsop({ ...esop, pool_size_shares: Number(e.target.value) || 0 })
              }
              className={inputCls}
            />
          </Field>
          <Field label="Scheme type">
            <select
              value={esop.scheme_type}
              onChange={(e) =>
                setEsop({ ...esop, scheme_type: e.target.value as EsopState["scheme_type"] })
              }
              className={inputCls}
            >
              <option value="ESS">ESS (Division 83A)</option>
              <option value="ESOP">ESOP</option>
              <option value="SAR">SAR</option>
              <option value="phantom">Phantom</option>
              <option value="direct">Direct shares</option>
            </select>
          </Field>
          <Field label="AU tax concession (s83A-33)">
            <label className="inline-flex items-center gap-2 text-sm h-9">
              <input
                type="checkbox"
                checked={esop.au_tax_concession}
                onChange={(e) =>
                  setEsop({ ...esop, au_tax_concession: e.target.checked })
                }
              />
              Eligible startup concession
            </label>
          </Field>
        </div>

        <div className="mt-6 space-y-2">
          <h4 className="text-sm font-semibold text-ink-800">Option holders</h4>
          {members.filter((m) => m.options_granted > 0).length === 0 ? (
            <p className="text-sm text-ink-600">No option grants yet.</p>
          ) : (
            <ul className="divide-y divide-surface-100 rounded-xl border border-surface-200 bg-white">
              {members
                .filter((m) => m.options_granted > 0)
                .map((m) => {
                  const events = timelinesByMember[m.id] ?? [];
                  const today = new Date().toISOString().slice(0, 10);
                  const vestedToday =
                    events.filter((e) => e.eventDate <= today).pop()?.cumulativeVested ?? 0;
                  const pct = m.options_granted > 0 ? (vestedToday / m.options_granted) * 100 : 0;
                  return (
                    <li key={m.id} className="p-3">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-ink-900">{m.name}</span>
                        <span className="text-ink-600">
                          {fmtInt(vestedToday)} / {fmtInt(m.options_granted)} vested
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-100">
                        <div
                          className="h-full bg-brand-500"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      {m.vesting && (
                        <p className="mt-1 text-xs text-ink-500">
                          Start {m.vesting.start_date} · cliff {m.vesting.cliff_months}m · total{" "}
                          {m.vesting.vest_months}m
                        </p>
                      )}
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </Section>}

      {/* Section 3: Vesting timeline */}
      {activeTab === "vesting" && <Section title="Vesting Timeline">
        {Object.keys(timelinesByMember).length === 0 ? (
          <EmptyHint text="Add members with a vesting schedule to see cumulative-vested over time." />
        ) : (
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis
                  dataKey="eventDate"
                  type="category"
                  allowDuplicatedCategory={false}
                  fontSize={11}
                />
                <YAxis fontSize={11} tickFormatter={(v: number) => fmtInt(v)} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine
                  x={new Date().toISOString().slice(0, 10)}
                  stroke="#dc2626"
                  strokeDasharray="3 3"
                  label={{ value: "Today", fill: "#dc2626", fontSize: 10 }}
                />
                {Object.entries(timelinesByMember).map(([memberId, events], idx) => {
                  const member = members.find((m) => m.id === memberId);
                  if (!member) return null;
                  const color = LINE_COLORS[idx % LINE_COLORS.length];
                  return (
                    <React.Fragment key={memberId}>
                      <Line
                        data={events}
                        type="monotone"
                        dataKey="cumulativeVested"
                        name={member.name}
                        stroke={color}
                        dot={false}
                        strokeWidth={2}
                      />
                      {events
                        .filter((e) => e.isCliff)
                        .map((e) => (
                          <ReferenceDot
                            key={`${memberId}-${e.eventDate}`}
                            x={e.eventDate}
                            y={e.cumulativeVested}
                            r={4}
                            fill={color}
                            stroke="white"
                            strokeWidth={2}
                          />
                        ))}
                    </React.Fragment>
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>}

      {/* Section 3.5: Grant Register */}
      {activeTab === "grants" && (
        <GrantRegisterSection
          grants={grants}
          poolSummary={poolSummary}
          loading={grantsLoading}
          error={grantsError}
          selectedGrantId={selectedGrantId}
          onSelectGrant={setSelectedGrantId}
          onAddGrant={() => setAddGrantOpen(true)}
          planId={plan.id}
        />
      )}

      {/* Section 4: Documents */}
      {activeTab === "documents" && <Section title="Documents">
        <p className="text-sm text-ink-600">
          Generate AU-compliant markdown documents from your equity data. Each document includes
          a disclaimer and is intended as a starting point for legal review.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { kind: "esop_grant", label: "ESOP Grant Letter" },
            { kind: "vesting_agreement", label: "Vesting Agreement" },
            { kind: "cap_table_summary", label: "Cap Table Summary" },
            { kind: "founders_agreement", label: "Founders Agreement" },
          ].map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              onClick={() => generateDoc(kind)}
              disabled={generating === kind || members.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-surface-300 bg-white px-3 text-sm font-semibold text-ink-800 hover:bg-surface-50 disabled:opacity-50"
            >
              {generating === kind ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {label}
            </button>
          ))}
        </div>
        {docsLog.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {docsLog.map((d) => (
              <li
                key={d.ts}
                className="flex justify-between rounded border border-surface-200 bg-white px-3 py-2"
              >
                <span className="text-ink-700">
                  Generated <strong>{d.kind.replace("_", " ")}</strong> at{" "}
                  {new Date(d.ts).toLocaleTimeString()}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(`${d.kind}-${plan.startup_name || "draft"}.md`, d.markdown)
                  }
                  className="text-brand-600 hover:underline"
                >
                  Re-download
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>}

      {addOpen && (
        <AddMemberModal
          plan={plan}
          onClose={() => setAddOpen(false)}
          onAdd={addMember}
        />
      )}

      {addGrantOpen && (
        <AddGrantModal
          onClose={() => setAddGrantOpen(false)}
          onAdd={handleAddGrant}
          adding={addingGrant}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (p: Plan) => void;
}) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5">
      <h2 className="text-base font-semibold text-ink-900">Plan</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <Field label="Startup name">
          <input
            value={plan.startup_name}
            onChange={(e) => onChange({ ...plan, startup_name: e.target.value })}
            className={inputCls}
            placeholder="Acme Pty Ltd"
          />
        </Field>
        <Field label="Total shares">
          <input
            type="number"
            min={1}
            value={plan.total_shares}
            onChange={(e) => onChange({ ...plan, total_shares: Number(e.target.value) || 0 })}
            className={inputCls}
          />
        </Field>
        <Field label="Pre-money valuation (AUD)">
          <input
            type="number"
            min={0}
            value={plan.pre_money_valuation ?? 0}
            onChange={(e) =>
              onChange({ ...plan, pre_money_valuation: Number(e.target.value) || null })
            }
            className={inputCls}
          />
        </Field>
        <Field label="Incorporation date">
          <input
            type="date"
            value={plan.incorporation_date ?? ""}
            onChange={(e) =>
              onChange({ ...plan, incorporation_date: e.target.value || null })
            }
            className={inputCls}
          />
        </Field>
      </div>
    </div>
  );
}

function AddMemberModal({
  plan,
  onClose,
  onAdd,
}: {
  plan: Plan;
  onClose: () => void;
  onAdd: (m: Omit<Member, "id">) => void;
}) {
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<Role>("employee");
  const [shares, setShares] = React.useState(0);
  const [options, setOptions] = React.useState(0);
  const [joinDate, setJoinDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [enableVesting, setEnableVesting] = React.useState(true);
  const [cliffMonths, setCliffMonths] = React.useState(12);
  const [vestMonths, setVestMonths] = React.useState(48);
  const [scheduleType, setScheduleType] =
    React.useState<VestingForm["schedule_type"]>("monthly");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const totalVesting = options > 0 ? options : shares;
    onAdd({
      name: name.trim(),
      role,
      share_class: "Ordinary",
      shares_issued: shares,
      options_granted: options,
      join_date: joinDate,
      vesting:
        enableVesting && totalVesting > 0
          ? {
              total_shares: totalVesting,
              cliff_months: cliffMonths,
              vest_months: vestMonths,
              schedule_type: scheduleType,
              start_date: joinDate,
            }
          : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add member to {plan.startup_name || "plan"}</h3>
          <button type="button" onClick={onClose} className="text-ink-500 hover:text-ink-700">
            <Users className="size-5" />
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className={inputCls}
            >
              <option value="founder">Founder</option>
              <option value="cofounder">Co-founder</option>
              <option value="employee">Employee</option>
              <option value="advisor">Advisor</option>
              <option value="investor">Investor</option>
              <option value="option_holder">Option holder</option>
            </select>
          </Field>
          <Field label="Shares issued">
            <input
              type="number"
              min={0}
              value={shares}
              onChange={(e) => setShares(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <Field label="Options granted">
            <input
              type="number"
              min={0}
              value={options}
              onChange={(e) => setOptions(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <Field label="Join date">
            <input
              type="date"
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enableVesting}
            onChange={(e) => setEnableVesting(e.target.checked)}
          />
          Vesting schedule
        </label>
        {enableVesting && (
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            <Field label="Cliff (months)">
              <input
                type="number"
                min={0}
                value={cliffMonths}
                onChange={(e) => setCliffMonths(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
            <Field label="Total vest (months)">
              <input
                type="number"
                min={1}
                value={vestMonths}
                onChange={(e) => setVestMonths(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
            <Field label="Cadence">
              <select
                value={scheduleType}
                onChange={(e) =>
                  setScheduleType(e.target.value as VestingForm["schedule_type"])
                }
                className={inputCls}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </Field>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[10px] border border-surface-300 px-4 text-sm font-semibold text-ink-700 hover:bg-surface-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-9 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ink-700">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-surface-300 bg-white px-4 py-10 text-center text-sm text-ink-600">
      {text}
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-3 py-2 text-left font-semibold ${className ?? ""}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-2 ${className ?? ""}`} colSpan={colSpan}>
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LINE_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0d9488"];
const inputCls =
  "block w-full h-9 rounded-[10px] border border-surface-300 bg-white px-3 text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";

function emptyPlan(): Plan {
  return {
    id: "",
    startup_name: "",
    total_shares: 10_000_000,
    pre_money_valuation: null,
    incorporation_date: null,
    jurisdiction: "AU",
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-AU").format(Math.round(n));
}

function fmtAud(n: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadText(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Grant Register Section — T0099
// ---------------------------------------------------------------------------

function GrantRegisterSection({
  grants,
  poolSummary,
  loading,
  error,
  selectedGrantId,
  onSelectGrant,
  onAddGrant,
  planId,
}: {
  grants: Grant[];
  poolSummary: PoolSummary | null;
  loading: boolean;
  error: string | null;
  selectedGrantId: string | null;
  onSelectGrant: (id: string | null) => void;
  onAddGrant: () => void;
  planId: string;
}) {
  const selectedGrant = grants.find((g) => g.memberId === selectedGrantId) ?? null;

  const healthColor = {
    healthy: "text-emerald-700 bg-emerald-50 border-emerald-200",
    warning: "text-amber-700 bg-amber-50 border-amber-200",
    critical: "text-red-700 bg-red-50 border-red-200",
  };

  return (
    <div className="space-y-6">
      <Section
        title="Grant Register"
        action={
          <button
            type="button"
            onClick={onAddGrant}
            disabled={!planId}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            title={!planId ? "Save plan first to enable grants" : undefined}
          >
            <Plus className="size-4" /> Add Grant
          </button>
        }
      >
        {/* Pool Health Indicators */}
        {poolSummary && (
          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <Stat
              label="Pool size"
              value={fmtInt(poolSummary.poolSize)}
              sub={`${poolSummary.schemeType} scheme`}
            />
            <Stat
              label="Granted"
              value={fmtInt(poolSummary.totalGranted)}
              sub={`${poolSummary.utilizationPct}% utilised`}
            />
            <Stat
              label="Available"
              value={fmtInt(poolSummary.available)}
              sub={poolSummary.health.refreshRecommended ? "Refresh recommended" : "Healthy buffer"}
            />
            <Stat
              label="Avg grant size"
              value={fmtInt(poolSummary.avgGrantSize)}
              sub={poolSummary.health.grantVsIndustry?.replace("_", " ") ?? ""}
            />
          </div>
        )}

        {/* Pool utilization bar */}
        {poolSummary && (
          <div className="mb-5 rounded-xl border border-surface-200 bg-white p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-ink-800">Pool Utilisation</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${healthColor[poolSummary.health.utilizationStatus]}`}>
                {poolSummary.utilizationPct}% — {poolSummary.health.utilizationStatus}
              </span>
            </div>
            <div className="w-full h-3 bg-surface-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  poolSummary.health.utilizationStatus === "critical"
                    ? "bg-red-500"
                    : poolSummary.health.utilizationStatus === "warning"
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(100, poolSummary.utilizationPct)}%` }}
              />
            </div>
            {poolSummary.health.refreshRecommended && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700">
                  <strong>Pool refresh recommended.</strong> Available shares ({fmtInt(poolSummary.available)}) are below 5% of pool size.
                  Consider authorising a pool top-up before your next funding round.
                </p>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-8 justify-center text-ink-500">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Loading grants...</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && grants.length === 0 && (
          <EmptyHint text="No ESOP grants yet. Click 'Add Grant' to record your first option grant." />
        )}

        {!loading && grants.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-ink-600">
                <tr>
                  <Th>Grantee</Th>
                  <Th>Role</Th>
                  <Th>Grant date</Th>
                  <Th className="text-right">Shares</Th>
                  <Th className="text-right">Vested %</Th>
                  <Th className="text-right">Vested</Th>
                  <Th className="text-right">Unvested</Th>
                  <Th className="text-right">Value (AUD)</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr
                    key={g.memberId}
                    className={`border-t border-surface-100 cursor-pointer hover:bg-surface-50 ${
                      selectedGrantId === g.memberId ? "bg-brand-50/30" : ""
                    }`}
                    onClick={() => onSelectGrant(selectedGrantId === g.memberId ? null : g.memberId)}
                  >
                    <Td className="font-medium text-ink-900">{g.name}</Td>
                    <Td className="capitalize text-ink-600">{g.role.replace("_", " ")}</Td>
                    <Td className="text-ink-600 tabular-nums">{g.grantDate}</Td>
                    <Td className="text-right tabular-nums">{fmtInt(g.shares)}</Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{ width: `${g.vestedPct}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-ink-700">{g.vestedPct}%</span>
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums text-emerald-700">{fmtInt(g.vestedShares)}</Td>
                    <Td className="text-right tabular-nums text-ink-600">{fmtInt(g.unvestedShares)}</Td>
                    <Td className="text-right tabular-nums text-ink-700">
                      {g.vestedValueAud != null ? fmtAud(g.vestedValueAud) : "—"}
                    </Td>
                    <Td className="text-right">
                      <TrendingUp className="size-4 text-brand-400" />
                    </Td>
                  </tr>
                ))}
                {grants.length > 0 && (
                  <tr className="border-t-2 border-surface-200 bg-surface-50/50 font-semibold">
                    <Td colSpan={3}>Totals ({grants.length} grants)</Td>
                    <Td className="text-right tabular-nums">{fmtInt(grants.reduce((s, g) => s + g.shares, 0))}</Td>
                    <Td />
                    <Td className="text-right tabular-nums text-emerald-700">{fmtInt(grants.reduce((s, g) => s + g.vestedShares, 0))}</Td>
                    <Td className="text-right tabular-nums">{fmtInt(grants.reduce((s, g) => s + g.unvestedShares, 0))}</Td>
                    <Td className="text-right tabular-nums">
                      {grants.some((g) => g.vestedValueAud != null)
                        ? fmtAud(grants.reduce((s, g) => s + (g.vestedValueAud ?? 0), 0))
                        : "—"}
                    </Td>
                    <Td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Vesting detail for selected grant */}
        {selectedGrant && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-ink-900">
                  {selectedGrant.name} — Vesting Detail
                </h4>
                <p className="text-xs text-ink-500 mt-0.5">
                  {fmtInt(selectedGrant.shares)} options · {selectedGrant.vestingMonths}m vest · {selectedGrant.cliffMonths}m cliff · {selectedGrant.scheduleType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectGrant(null)}
                className="text-ink-400 hover:text-ink-600"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-surface-200 bg-white p-3">
                <p className="text-xs text-ink-500">Vested to date</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">{fmtInt(selectedGrant.vestedShares)}</p>
                <p className="text-xs text-ink-500">{selectedGrant.vestedPct}% of grant</p>
              </div>
              <div className="rounded-lg border border-surface-200 bg-white p-3">
                <p className="text-xs text-ink-500">Still unvested</p>
                <p className="text-lg font-bold text-ink-700 mt-0.5">{fmtInt(selectedGrant.unvestedShares)}</p>
                <p className="text-xs text-ink-500">{100 - selectedGrant.vestedPct}% remaining</p>
              </div>
              <div className="rounded-lg border border-surface-200 bg-white p-3">
                <p className="text-xs text-ink-500">Vested value (AUD)</p>
                <p className="text-lg font-bold text-brand-700 mt-0.5">
                  {selectedGrant.vestedValueAud != null ? fmtAud(selectedGrant.vestedValueAud) : "Set valuation"}
                </p>
                <p className="text-xs text-ink-500">At current pre-money</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Activity className="size-4 text-brand-500 shrink-0" />
              <p className="text-xs text-ink-600">
                <strong>Schedule:</strong> {selectedGrant.scheduleType} vesting over {selectedGrant.vestingMonths} months
                {selectedGrant.cliffMonths ? ` with ${selectedGrant.cliffMonths}-month cliff` : ""}
                {" "}starting {selectedGrant.grantDate}.
              </p>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Grant Modal — T0099
// ---------------------------------------------------------------------------

function AddGrantModal({
  onClose,
  onAdd,
  adding,
}: {
  onClose: () => void;
  onAdd: (form: AddGrantForm) => void;
  adding: boolean;
}) {
  const [form, setForm] = React.useState<AddGrantForm>({
    memberName: "",
    memberEmail: "",
    memberRole: "employee",
    grantDate: new Date().toISOString().slice(0, 10),
    shares: 100000,
    vestingMonths: 48,
    cliffMonths: 12,
    scheduleType: "monthly",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.memberName.trim()) return;
    if (form.shares <= 0) return;
    onAdd(form);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-900">Add ESOP Grant</h3>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-600">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Grantee name *">
            <input
              value={form.memberName}
              onChange={(e) => setForm({ ...form, memberName: e.target.value })}
              className={inputCls}
              required
              placeholder="Jane Smith"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.memberEmail}
              onChange={(e) => setForm({ ...form, memberEmail: e.target.value })}
              className={inputCls}
              placeholder="jane@startup.com"
            />
          </Field>
          <Field label="Role">
            <select
              value={form.memberRole}
              onChange={(e) => setForm({ ...form, memberRole: e.target.value })}
              className={inputCls}
            >
              <option value="employee">Employee</option>
              <option value="advisor">Advisor</option>
              <option value="option_holder">Option holder</option>
              <option value="cofounder">Co-founder</option>
            </select>
          </Field>
          <Field label="Grant date *">
            <input
              type="date"
              value={form.grantDate}
              onChange={(e) => setForm({ ...form, grantDate: e.target.value })}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Number of options *">
            <input
              type="number"
              min={1}
              value={form.shares}
              onChange={(e) => setForm({ ...form, shares: Number(e.target.value) || 0 })}
              className={inputCls}
              required
            />
          </Field>
          <Field label="Vesting cadence">
            <select
              value={form.scheduleType}
              onChange={(e) => setForm({ ...form, scheduleType: e.target.value as AddGrantForm["scheduleType"] })}
              className={inputCls}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          <Field label="Cliff (months)">
            <input
              type="number"
              min={0}
              value={form.cliffMonths}
              onChange={(e) => setForm({ ...form, cliffMonths: Number(e.target.value) || 0 })}
              className={inputCls}
            />
          </Field>
          <Field label="Total vest (months)">
            <input
              type="number"
              min={1}
              value={form.vestingMonths}
              onChange={(e) => setForm({ ...form, vestingMonths: Number(e.target.value) || 1 })}
              className={inputCls}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          Standard AU ESOP: 4-year vest, 1-year cliff, monthly cadence.
          Division 83A ESS concession applies if startup is an &lsquo;eligible startup&rsquo;.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[10px] border border-surface-300 px-4 text-sm font-semibold text-ink-700 hover:bg-surface-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {adding ? "Creating..." : "Create Grant"}
          </button>
        </div>
      </form>
    </div>
  );
}
