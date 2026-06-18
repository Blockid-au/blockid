// /dashboard/admin/investor-verifications (T_SVI_EXC_0003) — admin queue
// of pending and approved investor accounts. Approve = stamp verified_at.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import VerifyButton from "./VerifyButton";

export const dynamic = "force-dynamic";

interface InvestorRow {
  id: string;
  email: string;
  display_name: string | null;
  investor_firm: string | null;
  investor_url: string | null;
  verified_at: string | null;
  created_at: string;
}

export default async function InvestorVerificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login?next=/dashboard/admin/investor-verifications");
  if (me.role !== "admin") redirect("/dashboard");

  const supabase = getSupabaseAdmin();
  const { data } = supabase
    ? await supabase
        .from("app_users")
        .select("id, email, display_name, investor_firm, investor_url, verified_at, created_at")
        .eq("account_type", "investor")
        .order("created_at", { ascending: false })
    : { data: [] };

  const rows = (data ?? []) as InvestorRow[];
  const pending = rows.filter((r) => !r.verified_at);
  const verified = rows.filter((r) => r.verified_at);

  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-700">Admin · v2.18 Beta</p>
        <h1 className="text-2xl font-bold mt-1">Investor verifications</h1>
        <p className="text-sm text-slate-600 mt-1">
          Approve investor accounts to unlock founder contact requests on startupvalueindex.com.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-semibold mb-3">Pending — {pending.length}</h2>
        <ul className="space-y-3">
          {pending.length === 0 && <li className="text-sm text-slate-500">No pending investor sign-ups.</li>}
          {pending.map((r) => (
            <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{r.display_name || r.email}</p>
                <p className="text-xs text-slate-600">{r.email}</p>
                {r.investor_firm && <p className="text-xs mt-1">Firm: <strong>{r.investor_firm}</strong></p>}
                {r.investor_url && (
                  <a href={r.investor_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:underline">
                    {r.investor_url}
                  </a>
                )}
                <p className="text-[10px] text-slate-500 mt-1">Signed up {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <VerifyButton userId={r.id} verified={false} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-3">Verified — {verified.length}</h2>
        <ul className="space-y-2">
          {verified.map((r) => (
            <li key={r.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between gap-3 text-sm">
              <div>
                <strong>{r.display_name || r.email}</strong>
                <span className="text-xs text-slate-600 ml-2">{r.investor_firm || ""}</span>
              </div>
              <VerifyButton userId={r.id} verified={true} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
