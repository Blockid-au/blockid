"use client";

import * as React from "react";
import { FileText, Plus, ExternalLink, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceWizard } from "./evidence-wizard";

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

interface EvidenceVaultClientProps {
  initialEvidence: EvidenceItem[];
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  self_declared: { label: "Self-declared", color: "text-slate-500" },
  public_url: { label: "Public URL", color: "text-blue-400" },
  document_uploaded: { label: "Document", color: "text-amber-400" },
  connected_source: { label: "Connected", color: "text-teal-400" },
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

export function EvidenceVaultClient({ initialEvidence }: EvidenceVaultClientProps) {
  const [evidence, setEvidence] = React.useState<EvidenceItem[]>(initialEvidence);
  const [showWizard, setShowWizard] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

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

  const handleWizardSuccess = React.useCallback(() => {
    setShowWizard(false);
    void refreshEvidence();
  }, [refreshEvidence]);

  const totalImpact = evidence.reduce((sum, e) => sum + (e.svi_impact ?? 0), 0);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-50">Evidence Vault</h1>
          <p className="text-sm text-slate-500 mt-1">
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

      {evidence.length > 0 ? (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-6 rounded-xl border border-ink-700 bg-ink-800/60 px-5 py-3 mb-5">
            <div>
              <p className="text-xs text-slate-500">Total Items</p>
              <p className="text-lg font-bold font-mono text-slate-100">{evidence.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Est. SVI Impact</p>
              <p className="text-lg font-bold font-mono text-teal-400">+{totalImpact}</p>
            </div>
            {refreshing && (
              <Loader2 strokeWidth={1.75} className="h-4 w-4 text-slate-500 animate-spin ml-auto" />
            )}
          </div>

          {/* Evidence list */}
          <div className="space-y-3">
            {evidence.map((item) => {
              const conf = CONFIDENCE_LABELS[item.confidence_level] ?? CONFIDENCE_LABELS.self_declared;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 rounded-xl border border-ink-700 bg-ink-900/80 px-5 py-4 hover:border-ink-600 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 border border-ink-700">
                    <FileText strokeWidth={1.5} className="h-4 w-4 text-brand-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{item.label}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-500">
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
                          className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                        >
                          <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
                          Link
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-teal-400">+{item.svi_impact}</p>
                    <div className="flex items-center gap-1 mt-0.5 justify-end">
                      {item.verified_at ? (
                        <CheckCircle2 strokeWidth={1.75} className="h-3 w-3 text-green-400" />
                      ) : (
                        <Clock strokeWidth={1.75} className="h-3 w-3 text-slate-600" />
                      )}
                      <span className="text-[10px] text-slate-600">
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
        <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 px-6 py-16 text-center">
          <FileText strokeWidth={1.25} className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">No evidence yet</p>
          <p className="text-slate-600 text-sm mt-1">
            Upload pitch decks, cap tables, revenue proofs, and more to boost your SVI.
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => setShowWizard(true)}
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Add Your First Evidence
          </Button>
        </div>
      )}

      {showWizard && (
        <EvidenceWizard
          onClose={() => setShowWizard(false)}
          onSuccess={handleWizardSuccess}
        />
      )}
    </>
  );
}
