// /admin/users — Admin list of every app_users row.
//
// Mirror of /admin/resellers pattern (list → detail). requireAdmin gate.
// Server component, force-dynamic. Search (email prefix) + filter chips
// (all / admin / reseller / unverified) + account_type dropdown via URL
// params so the page can be bookmarked and re-entered with state preserved.
//
// Detail lives at /admin/users/[id]. Row-level actions (add credits, change
// role, delete) are on the detail page — this list is a directory.
//
// P12.3 (goal-file plan): account_type dropdown surfaces the P12.1 enum, and
// each row resolves attribution_reseller_id → resellers.display_name so admins
// can see WHICH reseller a user was attributed to without opening the detail.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ACCOUNT_TYPE_VALUES,
  accountTypeLabel,
  isAccountType,
  type AccountType,
} from "@/lib/segments";

export const dynamic = "force-dynamic";

type Filter = "all" | "admin" | "reseller" | "unverified";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
  plan: string | null;
  segment: string | null;
  account_type: string | null;
  attribution_reseller_id: string | null;
  created_at: string;
  last_login_at: string | null;
}

interface BalanceRow {
  user_id: string;
  balance: number;
}

interface ResellerRow {
  id: string;
  display_name: string;
}

const PAGE_SIZE = 50;

function parseFilter(v: string | undefined): Filter {
  return v === "admin" || v === "reseller" || v === "unverified" ? v : "all";
}

function parseAccountType(v: string | undefined): AccountType | null {
  return isAccountType(v) ? v : null;
}

