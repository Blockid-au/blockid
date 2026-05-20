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
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface DataRoomClientProps {
  items: DataRoomItemDef[];
  categories: string[];
  initialStates: DataRoomItemState[];
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
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingItemId, setPendingItemId] = React.useState<string | null>(null);

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

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.csv"
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
          <div>
            <h1 className="text-xl font-bold text-ink-900">Data Room</h1>
            <p className="text-sm text-ink-600">
              Investor-ready document checklist for due diligence
            </p>
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

      {/* Category sections */}
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
