"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lightbulb,
  DollarSign,
  TrendingUp,
  MessageSquare,
  FileText,
  Copy,
  Mail,
  Loader2,
  Check,
  Clock,
  Trash2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

type RndTopic = "features" | "pricing" | "market" | "cta" | "full";

interface RndReport {
  topic: RndTopic;
  report: string;
  generatedAt: string;
}

interface StoredReport extends RndReport {
  id: string;
}

const TOPICS: Array<{ key: RndTopic; label: string; desc: string; icon: typeof Lightbulb }> = [
  { key: "features", label: "Features", desc: "Feature upgrades with effort/impact scoring", icon: Lightbulb },
  { key: "pricing", label: "Pricing", desc: "Pricing models, promotions, freemium optimization", icon: DollarSign },
  { key: "market", label: "Market", desc: "TAM/SAM, competition, trends, opportunities", icon: TrendingUp },
  { key: "cta", label: "CTAs", desc: "Headlines, button text, value props, A/B tests", icon: MessageSquare },
  { key: "full", label: "Full Report", desc: "All 4 topics compiled into one report", icon: FileText },
];

const STORAGE_KEY = "blockid-rnd-reports";
const MAX_HISTORY = 3;

// ── Markdown renderer ──────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="my-6 border-surface-200" />');

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-sm font-semibold text-ink-800 mt-5 mb-2">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-ink-800 mt-6 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-ink-800 mt-8 mb-3">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-ink-800 mt-8 mb-4">$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="font-semibold text-ink-800"><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-ink-800">$1</strong>');
  html = html.replace(/_(.+?)_/g, '<em class="italic text-ink-600">$1</em>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em class="italic text-ink-600">$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-surface-100 text-brand-700 px-1 py-0.5 rounded text-xs font-mono">$1</code>');

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)*)/gm, (_match, headerRow: string, _sep: string, bodyRows: string) => {
    const headers = headerRow.split("|").filter((c: string) => c.trim());
    const headerHtml = headers.map((h: string) =>
      `<th class="px-3 py-2 text-left text-xs font-medium text-ink-700 bg-surface-100">${h.trim()}</th>`
    ).join("");

    const rows = bodyRows.trim().split("\n").map((row: string) => {
      const cells = row.split("|").filter((c: string) => c.trim());
      return "<tr>" + cells.map((c: string) =>
        `<td class="px-3 py-2 text-sm text-ink-600 border-t border-surface-200">${c.trim()}</td>`
      ).join("") + "</tr>";
    }).join("");

    return `<div class="overflow-x-auto my-4"><table class="w-full border border-surface-200 rounded-lg overflow-hidden"><thead><tr>${headerHtml}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });

  // Unordered lists
  html = html.replace(/^(\s*)- (.+)$/gm, (_match, indent: string, content: string) => {
    const level = Math.floor(indent.length / 2);
    const ml = level > 0 ? ` ml-${level * 4}` : "";
    return `<li class="flex items-start gap-2 py-0.5${ml}"><span class="text-brand-600 mt-1.5 shrink-0 block w-1.5 h-1.5 rounded-full bg-brand-600"></span><span class="text-sm text-ink-600">${content}</span></li>`;
  });

  // Ordered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="flex items-start gap-2 py-0.5"><span class="text-brand-600 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">$1.</span><span class="text-sm text-ink-600">$2</span></li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="space-y-0.5 my-2">$1</ul>');

  // Paragraphs — lines that aren't already tagged
  html = html.replace(/^(?!<[hH1-6uldtro]|<hr|<li|<div|<table|<thead|<tbody|<tr|<td|<th|<code|<ul)(.+)$/gm, '<p class="text-sm text-ink-600 leading-relaxed my-2">$1</p>');

  return html;
}

// ── localStorage helpers ───────────────────────────────────────────────

function loadHistory(): StoredReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredReport[];
  } catch {
    return [];
  }
}

function saveToHistory(report: RndReport): StoredReport[] {
  const existing = loadHistory();
  const entry: StoredReport = { ...report, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  const updated = [entry, ...existing].slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* storage full — ignore */ }
  return updated;
}

function removeFromHistory(id: string): StoredReport[] {
  const existing = loadHistory();
  const updated = existing.filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
  return updated;
}

// ── Component ──────────────────────────────────────────────────────────

export function RndDashboard() {
  const [loading, setLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<RndTopic | null>(null);
  const [report, setReport] = useState<RndReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<StoredReport[]>([]);

  useEffect(() => {
    const h = loadHistory();
    if (h.length > 0) setHistory(h);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
  }, []);

  const runResearch = useCallback(async (topic: RndTopic) => {
    setLoading(true);
    setActiveTopic(topic);
    setError(null);
    setReport(null);
    setCopied(false);

    try {
      const res = await fetch("/api/admin/rnd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Research failed. Please try again.");
        return;
      }

      const newReport: RndReport = {
        topic: data.topic,
        report: data.report,
        generatedAt: data.generatedAt,
      };
      setReport(newReport);
      setHistory(saveToHistory(newReport));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const copyToClipboard = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = report.report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [report]);

  const viewHistoryReport = useCallback((stored: StoredReport) => {
    setReport({ topic: stored.topic, report: stored.report, generatedAt: stored.generatedAt });
    setActiveTopic(stored.topic);
    setError(null);
    setCopied(false);
  }, []);

  const deleteHistoryReport = useCallback((id: string) => {
    setHistory(removeFromHistory(id));
  }, []);

  const topicLabel = (t: RndTopic) => TOPICS.find((x) => x.key === t)?.label ?? t;

  return (
    <div className="space-y-8">
      {/* Topic Buttons */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {TOPICS.map(({ key, label, desc, icon: Icon }) => (
          <button
            key={key}
            onClick={() => runResearch(key)}
            disabled={loading}
            className={`
              group relative rounded-xl border px-4 py-4 text-left transition-all cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed
              ${activeTopic === key && loading
                ? "border-brand-500 bg-brand-50 shadow-sm"
                : key === "full"
                  ? "border-brand-500/40 bg-brand-50 hover:border-brand-500 hover:shadow-sm"
                  : "border-surface-200 bg-white hover:border-brand-600/40 hover:shadow-sm"
              }
            `}
          >
            <Icon strokeWidth={1.75} className={`h-5 w-5 mb-2 ${key === "full" ? "text-brand-600" : "text-ink-600 group-hover:text-brand-600"} transition-colors`} />
            <p className="text-sm font-semibold text-ink-800">{label}</p>
            <p className="text-[11px] text-ink-600 mt-1 leading-snug">{desc}</p>
            {activeTopic === key && loading && (
              <div className="absolute top-3 right-3">
                <Loader2 className="h-4 w-4 text-brand-600 animate-spin" />
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="rounded-2xl border border-surface-200 bg-white p-12 text-center shadow-sm">
          <Loader2 className="h-8 w-8 text-brand-600 animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-ink-800">
            {activeTopic === "full" ? "Running all 4 research topics..." : `Researching ${topicLabel(activeTopic!)}...`}
          </p>
          <p className="text-xs text-ink-600 mt-1">
            {activeTopic === "full" ? "This may take up to 2 minutes." : "This may take 15-30 seconds."}
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-red-700">Research Failed</p>
          <p className="text-xs text-red-600 mt-1">{error}</p>
        </div>
      )}

      {/* Report Output */}
      {report && !loading && (
        <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          {/* Report Header */}
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink-800">
                {topicLabel(report.topic)} Report
              </h2>
              <p className="text-[11px] text-ink-600 mt-0.5">
                Generated {new Date(report.generatedAt).toLocaleString("en-AU")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyToClipboard}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-ink-800 bg-surface-100 hover:bg-surface-200 rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy Report"}
              </button>
              <button
                disabled
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 bg-surface-100 rounded-lg px-3 py-1.5 cursor-not-allowed opacity-50"
                title="Email delivery coming soon"
              >
                <Mail className="h-3.5 w-3.5" />
                Email Report
              </button>
            </div>
          </div>

          {/* Report Content */}
          <div
            className="px-6 py-6 prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.report) }}
          />
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200">
            <h2 className="text-sm font-semibold text-ink-800">Recent Reports</h2>
            <p className="text-[11px] text-ink-600 mt-0.5">Last {MAX_HISTORY} reports stored locally</p>
          </div>
          <div className="divide-y divide-surface-200/50">
            {history.map((stored) => (
              <div
                key={stored.id}
                className="px-6 py-3 flex items-center justify-between hover:bg-surface-50 transition-colors"
              >
                <button
                  onClick={() => viewHistoryReport(stored)}
                  className="flex items-center gap-3 text-left flex-1 cursor-pointer"
                >
                  <Clock className="h-4 w-4 text-ink-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-ink-800">
                      {topicLabel(stored.topic)} Report
                    </p>
                    <p className="text-[11px] text-ink-600">
                      {new Date(stored.generatedAt).toLocaleString("en-AU")}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => deleteHistoryReport(stored.id)}
                  className="p-1.5 text-ink-400 hover:text-red-500 transition-colors cursor-pointer"
                  title="Remove from history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
