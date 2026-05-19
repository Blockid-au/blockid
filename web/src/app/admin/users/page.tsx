import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/users");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const supabase = getSupabaseAdmin();
  let users: Array<{ id: string; email: string; display_name: string | null; role: string; plan: string | null; created_at: string; last_login_at: string | null }> = [];

  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("id, email, display_name, role, plan, created_at, last_login_at")
      .order("created_at", { ascending: false });
    users = (data ?? []) as typeof users;
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center gap-4 max-w-6xl mx-auto">
        <Link href="/admin" className="text-ink-700 hover:text-ink-800 transition-colors">
          <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
        </Link>
        <Logo variant="dark" />
        <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">ADMIN</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Users strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          <h1 className="text-xl font-bold text-ink-800">All Users ({users.length})</h1>
        </div>

        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-100">
                  <th className="text-left px-6 py-3 text-xs text-ink-700 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Last Login</th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-surface-200/40 hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-3 text-ink-600 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-ink-600 text-xs">{u.display_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${u.role === "admin" ? "bg-red-100 text-red-700" : "bg-surface-100 text-ink-700"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${u.plan === "founding50" ? "bg-brand-100 text-brand-700" : u.plan === "pro" ? "bg-green-100 text-green-700" : "bg-surface-100 text-ink-700"}`}>
                        {u.plan ?? "free"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-700 text-xs">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("en-AU") : "Never"}
                    </td>
                    <td className="px-4 py-3 text-ink-700 text-xs">{new Date(u.created_at).toLocaleDateString("en-AU")}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-ink-600">No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
