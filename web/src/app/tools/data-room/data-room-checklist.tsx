"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Filter,
  LockKeyhole,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ItemStatus = "missing" | "in-progress" | "ready";
type Impact = "high" | "medium" | "low";

interface ChecklistItem {
  id: string;
  section: string;
  title: string;
  why: string;
  owner: "Founder" | "Lawyer" | "Accountant" | "Board";
  impact: Impact;
}

const ITEMS: ChecklistItem[] = [
  {
    id: "asic-extract",
    section: "Corporate",
    title: "Current ASIC company extract",
    why: "Confirms ACN, directors, registered office and company status.",
    owner: "Founder",
    impact: "high",
  },
  {
    id: "constitution",
    section: "Corporate",
    title: "Company constitution",
    why: "Investors check share classes, transfer rules and governance mechanics.",
    owner: "Lawyer",
    impact: "high",
  },
  {
    id: "share-register",
    section: "Cap Table",
    title: "Share register and current cap table",
    why: "Shows who owns what, share classes and whether records reconcile.",
    owner: "Founder",
    impact: "high",
  },
  {
    id: "sha",
    section: "Cap Table",
    title: "Shareholders agreement",
    why: "Covers founder rights, transfers, drag/tag, disputes and investor protections.",
    owner: "Lawyer",
    impact: "high",
  },
  {
    id: "esop",
    section: "Cap Table",
    title: "ESOP plan and option grant register",
    why: "Investors will model option pool top-up and employee equity obligations.",
    owner: "Founder",
    impact: "medium",
  },
  {
    id: "safe-notes",
    section: "Financing",
    title: "SAFEs, convertible notes and prior round docs",
    why: "Conversion mechanics can change dilution, control and next-round pricing.",
    owner: "Lawyer",
    impact: "high",
  },
  {
    id: "board-consents",
    section: "Governance",
    title: "Board approvals and shareholder consents",
    why: "Shows prior issues, ESOP grants and financing events were approved properly.",
    owner: "Board",
    impact: "high",
  },
  {
    id: "board-minutes",
    section: "Governance",
    title: "Recent board minutes or founder updates",
    why: "Regular cadence signals governance maturity and reporting discipline.",
    owner: "Founder",
    impact: "medium",
  },
  {
    id: "pnl-balance",
    section: "Financials",
    title: "P&L, balance sheet and cash report",
    why: "Investors validate runway, burn, margins, debtors and revenue quality.",
    owner: "Accountant",
    impact: "high",
  },
  {
    id: "forecast",
    section: "Financials",
    title: "12-18 month forecast and use of funds",
    why: "Connects the raise amount to hiring, runway, milestones and valuation logic.",
    owner: "Founder",
    impact: "high",
  },
  {
    id: "tax",
    section: "Tax / Compliance",
    title: "BAS, tax returns and payroll obligations",
    why: "Investors look for hidden liabilities before completion.",
    owner: "Accountant",
    impact: "medium",
  },
  {
    id: "esic-rdti",
    section: "Tax / Compliance",
    title: "ESIC and R&D Tax Incentive evidence",
    why: "Can improve investor economics and diligence confidence, but needs careful review.",
    owner: "Accountant",
    impact: "medium",
  },
  {
    id: "ip",
    section: "Legal / IP",
    title: "IP assignment and contractor agreements",
    why: "Investors check that the company owns the product, code and brand assets.",
    owner: "Lawyer",
    impact: "high",
  },
  {
    id: "customer-contracts",
    section: "Product / Customers",
    title: "Key customer contracts and pipeline evidence",
    why: "Supports revenue claims, churn assumptions and sector benchmark credibility.",
    owner: "Founder",
    impact: "medium",
  },
];

const SECTION_ORDER = Array.from(new Set(ITEMS.map((item) => item.section)));

const STATUS_LABEL: Record<ItemStatus, string> = {
  missing: "Missing",
  "in-progress": "In progress",
  ready: "Ready",
};

const STATUS_NEXT: Record<ItemStatus, ItemStatus> = {
  missing: "in-progress",
  "in-progress": "ready",
  ready: "missing",
};

function initialStatuses(): Record<string, ItemStatus> {
  return Object.fromEntries(ITEMS.map((item) => [item.id, "missing"]));
}

function impactVariant(impact: Impact) {
  if (impact === "high") return "amber";
  if (impact === "medium") return "brand";
  return "default";
}

