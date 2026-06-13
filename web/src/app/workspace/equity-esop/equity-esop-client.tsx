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
  Download,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Users,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EquityEsopClient() {
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

      {/* Section 1: Cap Table */}
      <Section
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
      </Section>

      {/* Section 2: ESOP Pool */}
      <Section title="ESOP Pool">
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
      </Section>

      {/* Section 3: Vesting timeline */}
      <Section title="Vesting Timeline">
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
      </Section>

      {/* Section 4: Documents */}
      <Section title="Documents">
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
      </Section>

      {addOpen && (
        <AddMemberModal
          plan={plan}
          onClose={() => setAddOpen(false)}
          onAdd={addMember}
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
