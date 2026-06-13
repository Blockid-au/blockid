import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "Data Room — Investor Access — BlockID",
};

export const dynamic = "force-dynamic";

interface AccessEntry {
  id: string;
  score_id: string;
  accessed_at: string;
  user_agent: string | null;
  ip_hash: string | null;
}

interface ShareLink {
  scoreId: string;
  url: string;
  totalViews: number;
  uniqueViewers: number;
  lastAccessed: string | null;
  accesses: AccessEntry[];
}

async function getDataRoomData(userEmail: string): Promise<ShareLink[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin()!;

  // Get SVI analyses for this user to get their score IDs
  const { data: analyses } = await supabase
    .from("svi_analyses")
    .select("id, company_name, created_at")
    .eq("email", userEmail)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!analyses || analyses.length === 0) return [];

  const scoreIds = analyses.map((a) => a.id as string);

  // Fetch investor_access_log for these score IDs
  const { data: accessLogs } = await supabase
    .from("investor_access_log")
    .select("id, score_id, accessed_at, user_agent, ip_hash")
    .in("score_id", scoreIds)
    .order("accessed_at", { ascending: false });

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au").replace(/\/$/, "");

  return analyses.map((analysis) => {
    const scoreId = analysis.id as string;
    const logs = (accessLogs ?? []).filter((l) => l.score_id === scoreId) as AccessEntry[];
    const uniqueHashes = new Set(logs.map((l) => l.ip_hash).filter(Boolean));
    const lastAccessed = logs[0]?.accessed_at ?? null;

    return {
      scoreId,
      url: `${siteUrl}/s/${scoreId}`,
      totalViews: logs.length,
      uniqueViewers: uniqueHashes.size,
      lastAccessed,
      accesses: logs.slice(0, 5),
    };
  });
}

export default async function DataRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/data-room");

  const links = await getDataRoomData(user.email);

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Data Room</h1>
          <p className="text-sm text-ink-500 mt-1">Track who viewed your shared score links and when</p>
        </div>

        {links.length === 0 ? (
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-6 py-12 text-center">
            <p className="text-ink-500 text-sm">No shared score links yet.</p>
            <p className="text-ink-400 text-xs mt-1">
              Run an SVI analysis and share the link with investors to track views here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {links.map((link) => (
              <div key={link.scoreId} className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-surface-100 bg-surface-50 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-ink-500 truncate">{link.url}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right flex-shrink-0">
                    <div>
                      <p className="text-xl font-bold text-ink-900 tabular-nums">{link.totalViews}</p>
                      <p className="text-[10px] text-ink-400">views</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-ink-900 tabular-nums">{link.uniqueViewers}</p>
                      <p className="text-[10px] text-ink-400">unique</p>
                    </div>
                  </div>
                </div>

                {link.accesses.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-100">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Accessed</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">IP Hash</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500 hidden sm:table-cell">User Agent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {link.accesses.map((a) => (
                        <tr key={a.id} className="hover:bg-surface-50">
                          <td className="px-4 py-2.5 text-xs text-ink-600 font-mono whitespace-nowrap">
                            {new Date(a.accessed_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-ink-400 font-mono">
                            {a.ip_hash ? a.ip_hash.slice(0, 12) + "…" : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-ink-400 truncate max-w-[200px] hidden sm:table-cell">
                            {a.user_agent ? a.user_agent.slice(0, 60) + (a.user_agent.length > 60 ? "…" : "") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="px-5 py-4 text-xs text-ink-400">No views yet — share this link with investors.</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
