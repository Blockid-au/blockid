// /admin/resellers/[code] — reseller detail page.
//
// Server component. requireAdmin gate. Loads the reseller row + related
// data (promotion codes, admins, attribution summary, recent commissions
// from reseller_commissions_current view) and hands the row to a client
// edit form.

import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normaliseResellerCode } from "@/lib/reseller/attribution";
import { ResellerEditClient } from "./reseller-edit-client";

export const dynamic = "force-dynamic";

interface Reseller {
  id: string;
  code: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string | null;
  billing_model: "retail" | "wholesale";
  allowed_tiers: number[];
  can_create_startups: boolean;
  can_grant_credits: boolean;
  monthly_credit_budget: number;
  monthly_sandbox_credits: number;
  gst_registered: boolean;
  abn: string | null;
  commission_share_pct: number;
  status: "active" | "paused" | "terminated";
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PromotionCode {
  id: string;
  tier_pct: number;
  code: string;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  active: boolean;
  created_at: string;
}

interface CommissionRow {
  commission_id: string;
  stripe_invoice_id: string;
  list_price_aud_cents: number;
  discount_pct: number;
  commission_aud_cents: number;
  net_owed_cents: number;
  status: string;
  created_at: string;
}

interface AttributionRow {
  status: string;
  source: string;
}

interface AttributionSummary {
  total: number;
  active: number;
  by_source: Record<string, number>;
}

async function loadDetail(codeParam: string): Promise<
  | { kind: "not_configured" }
  | { kind: "not_found" }
  | {
      kind: "ok";
      reseller: Reseller;
      promotion_codes: PromotionCode[];
      commissions: CommissionRow[];
      attributions_summary: AttributionSummary;
      admin_count: number;
    }
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { kind: "not_configured" };

  try {
    const { data: reseller } = await supabase
      .from("resellers")
      .select("*")
      .eq("code", codeParam)
      .maybeSingle();
    if (!reseller) return { kind: "not_found" };

    const [codesRes, attributionsRes, commissionsRes, adminsRes] = await Promise.all([
      supabase
        .from("reseller_promotion_codes")
        .select("id, tier_pct, code, stripe_coupon_id, stripe_promotion_code_id, active, created_at")
        .eq("reseller_id", reseller.id)
        .order("tier_pct", { ascending: true }),
      supabase
        .from("reseller_attributions")
        .select("status, source")
        .eq("reseller_id", reseller.id),
      supabase
        .from("reseller_commissions_current")
        .select(
          "commission_id, stripe_invoice_id, list_price_aud_cents, discount_pct, commission_aud_cents, net_owed_cents, status, created_at",
        )
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("reseller_admins")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", reseller.id)
        .eq("status", "active"),
    ]);

    const attributions = (attributionsRes.data ?? []) as AttributionRow[];
    const summary: AttributionSummary = {
      total: attributions.length,
      active: attributions.filter((a) => a.status === "active").length,
      by_source: attributions.reduce<Record<string, number>>((acc, a) => {
        acc[a.source] = (acc[a.source] ?? 0) + 1;
        return acc;
      }, {}),
    };

    return {
      kind: "ok",
      reseller: reseller as Reseller,
      promotion_codes: (codesRes.data ?? []) as PromotionCode[],
      commissions: (commissionsRes.data ?? []) as CommissionRow[],
      attributions_summary: summary,
      admin_count: adminsRes.count ?? 0,
    };
  } catch {
    return { kind: "not_configured" };
  }
}

function centsToAud(cents: number): string {
  return `A$${(cents / 100).toFixed(2)}`;
}

