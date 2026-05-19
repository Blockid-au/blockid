"use client";

import * as React from "react";
import { X, FileText, Link2, GitBranch, BarChart3, CreditCard, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EvidenceType = "text" | "document" | "url" | "github" | "analytics" | "stripe";

interface EvidenceTypeOption {
  id: EvidenceType;
  label: string;
  desc: string;
  icon: React.ElementType;
  impact: string;
  confidence: string;
}

const EVIDENCE_TYPES: EvidenceTypeOption[] = [
  { id: "text", label: "Manual Text", desc: "Describe evidence in writing", icon: FileText, impact: "+2–5 SVI", confidence: "20% confidence" },
  { id: "document", label: "Upload Document", desc: "PDF, DOCX, XLSX — pitch deck, cap table, contracts", icon: FileText, impact: "+5–15 SVI", confidence: "50% confidence" },
  { id: "url", label: "Public URL", desc: "Website, LinkedIn, App Store, GitHub link", icon: Link2, impact: "+3–10 SVI", confidence: "35% confidence" },
  { id: "github", label: "Connect GitHub", desc: "OAuth — verify commits, stars, activity", icon: GitBranch, impact: "+8–12 SVI", confidence: "75% confidence" },
  { id: "analytics", label: "Connect Analytics", desc: "Google Analytics — sessions, users, growth", icon: BarChart3, impact: "+6–10 SVI", confidence: "75% confidence" },
  { id: "stripe", label: "Connect Stripe", desc: "Verify MRR, ARR, customer count, churn", icon: CreditCard, impact: "+15–25 SVI", confidence: "90% confidence" },
];

export function EvidenceWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [evidenceType, setEvidenceType] = React.useState<EvidenceType | null>(null);
  const [inputValue, setInputValue] = React.useState("");

  const selected = EVIDENCE_TYPES.find(e => e.id === evidenceType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-700">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-400 font-medium">Add Evidence</p>
            <p className="text-sm font-semibold text-slate-100 mt-0.5">
              Step {step} of 3 — {step === 1 ? "Choose Type" : step === 2 ? "Provide Evidence" : "Confirm Impact"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 cursor-pointer transition-colors">
            <X strokeWidth={1.75} className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Choose evidence type */}
        {step === 1 && (
          <div className="p-6">
            <div className="grid grid-cols-2 gap-3">
              {EVIDENCE_TYPES.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => { setEvidenceType(opt.id); setStep(2); }}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-4 text-left cursor-pointer transition-all",
                      "border-ink-700 bg-ink-800/60 hover:border-brand-500/50 hover:bg-ink-800",
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-400" />
                      <span className="text-[10px] font-mono font-semibold text-teal-400">{opt.impact}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-100">{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">{opt.desc}</p>
                    </div>
                    <span className="text-[10px] text-slate-600">{opt.confidence}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Provide evidence */}
        {step === 2 && selected && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-4 py-3">
              <selected.icon strokeWidth={1.75} className="h-4 w-4 text-brand-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-100">{selected.label}</p>
                <p className="text-xs text-slate-500">{selected.confidence}</p>
              </div>
            </div>

            {(evidenceType === "text") && (
              <textarea
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Describe your evidence here (customer quotes, market research findings, metrics...)…"
                rows={5}
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 resize-none"
              />
            )}

            {(evidenceType === "url") && (
              <input
                type="url"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500"
              />
            )}

            {(evidenceType === "document") && (
              <div className="rounded-xl border-2 border-dashed border-ink-600 px-6 py-10 text-center cursor-pointer hover:border-brand-500/50 transition-colors">
                <FileText strokeWidth={1.75} className="mx-auto h-8 w-8 text-slate-600 mb-3" />
                <p className="text-sm text-slate-400">Drag & drop or <span className="text-brand-400">browse files</span></p>
                <p className="text-xs text-slate-600 mt-1">PDF, DOCX, XLSX — max 10MB</p>
              </div>
            )}

            {(evidenceType === "github" || evidenceType === "analytics" || evidenceType === "stripe") && (
              <div className="rounded-xl border border-ink-700 bg-ink-800 px-6 py-8 text-center">
                <selected.icon strokeWidth={1.75} className="mx-auto h-8 w-8 text-brand-400 mb-3" />
                <p className="text-sm font-medium text-slate-200 mb-1">Connect {selected.label}</p>
                <p className="text-xs text-slate-500 mb-4">You&apos;ll be redirected to authorize access. We only read — never write.</p>
                <Button variant="primary" size="sm" className="mx-auto" onClick={() => setStep(3)}>
                  Authorize {selected.label} →
                </Button>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setStep(1)} className="flex-1">Back</Button>
              {(evidenceType === "text" || evidenceType === "url") && (
                <Button variant="primary" size="sm" onClick={() => setStep(3)} disabled={!inputValue.trim()} className="flex-1">
                  Preview Impact <ChevronRight strokeWidth={1.75} className="h-4 w-4 ml-1" />
                </Button>
              )}
              {evidenceType === "document" && (
                <Button variant="primary" size="sm" onClick={() => setStep(3)} className="flex-1">
                  Confirm Upload <ChevronRight strokeWidth={1.75} className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Impact preview + confirm */}
        {step === 3 && selected && (
          <div className="p-6 space-y-5">
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 px-5 py-4 text-center">
              <CheckCircle2 strokeWidth={1.75} className="mx-auto h-8 w-8 text-green-400 mb-2" />
              <p className="text-sm font-semibold text-slate-100">Estimated SVI Impact</p>
              <p className="text-3xl font-bold font-mono text-teal-400 mt-1">{selected.impact}</p>
              <p className="text-xs text-slate-500 mt-2">Confidence will increase to <span className="text-slate-300">{selected.confidence.split(" ")[0]}</span></p>
            </div>

            <div className="space-y-2 text-sm text-slate-400">
              <p><span className="text-slate-300 font-medium">Type:</span> {selected.label}</p>
              {inputValue && <p><span className="text-slate-300 font-medium">Value:</span> <span className="font-mono text-xs">{inputValue.substring(0, 60)}{inputValue.length > 60 ? "…" : ""}</span></p>}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep(2)} className="flex-1">Back</Button>
              <Button variant="primary" size="sm" onClick={onClose} className="flex-1">
                Add Evidence → Update SVI
              </Button>
            </div>

            <p className="text-center text-[10px] text-slate-600">
              Your SVI will recalculate immediately. Verified evidence has higher weight.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
