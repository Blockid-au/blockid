// /admin/users/[id] — Admin detail page for a single app_users row.
//
// Server component, requireAdmin gate. Loads:
//   - the full app_users row (minus password_hash and other secrets)
//   - credit_balances (balance + lifetime totals)
//   - recent credit_transactions (last 20)
//   - recent sessions (last 5, ip_hash truncated to 8 chars)
//   - attribution reseller name if attribution_reseller_id is set
//
// Actions (Add credits, Change role, Delete) live in the client component
// user-actions-client.tsx which POSTs to /api/admin/users/[id]/**.

import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { UserActionsClient } from "./user-actions-client";

export const dynamic = "force-dynamic";

interface UserFull {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  plan: string | null;
  segment: string | null;
  account_type: string | null;
  jurisdiction: string | null;
  google_id: string | null;
  avatar_url: string | null;
  stripe_customer_id: string | null;
  discount_pct: number | null;
  startup_name: string | null;
  startup_stage: string | null;
  industry: string | null;
  startup_goals: string[] | null;
  onboarding_completed: boolean | null;
  onboarding_completed_at: string | null;
  referral_code: string | null;
  referred_by: string | null;
  referral_credits_earned: number | null;
  attribution_reseller_id: string | null;
  verified_at: string | null;
  created_at: string;
  last_login_at: string | null;
}

interface BalanceRow {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: string;
}

interface TransactionRow {
  id?: number;
  amount: number;
  balance_after: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface SessionRow {
  token: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  ip_hash: string | null;
  user_agent: string | null;
}

interface ResellerLite {
  id: string;
  code: string;
  display_name: string;
}

async function loadDetail(id: string): Promise<
  | { kind: "not_configured" }
  | { kind: "not_found" }
  | {
      kind: "ok";
      user: UserFull;
      balance: BalanceRow | null;
      transactions: TransactionRow[];
      sessions: SessionRow[];
      reseller: ResellerLite | null;
    }
> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { kind: "not_configured" };

