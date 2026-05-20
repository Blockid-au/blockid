"use client";

import * as React from "react";
import {
  BookOpen,
  ChevronDown,
  Lightbulb,
  MessageSquare,
  Milestone,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JournalEntry {
  id: string;
  entry_type: string;
  title: string;
  content: string | null;
  tags: string[];
  svi_at_time: number | null;
  ai_reflection: string | null;
  is_public: boolean;
  created_at: string;
}

const ENTRY_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare, color: "bg-slate-100 text-slate-700" },
  { value: "decision", label: "Decision", icon: Target, color: "bg-blue-100 text-blue-700" },
  { value: "pivot", label: "Pivot", icon: RotateCcw, color: "bg-amber-100 text-amber-700" },
  { value: "milestone", label: "Milestone", icon: Milestone, color: "bg-green-100 text-green-700" },
  { value: "learning", label: "Learning", icon: Lightbulb, color: "bg-purple-100 text-purple-700" },
  { value: "metric", label: "Metric", icon: TrendingUp, color: "bg-cyan-100 text-cyan-700" },
] as const;

function getTypeConfig(type: string) {
  return ENTRY_TYPES.find((t) => t.value === type) ?? ENTRY_TYPES[0];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JournalClient() {
  const [entries, setEntries] = React.useState<JournalEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [filterType, setFilterType] = React.useState<string>("");
  const [showForm, setShowForm] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = React.useState("");
  const [formContent, setFormContent] = React.useState("");
  const [formType, setFormType] = React.useState("note");
  const [formTags, setFormTags] = React.useState("");

  const limit = 20;

  const fetchEntries = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterType) params.set("type", filterType);
      const res = await fetch(`/api/journal?${params}`);
      const data = await res.json();
      if (data.ok) {
        setEntries(data.entries);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch journal:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filterType]);

  React.useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setSubmitting(true);

    try {
      const tags = formTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent.trim() || null,
          entryType: formType,
          tags,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setFormTitle("");
        setFormContent("");
        setFormType("note");
        setFormTags("");
        setShowForm(false);
        setPage(1);
        fetchEntries();
      }
    } catch (err) {
      console.error("Failed to create entry:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this journal entry?")) return;
    setDeleting(id);
    try {
      const res = await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        fetchEntries();
      }
    } catch (err) {
      console.error("Failed to delete entry:", err);
    } finally {
      setDeleting(null);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showForm ? "Cancel" : "Add Entry"}
        </button>

        {/* Type filter */}
        <div className="relative">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
            className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-surface-200 bg-white text-sm text-ink-700 hover:border-surface-300 transition-colors cursor-pointer"
          >
            <option value="">All types</option>
            {ENTRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
        </div>

        <button
          onClick={fetchEntries}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-200 text-sm text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>

        <span className="text-xs text-ink-400 ml-auto">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Add Entry Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-surface-200 bg-white p-5 space-y-4 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">Title *</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="What happened?"
                className="w-full px-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {ENTRY_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormType(t.value)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                        formType === t.value
                          ? "ring-2 ring-brand-400 " + t.color
                          : "bg-surface-50 text-ink-500 hover:bg-surface-100",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">Content</label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Details, context, reasoning..."
              rows={4}
              className="w-full px-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-y"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-600 mb-1">
              Tags <span className="text-ink-400">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              placeholder="product, fundraising, team"
              className="w-full px-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || !formTitle.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {submitting ? "Saving..." : "Save Entry"}
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-sm text-ink-400">Loading journal...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <BookOpen className="h-10 w-10 mx-auto text-ink-300" />
          <p className="text-sm text-ink-500">No journal entries yet.</p>
          <p className="text-xs text-ink-400">Start documenting your startup journey.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const typeConfig = getTypeConfig(entry.entry_type);
            const Icon = typeConfig.icon;
            const date = new Date(entry.created_at);

            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-surface-200 bg-white p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {/* Type badge */}
                  <div
                    className={cn(
                      "shrink-0 h-8 w-8 rounded-lg flex items-center justify-center",
                      typeConfig.color,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-ink-800">{entry.title}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium",
                              typeConfig.color,
                            )}
                          >
                            {typeConfig.label}
                          </span>
                          <span className="text-[10px] text-ink-400">
                            {date.toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          {entry.svi_at_time != null && (
                            <span className="text-[10px] text-ink-400">
                              SVI: {entry.svi_at_time}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-ink-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Content */}
                    {entry.content && (
                      <p className="text-sm text-ink-600 mt-2 whitespace-pre-wrap">
                        {entry.content}
                      </p>
                    )}

                    {/* Tags */}
                    {entry.tags && entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-[10px] text-ink-500 font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* AI Reflection */}
                    {entry.ai_reflection && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/50 border border-brand-100 px-3 py-2.5">
                        <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-brand-700 leading-relaxed">
                          {entry.ai_reflection}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 border border-surface-200 hover:bg-surface-50 disabled:opacity-40 transition-colors cursor-pointer"
          >
            Previous
          </button>
          <span className="text-xs text-ink-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-600 border border-surface-200 hover:bg-surface-50 disabled:opacity-40 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