export default async function AdminResellerDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normaliseResellerCode(rawCode);
  if (!code) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/admin/resellers/${rawCode}`);
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const result = await loadDetail(code);

  if (result.kind === "not_configured") {
    return (
      <div className="min-h-screen bg-surface-50">
        <div className="mx-auto max-w-3xl p-6">
          <a href="/admin/resellers" className="text-sm text-brand-700 hover:underline">
            ← All resellers
          </a>
          <div className="mt-6 rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">
              Reseller module tables not applied yet. Run migrations 0091 + 0092 first.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (result.kind === "not_found") notFound();

  const { reseller, promotion_codes, commissions, attributions_summary, admin_count } = result;

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-5xl p-6">
        <nav className="mb-4 text-sm">
          <a href="/admin/resellers" className="text-brand-700 hover:underline">
            ← All resellers
          </a>
        </nav>

        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">{reseller.display_name}</h1>
            <p className="mt-1 font-mono text-xs text-ink-500">{reseller.code}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                reseller.billing_model === "wholesale"
                  ? "bg-purple-50 text-purple-800"
                  : "bg-blue-50 text-blue-800"
              }`}
            >
              {reseller.billing_model}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                reseller.status === "active"
                  ? "bg-emerald-50 text-emerald-800"
                  : reseller.status === "paused"
                    ? "bg-yellow-50 text-yellow-800"
                    : "bg-red-50 text-red-800"
              }`}
            >
              {reseller.status}
            </span>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-ink-500">Attributions</div>
            <div className="mt-1 text-2xl font-semibold text-ink-900">
              {attributions_summary.total}
            </div>
            <div className="mt-1 text-xs text-ink-600">
              {attributions_summary.active} active ·{" "}
              {Object.entries(attributions_summary.by_source)
                .map(([k, v]) => `${v} ${k}`)
                .join(" · ") || "—"}
            </div>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-ink-500">Monthly budget</div>
            <div className="mt-1 text-2xl font-semibold text-ink-900">
              {reseller.monthly_credit_budget.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-ink-600">
              customer · {reseller.monthly_sandbox_credits.toLocaleString()} sandbox
            </div>
          </div>
          <div className="rounded-lg border border-surface-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-ink-500">Commission share</div>
            <div className="mt-1 text-2xl font-semibold text-ink-900">
              {Number(reseller.commission_share_pct).toFixed(2)}%
            </div>
            <div className="mt-1 text-xs text-ink-600">{admin_count} admin{admin_count === 1 ? "" : "s"}</div>
          </div>
        </section>

        <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Edit</h2>
          <ResellerEditClient
            code={reseller.code}
            initial={{
              display_name: reseller.display_name,
              billing_model: reseller.billing_model,
              status: reseller.status,
              gst_registered: reseller.gst_registered,
              abn: reseller.abn ?? "",
              monthly_credit_budget: reseller.monthly_credit_budget,
              monthly_sandbox_credits: reseller.monthly_sandbox_credits,
              commission_share_pct: Number(reseller.commission_share_pct),
              can_create_startups: reseller.can_create_startups,
              can_grant_credits: reseller.can_grant_credits,
              contact_email: reseller.contact_email ?? "",
              primary_color: reseller.primary_color ?? "",
              logo_url: reseller.logo_url ?? "",
              notes: reseller.notes ?? "",
            }}
          />
        </section>

        <section className="mb-6 rounded-lg border border-surface-200 bg-white">
          <div className="border-b border-surface-100 p-3">
            <h2 className="text-sm font-semibold text-ink-900">Promotion codes</h2>
          </div>
          {promotion_codes.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">
              No promotion codes yet. Tier-0 attribution code auto-created on first checkout.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Tier</th>
                  <th className="p-3">Stripe coupon</th>
                  <th className="p-3">Active</th>
                  <th className="p-3">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {promotion_codes.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-mono">{c.code}</td>
                    <td className="p-3">{c.tier_pct}%</td>
                    <td className="p-3 font-mono text-xs text-ink-600">
                      {c.stripe_coupon_id ?? "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          c.active ? "bg-emerald-50 text-emerald-800" : "bg-surface-100 text-ink-600"
                        }`}
                      >
                        {c.active ? "yes" : "no"}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(c.created_at).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-lg border border-surface-200 bg-white">
          <div className="border-b border-surface-100 p-3">
            <h2 className="text-sm font-semibold text-ink-900">
              Recent commissions (last {commissions.length})
            </h2>
          </div>
          {commissions.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">No commission rows yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">List</th>
                  <th className="p-3">Discount</th>
                  <th className="p-3">Commission</th>
                  <th className="p-3">Net owed</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {commissions.map((c) => (
                  <tr key={c.commission_id}>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(c.created_at).toISOString().slice(0, 10)}
                    </td>
                    <td className="p-3 font-mono text-xs text-ink-600">
                      {c.stripe_invoice_id.slice(0, 12)}…
                    </td>
                    <td className="p-3">{centsToAud(c.list_price_aud_cents)}</td>
                    <td className="p-3">{c.discount_pct}%</td>
                    <td className="p-3">{centsToAud(c.commission_aud_cents)}</td>
                    <td className="p-3">{centsToAud(c.net_owed_cents)}</td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          c.status === "cleared"
                            ? "bg-emerald-50 text-emerald-800"
                            : c.status === "clawed_back"
                              ? "bg-red-50 text-red-800"
                              : c.status === "dispute_open"
                                ? "bg-yellow-50 text-yellow-800"
                                : "bg-surface-100 text-ink-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
