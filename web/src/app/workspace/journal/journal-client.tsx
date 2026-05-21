"use client";

import * as React from "react";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Clock,
  Lightbulb,
  MessageSquare,
  Milestone,
  Pencil,
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
  metadata?: Record<string, unknown>;
}

const ENTRY_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare, color: "bg-slate-100 text-slate-700" },
  { value: "decision", label: "Decision", icon: Target, color: "bg-blue-100 text-blue-700" },
  { value: "pivot", label: "Pivot", icon: RotateCcw, color: "bg-amber-100 text-amber-700" },
  { value: "milestone", label: "Milestone", icon: Milestone, color: "bg-green-100 text-green-700" },
  { value: "learning", label: "Learning", icon: Lightbulb, color: "bg-purple-100 text-purple-700" },
  { value: "metric", label: "Metric", icon: TrendingUp, color: "bg-cyan-100 text-cyan-700" },
  { value: "ai_reflection", label: "AI Reflection", icon: Sparkles, color: "bg-brand-100 text-brand-700" },
  { value: "revaluation", label: "Revaluation", icon: BarChart3, color: "bg-emerald-100 text-emerald-700" },
] as const;

const CREATABLE_TYPES = ENTRY_TYPES.filter(
  (t) => t.value !== "ai_reflection" && t.value !== "revaluation",
);

function getTypeConfig(type: string) {
  return ENTRY_TYPES.find((t) => t.value === type) ?? ENTRY_TYPES[0];
}

