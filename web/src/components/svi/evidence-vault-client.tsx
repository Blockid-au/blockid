"use client";

import * as React from "react";
import { FileText, Plus, ExternalLink, CheckCircle2, Clock, Loader2, Globe, Code, Receipt, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectButtons } from "@/components/ui/connect-buttons";
import { EvidenceWizard } from "./evidence-wizard";
import { ConnectorStatus } from "./connector-status";
import { AnalyzeTierModal } from "./analyze-tier-modal";

interface EvidenceItem {
  id: string;
  evidence_type: string;
  label: string;
  value_or_url: string | null;
  confidence_level: string;
  dimension: string;
  svi_impact: number;
  verified_at: string | null;
  created_at: string;
}

interface RescoreResult {
  ok: boolean;
  previousSVI?: number;
  newSVI?: number;
  delta?: number;
  evidenceCount?: number;
}

interface EvidenceGap {
  priority: "P0" | "P1" | "P2";
  label: string;
  action: string;
  impact: number;
  evidenceType: string;
}

interface EvidenceVaultClientProps {
  initialEvidence: EvidenceItem[];
  evidenceGaps?: EvidenceGap[];
  currentSVI?: number | null;
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  self_declared: { label: "Self-declared", color: "text-ink-600" },
  public_url: { label: "Public URL", color: "text-blue-600" },
  document_uploaded: { label: "Document", color: "text-amber-600" },
  connected_source: { label: "Connected", color: "text-teal-600" },
};