export function DataRoomChecklist() {
  const [statuses, setStatuses] = React.useState<Record<string, ItemStatus>>(
    () => initialStatuses(),
  );
  const [section, setSection] = React.useState("All");
  const [email, setEmail] = React.useState("");
  const [submitState, setSubmitState] = React.useState<
    "idle" | "submitting" | "ok" | "err"
  >("idle");

  const readyCount = ITEMS.filter((item) => statuses[item.id] === "ready").length;
  const inProgressCount = ITEMS.filter(
    (item) => statuses[item.id] === "in-progress",
  ).length;
  const highMissing = ITEMS.filter(
    (item) => item.impact === "high" && statuses[item.id] !== "ready",
  ).length;
  const readiness = Math.round((readyCount / ITEMS.length) * 100);
  const filtered =
    section === "All"
      ? ITEMS
      : ITEMS.filter((item) => item.section === section);

  const updateStatus = (id: string, status: ItemStatus) =>
    setStatuses((prev) => ({ ...prev, [id]: status }));

  const cycleStatus = (id: string) =>
    setStatuses((prev) => ({ ...prev, [id]: STATUS_NEXT[prev[id] ?? "missing"] }));

  const reset = () => setStatuses(initialStatuses());

  const copySummary = async () => {
    const lines = [
      `BlockID Data Room Readiness: ${readiness}%`,
      `Ready: ${readyCount}/${ITEMS.length}`,
      `In progress: ${inProgressCount}`,
      `High-impact missing: ${highMissing}`,
      "",
      ...ITEMS.map(
        (item) => `${STATUS_LABEL[statuses[item.id]]}: ${item.section} — ${item.title}`,
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || submitState === "submitting") return;
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "data_room_checklist",
          email,
          payload: {
            readiness,
            readyCount,
            inProgressCount,
            highMissing,
            statuses,
          },
        }),
      });
      if (!res.ok) throw new Error("Network error");
      setSubmitState("ok");
    } catch {
      setSubmitState("err");
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
      <aside className="lg:col-span-4 space-y-6">
        <section className="rounded-2xl border border-surface-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
                Readiness
              </p>
              <p className="mt-3 font-mono text-6xl font-semibold tabular-nums text-brand-600 leading-none">
                {readiness}
                <span className="text-2xl text-ink-8000">%</span>
              </p>
            </div>
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-600">
              <LockKeyhole strokeWidth={1.75} className="h-6 w-6" />
            </span>
          </div>
          <div className="mt-6 h-2 rounded-full bg-surface-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${readiness}%` }}
            />
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Ready" value={String(readyCount)} />
            <MiniStat label="Progress" value={String(inProgressCount)} />
            <MiniStat label="High gaps" value={String(highMissing)} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={copySummary}>
              <Download strokeWidth={1.75} className="h-4 w-4" />
              Copy summary
            </Button>
            <Button type="button" variant="ghost" onClick={reset}>
              <RotateCcw strokeWidth={1.75} className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </section>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-brand-500/30 bg-white p-6"
          noValidate
        >
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
            Save checklist
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink-800">
            Send this into your Investor-Ready Score
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            Capture the readiness snapshot so BlockID can fold it into your
            report and follow-up workflow.
          </p>
          <div className="mt-5 flex flex-col gap-3">
            <Label htmlFor="data-room-email">Work email</Label>
            <Input
              id="data-room-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="founder@yourstartup.com.au"
              aria-invalid={submitState === "err"}
            />
            <Button
              type="submit"
              variant="primary"
              disabled={submitState === "submitting"}
              className="w-full"
            >
              {submitState === "ok"
                ? "Saved"
                : submitState === "submitting"
                  ? "Saving..."
                  : "Save readiness"}
              {submitState === "ok" ? (
                <CheckCircle2 strokeWidth={1.75} className="h-5 w-5" />
              ) : (
                <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
              )}
            </Button>
            {submitState === "err" && (
              <p role="alert" className="text-sm text-amber-300">
                Could not save right now. Try again.
              </p>
            )}
          </div>
        </form>
      </aside>

      <section className="lg:col-span-8 rounded-2xl border border-surface-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-800">
              Checklist items
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              Toggle each item as it moves from missing to ready.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-400">
            <Filter strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            <span className="sr-only">Filter section</span>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="h-10 rounded-[10px] border border-surface-200 bg-surface-100 px-3 text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 cursor-pointer"
            >
              <option value="All">All sections</option>
              {SECTION_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 space-y-4">
          {filtered.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              status={statuses[item.id] ?? "missing"}
              onStatus={updateStatus}
              onCycle={cycleStatus}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-100/50 px-3 py-3">
      <dt className="text-[10px] uppercase tracking-[0.16em] text-ink-8000">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-xl tabular-nums text-ink-700">
        {value}
      </dd>
    </div>
  );
}

function ChecklistRow({
  item,
  status,
  onStatus,
  onCycle,
}: {
  item: ChecklistItem;
  status: ItemStatus;
  onStatus: (id: string, status: ItemStatus) => void;
  onCycle: (id: string) => void;
}) {
  return (
    <article className="rounded-xl border border-surface-200 bg-surface-100/40 p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button
          type="button"
          onClick={() => onCycle(item.id)}
          className="group flex flex-1 items-start gap-3 text-left cursor-pointer"
        >
          <span
            className={cn(
              "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
              status === "ready"
                ? "border-green-500/40 bg-green-500/10 text-green-400"
                : status === "in-progress"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-surface-200 bg-white text-ink-8000 group-hover:border-brand-500/40",
            )}
          >
            {status === "ready" ? (
              <CheckCircle2 strokeWidth={1.75} className="h-4 w-4" />
            ) : (
              <Circle strokeWidth={1.75} className="h-3.5 w-3.5" />
            )}
          </span>
          <span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink-800">
                {item.title}
              </span>
              <Badge variant="outline">{item.section}</Badge>
              <Badge variant={impactVariant(item.impact)}>
                {item.impact} impact
              </Badge>
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-ink-400">
              {item.why}
            </span>
            <span className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-8000">
              <span className="inline-flex items-center gap-1.5">
                <FileText strokeWidth={1.75} className="h-3.5 w-3.5" />
                Owner: {item.owner}
              </span>
              {item.impact === "high" && status !== "ready" && (
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5" />
                  Fix before investor meeting
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="grid grid-cols-3 gap-1 rounded-lg border border-surface-200 bg-white p-1 md:w-[280px]">
          {(["missing", "in-progress", "ready"] as ItemStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onStatus(item.id, s)}
              className={cn(
                "rounded-md px-2 py-2 text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60",
                status === s
                  ? s === "ready"
                    ? "bg-green-500/15 text-green-300"
                    : s === "in-progress"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-slate-500/15 text-ink-500"
                  : "text-ink-8000 hover:bg-white/5 hover:text-ink-500",
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}
