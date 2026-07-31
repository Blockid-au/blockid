"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Upload,
  ExternalLink,
  Loader2,
  FolderOpen,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Download,
  Link2,
  FileText,
  HardDrive,
  Sparkles,
  Copy,
  Share2,
  AlertCircle,
  Target,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataRoomFolder } from "@/lib/data-room-templates";

// ---------------------------------------------------------------------------
// Types (mirrored from server page)
// ---------------------------------------------------------------------------

interface DataRoomItemDef {
  id: string;
  category: string;
  label: string;
  description: string;
  dimension: string;
}

interface DataRoomItemState {
  id: string;
  status: "not_started" | "uploaded" | "verified";
  fileUrl: string | null;
  fileName: string | null;
  evidenceId: string | null;
}

interface GeneratedDataRoom {
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      label: string;
      status: "complete" | "missing" | "partial";
      source: "auto" | "manual" | "evidence";
      value?: string;
      link?: string;
    }>;
    completeness: number;
  }>;
  overallCompleteness: number;
  generatedAt: string;
}

interface DataRoomClientProps {
  items: DataRoomItemDef[];
  categories: string[];
  initialStates: DataRoomItemState[];
  templateStructure: DataRoomFolder[];
}

// Goals types (T0098)
interface DataRoomGoal {
  id: string;
  templateId: string;
  progressId: string | null;
  goalType: "document_upload" | "template_fill" | "ai_generate" | "connect_integration";
  section: string;
  title: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  targetCompletionDays: number;
  creditsReward: number;
  status: "pending" | "in_progress" | "complete" | "skipped";
  completedAt: string | null;
  creditsAwarded: number;
}

interface GoalSection {
  section: string;
  total: number;
  complete: number;
  pct: number;
}

interface GoalsData {
  goals: DataRoomGoal[];
  completionScore: number;
  p0Score: number;
  sections: GoalSection[];
  stats: { total: number; completed: number; pending: number };
}

// ---------------------------------------------------------------------------
// Category icons
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, string> = {
  "Company Formation": "🏢",
  "Cap Table & Equity": "📊",
  "Financials": "💰",
  "Product & Tech": "🔧",
  "Market & Traction": "📈",
  "Legal & Compliance": "⚖️",
};

// ---------------------------------------------------------------------------
// Connect destination URLs
// ---------------------------------------------------------------------------

const CONNECT_URLS: Record<string, string> = {
  stripe: "/workspace/revenue",
  github: "/api/auth/github",
  analytics: "/workspace/analytics",
  linkedin: "https://linkedin.com",
  "blockid-captable": "/workspace/cap-table",
};

