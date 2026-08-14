"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Competitor } from "@/lib/founder-features";

// Tech enrichment fields returned from the AI fill endpoint
interface AiSuggestion {
  name: string;
  website: string;
  category: string;
  positioning: string;
  pricing: string;
  strengths: string;
  weaknesses: string;
  our_edge: string;
  threat_level: "low" | "medium" | "high";
  techStack?: string[];
  websiteScore?: number;
  hasAnalytics?: boolean;
  hasPricing?: boolean;
  techSignals?: string[];
}

interface TechComparisonMeta {
  ownTechScore: number | null;
  avgCompetitorWebScore: number | null;
}

interface Props {
  initial: Competitor[];
  disabled: boolean;
}

const EMPTY_DRAFT = {
  name: "",
  website: "",
  category: "direct",
  positioning: "",
  pricing: "",
  strengths: "",
  weaknesses: "",
  our_edge: "",
  threat_level: "medium" as "low" | "medium" | "high",
};

const THREAT_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const CATEGORY_STYLE: Record<string, string> = {
  direct: "bg-brand-100 text-brand-700",
  indirect: "bg-slate-100 text-slate-700",
  substitute: "bg-purple-100 text-purple-700",
};

export function CompetitorsClient({ initial, disabled }: Props) {
  const [items, setItems] = useState<Competitor[]>(initial);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Competitor>>({});
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [techComparison, setTechComparison] = useState<TechComparisonMeta | null>(null);

  const input =
    "w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50";
  const label = "text-xs font-semibold text-ink-700 uppercase tracking-wider";

  async function aiSuggest() {
    setAiBusy(true);
    setError(null);
    setAiNote(null);
    setAiSuggestions([]);
    setTechComparison(null);
    try {
      const res = await fetch("/api/founder/competitors/ai-fill", { method: "POST" });
      const json = await res.json() as {
        ok: boolean;
        error?: string;
        suggestions?: AiSuggestion[];
        meta?: {
          note?: string;
          ownTechScore?: number | null;
          avgCompetitorWebScore?: number | null;
        };
      };
      if (!json.ok) throw new Error(json.error ?? "AI suggest failed");
      const suggestions = json.suggestions ?? [];
      if (suggestions.length > 0) {
        // Pre-fill the draft form with the first suggestion
        const s = suggestions[0];
        setDraft({
          name: s.name ?? "",
          website: s.website ?? "",
          category: s.category ?? "direct",
          positioning: s.positioning ?? "",
          pricing: s.pricing ?? "",
          strengths: s.strengths ?? "",
          weaknesses: s.weaknesses ?? "",
          our_edge: s.our_edge ?? "",
          threat_level: (s.threat_level as typeof EMPTY_DRAFT.threat_level) ?? "medium",
        });
        setAiNote(json.meta?.note ?? null);
        setAiSuggestions(suggestions);
      }
      // Store tech comparison data if available
      if (
        json.meta &&
        (json.meta.ownTechScore != null || json.meta.avgCompetitorWebScore != null)
      ) {
        setTechComparison({
          ownTechScore: json.meta.ownTechScore ?? null,
          avgCompetitorWebScore: json.meta.avgCompetitorWebScore ?? null,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI suggest failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function add() {
    if (!draft.name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/founder/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Add failed");
      setItems((xs) => [...xs, json.item as Competitor]);
      setDraft({ ...EMPTY_DRAFT });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this competitor?")) return;
    const res = await fetch(`/api/founder/competitors/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setItems((xs) => xs.filter((x) => x.id !== id));
    else setError(json.error ?? "Delete failed");
  }

  async function saveEdit(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/founder/competitors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      setItems((xs) => xs.map((x) => (x.id === id ? (json.item as Competitor) : x)));
      setEditingId(null);
      setEditDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Add form ────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Add competitor</h2>
          <Button
            size="xs"
            variant="ghost"
            onClick={aiSuggest}
            disabled={aiBusy || disabled}
            className="gap-1.5 text-brand-600 hover:text-brand-700"
          >
            {aiBusy ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            ) : (
              <span aria-hidden>✨</span>
            )}
            {aiBusy ? "Generating…" : "AI Suggest"}
          </Button>
        </div>
        {aiNote && (
          <p className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-xs text-brand-700">
            {aiNote}
          </p>
        )}

        {/* ── AI Suggestions with tech signals ──────────────────────────── */}
        {aiSuggestions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
              AI-suggested competitors — click to prefill form
            </p>
            {aiSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() =>
                  setDraft({
                    name: s.name ?? "",
                    website: s.website ?? "",
                    category: s.category ?? "direct",
                    positioning: s.positioning ?? "",
                    pricing: s.pricing ?? "",
                    strengths: s.strengths ?? "",
                    weaknesses: s.weaknesses ?? "",
                    our_edge: s.our_edge ?? "",
                    threat_level: s.threat_level ?? "medium",
                  })
                }
                className="w-full text-left rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.07)] px-4 py-3 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#E2E8F0]">{s.name}</span>
                  {typeof s.websiteScore === "number" && (
                    <span className="text-xs text-[#94A3B8] shrink-0">
                      Web score: <span className="text-[#00D4FF] font-medium">{s.websiteScore}/100</span>
                    </span>
                  )}
                </div>
                {s.positioning && (
                  <p className="text-xs text-[#94A3B8] mt-0.5 line-clamp-1">{s.positioning}</p>
                )}
                {/* Tech signal chips */}
                {s.techSignals && s.techSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.techSignals.map((chip, ci) => (
                      <span
                        key={ci}
                        className="bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[#94A3B8] rounded-full px-2 py-0.5 text-xs"
                      >
                        {chip}
                      </span>
                    ))}
                    {s.websiteScore !== undefined && s.websiteScore > 75 && (
                      <span className="bg-[rgba(0,212,255,0.08)] border border-[rgba(0,212,255,0.2)] text-[#00D4FF] rounded-full px-2 py-0.5 text-xs">
                        Strong web presence
                      </span>
                    )}
                    {s.hasPricing && (
                      <span className="bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.2)] text-amber-300 rounded-full px-2 py-0.5 text-xs">
                        Has pricing page
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Name *</label>
            <input
              className={input}
              value={draft.name}
              placeholder="e.g. Acme Corp"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Website</label>
            <input
              className={input}
              value={draft.website}
              placeholder="https://…"
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Category</label>
            <select
              className={input}
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              disabled={disabled}
            >
              <option value="direct">Direct</option>
              <option value="indirect">Indirect</option>
              <option value="substitute">Substitute</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className={label}>Their positioning</label>
            <input
              className={input}
              value={draft.positioning}
              placeholder="One-line pitch"
              onChange={(e) => setDraft({ ...draft, positioning: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Pricing</label>
            <input
              className={input}
              value={draft.pricing}
              placeholder="e.g. US$29/mo"
              onChange={(e) => setDraft({ ...draft, pricing: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Strengths</label>
            <textarea
              className={input}
              rows={2}
              value={draft.strengths}
              onChange={(e) => setDraft({ ...draft, strengths: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Weaknesses</label>
            <textarea
              className={input}
              rows={2}
              value={draft.weaknesses}
              onChange={(e) => setDraft({ ...draft, weaknesses: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Our edge</label>
            <textarea
              className={input}
              rows={2}
              value={draft.our_edge}
              onChange={(e) => setDraft({ ...draft, our_edge: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Threat level</label>
            <select
              className={input}
              value={draft.threat_level}
              onChange={(e) =>
                setDraft({ ...draft, threat_level: e.target.value as typeof draft.threat_level })
              }
              disabled={disabled}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <Button onClick={add} disabled={busy || disabled} className="ml-auto">
            {busy ? "Adding…" : "Add competitor"}
          </Button>
        </div>
      </section>

      {/* ── Tech Comparison summary ─────────────────────────────────────────── */}
      {techComparison && (
        <section className="rounded-2xl border border-[rgba(0,212,255,0.15)] bg-[rgba(0,212,255,0.04)] px-5 py-4 space-y-3">
          <h2 className="text-sm font-semibold text-[#00D4FF]">Tech Comparison</h2>
          <div className="flex flex-wrap gap-6 text-sm">
            {techComparison.ownTechScore != null ? (
              <div>
                <span className="text-[#94A3B8] text-xs uppercase tracking-wider">Your tech score</span>
                <div className="text-xl font-bold text-[#E2E8F0] mt-0.5">
                  {techComparison.ownTechScore}
                  <span className="text-sm font-normal text-[#94A3B8]">/100</span>
                </div>
              </div>
            ) : (
              <div>
                <span className="text-[#94A3B8] text-xs uppercase tracking-wider">Your tech score</span>
                <div className="text-sm text-[#64748B] mt-0.5 italic">
                  Not analysed yet — run Tech Analysis on your SVI page
                </div>
              </div>
            )}
            {techComparison.avgCompetitorWebScore != null && (
              <div>
                <span className="text-[#94A3B8] text-xs uppercase tracking-wider">
                  Avg competitor web score
                </span>
                <div className="text-xl font-bold text-[#E2E8F0] mt-0.5">
                  {techComparison.avgCompetitorWebScore}
                  <span className="text-sm font-normal text-[#94A3B8]">/100</span>
                </div>
              </div>
            )}
          </div>
          {techComparison.ownTechScore != null && techComparison.avgCompetitorWebScore != null && (
            <p className="text-sm text-[#94A3B8]">
              {techComparison.ownTechScore > techComparison.avgCompetitorWebScore ? (
                <span className="text-emerald-400 font-medium">
                  You&apos;re ahead on tech
                </span>
              ) : techComparison.ownTechScore < techComparison.avgCompetitorWebScore ? (
                <span className="text-amber-400 font-medium">
                  Competitors have stronger web presence
                </span>
              ) : (
                <span className="text-[#94A3B8] font-medium">
                  On par with competitors on tech presence
                </span>
              )}
              {" "}— based on live website analysis of top 3 competitors.
            </p>
          )}
        </section>
      )}

      {/* ── Comparison table ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-ink-500">
            No competitors yet. Add 3–5 to build a defensible pitch.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 border-b border-surface-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Positioning</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Pricing</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Our edge</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600">Threat</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-ink-600" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {items.map((c) => {
                  const isEd = editingId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-surface-50 align-top">
                      <td className="px-3 py-2.5">
                        {isEd ? (
                          <input
                            className={input}
                            defaultValue={c.name}
                            onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          />
                        ) : (
                          <div>
                            <div className="font-semibold text-ink-800">{c.name}</div>
                            {c.website && (
                              <a
                                href={c.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-brand-600 hover:underline"
                              >
                                {c.website.replace(/^https?:\/\//, "")}
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_STYLE[c.category ?? "direct"] ?? ""}`}
                        >
                          {c.category ?? "direct"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-ink-700 max-w-xs">{c.positioning ?? "—"}</td>
                      <td className="px-3 py-2.5 text-ink-700">{c.pricing ?? "—"}</td>
                      <td className="px-3 py-2.5 text-ink-700 max-w-xs">{c.our_edge ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {c.threat_level && (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${THREAT_STYLE[c.threat_level]}`}
                          >
                            {c.threat_level}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {isEd ? (
                          <div className="flex gap-2">
                            <Button size="xs" onClick={() => saveEdit(c.id)} disabled={busy}>Save</Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft({});
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(c.id);
                                setEditDraft({ name: c.name });
                              }}
                            >
                              Edit
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => remove(c.id)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
