"use client";

import * as React from "react";
import { GitBranch, Globe, FileText, CheckCircle2, Loader2, X, BarChart3, CreditCard, Building2 } from "lucide-react";

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

interface EvidenceItem {
  id: string;
  evidence_type: string;
  confidence_level: string;
}

interface ConnectButtonsProps {
  evidence: EvidenceItem[];
  onEvidenceAdded?: () => void;
  onOpenWizard?: () => void;
}

export function ConnectButtons({ evidence, onEvidenceAdded, onOpenWizard }: ConnectButtonsProps) {
  const [urlModalOpen, setUrlModalOpen] = React.useState(false);
  const [urlValue, setUrlValue] = React.useState("");
  const [urlSaving, setUrlSaving] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [urlSuccess, setUrlSuccess] = React.useState(false);

  // Check connection status from existing evidence
  const hasGitHub = evidence.some(
    (e) => e.evidence_type === "github" && e.confidence_level === "connected_source",
  );
  const hasLinkedIn = evidence.some(
    (e) => e.evidence_type === "linkedin" && e.confidence_level === "connected_source",
  );
  const hasStripe = evidence.some(
    (e) => e.evidence_type === "stripe" && e.confidence_level === "connected_source",
  );
  const hasXero = evidence.some(
    (e) => (e.evidence_type === "xero_pl" || e.evidence_type === "xero_revenue") && e.confidence_level === "connected_source",
  );
  const hasAnalytics = evidence.some(
    (e) => e.evidence_type === "analytics" && e.confidence_level === "connected_source",
  );
  const hasUrl = evidence.some(
    (e) => e.evidence_type === "url" || (e.evidence_type === "github" && e.confidence_level === "public_url"),
  );
  const hasDocument = evidence.some(
    (e) => e.confidence_level === "document_uploaded",
  );

  // Check if OAuth providers are available (env var check via HEAD)
  const [githubAvailable, setGithubAvailable] = React.useState<boolean | null>(null);
  const [linkedinAvailable, setLinkedinAvailable] = React.useState<boolean | null>(null);
  const [stripeAvailable, setStripeAvailable] = React.useState<boolean | null>(null);
  const [analyticsAvailable, setAnalyticsAvailable] = React.useState<boolean | null>(null);
  const [xeroAvailable, setXeroAvailable] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    fetch("/api/oauth/github", { method: "HEAD", redirect: "manual" })
      .then((res) => setGithubAvailable(res.status !== 503))
      .catch(() => setGithubAvailable(false));
    fetch("/api/oauth/linkedin", { method: "HEAD", redirect: "manual" })
      .then((res) => setLinkedinAvailable(res.status !== 503))
      .catch(() => setLinkedinAvailable(false));
    fetch("/api/oauth/stripe", { method: "HEAD", redirect: "manual" })
      .then((res) => setStripeAvailable(res.status !== 503))
      .catch(() => setStripeAvailable(false));
    fetch("/api/oauth/ga4", { method: "HEAD", redirect: "manual" })
      .then((res) => setAnalyticsAvailable(res.status !== 503))
      .catch(() => setAnalyticsAvailable(false));
    fetch("/api/oauth/xero", { method: "HEAD", redirect: "manual" })
      .then((res) => setXeroAvailable(res.status !== 503))
      .catch(() => setXeroAvailable(false));
  }, []);

  const handleUrlSubmit = async () => {
    if (!urlValue.trim()) return;
    setUrlSaving(true);
    setUrlError(null);
    try {
      const res = await fetch("/api/evidence/connect-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlValue.trim(), type: "website" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setUrlError(json.error ?? "Failed to verify URL");
        return;
      }
      setUrlSuccess(true);
      trackEvent("evidence_added", { evidence_type: "url", dimension: "mpc", svi_impact: json.sviDelta ?? 0 });
      setTimeout(() => {
        setUrlModalOpen(false);
        setUrlValue("");
        setUrlSuccess(false);
        onEvidenceAdded?.();
      }, 1500);
    } catch {
      setUrlError("Network error — please try again");
    } finally {
      setUrlSaving(false);
    }
  };

  const connectors = [
    {
      id: "github" as const,
      icon: GitBranch,
      label: "Connect GitHub",
      connected: hasGitHub,
      connectedLabel: "GitHub Connected",
      available: githubAvailable !== false,
      comingSoon: githubAvailable === false,
      onClick: () => {
        if (githubAvailable === false) return;
        trackEvent("evidence_added", { evidence_type: "github", dimension: "ptd", svi_impact: 0 });
        window.location.href = "/api/oauth/github";
      },
    },
    {
      id: "linkedin" as const,
      icon: LinkedInIcon,
      label: "Connect LinkedIn",
      connected: hasLinkedIn,
      connectedLabel: "LinkedIn Connected",
      available: linkedinAvailable !== false,
      comingSoon: linkedinAvailable === false,
      onClick: () => {
        if (linkedinAvailable === false) return;
        trackEvent("evidence_added", { evidence_type: "linkedin", dimension: "cgh", svi_impact: 0 });
        window.location.href = "/api/oauth/linkedin";
      },
    },
    {
      id: "stripe" as const,
      icon: CreditCard,
      label: "Connect Stripe",
      connected: hasStripe,
      connectedLabel: "Stripe Connected",
      available: stripeAvailable !== false,
      comingSoon: stripeAvailable === false,
      onClick: () => {
        if (stripeAvailable === false) return;
        trackEvent("evidence_added", { evidence_type: "stripe", dimension: "tre", svi_impact: 0 });
        window.location.href = "/api/oauth/stripe";
      },
    },
    {
      id: "analytics" as const,
      icon: BarChart3,
      label: "Connect Analytics",
      connected: hasAnalytics,
      connectedLabel: "Analytics Connected",
      available: analyticsAvailable !== false,
      comingSoon: analyticsAvailable === false,
      onClick: () => {
        if (analyticsAvailable === false) return;
        trackEvent("evidence_added", { evidence_type: "analytics", dimension: "tre", svi_impact: 0 });
        window.location.href = "/api/oauth/ga4";
      },
    },
    {
      id: "xero" as const,
      icon: Building2,
      label: "Connect Xero",
      connected: hasXero,
      connectedLabel: "Xero Connected",
      available: xeroAvailable !== false,
      comingSoon: xeroAvailable === false,
      onClick: () => {
        if (xeroAvailable === false) return;
        trackEvent("evidence_added", { evidence_type: "xero_pl", dimension: "financial_health", svi_impact: 0 });
        window.location.href = "/api/oauth/xero";
      },
    },
    {
      id: "url" as const,
      icon: Globe,
      label: "Add Website URL",
      connected: hasUrl,
      connectedLabel: "URL Added",
      available: true,
      comingSoon: false,
      onClick: () => setUrlModalOpen(true),
    },
    {
      id: "document" as const,
      icon: FileText,
      label: "Upload Document",
      connected: hasDocument,
      connectedLabel: "Document Uploaded",
      available: true,
      comingSoon: false,
      onClick: () => onOpenWizard?.(),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {connectors.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              type="button"
              onClick={c.onClick}
              disabled={c.comingSoon}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer",
                c.connected
                  ? "border-teal-200 bg-teal-50 text-teal-700"
                  : c.comingSoon
                    ? "border-surface-200 bg-surface-50 text-ink-500 cursor-not-allowed opacity-60"
                    : "border-surface-200 bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50 shadow-sm",
              )}
            >
              {c.connected ? (
                <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-teal-600" />
              ) : (
                <Icon strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              )}
              {c.connected ? c.connectedLabel : c.comingSoon ? `${c.label} (Coming soon)` : c.label}
            </button>
          );
        })}
      </div>

      {/* URL input modal */}
      {urlModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setUrlModalOpen(false); setUrlError(null); }} />
          <div className="relative w-full max-w-md rounded-2xl border border-surface-200 bg-white shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-brand-600 font-medium">Add Evidence</p>
                <p className="text-sm font-semibold text-ink-800 mt-0.5">Verify a Public URL</p>
              </div>
              <button
                type="button"
                onClick={() => { setUrlModalOpen(false); setUrlError(null); }}
                className="text-ink-600 hover:text-ink-800 cursor-pointer transition-colors"
              >
                <X strokeWidth={1.75} className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-ink-600 mb-3">
              Paste a URL to your website, LinkedIn, Product Hunt, or any public page.
              We will verify it is reachable and add it as evidence.
            </p>

            {urlSuccess ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-6 text-center">
                <CheckCircle2 strokeWidth={1.75} className="mx-auto h-8 w-8 text-teal-600 mb-2" />
                <p className="text-sm font-semibold text-teal-700">URL verified and added!</p>
                <p className="text-xs text-teal-600 mt-1">Your SVI will recalculate shortly.</p>
              </div>
            ) : (
              <>
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full rounded-xl border border-surface-200 bg-surface-100 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-600 focus:outline-none focus:border-brand-500 mb-3"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && urlValue.trim()) {
                      void handleUrlSubmit();
                    }
                  }}
                />

                {urlError && (
                  <p className="text-xs text-red-600 mb-3">{urlError}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setUrlModalOpen(false); setUrlError(null); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!urlValue.trim() || urlSaving}
                    onClick={() => void handleUrlSubmit()}
                    className="flex-1"
                  >
                    {urlSaving ? (
                      <>
                        <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Add"
                    )}
                  </Button>
                </div>
              </>
            )}

            <p className="text-center text-[10px] text-ink-700 mt-3">
              URL must return HTTP 200. GitHub URLs receive 75% confidence.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