async function loadUsers(
  q: string,
  filter: Filter,
  accountType: AccountType | null,
  offset: number,
): Promise<{
  rows: UserRow[];
  balances: Map<string, number>;
  resellers: Map<string, string>;
  total: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { rows: [], balances: new Map(), resellers: new Map(), total: 0 };
  }

  try {
    let query = supabase
      .from("app_users")
      .select(
        "id, email, display_name, role, plan, segment, account_type, attribution_reseller_id, created_at, last_login_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (q) query = query.ilike("email", `${q}%`);
    if (filter === "admin") query = query.eq("role", "admin");
    if (filter === "reseller") query = query.not("attribution_reseller_id", "is", null);
    if (filter === "unverified") query = query.is("last_login_at", null);
    if (accountType) query = query.eq("account_type", accountType);

    const { data, count } = await query;
    const rows = (data ?? []) as UserRow[];

    if (rows.length === 0) {
      return { rows, balances: new Map(), resellers: new Map(), total: count ?? 0 };
    }

    const ids = rows.map((r) => r.id);
    const { data: balRows } = await supabase
      .from("credit_balances")
      .select("user_id, balance")
      .in("user_id", ids);
    const balances = new Map<string, number>(
      ((balRows ?? []) as BalanceRow[]).map((b) => [b.user_id, Number(b.balance)]),
    );

    const resellerIds = Array.from(
      new Set(
        rows
          .map((r) => r.attribution_reseller_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    );
    let resellers = new Map<string, string>();
    if (resellerIds.length > 0) {
      const { data: rsRows } = await supabase
        .from("resellers")
        .select("id, display_name")
        .in("id", resellerIds);
      resellers = new Map<string, string>(
        ((rsRows ?? []) as ResellerRow[]).map((r) => [r.id, r.display_name]),
      );
    }

    return { rows, balances, resellers, total: count ?? rows.length };
  } catch {
    return { rows: [], balances: new Map(), resellers: new Map(), total: 0 };
  }
}

interface SearchParams {
  q?: string;
  filter?: string;
  account_type?: string;
  page?: string;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/users");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filter = parseFilter(sp.filter);
  const accountType = parseAccountType(sp.account_type);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, balances, resellers, total } = await loadUsers(
    q,
    filter,
    accountType,
    offset,
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (over: {
    filter?: Filter;
    account_type?: AccountType | null;
    page?: number;
  } = {}) => {
    const nextFilter = over.filter ?? filter;
    const nextAccount =
      over.account_type === undefined ? accountType : over.account_type;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (nextFilter !== "all") params.set("filter", nextFilter);
    if (nextAccount) params.set("account_type", nextAccount);
    if (over.page && over.page > 1) params.set("page", String(over.page));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">Users</h1>
            <p className="mt-1 text-sm text-ink-600">
              Every app_users row. Click through for credits, role, and delete
              actions.
            </p>
          </div>
          <p className="text-xs text-ink-500">
            {total.toLocaleString()} total · page {page} / {totalPages}
          </p>
        </header>

        <section className="mb-4 flex flex-wrap items-center gap-3">
          <form method="GET" action="/admin/users" className="flex items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="email prefix…"
              className="w-64 rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm"
            />
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            {accountType && (
              <input type="hidden" name="account_type" value={accountType} />
            )}
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Search
            </button>
            {q && (
              <a
                href={buildHref()}
                className="text-xs text-ink-500 hover:underline"
              >
                clear
              </a>
            )}
          </form>

          <form
            method="GET"
            action="/admin/users"
            className="flex items-center gap-2 text-xs text-ink-600"
          >
            {q && <input type="hidden" name="q" value={q} />}
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <label htmlFor="account_type" className="text-ink-500">
              account
            </label>
            <select
              id="account_type"
              name="account_type"
              defaultValue={accountType ?? ""}
              className="rounded-md border border-surface-300 bg-white px-2 py-1.5 text-xs"
            >
              <option value="">any</option>
              {ACCOUNT_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {accountTypeLabel(v)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-white px-2 py-1 text-xs ring-1 ring-surface-200 hover:bg-surface-100"
            >
              apply
            </button>
            {accountType && (
              <a
                href={buildHref({ account_type: null })}
                className="text-xs text-ink-500 hover:underline"
              >
                clear
              </a>
            )}
          </form>

          <div className="ml-auto flex items-center gap-2">
            {(["all", "admin", "reseller", "unverified"] as Filter[]).map((f) => (
              <a
                key={f}
                href={buildHref({ filter: f })}
                className={`rounded-full px-3 py-1 text-xs ${
                  filter === f
                    ? "bg-brand-600 text-white"
                    : "bg-white text-ink-700 ring-1 ring-surface-200 hover:bg-surface-100"
                }`}
              >
                {f}
              </a>
            ))}
          </div>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-surface-300 bg-white p-8 text-center">
            <p className="text-sm text-ink-600">
              No users match {q ? `“${q}”` : "this filter"}.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="p-3">Email</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Segment</th>
                  <th className="p-3">Account</th>
                  <th className="p-3">Reseller</th>
                  <th className="p-3">Credits</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Last login</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((r) => {
                  const at = isAccountType(r.account_type) ? r.account_type : null;
                  const resellerName = r.attribution_reseller_id
                    ? resellers.get(r.attribution_reseller_id) ?? null
                    : null;
                  return (
                    <tr key={r.id}>
                      <td className="p-3">
                        <a
                          href={`/admin/users/${r.id}`}
                          className="font-mono text-xs text-brand-700 hover:underline"
                        >
                          {r.email}
                        </a>
                      </td>
                      <td className="p-3 text-xs text-ink-700">
                        {r.display_name ?? "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            r.role === "admin"
                              ? "bg-red-50 text-red-800"
                              : "bg-surface-100 text-ink-700"
                          }`}
                        >
                          {r.role ?? "user"}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-ink-700">{r.plan ?? "free"}</td>
                      <td className="p-3 text-xs text-ink-600">{r.segment ?? "—"}</td>
                      <td className="p-3 text-xs text-ink-600">
                        {at ? accountTypeLabel(at) : r.account_type ?? "—"}
                      </td>
                      <td className="p-3 text-xs text-ink-600">
                        {resellerName ?? (r.attribution_reseller_id ? "—" : "—")}
                      </td>
                      <td className="p-3 text-xs text-ink-700">
                        {(balances.get(r.id) ?? 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs text-ink-600">
                        {new Date(r.created_at).toISOString().slice(0, 10)}
                      </td>
                      <td className="p-3 text-xs text-ink-600">
                        {r.last_login_at
                          ? new Date(r.last_login_at).toISOString().slice(0, 10)
                          : "never"}
                      </td>
                      <td className="p-3">
                        <a
                          href={`/admin/users/${r.id}`}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          open →
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-xs">
            {page > 1 ? (
              <a
                href={buildHref({ page: page - 1 })}
                className="text-brand-700 hover:underline"
              >
                ← previous
              </a>
            ) : (
              <span className="text-ink-400">← previous</span>
            )}
            <span className="text-ink-500">
              page {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <a
                href={buildHref({ page: page + 1 })}
                className="text-brand-700 hover:underline"
              >
                next →
              </a>
            ) : (
              <span className="text-ink-400">next →</span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
