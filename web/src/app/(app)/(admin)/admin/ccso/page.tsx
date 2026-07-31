"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Star, TrendingUp, Users, ThumbsUp, ThumbsDown, Minus, CheckCircle, XCircle } from "lucide-react";

interface NpsResponse {
  id: string;
  user_email: string;
  score: number;
  comment: string;
  context: string;
  created_at: string;
}

interface Testimonial {
  id: string;
  user_email: string;
  text: string;
  name: string;
  company: string;
  public: boolean;
  approved: boolean;
  created_at: string;
}

type Tab = "nps" | "testimonials";

function npsCategory(score: number): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

function ScoreBadge({ score }: { score: number }) {
  const cat = npsCategory(score);
  const styles = {
    promoter: "bg-green-100 text-green-700",
    passive: "bg-yellow-100 text-yellow-700",
    detractor: "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${styles[cat]}`}>
      {score}
    </span>
  );
}

export default function CcsoPage() {
  const [tab, setTab] = React.useState<Tab>("nps");

  // NPS state
  const [responses, setResponses] = React.useState<NpsResponse[]>([]);
  const [npsLoading, setNpsLoading] = React.useState(false);
  const [npsError, setNpsError] = React.useState("");

  // Testimonial state
  const [testimonials, setTestimonials] = React.useState<Testimonial[]>([]);
  const [tLoading, setTLoading] = React.useState(false);
  const [tError, setTError] = React.useState("");
  const [approvingId, setApprovingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (tab === "nps" && responses.length === 0 && !npsLoading) {
      setNpsLoading(true);
      fetch("/api/nps")
        .then((r) => r.json())
        .then((d) => setResponses(d.responses ?? []))
        .catch(() => setNpsError("Failed to load NPS data"))
        .finally(() => setNpsLoading(false));
    }
    if (tab === "testimonials" && testimonials.length === 0 && !tLoading) {
      setTLoading(true);
      fetch("/api/testimonial")
        .then((r) => r.json())
        .then((d) => setTestimonials(d.testimonials ?? []))
        .catch(() => setTError("Failed to load testimonials"))
        .finally(() => setTLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // NPS metrics
  const total = responses.length;
  const promoters = responses.filter((r) => r.score >= 9).length;
  const passives = responses.filter((r) => r.score >= 7 && r.score <= 8).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : null;
  const avgScore = total > 0 ? (responses.reduce((s, r) => s + r.score, 0) / total).toFixed(1) : null;

  async function toggleApprove(t: Testimonial) {
    setApprovingId(t.id);
    try {
      await fetch("/api/testimonial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, approved: !t.approved }),
      });
      setTestimonials((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, approved: !x.approved } : x))
      );
    } catch { /* ignore */ }
    setApprovingId(null);
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center gap-4 max-w-6xl mx-auto">
        <Link href="/admin" className="text-ink-700 hover:text-ink-800 transition-colors">
          <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
        </Link>
        <span className="font-semibold text-ink-800">CCSO — Voice of Customer</span>
        <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">ADMIN</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-surface-200">
          {(["nps", "testimonials"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize",
                tab === t
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:text-ink-700",
              ].join(" ")}
            >
              {t === "nps" ? "NPS" : "Testimonials"}
            </button>
          ))}
        </div>

        {/* NPS Tab */}
        {tab === "nps" && (
          <>
            {npsLoading && <p className="text-sm text-ink-500">Loading NPS data…</p>}
            {npsError && <p className="text-sm text-red-600">{npsError}</p>}

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-ink-500 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> NPS Score</span>
                <span className={`text-3xl font-bold ${npsScore === null ? "text-ink-400" : npsScore >= 50 ? "text-green-600" : npsScore >= 0 ? "text-yellow-600" : "text-red-600"}`}>
                  {npsScore === null ? "—" : npsScore > 0 ? `+${npsScore}` : npsScore}
                </span>
              </div>
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-ink-500 flex items-center gap-1"><Star className="h-3 w-3" /> Avg Score</span>
                <span className="text-3xl font-bold text-ink-800">{avgScore ?? "—"}</span>
              </div>
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-green-600 flex items-center gap-1"><ThumbsUp className="h-3 w-3" /> Promoters</span>
                <span className="text-3xl font-bold text-green-700">{promoters}</span>
                <span className="text-xs text-ink-400">{total > 0 ? `${Math.round((promoters / total) * 100)}%` : ""}</span>
              </div>
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-yellow-600 flex items-center gap-1"><Minus className="h-3 w-3" /> Passives</span>
                <span className="text-3xl font-bold text-yellow-700">{passives}</span>
                <span className="text-xs text-ink-400">{total > 0 ? `${Math.round((passives / total) * 100)}%` : ""}</span>
              </div>
              <div className="rounded-2xl bg-white border border-surface-200 shadow-sm p-4 flex flex-col gap-1">
                <span className="text-xs text-red-600 flex items-center gap-1"><ThumbsDown className="h-3 w-3" /> Detractors</span>
                <span className="text-3xl font-bold text-red-700">{detractors}</span>
                <span className="text-xs text-ink-400">{total > 0 ? `${Math.round((detractors / total) * 100)}%` : ""}</span>
              </div>
            </div>

            {/* NPS Formula explainer */}
            {total > 0 && (
              <p className="text-xs text-ink-500">
                NPS = ((Promoters − Detractors) / Total) × 100 = (({promoters} − {detractors}) / {total}) × 100 = <strong>{npsScore! > 0 ? `+${npsScore}` : npsScore}</strong>
              </p>
            )}

            {/* Responses table */}
            <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-200 flex items-center gap-2">
                <Users className="h-4 w-4 text-ink-500" />
                <span className="text-sm font-medium">Recent Responses ({total})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs text-ink-500 font-medium">Score</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Email</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Comment</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Context</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responses.length === 0 && !npsLoading && (
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-sm text-ink-400">No responses yet.</td>
                      </tr>
                    )}
                    {responses.map((r) => (
                      <tr key={r.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3"><ScoreBadge score={r.score} /></td>
                        <td className="px-4 py-3 text-ink-700 text-xs">{r.user_email}</td>
                        <td className="px-4 py-3 text-ink-600 max-w-xs truncate">{r.comment || <span className="text-ink-300 italic">—</span>}</td>
                        <td className="px-4 py-3 text-ink-400 text-xs">{r.context || "—"}</td>
                        <td className="px-4 py-3 text-ink-400 text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Testimonials Tab */}
        {tab === "testimonials" && (
          <>
            {tLoading && <p className="text-sm text-ink-500">Loading testimonials…</p>}
            {tError && <p className="text-sm text-red-600">{tError}</p>}

            <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-200 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-ink-500" />
                <span className="text-sm font-medium">All Testimonials ({testimonials.length})</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200 bg-surface-50">
                      <th className="text-left px-5 py-3 text-xs text-ink-500 font-medium">Text</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Name</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Company</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Public</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Approved</th>
                      <th className="text-left px-4 py-3 text-xs text-ink-500 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testimonials.length === 0 && !tLoading && (
                      <tr>
                        <td colSpan={6} className="px-5 py-6 text-center text-sm text-ink-400">No testimonials yet.</td>
                      </tr>
                    )}
                    {testimonials.map((t) => (
                      <tr key={t.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                        <td className="px-5 py-3 max-w-sm">
                          <p className="text-ink-700 line-clamp-2 text-xs leading-relaxed">{t.text}</p>
                        </td>
                        <td className="px-4 py-3 text-ink-600 text-xs whitespace-nowrap">{t.name || <span className="text-ink-300 italic">—</span>}</td>
                        <td className="px-4 py-3 text-ink-600 text-xs whitespace-nowrap">{t.company || <span className="text-ink-300 italic">—</span>}</td>
                        <td className="px-4 py-3">
                          {t.public
                            ? <CheckCircle className="h-4 w-4 text-green-500" />
                            : <XCircle className="h-4 w-4 text-gray-300" />}
                        </td>
                        <td className="px-4 py-3">
                          {t.approved
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5"><CheckCircle className="h-3 w-3" /> Yes</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5"><XCircle className="h-3 w-3" /> No</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleApprove(t)}
                            disabled={approvingId === t.id}
                            className={[
                              "text-xs rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50",
                              t.approved
                                ? "bg-gray-100 hover:bg-gray-200 text-gray-700"
                                : "bg-green-600 hover:bg-green-700 text-white",
                            ].join(" ")}
                          >
                            {approvingId === t.id ? "…" : t.approved ? "Revoke" : "Approve"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