const TYPE_LABELS: Record<string, string> = {
  text: "Manual Text",
  url: "Public URL",
  document: "Document",
  github: "GitHub",
  analytics: "Analytics",
  stripe: "Stripe",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  P0: { label: "Critical", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  P1: { label: "Important", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  P2: { label: "Recommended", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
};

const EVIDENCE_TYPE_ICONS: Record<string, string> = {
  transaction_data: "💰",
  connected_source: "🔗",
  document_uploaded: "📄",
  public_url: "🌐",
  self_declared: "✏️",
};

export function EvidenceVaultClient({ initialEvidence, evidenceGaps, currentSVI }: EvidenceVaultClientProps) {
  const [evidence, setEvidence] = React.useState<EvidenceItem[]>(initialEvidence);
  const [showWizard, setShowWizard] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [rescoreToast, setRescoreToast] = React.useState<string | null>(null);
  const [analyzeTarget, setAnalyzeTarget] = React.useState<{ id: string; label: string } | null>(null);

  const refreshEvidence = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/evidence");
      const json = await res.json();
      if (json.ok && Array.isArray(json.evidence)) {
        setEvidence(json.evidence);
      }
    } catch {
      // Silently fail — the list will remain as-is
    } finally {
      setRefreshing(false);
    }
  }, []);

  const triggerRescore = React.useCallback(async () => {
    try {
      const rescoreRes = await fetch("/api/svi/rescore-from-evidence", { method: "POST" });
      const rescoreData: RescoreResult = await rescoreRes.json();
      if (rescoreData.ok && rescoreData.delta != null && rescoreData.delta !== 0) {
        setRescoreToast(
          `SVI ${rescoreData.delta > 0 ? "+" : ""}${rescoreData.delta} points \u2192 New score: ${rescoreData.newSVI}`,
        );
        // Auto-dismiss after 6 seconds
        setTimeout(() => setRescoreToast(null), 6000);
      }
    } catch {
      // Rescore is best-effort — don't block the user
    }
  }, []);

  const handleWizardSuccess = React.useCallback(() => {
    setShowWizard(false);
    void refreshEvidence();
    void triggerRescore();
  }, [refreshEvidence, triggerRescore]);

  const totalImpact = evidence.reduce((sum, e) => sum + (e.svi_impact ?? 0), 0);

  return (
    <>
      {/* SVI rescore toast */}
      {rescoreToast && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-5 py-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm font-semibold text-teal-700">{rescoreToast}</p>
          <button
            type="button"
            onClick={() => setRescoreToast(null)}
            className="text-teal-600 hover:text-teal-800 cursor-pointer text-xs font-medium ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Connector status dashboard */}
      <ConnectorStatus />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Evidence Vault</h1>
          <p className="text-sm text-ink-600 mt-1">
            Upload and manage your startup evidence to lift your SVI.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowWizard(true)}
        >
          <Plus strokeWidth={1.75} className="h-4 w-4" />
          Add Evidence
        </Button>
      </div>

      {/* Connect buttons — quick access to OAuth/URL connectors */}
      <ConnectButtons
        evidence={evidence}
        onEvidenceAdded={() => {
          void refreshEvidence();
          void triggerRescore();
        }}
        onOpenWizard={() => setShowWizard(true)}
      />

      {/* Evidence Gaps — What to add next */}
      {evidenceGaps && evidenceGaps.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-800">What to Add Next</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                These are the specific items that will boost your SVI the most.
                {currentSVI != null && <span className="font-medium text-brand-600"> Current SVI: {currentSVI}</span>}
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            {evidenceGaps.map((gap) => {
              const config = PRIORITY_CONFIG[gap.priority] ?? PRIORITY_CONFIG.P2;
              const icon = EVIDENCE_TYPE_ICONS[gap.evidenceType] ?? "📎";
              return (
                <button
                  key={gap.label}
                  type="button"
                  onClick={() => setShowWizard(true)}
                  className={`w-full text-left rounded-xl border ${config.border} ${config.bg} px-4 py-3 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-ink-800">{gap.label}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color} ${config.bg} border ${config.border} px-1.5 py-0.5 rounded`}>
                          {config.label}
                        </span>
                      </div>
                      <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">{gap.action}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold font-mono text-teal-600">+{gap.impact}</p>
                      <p className="text-[10px] text-ink-500">SVI pts</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {evidenceGaps.length > 0 && (
            <p className="text-[11px] text-ink-400 mt-2 text-center">
              Total potential gain: +{evidenceGaps.reduce((s, g) => s + g.impact, 0)} SVI points
              {currentSVI != null && ` → Projected SVI: ${currentSVI + evidenceGaps.reduce((s, g) => s + g.impact, 0)}`}
            </p>
          )}
        </div>
      )}

      {evidence.length > 0 ? (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-6 rounded-xl border border-surface-200 bg-white px-5 py-3 mb-5 shadow-sm">
            <div>
              <p className="text-xs text-ink-600">Total Items</p>
              <p className="text-lg font-bold font-mono text-ink-800">{evidence.length}</p>
            </div>
            <div>
              <p className="text-xs text-ink-600">Est. SVI Impact</p>
              <p className="text-lg font-bold font-mono text-teal-600">+{totalImpact}</p>
            </div>
            {refreshing && (
              <Loader2 strokeWidth={1.75} className="h-4 w-4 text-ink-600 animate-spin ml-auto" />
            )}
          </div>

          {/* Evidence list */}
          <div className="space-y-3">
            {evidence.map((item) => {
              const conf = CONFIDENCE_LABELS[item.confidence_level] ?? CONFIDENCE_LABELS.self_declared;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-xl border border-surface-200 bg-white px-5 py-4 hover:border-brand-200 transition-colors shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-100 border border-surface-200">
                    <FileText strokeWidth={1.5} className="h-4 w-4 text-brand-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-800 truncate">{item.label}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-ink-600">
                        {TYPE_LABELS[item.evidence_type] ?? item.evidence_type}
                      </span>
                      <span className={`text-xs font-medium ${conf.color}`}>
                        {conf.label}
                      </span>
                      {item.value_or_url && item.evidence_type === "url" && (
                        <a
                          href={item.value_or_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
                        >
                          <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
                          Link
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Analyze button */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setAnalyzeTarget({ id: item.id, label: item.label }); }}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 hover:border-brand-300 transition-all cursor-pointer"
                  >
                    <Sparkles strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Analyze
                  </button>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-teal-600">+{item.svi_impact}</p>
                    <div className="flex items-center gap-1 mt-0.5 justify-end">
                      {item.verified_at ? (
                        <CheckCircle2 strokeWidth={1.75} className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Clock strokeWidth={1.75} className="h-3 w-3 text-ink-600" />
                      )}
                      <span className="text-[10px] text-ink-700">
                        {formatDate(item.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-surface-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-ink-800">Build Your Evidence Vault</h3>
            <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
              Upload documents, connect platforms, and add proof to increase your SVI score.
              Each item below shows how many points you'll gain.
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600 mb-2">Quick Wins — Boost Your Score</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: FileText, title: "Upload Pitch Deck", desc: "PDF or PPTX — boosts Investor Readiness by +8-20 pts", pts: "+8-20", action: "Upload" },
              { icon: Globe, title: "Add Website URL", desc: "Public site proves market presence — auto tech audit runs", pts: "+6-15", action: "Add URL" },
              { icon: Code, title: "Link GitHub Repo", desc: "Source code verifies product depth + architecture audit", pts: "+10-25", action: "Connect" },
              { icon: Receipt, title: "Add Revenue Proof", desc: "Invoices, Stripe, or bank statements boost traction", pts: "+12-20", action: "Upload" },
            ].map(({ icon: Icon, title, desc, pts, action }) => (
              <button key={title} onClick={() => setShowWizard(true)} className="flex items-start gap-3 rounded-2xl border border-surface-200 bg-white p-4 text-left hover:border-brand-200 hover:shadow-md transition-all cursor-pointer group">
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0 group-hover:bg-brand-100 transition-colors">
                  <Icon strokeWidth={1.75} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink-800">{title}</p>
                    <span className="text-[10px] font-bold font-mono text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">{pts} pts</span>
                  </div>
                  <p className="text-xs text-ink-500 mt-0.5">{desc}</p>
                </div>
                <span className="text-xs font-medium text-brand-600 mt-1 group-hover:text-brand-700">{action} →</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 text-center mt-3">
            Each piece of evidence moves your confidence from self-declared (20%) toward connected source (75%) — dramatically improving your SVI accuracy and investor trust.
          </p>
        </div>
      )}

      {showWizard && (
        <EvidenceWizard
          onClose={() => setShowWizard(false)}
          onSuccess={handleWizardSuccess}
        />
      )}

      {analyzeTarget && (
        <AnalyzeTierModal
          evidenceId={analyzeTarget.id}
          evidenceLabel={analyzeTarget.label}
          onClose={() => setAnalyzeTarget(null)}
          onAnalyzed={(result) => {
            if (result.ok) {
              void refreshEvidence();
              if (result.sviBoost && result.sviBoost > 0) {
                setRescoreToast(`AI Analysis: SVI +${result.sviBoost} points`);
                setTimeout(() => setRescoreToast(null), 6000);
              }
            }
          }}
        />
      )}
    </>
  );
}
