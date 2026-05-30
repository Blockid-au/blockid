"use client";

import * as React from "react";
import {
  Lightbulb,
  TrendingUp,
  User,
  Code,
  Globe,
  Users,
  BarChart3,
  Megaphone,
  FileText,
  FolderCheck,
  Network,
  Map,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Upload,
  Link2,
  Plus,
  X,
  Sparkles,
  Target,
  Loader2,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CriterionDef, QualityLevel } from "@/lib/evaluation-criteria";

// ── Icon registry ────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Lightbulb,
  TrendingUp,
  User,
  Code,
  Globe,
  Users,
  BarChart3,
  Megaphone,
  FileText,
  FolderCheck,
  Network,
  Map,
  DollarSign,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? FileText;
}

// ── Quality badge config ─────────────────────────────────────────────────────

const QUALITY_BADGE: Record<
  QualityLevel,
  { label: string; className: string; meterFill: number }
> = {
  exceptional: {
    label: "Exceptional",
    className:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    meterFill: 5,
  },
  strong: {
    label: "Strong",
    className:
      "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",
    meterFill: 4,
  },
  good: {
    label: "Good",
    className:
      "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    meterFill: 3,
  },
  basic: {
    label: "Basic",
    className:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    meterFill: 2,
  },
  incomplete: {
    label: "Incomplete",
    className:
      "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400",
    meterFill: 0,
  },
};

