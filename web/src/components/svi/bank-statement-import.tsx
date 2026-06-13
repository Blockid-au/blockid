"use client";

import * as React from "react";
import { Upload, CheckCircle2, AlertCircle, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportResult {
  bankName: string;
  summary: {
    transactionCount: number;
    monthsCovered: number;
    avgMonthlyBurnAud: number;
    netCashFlowAud: number;
    sviImpact: number;
  };
}

export function BankStatementImport({ onImported }: { onImported?: () => void }) {
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = React.useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file (exported from your bank's internet banking).");
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/evidence/bank-statement", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Could not parse bank statement.");
      } else {
        setResult(json);
        onImported?.();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setUploading(false);
    }
  }, [onImported]);

  const onDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-800">
              {result.bankName} statement imported · +{result.summary.sviImpact} SVI points
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-emerald-700">
              <span>{result.summary.transactionCount} transactions</span>
              <span>{result.summary.monthsCovered} months covered</span>
              <span>A${result.summary.avgMonthlyBurnAud.toLocaleString("en-AU")}/mo avg burn</span>
              <span>
                Net: {result.summary.netCashFlowAud >= 0 ? "+" : ""}
                A${result.summary.netCashFlowAud.toLocaleString("en-AU")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="mt-2 text-xs text-emerald-600 hover:underline"
            >
              Import another statement
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors",
          dragging ? "border-brand-400 bg-brand-50" : "border-surface-200 bg-surface-50 hover:border-brand-300 hover:bg-brand-50/50",
        )}
      >
        <input ref={inputRef} type="file" accept=".csv" className="sr-only" onChange={onInputChange} />
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        ) : (
          <Upload className="h-6 w-6 text-ink-400" />
        )}
        <p className="text-sm font-medium text-ink-700">
          {uploading ? "Parsing statement…" : "Drop bank statement CSV here"}
        </p>
        <p className="text-xs text-ink-400 text-center">
          Supports ANZ · CBA · NAB · Westpac exports · or click to browse
        </p>
        <div className="flex items-center gap-2 mt-1">
          {["ANZ", "CBA", "NAB", "Westpac"].map((b) => (
            <span key={b} className="rounded border border-surface-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-ink-500">
              {b}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <p className="text-xs text-ink-400 flex items-center gap-1">
        <FileText className="h-3 w-3" />
        How to export: Internet banking → Transactions → Download CSV
      </p>
    </div>
  );
}
