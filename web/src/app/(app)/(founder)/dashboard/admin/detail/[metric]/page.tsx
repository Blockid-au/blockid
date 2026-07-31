// /dashboard/admin/detail/[metric] — drill-down from any summary card.
//
// Generic admin detail page that answers "WHY is this number what it is?"
// for every aggregate stat on the 30-day scoreboard and admin home.
//
// Supported metric slugs:
//   - users                 → users table (registered accounts)
//   - analyses              → svi_analyses (last 90d, all)
//   - paying-customers      → revenue_entries (distinct emails)
//   - email-subscribers     → founding50_waitlist
//   - company-profiles      → svi_analyses distinct emails (all-time)
//   - revenue               → revenue_entries individual rows
//
// Output is server-rendered with the actual rows behind the aggregate so the
// admin can verify the count and click through to each individual record.
//
// Admin-only (role check at the top).

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Mail, RefreshCw, User } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const dynamic = "force-dynamic";

interface MetricSpec {
  slug: string;
  title: string;
  description: string;
  source: string;
  countLabel: string;
}

const METRICS: Record<string, MetricSpec> = {
  users: {
    slug: "users",
    title: "Registered users",
    description: "Every account created via signup / OAuth / auto-create-with-temp-password.",
    source: "Supabase `users` table",
    countLabel: "user",
  },
  analyses: {
    slug: "analyses",
    title: "SVI analyses (last 90 days)",
    description: "Every Startup Value Index analysis run via /api/svi (free + paid).",
    source: "Supabase `svi_analyses` table, filtered by created_at ≥ 90 days ago",
    countLabel: "analysis",
  },
  "paying-customers": {
    slug: "paying-customers",
    title: "Paying customers",
    description: "Distinct email addresses that have at least one revenue entry in the last 30 days.",
    source: "Supabase `revenue_entries` table, distinct on email, last 30d",
    countLabel: "customer",
  },
  "email-subscribers": {
    slug: "email-subscribers",
    title: "Email subscribers (Founding 50 waitlist)",
    description: "Everyone who signed up to the Founding 50 waitlist on the home page.",
    source: "Supabase `founding50_waitlist` table",
    countLabel: "subscriber",
  },
  "company-profiles": {
    slug: "company-profiles",
    title: "Company profiles",
    description: "Distinct email addresses across all svi_analyses — proxy for company profiles created.",
    source: "Supabase `svi_analyses` table, distinct on email, all-time",
    countLabel: "profile",
  },
  revenue: {
    slug: "revenue",
    title: "Revenue entries (last 30 days)",
    description: "Every individual revenue entry — Stripe-synced or manually logged via /dashboard/finance.",
    source: "Supabase `revenue_entries` table, last 30 days",
    countLabel: "entry",
  },
};

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  startupName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  role: string | null;
  plan: string | null;
}

interface AnalysisRow {
  id: string;
  email: string;
  totalSvi: number | null;
  createdAt: string;
  inputType: string | null;
  websiteUrl: string | null;
  projectName: string | null;
}

interface RevenueRow {
  id: string;
  email: string;
  amountAud: number;
  month: string;
  source: string | null;
  createdAt: string;
}

interface SubscriberRow {
  email: string;
  createdAt: string;
  source: string | null;
}

interface FetchResult {
  rows: UserRow[] | AnalysisRow[] | RevenueRow[] | SubscriberRow[];
  total: number;
  kind: "users" | "analyses" | "revenue" | "subscribers";
}

