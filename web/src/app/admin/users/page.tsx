// /admin/users — Admin list of every app_users row.
//
// Mirror of /admin/resellers pattern (list → detail). requireAdmin gate.
// Server component, force-dynamic. Search (email prefix) + filter chips
// (all / admin / reseller / unverified) via URL params so the page can be
// bookmarked and re-entered with state preserved.
//
// Detail lives at /admin/users/[id]. Row-level actions (add credits, change
// role, delete) are on the detail page — this list is a directory.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";

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

const PAGE_SIZE = 50;

function parseFilter(v: string | undefined): Filter {
  return v === "admin" || v === "reseller" || v === "unverified" ? v : "all";
}

async function loadUsers(
  q: string,
  filter: Filter,
  offset: number,
): Promise<{ rows: UserRow[]; balances: Map<string, number>; total: number }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { rows: [], balances: new Map(), total: 0 };

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

    const { data, count } = await query;
    const rows = (data ?? []) as UserRow[];

    if (rows.length === 0) return { rows, balances: new Map(), total: count ?? 0 };

    const ids = rows.map((r) => r.id);
    const { data: balRows } = await supabase
      .from("credit_balances")
      .select("user_id, balance")
      .in("user_id", ids);
    const balances = new Map<string, number>(
      ((balRows ?? []) as BalanceRow[]).map((b) => [b.user_id, Number(b.balance)]),
    );

    return { rows, balances, total: count ?? rows.length };
  } catch {
    return { rows: [], balances: new Map(), total: 0 };
  }
}

interface SearchParams {
  q?: string;
  filter?: string;
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
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, balances, total } = await loadUsers(q, filter, offset);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const chipHref = (f: Filter) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (f !== "all") params.set("filter", f);
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
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Search
            </button>
            {q && (
              <a href={chipHref(filter)} className="text-xs text-ink-500 hover:underline">
                clear
              </a>
            )}
          </form>

          <div className="ml-auto flex items-center gap-2">
            {(["all", "admin", "reseller", "unverified"] as Filter[]).map((f) => (
              <a
                key={f}
                href={chipHref(f)}
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
                  <th className="p-3">Credits</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">Last login</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <a
                        href={`/admin/users/${r.id}`}
                        className="font-mono text-xs text-brand-700 hover:underline"
                      >
                        {r.email}
                      </a>
                    </td>
                    <td className="p-3 text-xs text-ink-700">{r.display_name ?? "—"}</td>
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
                    <td className="p-3 text-xs text-ink-600">{r.account_type ?? "—"}</td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-xs">
            {page > 1 ? (
              <a
                href={`/admin/users?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  ...(filter !== "all" ? { filter } : {}),
                  page: String(page - 1),
                }).toString()}`}
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
                href={`/admin/users?${new URLSearchParams({
                  ...(q ? { q } : {}),
                  ...(filter !== "all" ? { filter } : {}),
                  page: String(page + 1),
                }).toString()}`}
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