// Group entries by month
function groupByMonth(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const existing = groups.get(key) ?? [];
    existing.push(entry);
    groups.set(key, existing);
  }
  return groups;
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
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
  const [reflecting, setReflecting] = React.useState(false);
  const [revaluing, setRevaluing] = React.useState(false);
  const [selectedEntry, setSelectedEntry] = React.useState<JournalEntry | null>(null);
  const [editingEntry, setEditingEntry] = React.useState<JournalEntry | null>(null);

  // Form state
  const [formTitle, setFormTitle] = React.useState("");
  const [formContent, setFormContent] = React.useState("");
  const [formType, setFormType] = React.useState("note");
  const [formTags, setFormTags] = React.useState("");

  const limit = 50;

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
        resetForm();
        setPage(1);
        fetchEntries();
      }
    } catch (err) {
      console.error("Failed to create entry:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEntry || !formTitle.trim()) return;
    setSubmitting(true);

    try {
      const tags = formTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/journal/${editingEntry.id}`, {
        method: "PATCH",
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
        resetForm();
        fetchEntries();
      }
    } catch (err) {
      console.error("Failed to update entry:", err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this journal entry?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/journal/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        if (selectedEntry?.id === id) setSelectedEntry(null);
        fetchEntries();
      }
    } catch (err) {
      console.error("Failed to delete entry:", err);
    } finally {
      setDeleting(null);
    }
  }

  async function handleReflect() {
    if (reflecting) return;
    setReflecting(true);
    try {
      const res = await fetch("/api/journal/reflect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        fetchEntries();
      } else {
        alert(data.error || "Failed to generate reflection");
      }
    } catch (err) {
      console.error("Failed to generate reflection:", err);
      alert("Failed to generate reflection. Please try again.");
    } finally {
      setReflecting(false);
    }
  }

  async function handleRevaluation() {
    if (revaluing) return;
    setRevaluing(true);
    try {
      const res = await fetch("/api/revaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        fetchEntries();
      } else {
        alert(data.error || "Failed to generate revaluation");
      }
    } catch (err) {
      console.error("Failed to generate revaluation:", err);
      alert("Failed to generate revaluation. Please try again.");
    } finally {
      setRevaluing(false);
    }
  }

  function resetForm() {
    setFormTitle("");
    setFormContent("");
    setFormType("note");
    setFormTags("");
    setShowForm(false);
    setEditingEntry(null);
  }

  function startEdit(entry: JournalEntry) {
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormContent(entry.content ?? "");
    setFormType(entry.entry_type);
    setFormTags(entry.tags?.join(", ") ?? "");
    setShowForm(true);
    setSelectedEntry(null);
  }

  const totalPages = Math.ceil(total / limit);
  const grouped = groupByMonth(entries);

  return (
    <div className="flex gap-6">
      {/* Left: Timeline */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                setShowForm(true);
                setEditingEntry(null);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors cursor-pointer"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "New Entry"}
          </button>

          <button
            onClick={handleReflect}
            disabled={reflecting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-200 bg-brand-50 text-sm text-brand-700 font-medium hover:bg-brand-100 disabled:opacity-50 transition-colors cursor-pointer"
            title="Generate AI monthly reflection (0.50 credits)"
          >
            <Sparkles className={cn("h-3.5 w-3.5", reflecting && "animate-spin")} />
            {reflecting ? "Reflecting..." : "Monthly Reflection"}
          </button>

          <button
            onClick={handleRevaluation}
            disabled={revaluing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-700 font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors cursor-pointer"
            title="Generate quarterly revaluation (1.00 credit)"
          >
            <BarChart3 className={cn("h-3.5 w-3.5", revaluing && "animate-spin")} />
            {revaluing ? "Revaluing..." : "Quarterly Revaluation"}
          </button>

          {/* Type filter */}
          <div className="relative ml-auto">
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
          </button>

          <span className="text-xs text-ink-400">
            {total} {total === 1 ? "entry" : "entries"}
          </span>
        </div>

        {/* Entry Form (New / Edit) */}
        {showForm && (
          <form
            onSubmit={editingEntry ? handleUpdate : handleSubmit}
            className="rounded-2xl border border-surface-200 bg-white p-5 space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-800">
                {editingEntry ? "Edit Entry" : "New Journal Entry"}
              </h3>
            </div>

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
                  {CREATABLE_TYPES.map((t) => {
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

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-xl text-sm text-ink-600 border border-surface-200 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formTitle.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? "Saving..." : editingEntry ? "Update Entry" : "Save Entry"}
              </button>
            </div>
          </form>
        )}

        {/* Timeline grouped by month */}
        {loading ? (
          <div className="text-center py-12 text-sm text-ink-400">Loading journal...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <BookOpen className="h-10 w-10 mx-auto text-ink-300" />
            <p className="text-sm text-ink-500">No journal entries yet.</p>
            <p className="text-xs text-ink-400">
              Start documenting your startup journey — decisions, pivots, milestones, and learnings.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([monthKey, monthEntries]) => (
              <div key={monthKey}>
                {/* Month header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-6 w-6 rounded-full bg-surface-200 flex items-center justify-center">
                    <Clock className="h-3 w-3 text-ink-500" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink-700">
                    {formatMonthLabel(monthKey)}
                  </h3>
                  <span className="text-[10px] text-ink-400">
                    {monthEntries.length} {monthEntries.length === 1 ? "entry" : "entries"}
                  </span>
                  <div className="flex-1 border-t border-surface-200" />
                </div>

                {/* Entries in this month */}
                <div className="space-y-3 ml-3 border-l-2 border-surface-200 pl-5">
                  {monthEntries.map((entry) => {
                    const typeConfig = getTypeConfig(entry.entry_type);
                    const Icon = typeConfig.icon;
                    const date = new Date(entry.created_at);
                    const isSelected = selectedEntry?.id === entry.id;
                    const isReflection = entry.entry_type === "ai_reflection";
                    const isRevaluation = entry.entry_type === "revaluation";

                    return (
                      <div
                        key={entry.id}
                        onClick={() => setSelectedEntry(isSelected ? null : entry)}
                        className={cn(
                          "rounded-2xl border bg-white p-4 transition-all cursor-pointer",
                          isSelected
                            ? "border-brand-300 shadow-md ring-1 ring-brand-100"
                            : "border-surface-200 hover:shadow-sm hover:border-surface-300",
                          isReflection && "border-brand-200 bg-brand-50/30",
                          isRevaluation && "border-emerald-200 bg-emerald-50/30",
                        )}
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
                                <h3 className="text-sm font-semibold text-ink-800 line-clamp-1">
                                  {entry.title}
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

                              <div className="flex items-center gap-1 shrink-0">
                                {!isReflection && !isRevaluation && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEdit(entry);
                                    }}
                                    className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-300 hover:text-brand-500 hover:bg-brand-50 transition-colors cursor-pointer"
                                    title="Edit entry"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(entry.id);
                                  }}
                                  disabled={deleting === entry.id}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-300 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                                  title="Delete entry"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Content preview (collapsed) */}
                            {entry.content && !isSelected && (
                              <p className="text-sm text-ink-500 mt-1.5 line-clamp-2">
                                {entry.content}
                              </p>
                            )}

                            {/* Full content (expanded) */}
                            {entry.content && isSelected && (
                              <div className="mt-3 text-sm text-ink-600 whitespace-pre-wrap leading-relaxed">
                                {entry.content}
                              </div>
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

                            {/* AI Reflection badge */}
                            {entry.ai_reflection && !isReflection && (
                              <div className="mt-3 flex items-start gap-2 rounded-xl bg-brand-50/50 border border-brand-100 px-3 py-2.5">
                                <Sparkles className="h-3.5 w-3.5 text-brand-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-brand-700 leading-relaxed">
                                  {entry.ai_reflection}
                                </p>
                              </div>
                            )}

                            {/* Revaluation metadata */}
                            {isRevaluation && entry.metadata && isSelected && (
                              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {entry.metadata.lowValuation != null && (
                                  <div className="rounded-xl bg-surface-50 px-3 py-2 text-center">
                                    <div className="text-[10px] text-ink-400">Conservative</div>
                                    <div className="text-sm font-semibold text-ink-700">
                                      ${(Number(entry.metadata.lowValuation) / 1_000_000).toFixed(2)}M
                                    </div>
                                  </div>
                                )}
                                {entry.metadata.midValuation != null && (
                                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center">
                                    <div className="text-[10px] text-emerald-600">Mid</div>
                                    <div className="text-sm font-semibold text-emerald-700">
                                      ${(Number(entry.metadata.midValuation) / 1_000_000).toFixed(2)}M
                                    </div>
                                  </div>
                                )}
                                {entry.metadata.highValuation != null && (
                                  <div className="rounded-xl bg-brand-50 px-3 py-2 text-center">
                                    <div className="text-[10px] text-brand-600">Optimistic</div>
                                    <div className="text-sm font-semibold text-brand-700">
                                      ${(Number(entry.metadata.highValuation) / 1_000_000).toFixed(2)}M
                                    </div>
                                  </div>
                                )}
                                {entry.metadata.revenueMultiple != null && (
                                  <div className="rounded-xl bg-surface-50 px-3 py-2 text-center">
                                    <div className="text-[10px] text-ink-400">Multiple</div>
                                    <div className="text-sm font-semibold text-ink-700">
                                      {String(entry.metadata.revenueMultiple)}x
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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

      {/* Right: Selected entry detail (desktop) */}
      {selectedEntry && (
        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-20 rounded-2xl border border-surface-200 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-800">Entry Detail</h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="h-6 w-6 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-ink-400 uppercase tracking-wider">Title</span>
                <p className="text-sm font-medium text-ink-800">{selectedEntry.title}</p>
              </div>

              <div>
                <span className="text-[10px] text-ink-400 uppercase tracking-wider">Type</span>
                <div className="mt-0.5">
                  {(() => {
                    const cfg = getTypeConfig(selectedEntry.entry_type);
                    const I = cfg.icon;
                    return (
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium", cfg.color)}>
                        <I className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div>
                <span className="text-[10px] text-ink-400 uppercase tracking-wider">Date</span>
                <p className="text-sm text-ink-600">
                  {new Date(selectedEntry.created_at).toLocaleDateString("en-AU", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>

              {selectedEntry.svi_at_time != null && (
                <div>
                  <span className="text-[10px] text-ink-400 uppercase tracking-wider">SVI at Time</span>
                  <p className="text-sm font-mono text-ink-700">{selectedEntry.svi_at_time}/1000</p>
                </div>
              )}

              {selectedEntry.tags && selectedEntry.tags.length > 0 && (
                <div>
                  <span className="text-[10px] text-ink-400 uppercase tracking-wider">Tags</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {selectedEntry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-[10px] text-ink-500 font-medium"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedEntry.ai_reflection && (
                <div>
                  <span className="text-[10px] text-ink-400 uppercase tracking-wider">AI Insight</span>
                  <p className="text-xs text-brand-700 mt-0.5 leading-relaxed">
                    {selectedEntry.ai_reflection}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-surface-100">
              {selectedEntry.entry_type !== "ai_reflection" && selectedEntry.entry_type !== "revaluation" && (
                <button
                  onClick={() => startEdit(selectedEntry)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-surface-200 text-sm text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
              <button
                onClick={() => handleDelete(selectedEntry.id)}
                disabled={deleting === selectedEntry.id}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
