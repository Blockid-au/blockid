// /admin/resellers/[slug] — Detail page for a single reseller org.
//
// Per docs/plans/reseller-module-plan.md § C.5 admin approval flows +
// C.1 mirror of /admin/accelerator/[slug]. Read + activate/suspend/edit
// budget actions. slug = resellers.code (case-insensitive).

import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ResellerFull {
  id: string;
  code: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string | null;
  billing_model: string;
  status: string;
  gst_registered: boolean;
  abn: string | null;
  monthly_credit_budget: number;
  monthly_sandbox_credits: number;
  allowed_tiers: number[];
  can_create_startups: boolean;
  can_grant_credits: boolean;
  commission_share_pct: number;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface PromoCodeRow {
  id: string;
  code: string;
  tier_pct: number;
  active: boolean;
  stripe_promotion_code_id: string | null;
  created_at: string;
}

interface CountRow {
  count: number;
}

interface Params {
  slug: string;
}

async function loadReseller(slug: string): Promise<{
  reseller: ResellerFull | null;
  codes: PromoCodeRow[];
  attributionCount: number;
  adminCount: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { reseller: null, codes: [], attributionCount: 0, adminCount: 0 };

  try {
    const { data: reseller } = await supabase
      .from("resellers")
      .select("*")
      .ilike("code", slug)
      .maybeSingle();

    if (!reseller) return { reseller: null, codes: [], attributionCount: 0, adminCount: 0 };

    const [codesRes, attribRes, adminRes] = await Promise.all([
      supabase
        .from("reseller_promotion_codes")
        .select("id, code, tier_pct, active, stripe_promotion_code_id, created_at")
        .eq("reseller_id", reseller.id)
        .order("tier_pct", { ascending: true }),
      supabase
        .from("reseller_attributions")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", reseller.id)
        .eq("status", "active"),
      supabase
        .from("reseller_admins")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", reseller.id)
        .eq("status", "active"),
    ]);

    return {
      reseller: reseller as ResellerFull,
      codes: (codesRes.data ?? []) as PromoCodeRow[],
      attributionCount: (attribRes as unknown as CountRow).count ?? 0,
      adminCount: (adminRes as unknown as CountRow).count ?? 0,
    };
  } catch {
    return { reseller: null, codes: [], attributionCount: 0, adminCount: 0 };
  }
}

export default async function AdminResellerDetailPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/resellers");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const { reseller, codes, attributionCount, adminCount } = await loadReseller(slug);
  if (!reseller) notFound();

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
            <h1 className="text-2xl font-semibold text-ink-900">
              {reseller.display_name}
            </h1>
            <p className="font-mono text-sm text-ink-500">{reseller.code}</p>
          </div>
          <span
            className={`rounded px-3 py-1 text-sm ${
              reseller.status === "active"
                ? "bg-emerald-50 text-emerald-800"
                : reseller.status === "paused"
                  ? "bg-yellow-50 text-yellow-800"
                  : "bg-red-50 text-red-800"
            }`}
          >
            {reseller.status}
          </span>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Attributed customers" value={String(attributionCount)} />
          <StatCard label="Reseller admins" value={String(adminCount)} />
          <StatCard
            label="Promotion codes"
            value={`${codes.filter((c) => c.active).length} / ${codes.length}`}
          />
        </section>

        <section className="mb-6 grid gap-6 sm:grid-cols-2">
          <Card title="Identity">
            <Field label="Code" value={reseller.code} mono />
            <Field label="Display name" value={reseller.display_name} />
            <Field label="Logo URL" value={reseller.logo_url ?? "—"} mono />
            <Field
              label="Primary color"
              value={reseller.primary_color ?? "—"}
              swatch={reseller.primary_color}
            />
            <Field label="Contact" value={reseller.contact_email ?? "—"} mono />
          </Card>
          <Card title="Billing model">
            <Field
              label="Model"
              value={reseller.billing_model}
              badge={reseller.billing_model === "wholesale" ? "purple" : "blue"}
            />
            <Field label="Commission share" value={`${reseller.commission_share_pct}%`} />
            <Field
              label="GST registered"
              value={reseller.gst_registered ? "✓ yes" : "— no"}
            />
            <Field label="ABN" value={reseller.abn ?? "—"} mono />
            <Field
              label="Allowed tiers"
              value={reseller.allowed_tiers.join(", ") + "%"}
            />
          </Card>
        </section>

        <section className="mb-6">
          <Card title="Capabilities & budget">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Field
                  label="Can create startups"
                  value={reseller.can_create_startups ? "✓" : "—"}
                />
                <Field
                  label="Can grant credits"
                  value={reseller.can_grant_credits ? "✓" : "—"}
                />
              </div>
              <div>
                <Field
                  label="Monthly credit budget (customers)"
                  value={reseller.monthly_credit_budget.toLocaleString()}
                />
                <Field
                  label="Monthly sandbox credits"
                  value={reseller.monthly_sandbox_credits.toLocaleString()}
                />
              </div>
            </div>
          </Card>
        </section>

        {codes.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-lg font-semibold text-ink-900">Promotion codes</h2>
            <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Tier</th>
                    <th className="p-3">Stripe promo id</th>
                    <th className="p-3">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {codes.map((c) => (
                    <tr key={c.id}>
                      <td className="p-3 font-mono text-brand-700">{c.code}</td>
                      <td className="p-3">
                        {c.tier_pct === 0
                          ? <span className="text-xs">Attribution only</span>
                          : `${c.tier_pct}% off`}
                      </td>
                      <td className="p-3 font-mono text-xs text-ink-500">
                        {c.stripe_promotion_code_id ?? "—"}
                      </td>
                      <td className="p-3">{c.active ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {reseller.notes && (
          <section className="mb-6">
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-ink-700">{reseller.notes}</p>
            </Card>
          </section>
        )}

        <p className="text-xs text-ink-500">
          Created {new Date(reseller.created_at).toISOString().slice(0, 10)} · Updated{" "}
          {new Date(reseller.updated_at).toISOString().slice(0, 10)}
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink-900">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  badge,
  swatch,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: "purple" | "blue";
  swatch?: string | null;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-40 text-xs uppercase tracking-wide text-ink-500">{label}</span>
      {badge ? (
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            badge === "purple"
              ? "bg-purple-50 text-purple-800"
              : "bg-blue-50 text-blue-800"
          }`}
        >
          {value}
        </span>
      ) : swatch ? (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 rounded border border-surface-300"
            style={{ backgroundColor: swatch }}
          />
          <span className={mono ? "font-mono text-ink-700" : "text-ink-700"}>{value}</span>
        </span>
      ) : (
        <span className={mono ? "font-mono text-ink-700" : "text-ink-700"}>{value}</span>
      )}
    </div>
  );
}