  try {
    const { data: user } = await supabase
      .from("app_users")
      .select(
        [
          "id",
          "email",
          "display_name",
          "role",
          "plan",
          "segment",
          "account_type",
          "jurisdiction",
          "google_id",
          "avatar_url",
          "stripe_customer_id",
          "discount_pct",
          "startup_name",
          "startup_stage",
          "industry",
          "startup_goals",
          "onboarding_completed",
          "onboarding_completed_at",
          "referral_code",
          "referred_by",
          "referral_credits_earned",
          "attribution_reseller_id",
          "verified_at",
          "created_at",
          "last_login_at",
        ].join(", "),
      )
      .eq("id", id)
      .maybeSingle();

    if (!user) return { kind: "not_found" };

    const typedUser = user as unknown as UserFull;

    const [balRes, txRes, sessRes, resellerRes] = await Promise.all([
      supabase
        .from("credit_balances")
        .select("balance, lifetime_earned, lifetime_spent, updated_at")
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("id, amount, balance_after, reason, metadata, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("sessions")
        .select("token, created_at, last_used_at, expires_at, ip_hash, user_agent")
        .eq("user_id", id)
        .order("last_used_at", { ascending: false })
        .limit(5),
      typedUser.attribution_reseller_id
        ? supabase
            .from("resellers")
            .select("id, code, display_name")
            .eq("id", typedUser.attribution_reseller_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      kind: "ok",
      user: typedUser,
      balance: (balRes.data as BalanceRow | null) ?? null,
      transactions: (txRes.data ?? []) as TransactionRow[],
      sessions: (sessRes.data ?? []) as SessionRow[],
      reseller: (resellerRes.data as ResellerLite | null) ?? null,
    };
  } catch {
    return { kind: "not_configured" };
  }
}

function truncate(v: string | null, n: number): string {
  if (!v) return "—";
  return v.length > n ? `${v.slice(0, n)}…` : v;
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  if (!currentUser) redirect(`/auth/login?next=/admin/users/${id}`);
  if (!isAdmin(currentUser)) redirect("/dashboard/svi");

  const result = await loadDetail(id);

  if (result.kind === "not_configured") {
    return (
      <div className="min-h-screen bg-surface-50">
        <div className="mx-auto max-w-3xl p-6">
          <a href="/admin/users" className="text-sm text-brand-700 hover:underline">
            ← All users
          </a>
          <div className="mt-6 rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">Supabase admin client not configured.</p>
          </div>
        </div>
      </div>
    );
  }

  if (result.kind === "not_found") notFound();

  const { user, balance, transactions, sessions, reseller } = result;
  const isSelf = currentUser.id === user.id;

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-5xl p-6">
        <nav className="mb-4 text-sm">
          <a href="/admin/users" className="text-brand-700 hover:underline">
            ← All users
          </a>
        </nav>

        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">
              {user.display_name ?? user.email}
            </h1>
            <p className="mt-1 font-mono text-xs text-ink-500">{user.email}</p>
            <p className="mt-0.5 font-mono text-[10px] text-ink-400">{user.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                user.role === "admin"
                  ? "bg-red-50 text-red-800"
                  : "bg-surface-100 text-ink-700"
              }`}
            >
              {user.role ?? "user"}
            </span>
            <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
              {user.plan ?? "free"}
            </span>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            label="Credit balance"
            value={balance ? Number(balance.balance).toFixed(2) : "0.00"}
            hint={
              balance
                ? `${Number(balance.lifetime_earned).toFixed(2)} earned · ${Number(
                    balance.lifetime_spent,
                  ).toFixed(2)} spent`
                : "no balance row"
            }
          />
          <StatCard
            label="Sessions"
            value={String(sessions.length)}
            hint={
              sessions[0]
                ? `last seen ${new Date(sessions[0].last_used_at).toISOString().slice(0, 10)}`
                : "no active sessions"
            }
          />
          <StatCard
            label="Attribution"
            value={reseller?.display_name ?? "—"}
            hint={reseller ? `code ${reseller.code}` : "no reseller"}
          />
        </section>

        <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Actions</h2>
          {isSelf ? (
            <p className="text-xs text-ink-600">
              You cannot mutate your own admin account here — use another admin
              user or the DB.
            </p>
          ) : (
            <UserActionsClient
              userId={user.id}
              email={user.email}
              currentRole={(user.role ?? "user") as "user" | "admin"}
            />
          )}
        </section>

        <section className="mb-6 grid gap-6 md:grid-cols-2">
          <Card title="Identity">
            <Field label="Display name" value={user.display_name ?? "—"} />
            <Field label="Email" value={user.email} mono />
            <Field label="Role" value={user.role ?? "user"} />
            <Field label="Plan" value={user.plan ?? "free"} />
            <Field label="Segment" value={user.segment ?? "—"} />
            <Field label="Account type" value={user.account_type ?? "—"} />
            <Field label="Jurisdiction" value={user.jurisdiction ?? "—"} />
            <Field
              label="Verified at"
              value={user.verified_at ? new Date(user.verified_at).toISOString().slice(0, 10) : "—"}
            />
            <Field label="Google ID" value={truncate(user.google_id, 20)} mono />
            <Field label="Avatar URL" value={truncate(user.avatar_url, 40)} mono />
          </Card>
          <Card title="Startup & billing">
            <Field label="Startup name" value={user.startup_name ?? "—"} />
            <Field label="Startup stage" value={user.startup_stage ?? "—"} />
            <Field label="Industry" value={user.industry ?? "—"} />
            <Field
              label="Startup goals"
              value={
                user.startup_goals && user.startup_goals.length > 0
                  ? user.startup_goals.join(", ")
                  : "—"
              }
            />
            <Field
              label="Onboarding"
              value={
                user.onboarding_completed
                  ? `✓ ${
                      user.onboarding_completed_at
                        ? new Date(user.onboarding_completed_at).toISOString().slice(0, 10)
                        : "yes"
                    }`
                  : "— pending"
              }
            />
            <Field
              label="Stripe customer"
              value={truncate(user.stripe_customer_id, 24)}
              mono
            />
            <Field
              label="Discount %"
              value={user.discount_pct != null ? `${user.discount_pct}%` : "—"}
            />
            <Field label="Referral code" value={user.referral_code ?? "—"} mono />
            <Field label="Referred by" value={truncate(user.referred_by, 24)} mono />
            <Field
              label="Referral credits"
              value={String(user.referral_credits_earned ?? 0)}
            />
          </Card>
        </section>

        {reseller && (
          <section className="mb-6 rounded-lg border border-purple-200 bg-purple-50/40 p-4">
            <h2 className="mb-2 text-sm font-semibold text-purple-900">
              Attributed to reseller
            </h2>
            <p className="text-sm text-ink-800">
              <a
                href={`/admin/resellers/${reseller.code.toLowerCase()}`}
                className="font-medium text-purple-800 underline"
              >
                {reseller.display_name}
              </a>{" "}
              <span className="font-mono text-xs text-ink-600">({reseller.code})</span>
            </p>
          </section>
        )}

        <section className="mb-6 rounded-lg border border-surface-200 bg-white">
          <div className="border-b border-surface-100 p-3">
            <h2 className="text-sm font-semibold text-ink-900">
              Recent credit transactions (last {transactions.length})
            </h2>
          </div>
          {transactions.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">No transactions yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Balance after</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {transactions.map((t, i) => (
                  <tr key={t.id ?? `${t.created_at}-${i}`}>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(t.created_at).toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td
                      className={`p-3 text-sm font-medium ${
                        t.amount >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {t.amount >= 0 ? "+" : ""}
                      {Number(t.amount).toFixed(2)}
                    </td>
                    <td className="p-3 text-xs text-ink-700">
                      {Number(t.balance_after).toFixed(2)}
                    </td>
                    <td className="p-3 text-xs text-ink-600">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-lg border border-surface-200 bg-white">
          <div className="border-b border-surface-100 p-3">
            <h2 className="text-sm font-semibold text-ink-900">
              Recent sessions (last {sessions.length})
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              IP is stored as a hash — only the first 8 chars are shown.
            </p>
          </div>
          {sessions.length === 0 ? (
            <div className="p-4 text-sm text-ink-500">No sessions on file.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">Created</th>
                  <th className="p-3">Last used</th>
                  <th className="p-3">Expires</th>
                  <th className="p-3">IP (hash)</th>
                  <th className="p-3">User agent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {sessions.map((s) => (
                  <tr key={s.token}>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(s.created_at).toISOString().slice(0, 10)}
                    </td>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(s.last_used_at).toISOString().slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="p-3 text-xs text-ink-600">
                      {new Date(s.expires_at).toISOString().slice(0, 10)}
                    </td>
                    <td className="p-3 font-mono text-xs text-ink-500">
                      {s.ip_hash ? `${s.ip_hash.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="p-3 text-xs text-ink-600">{truncate(s.user_agent, 60)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="mt-6 text-xs text-ink-500">
          Created {new Date(user.created_at).toISOString().slice(0, 10)}
          {user.last_login_at
            ? ` · last login ${new Date(user.last_login_at).toISOString().slice(0, 10)}`
            : " · never logged in"}
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-600">{hint}</div>}
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

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-ink-500">
        {label}
      </span>
      <span className={mono ? "font-mono text-xs text-ink-700" : "text-ink-700"}>
        {value}
      </span>
    </div>
  );
}
