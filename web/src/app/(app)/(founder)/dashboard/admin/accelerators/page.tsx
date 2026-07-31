// /dashboard/admin/accelerators — IR accelerator + grant deadline tracker.
//
// Reads content/data/accelerator-deadlines.json (T0209). Surfaces:
//   • Next deadline countdown (days remaining, colour-coded)
//   • Per-accelerator fit + evidence-needed checklist
//   • AU vs US split, stage filters
//   • Grants section (ESIC, R&D tax, IGP) — different from accelerators
// IR daily brief surfaces any deadline ≤ 14 days as a blocker. Closes T0209.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as fs from "fs";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = { title: "Accelerator Tracker — BlockID Admin" };
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Opportunity {
  id: string;
  name: string;
  round: string;
  deadline: string;
  decisionBy?: string;
  country: string;
  stage: string[];
  checkSize: string;
  url: string;
  fit: string;
  evidenceNeeded: string[];
}

interface DeadlinesFile {
  _meta: { updatedAt: string };
  accelerators: Opportunity[];
  grants: Opportunity[];
}

const FILE = "/home/dovanlong/blockid.au/web/content/data/accelerator-deadlines.json";

function loadDeadlines(): DeadlinesFile | null {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")) as DeadlinesFile; } catch { return null; }
}

function daysUntil(iso: string): number | null {
  if (/rolling/i.test(iso)) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function urgencyOf(d: number | null): { color: string; label: string } {
  if (d === null) return { color: "bg-ink-100 text-ink-700 border-ink-200", label: "Rolling" };
  if (d < 0) return { color: "bg-ink-100 text-ink-500 border-ink-200", label: "Passed" };
  if (d <= 14) return { color: "bg-rose-50 text-rose-700 border-rose-200", label: "Urgent" };
  if (d <= 45) return { color: "bg-amber-50 text-amber-700 border-amber-200", label: "Soon" };
  return { color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "On horizon" };
}

function OpportunityCard({ o }: { o: Opportunity }) {
  const d = daysUntil(o.deadline);
  const u = urgencyOf(d);
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">{o.country} · {o.stage.join(" / ")}</p>
          <h3 className="mt-1 text-lg font-semibold text-ink-800">{o.name}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{o.round}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${u.color}`}>{u.label}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-ink-600">
        <div>
          <p className="text-ink-500">Deadline</p>
          <p className="font-medium text-ink-800">{o.deadline}{d !== null && d >= 0 ? ` · ${d}d left` : ""}</p>
        </div>
        {o.decisionBy && (
          <div>
            <p className="text-ink-500">Decision by</p>
            <p className="font-medium text-ink-800">{o.decisionBy}</p>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-500">Check: <span className="font-medium text-ink-700">{o.checkSize}</span></p>
      <p className="mt-2 text-sm text-ink-700">{o.fit}</p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-700">Evidence needed ({o.evidenceNeeded.length})</summary>
        <ul className="mt-2 space-y-1 text-xs text-ink-600">
          {o.evidenceNeeded.map(e => <li key={e}>• {e}</li>)}
        </ul>
      </details>
      <a href={o.url} target="_blank" rel="noopener" className="mt-3 inline-block text-xs font-medium text-brand-700 underline">Apply →</a>
    </div>
  );
}

export default async function AcceleratorTrackerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/accelerators");
  if (user.role !== "admin") redirect("/dashboard");

  const data = loadDeadlines();
  if (!data) {
    return (
      <WorkspaceLayout user={user}>
        <div className="max-w-4xl">
          <h1 className="text-2xl font-semibold text-ink-800">Accelerator tracker</h1>
          <p className="mt-2 text-sm text-rose-600">Cannot read accelerator-deadlines.json</p>
        </div>
      </WorkspaceLayout>
    );
  }

  const allOpps = [...data.accelerators, ...data.grants];
  const urgentCount = allOpps.filter(o => {
    const d = daysUntil(o.deadline);
    return d !== null && d >= 0 && d <= 14;
  }).length;
  const upcoming = data.accelerators
    .map(o => ({ o, d: daysUntil(o.deadline) }))
    .filter(({ d }) => d !== null && d >= 0)
    .sort((a, b) => (a.d ?? 0) - (b.d ?? 0));

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">IR · Fundraise Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">Accelerator & Grant Tracker</h1>
          <p className="mt-2 text-sm text-ink-500">
            {data.accelerators.length} accelerators · {data.grants.length} grants · updated {data._meta.updatedAt}.
            Source: <code className="text-xs">content/data/accelerator-deadlines.json</code>
          </p>
        </header>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <p className="text-xs uppercase tracking-wide text-rose-600">Urgent (≤14d)</p>
            <p className="mt-1 text-2xl font-semibold text-rose-700">{urgentCount}</p>
            <p className="mt-2 text-xs text-rose-600">Surfaced in IR daily brief automatically.</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Next deadline</p>
            <p className="mt-1 text-base font-semibold text-ink-800">
              {upcoming[0] ? `${upcoming[0].o.name} — ${upcoming[0].d}d` : "—"}
            </p>
            <p className="mt-2 text-xs text-ink-500">{upcoming[0]?.o.deadline ?? ""}</p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wide text-ink-500">Tracked total</p>
            <p className="mt-1 text-2xl font-semibold text-ink-800">{allOpps.length}</p>
            <p className="mt-2 text-xs text-ink-500">AU + global accelerators + AU grants.</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-ink-800">Accelerators ({data.accelerators.length})</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {data.accelerators.map(o => <OpportunityCard key={o.id} o={o} />)}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-ink-800">Grants ({data.grants.length})</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {data.grants.map(o => <OpportunityCard key={o.id} o={o} />)}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-ink-50 p-5 text-sm text-ink-600">
          <p>
            <strong>IR weekly cadence:</strong> 1) refresh deadlines doc, 2) draft monthly investor update bullets from
            project-state.json milestones, 3) cross-link to <code>/dashboard/admin/30day</code> scoreboard for SVI
            score evidence, 4) flag deadlines ≤ 14d to CEO via Telegram.
          </p>
        </section>
      </div>
    </WorkspaceLayout>
  );
}
