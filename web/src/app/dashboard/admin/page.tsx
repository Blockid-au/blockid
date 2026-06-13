import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRateLimitSnapshot } from "@/lib/rate-limit";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "Admin — Rate Limit Dashboard — BlockID",
};

export const dynamic = "force-dynamic";

function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.ceil((ms % 60_000) / 1000);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function parseKey(raw: string) {
  // format: rl:<route>:<identity>
  const parts = raw.replace(/^rl:/, "").split(":");
  if (parts.length >= 2) {
    const identity = parts.slice(1).join(":");
    return { route: parts[0], identity };
  }
  return { route: raw, identity: "-" };
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin");
  if (user.role !== "admin") redirect("/dashboard");

  const entries = getRateLimitSnapshot();
  const generatedAt = new Date().toISOString();

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Rate Limit Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">
            Live in-memory rate-limit state · {entries.length} active entries ·{" "}
            <span className="font-mono">{generatedAt}</span>
          </p>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-6 py-12 text-center text-ink-400">
            No active rate-limit entries.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-surface-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-4 py-3 text-left font-semibold text-ink-600">Route</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-600">Identity</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink-600">Count</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink-600">Resets in</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink-600">Resets at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {entries.map((e) => {
                  const { route, identity } = parseKey(e.key);
                  const isHigh = e.count >= 10;
                  return (
                    <tr key={e.key} className={isHigh ? "bg-amber-50" : "bg-white"}>
                      <td className="px-4 py-3 font-mono text-xs text-brand-700">{route}</td>
                      <td className="px-4 py-3 text-ink-700 max-w-[260px] truncate" title={identity}>
                        {identity}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${isHigh ? "text-amber-700" : "text-ink-900"}`}>
                        {e.count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-500">
                        {fmtMs(e.resetInMs)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-ink-400">
                        {new Date(e.resetAt).toISOString().substring(11, 19)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-ink-400">
          Refresh the page to see latest state. High-count rows (≥10) are highlighted in amber.
          In Redis mode, live data is not available here.
        </p>
      </div>
    </WorkspaceLayout>
  );
}