const METER_COLORS = [
  "bg-ink-300",
  "bg-amber-400",
  "bg-blue-400",
  "bg-brand-500",
  "bg-emerald-500",
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface CriterionData {
  criterion_key: string;
  text_input: string;
  files: Array<{ name: string; url: string }>;
  links: Array<{ label: string; url: string }>;
  ai_score: number | null;
  ai_suggestions: string[];
  quality_level: QualityLevel;
}

interface CriterionCardProps {
  criterion: CriterionDef;
  data: CriterionData;
  onSave: (key: string, updates: Partial<CriterionData>) => void;
  defaultExpanded?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CriterionCard({
  criterion,
  data,
  onSave,
  defaultExpanded = false,
}: CriterionCardProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [textInput, setTextInput] = React.useState(data.text_input);
  const [links, setLinks] = React.useState(data.links);
  const [newLinkLabel, setNewLinkLabel] = React.useState("");
  const [newLinkUrl, setNewLinkUrl] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<string[]>(
    data.ai_suggestions,
  );
  const [aiScore, setAiScore] = React.useState(data.ai_score);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [scoreLoading, setScoreLoading] = React.useState(false);
  const [uploadLoading, setUploadLoading] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<
    "idle" | "saving" | "saved"
  >("idle");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const Icon = getIcon(criterion.icon);
  const quality = data.quality_level;
  const badge = QUALITY_BADGE[quality];

  // Sync incoming data when parent updates
  React.useEffect(() => {
    setTextInput(data.text_input);
    setLinks(data.links);
    setSuggestions(data.ai_suggestions);
    setAiScore(data.ai_score);
  }, [data]);

  // ── Auto-save on text change ──────────────────────────────────────────────

  const scheduleAutoSave = React.useCallback(
    (newText: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus("saving");
        onSave(criterion.key, { text_input: newText });
        setTimeout(() => setSaveStatus("saved"), 500);
        setTimeout(() => setSaveStatus("idle"), 2000);
      }, 1500);
    },
    [criterion.key, onSave],
  );

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setTextInput(val);
    scheduleAutoSave(val);
  }

  // ── Link management ───────────────────────────────────────────────────────

  function addLink() {
    if (!newLinkUrl.trim()) return;
    const updated = [
      ...links,
      { label: newLinkLabel.trim() || newLinkUrl.trim(), url: newLinkUrl.trim() },
    ];
    setLinks(updated);
    setNewLinkLabel("");
    setNewLinkUrl("");
    onSave(criterion.key, { links: updated });
  }

  function removeLink(idx: number) {
    const updated = links.filter((_, i) => i !== idx);
    setLinks(updated);
    onSave(criterion.key, { links: updated });
  }

  // ── File upload ───────────────────────────────────────────────────────────

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setUploadLoading(true);

    try {
      const newFiles = [...data.files];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("context", `evaluation-${criterion.key}`);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const json = await res.json();
          newFiles.push({ name: file.name, url: json.url ?? json.path ?? "" });
        }
      }
      onSave(criterion.key, { files: newFiles });
    } catch (err) {
      console.error("File upload failed:", err);
    } finally {
      setUploadLoading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeFile(idx: number) {
    const updated = data.files.filter((_, i) => i !== idx);
    onSave(criterion.key, { files: updated });
  }

  // ── AI Suggest ────────────────────────────────────────────────────────────

  async function handleAiSuggest() {
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/evaluation/${criterion.key}/ai-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textInput, links, files: data.files }),
      });
      if (res.ok) {
        const json = await res.json();
        const newSuggestions = json.suggestions ?? [];
        setSuggestions(newSuggestions);
        onSave(criterion.key, { ai_suggestions: newSuggestions });
      }
    } catch (err) {
      console.error("AI suggest failed:", err);
    } finally {
      setSuggestLoading(false);
    }
  }

  // ── AI Score ──────────────────────────────────────────────────────────────

  async function handleAiScore() {
    setScoreLoading(true);
    try {
      const res = await fetch(`/api/evaluation/${criterion.key}/ai-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textInput, links, files: data.files }),
      });
      if (res.ok) {
        const json = await res.json();
        setAiScore(json.score ?? null);
        onSave(criterion.key, { ai_score: json.score ?? null });
      }
    } catch (err) {
      console.error("AI score failed:", err);
    } finally {
      setScoreLoading(false);
    }
  }

  // ── Accept suggestion → append to text ────────────────────────────────────

  function acceptSuggestion(suggestion: string) {
    const newText = textInput
      ? `${textInput}\n\n${suggestion}`
      : suggestion;
    setTextInput(newText);
    onSave(criterion.key, { text_input: newText });
    setSuggestions((prev) => prev.filter((s) => s !== suggestion));
  }

  // ── Build the guiding-questions placeholder ──────────────────────────────

  const placeholder = criterion.guidingQuestions
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "bg-white dark:bg-ink-900 rounded-2xl border transition-all duration-200",
        expanded
          ? "border-brand-200 dark:border-brand-700 shadow-sm"
          : "border-ink-200 dark:border-ink-700 hover:border-ink-300 dark:hover:border-ink-600",
      )}
    >
      {/* ── Header (always visible) ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left cursor-pointer"
      >
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            quality === "incomplete"
              ? "bg-ink-100 dark:bg-ink-800"
              : quality === "basic"
                ? "bg-amber-50 dark:bg-amber-900/20"
                : quality === "good"
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : quality === "strong"
                    ? "bg-brand-50 dark:bg-brand-900/20"
                    : "bg-emerald-50 dark:bg-emerald-900/20",
          )}
        >
          <Icon
            strokeWidth={1.75}
            className={cn(
              "h-5 w-5",
              quality === "incomplete"
                ? "text-ink-400"
                : quality === "basic"
                  ? "text-amber-600 dark:text-amber-400"
                  : quality === "good"
                    ? "text-blue-600 dark:text-blue-400"
                    : quality === "strong"
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-emerald-600 dark:text-emerald-400",
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 truncate">
              {criterion.title}
            </h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
          {!expanded && (
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 truncate">
              {criterion.subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-medium text-ink-400 dark:text-ink-500 tabular-nums">
            {criterion.weight}%
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-ink-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-400" />
          )}
        </div>
      </button>

      {/* ── Expanded content ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-ink-100 dark:border-ink-800 pt-4">
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {criterion.subtitle}
          </p>

          {/* Text input */}
          <div className="relative">
            <textarea
              value={textInput}
              onChange={handleTextChange}
              placeholder={placeholder}
              rows={5}
              className="w-full rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50 px-3 py-2.5 text-sm text-ink-900 dark:text-ink-100 placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-y min-h-[100px]"
            />
            {saveStatus !== "idle" && (
              <span
                className={cn(
                  "absolute top-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded",
                  saveStatus === "saving"
                    ? "text-ink-400 bg-ink-100 dark:bg-ink-800"
                    : "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400",
                )}
              >
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </span>
            )}
          </div>

          {/* Files section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                Files
                {data.files.length > 0 && (
                  <span className="ml-1 text-ink-400">
                    ({data.files.length})
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLoading}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 disabled:opacity-50 cursor-pointer"
              >
                {uploadLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={
                  criterion.suggestedFileTypes.length > 0
                    ? criterion.suggestedFileTypes
                        .map((t) => `.${t}`)
                        .join(",")
                    : undefined
                }
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            {data.files.length > 0 && (
              <div className="space-y-1.5">
                {data.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-ink-50 dark:bg-ink-800/50 rounded-lg px-2.5 py-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                    <span className="text-xs text-ink-700 dark:text-ink-300 truncate flex-1">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-ink-400 hover:text-red-500 shrink-0 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {criterion.suggestedFileTypes.length > 0 && data.files.length === 0 && (
              <p className="text-[11px] text-ink-400 dark:text-ink-500">
                Suggested: {criterion.suggestedFileTypes.join(", ")} files
              </p>
            )}
          </div>

          {/* Links section */}
          <div>
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300 mb-2 block">
              Links
              {links.length > 0 && (
                <span className="ml-1 text-ink-400">({links.length})</span>
              )}
            </span>
            {links.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {links.map((link, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-ink-50 dark:bg-ink-800/50 rounded-lg px-2.5 py-1.5"
                  >
                    <Link2 className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 dark:text-brand-400 hover:underline truncate flex-1"
                    >
                      {link.label}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeLink(idx)}
                      className="text-ink-400 hover:text-red-500 shrink-0 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Add link form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Label (optional)"
                className="flex-1 min-w-0 rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50 px-2.5 py-1.5 text-xs text-ink-900 dark:text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
              />
              <input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addLink();
                  }
                }}
                className="flex-[2] min-w-0 rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50 px-2.5 py-1.5 text-xs text-ink-900 dark:text-ink-100 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
              />
              <button
                type="button"
                onClick={addLink}
                disabled={!newLinkUrl.trim()}
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {criterion.suggestedLinks.length > 0 && links.length === 0 && (
              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-1.5">
                Suggested: {criterion.suggestedLinks.join(", ")}
              </p>
            )}
          </div>

          {/* AI Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleAiSuggest}
              disabled={suggestLoading}
              className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-600 rounded-xl px-3 py-1.5 text-xs font-medium text-ink-700 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {suggestLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span className="text-xs truncate">Finding improvement suggestions...</span>
                </>
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {!suggestLoading && "AI Suggest (0.10 credits)"}
            </button>
            <button
              type="button"
              onClick={handleAiScore}
              disabled={scoreLoading}
              className="inline-flex items-center gap-1.5 border border-ink-300 dark:border-ink-600 rounded-xl px-3 py-1.5 text-xs font-medium text-ink-700 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {scoreLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span className="text-xs truncate">Scoring with AI analysis...</span>
                </>
              ) : (
                <Target className="h-3.5 w-3.5" />
              )}
              {!scoreLoading && "AI Score (0.25 credits)"}
            </button>
          </div>

          {/* AI Score display */}
          {aiScore !== null && (
            <div className="flex items-center gap-3 bg-ink-50 dark:bg-ink-800/50 rounded-xl px-3 py-2">
              <span className="text-xs font-medium text-ink-500 dark:text-ink-400">
                AI Score
              </span>
              <div className="flex-1 h-2 bg-ink-200 dark:bg-ink-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    aiScore >= 80
                      ? "bg-emerald-500"
                      : aiScore >= 60
                        ? "bg-brand-500"
                        : aiScore >= 40
                          ? "bg-blue-500"
                          : aiScore >= 20
                            ? "bg-amber-500"
                            : "bg-red-500",
                  )}
                  style={{ width: `${aiScore}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  aiScore >= 80
                    ? "text-emerald-600 dark:text-emerald-400"
                    : aiScore >= 60
                      ? "text-brand-600 dark:text-brand-400"
                      : aiScore >= 40
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-amber-600 dark:text-amber-400",
                )}
              >
                {aiScore}/100
              </span>
            </div>
          )}

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                AI Suggestions
              </span>
              {suggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 bg-brand-50/50 dark:bg-brand-900/10 border border-brand-100 dark:border-brand-800/30 rounded-xl px-3 py-2"
                >
                  <p className="text-xs text-ink-700 dark:text-ink-300 flex-1">
                    {suggestion}
                  </p>
                  <button
                    type="button"
                    onClick={() => acceptSuggestion(suggestion)}
                    title="Accept suggestion"
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded-lg text-brand-600 hover:bg-brand-100 dark:text-brand-400 dark:hover:bg-brand-900/30 transition-colors cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer: quality meter + weight */}
          <div className="flex items-center justify-between pt-2 border-t border-ink-100 dark:border-ink-800">
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={cn(
                    "h-1.5 w-5 rounded-full transition-colors",
                    level < badge.meterFill
                      ? METER_COLORS[badge.meterFill - 1] ?? "bg-ink-300"
                      : "bg-ink-200 dark:bg-ink-700",
                  )}
                />
              ))}
            </div>
            <span className="text-[10px] font-medium text-ink-400 dark:text-ink-500">
              Weight: {criterion.weight}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