// ---------------------------------------------------------------------------
// Status display
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  not_started: {
    label: "Not started",
    className: "text-ink-400 bg-surface-100 border-surface-200",
    icon: Circle,
  },
  uploaded: {
    label: "Uploaded",
    className: "text-brand-600 bg-brand-50 border-brand-200",
    icon: CheckCircle2,
  },
  verified: {
    label: "Verified",
    className: "text-emerald-600 bg-emerald-50 border-emerald-200",
    icon: ShieldCheck,
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataRoomClient({
  items,
  categories,
  initialStates,
  templateStructure,
}: DataRoomClientProps) {
  const [states, setStates] = React.useState<Record<string, DataRoomItemState>>(() => {
    const map: Record<string, DataRoomItemState> = {};
    // Initialize all items as not_started
    for (const item of items) {
      map[item.id] = {
        id: item.id,
        status: "not_started",
        fileUrl: null,
        fileName: null,
        evidenceId: null,
      };
    }
    // Override with initial states from server
    for (const s of initialStates) {
      map[s.id] = s;
    }
    return map;
  });

  const [uploadingId, setUploadingId] = React.useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(
    () => new Set(categories),
  );

  // Goals state (T0098)
  const [goalsData, setGoalsData] = React.useState<GoalsData | null>(null);
  const [goalsLoading, setGoalsLoading] = React.useState(false);
  const [showGoals, setShowGoals] = React.useState(true);
  const [autoFillDocId, setAutoFillDocId] = React.useState<string | null>(null);
  const [autoFilling, setAutoFilling] = React.useState(false);
  const [autoFillResult, setAutoFillResult] = React.useState<{ content: string; docId: string } | null>(null);

  // Load goals on mount
  React.useEffect(() => {
    let cancelled = false;
    async function loadGoals() {
      setGoalsLoading(true);
      try {
        const r = await fetch("/api/data-room/goals");
        const data = (await r.json()) as GoalsData & { ok: boolean };
        if (!cancelled && data.ok) {
          setGoalsData(data);
        }
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setGoalsLoading(false);
      }
    }
    loadGoals();
    return () => { cancelled = true; };
  }, []);
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingItemId, setPendingItemId] = React.useState<string | null>(null);
  const [settingUpDrive, setSettingUpDrive] = React.useState(false);
  const [driveSetupResult, setDriveSetupResult] = React.useState<{
    dataRoomFolderUrl: string;
    totalTemplates: number;
  } | null>(null);
  const [showTemplates, setShowTemplates] = React.useState(true);

  // Generated data room state
  const [generatedRoom, setGeneratedRoom] = React.useState<GeneratedDataRoom | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [shareLink, setShareLink] = React.useState<string | null>(null);
  const [sharingLoading, setSharingLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  // Progress calculation
  const totalItems = items.length;
  const completedItems = Object.values(states).filter(
    (s) => s.status === "uploaded" || s.status === "verified",
  ).length;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function triggerUpload(itemId: string) {
    setPendingItemId(itemId);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingItemId) return;

    const itemId = pendingItemId;
    const itemDef = items.find((i) => i.id === itemId);
    if (!itemDef) return;

    setUploadingId(itemId);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("dimension", itemDef.dimension);

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.ok) {
        setStates((prev) => ({
          ...prev,
          [itemId]: {
            id: itemId,
            status: "uploaded",
            fileUrl: data.webViewLink ?? null,
            fileName: file.name,
            evidenceId: data.evidenceId ?? null,
          },
        }));
        showToast(`"${itemDef.label}" uploaded successfully`);
      } else {
        showToast(data.error ?? data.reason ?? "Upload failed", "error");
      }
    } catch {
      showToast("Upload failed. Please try again.", "error");
    } finally {
      setUploadingId(null);
      setPendingItemId(null);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleItemDone(itemId: string) {
    setStates((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      // Toggle between not_started and uploaded (manual check)
      const newStatus = current.status === "not_started" ? "uploaded" : "not_started";
      return {
        ...prev,
        [itemId]: {
          ...current,
          status: newStatus,
          // Clear file info if marking as not started
          ...(newStatus === "not_started"
            ? { fileUrl: null, fileName: null, evidenceId: null }
            : {}),
        },
      };
    });
  }

  async function handleSetupDrive() {
    setSettingUpDrive(true);
    try {
      const res = await fetch("/api/dataroom/setup", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setDriveSetupResult({
          dataRoomFolderUrl: data.dataRoomFolderUrl,
          totalTemplates: data.totalTemplates,
        });
        showToast(`Data room created with ${data.totalTemplates} templates in Google Drive`);
      } else {
        showToast(data.error ?? "Failed to setup Google Drive", "error");
      }
    } catch {
      showToast("Failed to setup Google Drive. Please try again.", "error");
    } finally {
      setSettingUpDrive(false);
    }
  }

  function downloadTemplate(templateName: string) {
    const url = `/api/dataroom/template?name=${encodeURIComponent(templateName)}`;
    window.open(url, "_blank");
  }

  async function handleGenerateDataRoom() {
    setGenerating(true);
    try {
      const res = await fetch("/api/data-room/generate", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setGeneratedRoom(data.dataRoom);
        showToast("Data room generated successfully");
      } else {
        showToast(data.error ?? "Failed to generate data room", "error");
      }
    } catch {
      showToast("Failed to generate data room. Please try again.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function handleShareWithInvestor() {
    setSharingLoading(true);
    try {
      const res = await fetch("/api/investor-data-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays: 30 }),
      });
      const data = await res.json();
      if (data.ok) {
        setShareLink(data.url);
        showToast("Shareable link created (expires in 30 days)");
      } else {
        showToast(data.error ?? "Failed to create share link", "error");
      }
    } catch {
      showToast("Failed to create share link. Please try again.", "error");
    } finally {
      setSharingLoading(false);
    }
  }

  function handleCopyLink() {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleAutoFill(documentId: string, templateSlug?: string) {
    setAutoFillDocId(documentId);
    setAutoFilling(true);
    setAutoFillResult(null);
    try {
      const res = await fetch("/api/data-room/auto-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, templateSlug }),
      });
      const data = await res.json();
      if (data.ok) {
        setAutoFillResult({ content: data.filledContent, docId: documentId });
        showToast(`Auto-filled document (${data.wordsGenerated} words generated). 0.25 credits used.`);
      } else {
        showToast(data.error ?? "Auto-fill failed", "error");
      }
    } catch {
      showToast("Auto-fill failed. Please try again.", "error");
    } finally {
      setAutoFillDocId(null);
      setAutoFilling(false);
    }
  }

  async function handleMarkGoalComplete(templateId: string, dataRoomId?: string) {
    try {
      const res = await fetch("/api/data-room/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          dataRoomId: dataRoomId ?? "default",
          status: "complete",
        }),
      });
      const data = await res.json();
      if (data.ok && goalsData) {
        // Update local goals state
        setGoalsData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            goals: prev.goals.map((g) =>
              g.templateId === templateId
                ? { ...g, status: "complete", completedAt: new Date().toISOString() }
                : g
            ),
          };
        });
        showToast(`Goal completed! ${data.creditsAwarded > 0 ? `+${data.creditsAwarded} credits` : ""}`);
      }
    } catch {
      // Non-fatal
    }
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.csv,.mp4"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "mb-4 flex items-center justify-between rounded-xl border px-5 py-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300",
            toast.type === "success"
              ? "border-teal-200 bg-teal-50"
              : "border-red-200 bg-red-50",
          )}
        >
          <p
            className={cn(
              "text-sm font-semibold",
              toast.type === "success" ? "text-teal-700" : "text-red-700",
            )}
          >
            {toast.message}
          </p>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-ink-500 hover:text-ink-700 cursor-pointer text-xs font-medium ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <FolderOpen strokeWidth={1.5} className="h-5 w-5 text-brand-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-ink-900">Data Room</h1>
            <p className="text-sm text-ink-600">
              Investor-ready document checklist for due diligence
            </p>
          </div>
        </div>
      </div>

      {/* Google Drive Setup CTA */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-5 shadow-sm mb-6">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-white border border-brand-100 flex items-center justify-center shrink-0">
            <HardDrive strokeWidth={1.5} className="h-5 w-5 text-brand-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ink-800 mb-1">
              Google Drive Auto-Setup
            </h3>
            <p className="text-xs text-ink-600 mb-3">
              One click creates your full data room folder structure in Google Drive with
              pre-filled template documents. Share the folder link with investors when ready.
            </p>
            {driveSetupResult ? (
              <a
                href={driveSetupResult.dataRoomFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
                Open Data Room in Drive ({driveSetupResult.totalTemplates} templates)
              </a>
            ) : (
              <button
                type="button"
                onClick={handleSetupDrive}
                disabled={settingUpDrive}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {settingUpDrive ? (
                  <>
                    <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <HardDrive strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Create Data Room in Google Drive
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink-800">
            {completedItems}/{totalItems} items complete ({progressPercent}%)
          </p>
          <span
            className={cn(
              "text-xs font-medium px-2.5 py-1 rounded-full border",
              progressPercent === 100
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : progressPercent >= 50
                  ? "bg-brand-50 text-brand-700 border-brand-200"
                  : "bg-surface-100 text-ink-600 border-surface-200",
            )}
          >
            {progressPercent === 100
              ? "Complete"
              : progressPercent >= 50
                ? "Good progress"
                : "Getting started"}
          </span>
        </div>
        <div className="w-full h-2.5 bg-surface-100 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progressPercent === 100
                ? "bg-emerald-500"
                : "bg-brand-500",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Goals Progress Panel (T0098) */}
      <div className="rounded-xl border border-surface-200 bg-white shadow-sm mb-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowGoals((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-50 transition-colors cursor-pointer"
        >
          <div className="h-8 w-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center shrink-0">
            <Target strokeWidth={1.5} className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-sm font-semibold text-ink-800">
              Automation Goals
              {goalsData && (
                <span className={cn(
                  "ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
                  goalsData.completionScore >= 80
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : goalsData.completionScore >= 40
                    ? "bg-brand-50 text-brand-700 border-brand-200"
                    : "bg-amber-50 text-amber-700 border-amber-200",
                )}>
                  {goalsData.completionScore}% complete
                </span>
              )}
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              {goalsData
                ? `${goalsData.stats.completed}/${goalsData.stats.total} goals done · P0 score: ${goalsData.p0Score}%`
                : "Track automation goals for each data room section"}
            </p>
          </div>
          {goalsLoading && <Loader2 strokeWidth={1.75} className="h-4 w-4 text-ink-400 animate-spin shrink-0" />}
          {showGoals ? (
            <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
          ) : (
            <ChevronRight strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
          )}
        </button>

        {showGoals && goalsData && (
          <div className="border-t border-surface-100">
            {/* Section progress grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-0 divide-x divide-y divide-surface-100 border-b border-surface-100">
              {goalsData.sections.map((sec) => (
                <div key={sec.section} className="p-3">
                  <p className="text-[10px] font-semibold text-ink-600 leading-tight truncate" title={sec.section}>
                    {sec.section.replace(/^\d+\.\s+/, "")}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-surface-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          sec.pct === 100 ? "bg-emerald-500" : sec.pct >= 50 ? "bg-brand-500" : "bg-amber-400"
                        )}
                        style={{ width: `${sec.pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-ink-500 shrink-0">{sec.pct}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* P0 goals list */}
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-ink-700 mb-2">Critical (P0) Goals</p>
              <div className="space-y-2">
                {goalsData.goals
                  .filter((g) => g.priority === "P0")
                  .slice(0, 6)
                  .map((g) => (
                    <div key={g.id} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => g.status !== "complete" && handleMarkGoalComplete(g.templateId)}
                        className="shrink-0"
                      >
                        {g.status === "complete" ? (
                          <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle strokeWidth={1.75} className="h-4 w-4 text-surface-300" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-xs font-medium truncate",
                          g.status === "complete" ? "line-through text-ink-400" : "text-ink-800"
                        )}>
                          {g.title}
                        </p>
                        <p className="text-[10px] text-ink-500 truncate">{g.section.replace(/^\d+\.\s+/, "")}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                        g.goalType === "ai_generate"
                          ? "text-amber-700 bg-amber-50 border-amber-200"
                          : g.goalType === "connect_integration"
                          ? "text-teal-700 bg-teal-50 border-teal-200"
                          : g.goalType === "template_fill"
                          ? "text-brand-700 bg-brand-50 border-brand-200"
                          : "text-ink-600 bg-surface-100 border-surface-200"
                      )}>
                        {g.goalType === "ai_generate" ? "AI" : g.goalType === "connect_integration" ? "Connect" : g.goalType === "template_fill" ? "Fill" : "Upload"}
                      </span>
                      {g.creditsReward > 0 && g.status !== "complete" && (
                        <span className="shrink-0 text-[10px] text-amber-600 font-semibold">
                          +{g.creditsReward}cr
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Fill Result Display */}
      {autoFillResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-sm mb-6 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <Wand2 strokeWidth={1.5} className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-semibold text-ink-800">Auto-Fill Result</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoFillResult(null)}
              className="text-xs text-ink-500 hover:text-ink-700"
            >
              Dismiss
            </button>
          </div>
          <div className="px-5 py-4">
            <pre className="text-xs text-ink-700 whitespace-pre-wrap font-mono bg-white rounded-lg border border-emerald-100 p-3 max-h-64 overflow-y-auto">
              {autoFillResult.content.slice(0, 2000)}
              {autoFillResult.content.length > 2000 ? "\n\n[... truncated, document saved in full]" : ""}
            </pre>
          </div>
        </div>
      )}

      {/* One-Click Data Room Generator */}
      <div className="rounded-xl border border-amber-100 bg-amber-50/30 p-5 shadow-sm mb-6">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0">
            <Sparkles strokeWidth={1.5} className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ink-800 mb-1">
              One-Click Data Room Generator
            </h3>
            <p className="text-xs text-ink-600 mb-3">
              Automatically compile your investor data room from existing SVI data,
              metrics, cap table, and evidence vault. See completeness gaps at a glance.
              <span className="font-semibold text-amber-700"> 3.00 credits</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGenerateDataRoom}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {generating ? (
                  <>
                    <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Generate Data Room
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleShareWithInvestor}
                disabled={sharingLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {sharingLoading ? (
                  <>
                    <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />
                    Creating link...
                  </>
                ) : (
                  <>
                    <Share2 strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Share with Investor
                  </>
                )}
              </button>
            </div>

            {/* Share link display */}
            {shareLink && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2">
                <Link2 strokeWidth={1.5} className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 text-xs text-ink-700 bg-transparent outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
                >
                  {copied ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" /> Copied
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Copy strokeWidth={1.75} className="h-3.5 w-3.5" /> Copy
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generated Data Room Results */}
      {generatedRoom && (
        <div className="rounded-xl border border-surface-200 bg-white shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-800">Generated Data Room</h3>
              <p className="text-xs text-ink-500 mt-0.5">
                Generated {new Date(generatedRoom.generatedAt).toLocaleString("en-AU")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold",
                generatedRoom.overallCompleteness >= 80
                  ? "bg-emerald-50 text-emerald-700 border-2 border-emerald-200"
                  : generatedRoom.overallCompleteness >= 50
                    ? "bg-brand-50 text-brand-700 border-2 border-brand-200"
                    : "bg-amber-50 text-amber-700 border-2 border-amber-200",
              )}>
                {generatedRoom.overallCompleteness}%
              </div>
            </div>
          </div>

          <div className="divide-y divide-surface-100">
            {generatedRoom.sections.map((section) => (
              <GeneratedSectionRow key={section.id} section={section} />
            ))}
          </div>
        </div>
      )}

      {/* Template Structure Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-ink-700">Document Templates</h2>
        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium cursor-pointer"
        >
          {showTemplates ? "Hide templates" : "Show templates"}
        </button>
      </div>

      {/* Template Structure - Accordion */}
      {showTemplates && (
        <div className="space-y-3 mb-8">
          {templateStructure.map((folder) => (
            <TemplateFolderSection
              key={folder.name}
              folder={folder}
              onDownload={downloadTemplate}
              onUpload={triggerUpload}
              onAutoFill={(docName) => handleAutoFill(docName)}
              autoFillingId={autoFilling ? autoFillDocId : null}
            />
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-surface-200 my-6" />

      {/* Category sections - existing checklist */}
      <h2 className="text-sm font-semibold text-ink-700 mb-4">Upload Checklist</h2>
      <div className="space-y-4">
        {categories.map((category) => {
          const categoryItems = items.filter((i) => i.category === category);
          const categoryCompleted = categoryItems.filter(
            (i) =>
              states[i.id]?.status === "uploaded" ||
              states[i.id]?.status === "verified",
          ).length;
          const isExpanded = expandedCategories.has(category);

          return (
            <div
              key={category}
              className="rounded-xl border border-surface-200 bg-white shadow-sm overflow-hidden"
            >
              {/* Category header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                <span className="text-xl shrink-0">
                  {CATEGORY_ICONS[category] ?? "📁"}
                </span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-ink-800">
                    {category}
                  </p>
                  <p className="text-xs text-ink-500">
                    {categoryCompleted}/{categoryItems.length} complete
                  </p>
                </div>
                {/* Mini progress */}
                <div className="w-16 h-1.5 bg-surface-100 rounded-full overflow-hidden shrink-0">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      categoryCompleted === categoryItems.length
                        ? "bg-emerald-500"
                        : "bg-brand-500",
                    )}
                    style={{
                      width: `${
                        categoryItems.length > 0
                          ? Math.round(
                              (categoryCompleted / categoryItems.length) * 100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {isExpanded ? (
                  <ChevronDown
                    strokeWidth={1.75}
                    className="h-4 w-4 text-ink-400 shrink-0"
                  />
                ) : (
                  <ChevronRight
                    strokeWidth={1.75}
                    className="h-4 w-4 text-ink-400 shrink-0"
                  />
                )}
              </button>

              {/* Items */}
              {isExpanded && (
                <div className="border-t border-surface-100">
                  {categoryItems.map((item, idx) => {
                    const state = states[item.id];
                    const statusConfig = STATUS_CONFIG[state?.status ?? "not_started"];
                    const StatusIcon = statusConfig.icon;
                    const isUploading = uploadingId === item.id;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-4 px-5 py-4",
                          idx < categoryItems.length - 1 &&
                            "border-b border-surface-50",
                        )}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleItemDone(item.id)}
                          className="shrink-0 cursor-pointer"
                          title={
                            state?.status === "not_started"
                              ? "Mark as done"
                              : "Mark as not done"
                          }
                        >
                          {state?.status === "verified" ? (
                            <ShieldCheck
                              strokeWidth={1.75}
                              className="h-5 w-5 text-emerald-500"
                            />
                          ) : state?.status === "uploaded" ? (
                            <CheckCircle2
                              strokeWidth={1.75}
                              className="h-5 w-5 text-brand-500"
                            />
                          ) : (
                            <Circle
                              strokeWidth={1.75}
                              className="h-5 w-5 text-surface-300"
                            />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              state?.status !== "not_started"
                                ? "text-ink-600 line-through"
                                : "text-ink-800",
                            )}
                          >
                            {item.label}
                          </p>
                          <p className="text-xs text-ink-500 mt-0.5">
                            {item.description}
                          </p>
                          {state?.fileName && state.fileUrl && (
                            <a
                              href={state.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 mt-1"
                            >
                              <ExternalLink
                                strokeWidth={1.75}
                                className="h-3 w-3"
                              />
                              {state.fileName}
                            </a>
                          )}
                        </div>

                        {/* Status badge */}
                        <span
                          className={cn(
                            "hidden sm:inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold shrink-0",
                            statusConfig.className,
                          )}
                        >
                          <StatusIcon strokeWidth={1.75} className="h-3 w-3" />
                          {statusConfig.label}
                        </span>

                        {/* Upload button */}
                        <button
                          type="button"
                          onClick={() => triggerUpload(item.id)}
                          disabled={isUploading}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-ink-600 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50/50 transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isUploading ? (
                            <Loader2
                              strokeWidth={1.75}
                              className="h-3.5 w-3.5 animate-spin"
                            />
                          ) : (
                            <Upload
                              strokeWidth={1.75}
                              className="h-3.5 w-3.5"
                            />
                          )}
                          <span className="hidden sm:inline">Upload</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer tip */}
      <div className="mt-8 rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-ink-700">
          <span className="font-semibold">Tip:</span> Upload documents in PDF or
          DOCX format for best results. Files are securely stored and only visible
          to you and your team. Uploaded documents contribute to your SVI score.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Template Folder Accordion Section
// ---------------------------------------------------------------------------

function TemplateFolderSection({
  folder,
  onDownload,
  onUpload,
  onAutoFill,
  autoFillingId,
}: {
  folder: DataRoomFolder;
  onDownload: (name: string) => void;
  onUpload: (id: string) => void;
  onAutoFill?: (docName: string) => void;
  autoFillingId?: string | null;
}) {
  const [expanded, setExpanded] = React.useState(false);

  const priorityColors = {
    P0: "bg-red-50 text-red-700 border-red-200",
    P1: "bg-amber-50 text-amber-700 border-amber-200",
    P2: "bg-surface-100 text-ink-600 border-surface-200",
  };

  const stageColors = {
    idea: "bg-purple-50 text-purple-700 border-purple-200",
    mvp: "bg-blue-50 text-blue-700 border-blue-200",
    launch: "bg-teal-50 text-teal-700 border-teal-200",
    revenue: "bg-emerald-50 text-emerald-700 border-emerald-200",
    raise: "bg-brand-50 text-brand-700 border-brand-200",
  };

  return (
    <div className="rounded-xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 transition-colors cursor-pointer"
      >
        <FolderOpen strokeWidth={1.5} className="h-4 w-4 text-brand-500 shrink-0" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-ink-800">{folder.name}</p>
          <p className="text-xs text-ink-500">{folder.description}</p>
        </div>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0", stageColors[folder.stage])}>
          {folder.stage}
        </span>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0", priorityColors[folder.priority])}>
          {folder.priority}
        </span>
        {expanded ? (
          <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
        ) : (
          <ChevronRight strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-surface-100 divide-y divide-surface-50">
          {folder.documents.map((doc) => (
            <div key={doc.name} className="flex items-center gap-3 px-5 py-3">
              {/* Icon based on type */}
              <div className="shrink-0">
                {doc.type === "template" && (
                  <FileText strokeWidth={1.5} className="h-4 w-4 text-brand-500" />
                )}
                {doc.type === "upload" && (
                  <Upload strokeWidth={1.5} className="h-4 w-4 text-ink-400" />
                )}
                {doc.type === "connect" && (
                  <Link2 strokeWidth={1.5} className="h-4 w-4 text-teal-500" />
                )}
              </div>

              {/* Doc info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-800">{doc.name}</p>
                <p className="text-xs text-ink-500">{doc.description}</p>
              </div>

              {/* Format badge */}
              {doc.format && (
                <span className="text-[10px] font-semibold text-ink-500 bg-surface-100 px-2 py-0.5 rounded-full border border-surface-200 shrink-0 uppercase">
                  {doc.format}
                </span>
              )}

              {/* Action button */}
              {doc.type === "template" && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onDownload(doc.name)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer"
                  >
                    <Download strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Template
                  </button>
                  {onAutoFill && (
                    <button
                      type="button"
                      onClick={() => onAutoFill(doc.name)}
                      disabled={autoFillingId === doc.name}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Auto-fill with AI (0.25 credits)"
                    >
                      {autoFillingId === doc.name ? (
                        <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 strokeWidth={1.75} className="h-3.5 w-3.5" />
                      )}
                      AI Fill
                    </button>
                  )}
                </div>
              )}
              {doc.type === "upload" && (
                <button
                  type="button"
                  onClick={() => onUpload(doc.name)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:text-brand-600 hover:border-brand-200 transition-colors cursor-pointer"
                >
                  <Upload strokeWidth={1.75} className="h-3.5 w-3.5" />
                  Upload
                </button>
              )}
              {doc.type === "connect" && doc.connectTo && (
                <a
                  href={CONNECT_URLS[doc.connectTo] ?? "#"}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 transition-colors"
                >
                  <Link2 strokeWidth={1.75} className="h-3.5 w-3.5" />
                  Connect
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generated Section Row — expandable section with completeness bar
// ---------------------------------------------------------------------------

function GeneratedSectionRow({
  section,
}: {
  section: GeneratedDataRoom["sections"][number];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const completeCount = section.items.filter((i) => i.status === "complete").length;
  const missingCount = section.items.filter((i) => i.status === "missing").length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 transition-colors cursor-pointer"
      >
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-ink-800">{section.title}</p>
          <p className="text-xs text-ink-500">
            {completeCount}/{section.items.length} items
            {missingCount > 0 && (
              <span className="text-amber-600 ml-1">
                ({missingCount} missing)
              </span>
            )}
          </p>
        </div>
        {/* Completeness bar */}
        <div className="w-20 shrink-0">
          <div className="w-full h-1.5 bg-surface-100 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                section.completeness === 100
                  ? "bg-emerald-500"
                  : section.completeness >= 50
                    ? "bg-brand-500"
                    : "bg-amber-500",
              )}
              style={{ width: `${section.completeness}%` }}
            />
          </div>
          <p className="text-[10px] text-ink-500 text-right mt-0.5">
            {section.completeness}%
          </p>
        </div>
        {expanded ? (
          <ChevronDown strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
        ) : (
          <ChevronRight strokeWidth={1.75} className="h-4 w-4 text-ink-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-2">
          {section.items.map((item, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                item.status === "complete"
                  ? "bg-emerald-50/50"
                  : item.status === "partial"
                    ? "bg-amber-50/50"
                    : "bg-red-50/30",
              )}
            >
              {item.status === "complete" ? (
                <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : item.status === "partial" ? (
                <AlertCircle strokeWidth={1.75} className="h-4 w-4 text-amber-500 shrink-0" />
              ) : (
                <Circle strokeWidth={1.75} className="h-4 w-4 text-red-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-ink-700">{item.label}</p>
                {item.value && (
                  <p className="text-[11px] text-ink-500 truncate">{item.value}</p>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
                  item.source === "auto"
                    ? "bg-brand-50 text-brand-600 border-brand-200"
                    : item.source === "evidence"
                      ? "bg-teal-50 text-teal-600 border-teal-200"
                      : "bg-surface-100 text-ink-500 border-surface-200",
                )}
              >
                {item.source}
              </span>
              {item.status === "missing" && (
                <a
                  href={
                    item.source === "evidence"
                      ? "/workspace/evidence"
                      : item.label.toLowerCase().includes("cap table")
                        ? "/workspace/cap-table"
                        : item.label.toLowerCase().includes("metric")
                          ? "/workspace/metrics"
                          : "/workspace/evidence"
                  }
                  className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 shrink-0"
                >
                  Add
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