async function fetchRows(slug: string): Promise<FetchResult | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  switch (slug) {
    case "users": {
      const { data, count } = await supabase
        .from("users")
        .select("id, email, display_name, startup_name, created_at, last_login_at, role, plan", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(500);
      const rows: UserRow[] = (data ?? []).map((r) => ({
        id: r.id as string,
        email: r.email as string,
        displayName: (r.display_name as string) ?? null,
        startupName: (r.startup_name as string) ?? null,
        createdAt: r.created_at as string,
        lastLoginAt: (r.last_login_at as string) ?? null,
        role: (r.role as string) ?? null,
        plan: (r.plan as string) ?? null,
      }));
      return { rows, total: count ?? rows.length, kind: "users" };
    }
    case "analyses": {
      const { data, count } = await supabase
        .from("svi_analyses")
        .select("id, email, total_svi, created_at, input_type, analysis_json", { count: "exact" })
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(500);
      const rows: AnalysisRow[] = (data ?? []).map((r) => {
        const aj = (r.analysis_json as Record<string, unknown>) ?? {};
        const inputSummary = aj.inputSummary as { projectName?: string } | undefined;
        return {
          id: r.id as string,
          email: r.email as string,
          totalSvi: (r.total_svi as number) ?? null,
          createdAt: r.created_at as string,
          inputType: (r.input_type as string) ?? null,
          websiteUrl: (aj.websiteUrl as string) ?? null,
          projectName: inputSummary?.projectName ?? null,
        };
      });
      return { rows, total: count ?? rows.length, kind: "analyses" };
    }
    case "paying-customers": {
      const { data } = await supabase
        .from("revenue_entries")
        .select("email, amount_aud, month, source, created_at")
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false });
      const byEmail = new Map<string, RevenueRow>();
      for (const r of data ?? []) {
        const email = r.email as string;
        if (!email) continue;
        const prev = byEmail.get(email);
        const candidate: RevenueRow = {
          id: email, // synthetic — for keys
          email,
          amountAud: Number(r.amount_aud ?? 0),
          month: r.month as string,
          source: (r.source as string) ?? null,
          createdAt: r.created_at as string,
        };
        if (!prev || new Date(candidate.createdAt) > new Date(prev.createdAt)) {
          byEmail.set(email, candidate);
        }
      }
      const rows = Array.from(byEmail.values());
      return { rows, total: rows.length, kind: "revenue" };
    }
    case "email-subscribers": {
      const { data, count } = await supabase
        .from("founding50_waitlist")
        .select("email, created_at, source", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(500);
      const rows: SubscriberRow[] = (data ?? []).map((r) => ({
        email: r.email as string,
        createdAt: r.created_at as string,
        source: (r.source as string) ?? null,
      }));
      return { rows, total: count ?? rows.length, kind: "subscribers" };
    }
    case "company-profiles": {
      const { data } = await supabase
        .from("svi_analyses")
        .select("email, created_at, total_svi")
        .order("created_at", { ascending: false })
        .limit(2000);
      const byEmail = new Map<string, AnalysisRow>();
      for (const r of data ?? []) {
        const email = (r.email as string) ?? "";
        if (!email) continue;
        if (byEmail.has(email)) continue;
        byEmail.set(email, {
          id: email,
          email,
          totalSvi: (r.total_svi as number) ?? null,
          createdAt: r.created_at as string,
          inputType: null,
          websiteUrl: null,
          projectName: null,
        });
      }
      const rows = Array.from(byEmail.values());
      return { rows, total: rows.length, kind: "analyses" };
    }
    case "revenue": {
      const { data, count } = await supabase
        .from("revenue_entries")
        .select("id, email, amount_aud, month, source, created_at", { count: "exact" })
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(500);
      const rows: RevenueRow[] = (data ?? []).map((r) => ({
        id: r.id as string,
        email: r.email as string,
        amountAud: Number(r.amount_aud ?? 0),
        month: r.month as string,
        source: (r.source as string) ?? null,
        createdAt: r.created_at as string,
      }));
      return { rows, total: count ?? rows.length, kind: "revenue" };
    }
  }
  return null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtAud(v: number): string {
  return `A$${v.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
}

interface PageProps {
  params: Promise<{ metric: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { metric } = await params;
  const spec = METRICS[metric];
  return {
    title: spec ? `${spec.title} · Admin Detail` : "Admin Detail",
    robots: { index: false, follow: false },
  };
}

export default async function AdminDetailPage({ params }: PageProps) {
  const { metric } = await params;
  const spec = METRICS[metric];
  if (!spec) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/dashboard/admin/detail/${metric}`);
  if (user.role !== "admin") redirect("/dashboard");

  const result = await fetchRows(metric);

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <Link href="/dashboard/admin/30day" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Back to 30-Day Scoreboard
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">{spec.title}</h1>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">{spec.description}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <code className="bg-muted px-2 py-0.5 rounded">{spec.source}</code>
          </div>
        </div>

        {/* Summary */}
        {result && (
          <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Total</p>
              <p className="text-3xl font-bold text-blue-600">{result.total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{spec.countLabel}{result.total !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Showing latest {Math.min(result.rows.length, 500).toLocaleString()} rows</span>
              <Link
                href={`/dashboard/admin/detail/${metric}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg hover:bg-muted/30 transition-colors"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </Link>
            </div>
          </div>
        )}

        {/* Table */}
        {!result ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            Database not configured.
          </div>
        ) : result.rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            No rows found for this metric.
          </div>
        ) : (
          <RowsTable result={result} />
        )}

        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">Why this number?</p>
          <p>
            This page queries the source-of-truth Supabase table directly. The aggregate
            on the scoreboard is computed live from these rows on every page load. If a
            row disappears here, it disappears from the count too.
          </p>
        </div>
      </div>
    </WorkspaceLayout>
  );
}

/* ─── Table renderer (switch on kind) ──────────────────────────────────── */

function RowsTable({ result }: { result: FetchResult }) {
  if (result.kind === "users") {
    const rows = result.rows as UserRow[];
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Display name</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Startup</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Created</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Last login</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Role · Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/dashboard/admin/usage?email=${encodeURIComponent(u.email)}`} className="text-blue-600 hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2 text-xs">{u.displayName ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2 text-xs">{u.startupName ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(u.lastLoginAt)}</td>
                <td className="px-4 py-2 text-xs">
                  <span className={u.role === "admin" ? "text-red-600 font-medium" : "text-muted-foreground"}>{u.role ?? "user"}</span>
                  {u.plan && <span className="text-blue-600 ml-1">· {u.plan}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (result.kind === "analyses") {
    const rows = result.rows as AnalysisRow[];
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Project</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Email</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">SVI</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Input type</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Created</th>
              <th className="px-4 py-2 text-xs font-semibold text-muted-foreground">Open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 text-xs">
                  {a.projectName ?? <span className="text-muted-foreground italic">untitled</span>}
                  {a.websiteUrl && <span className="text-muted-foreground"> · {a.websiteUrl}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{a.email}</td>
                <td className="px-4 py-2 text-right text-xs font-bold">{a.totalSvi ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{a.inputType ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(a.createdAt)}</td>
                <td className="px-4 py-2 text-xs text-center">
                  <Link href={`/s/${a.id}`} className="text-blue-600 hover:underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (result.kind === "revenue") {
    const rows = result.rows as RevenueRow[];
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Email</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Amount (AUD)</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Month</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Source</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Logged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">{r.email}</td>
                <td className="px-4 py-2 text-right text-xs font-mono font-bold text-emerald-600">{fmtAud(r.amountAud)}</td>
                <td className="px-4 py-2 text-xs">{r.month}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{r.source ?? "—"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (result.kind === "subscribers") {
    const rows = result.rows as SubscriberRow[];
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Source</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => (
              <tr key={s.email + s.createdAt} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-xs">
                  <Mail className="h-3 w-3 inline mr-1 text-muted-foreground" />
                  {s.email}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{s.source ?? "founding-50"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}
