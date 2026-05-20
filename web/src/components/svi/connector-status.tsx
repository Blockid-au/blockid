"use client";

import * as React from "react";
import { GitBranch, BarChart3, CreditCard, CheckCircle2, Loader2, ExternalLink } from "lucide-react";

interface EvidenceItem {
  id: string;
  evidence_type: string;
  label: string;
  value_or_url: string | null;
  confidence_level: string;
  dimension: string;
  svi_impact: number;
}

interface ConnectorDef {
  id: string;
  label: string;
  icon: React.ElementType;
  connectUrl: string;
  /** Whether the connector uses a POST request instead of a redirect */
  usePost?: boolean;
}

const CONNECTORS: ConnectorDef[] = [
  {
    id: "github",
    label: "GitHub",
    icon: GitBranch,
    connectUrl: "/api/oauth/github",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    connectUrl: "/api/auth/analytics",
  },
  {
    id: "stripe",
    label: "Stripe",
    icon: CreditCard,
    connectUrl: "/api/auth/stripe/connect",
    usePost: true,
  },
];

export function ConnectorStatus() {
  const [evidence, setEvidence] = React.useState<EvidenceItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [connectingId, setConnectingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/evidence");
        const json = await res.json();
        if (!cancelled && json.ok && Array.isArray(json.evidence)) {
          setEvidence(json.evidence);
        }
      } catch {
        // Silently fail — will show all as disconnected
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const connectedEvidence = evidence.filter(
    (e) => e.confidence_level === "connected_source",
  );

  function getConnectorEvidence(connectorId: string): EvidenceItem | undefined {
    return connectedEvidence.find((e) => e.evidence_type === connectorId);
  }

  function getMetricSummary(item: EvidenceItem): string {
    // Try to parse value_or_url for richer detail
    if (item.value_or_url) {
      try {
        const data = JSON.parse(item.value_or_url);
        if (item.evidence_type === "stripe" && data.mrr != null) {
          const mrrStr = data.mrr >= 1000
            ? `$${(data.mrr / 1000).toFixed(1)}k`
            : `$${data.mrr.toFixed(0)}`;
          return `MRR ${mrrStr}, ${data.customerCount ?? 0} customers`;
        }
        if (item.evidence_type === "github" && data.public_repos != null) {
          return `${data.public_repos} repos, ${data.followers ?? 0} followers`;
        }
        if (item.evidence_type === "analytics" && data.sessions != null) {
          return `${data.sessions} sessions, ${data.pageviews ?? 0} pageviews`;
        }
      } catch {
        // Fall through to label
      }
    }
    // Fallback: use the label
    return item.label;
  }

  const connectedCount = CONNECTORS.filter((c) => getConnectorEvidence(c.id)).length;

  async function handleConnect(connector: ConnectorDef) {
    if (connector.usePost) {
      setConnectingId(connector.id);
      try {
        const res = await fetch(connector.connectUrl, { method: "POST" });
        const json = await res.json();
        if (json.ok) {
          // Refresh evidence list
          const evidenceRes = await fetch("/api/evidence");
          const evidenceJson = await evidenceRes.json();
          if (evidenceJson.ok && Array.isArray(evidenceJson.evidence)) {
            setEvidence(evidenceJson.evidence);
          }
        } else {
          console.error("[connector-status]", json.error);
        }
      } catch (err) {
        console.error("[connector-status] connect failed", err);
      } finally {
        setConnectingId(null);
      }
    } else {
      // OAuth redirect flow
      window.location.href = connector.connectUrl;
    }
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Loader2 strokeWidth={1.75} className="h-4 w-4 text-ink-600 animate-spin" />
          <span className="text-sm text-ink-600">Loading connectors...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-800">Connected Sources</h2>
          <p className="text-xs text-ink-600 mt-0.5">
            Link platforms to automatically verify your traction.
          </p>
        </div>
        {connectedCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 text-xs font-medium text-teal-700">
            <CheckCircle2 strokeWidth={1.75} className="h-3 w-3" />
            {connectedCount}/{CONNECTORS.length}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {CONNECTORS.map((connector) => {
          const Icon = connector.icon;
          const ev = getConnectorEvidence(connector.id);
          const isConnected = !!ev;
          const isConnecting = connectingId === connector.id;

          return (
            <div
              key={connector.id}
              className={`rounded-xl border p-4 transition-colors ${
                isConnected
                  ? "border-teal-200 bg-teal-50/50"
                  : "border-surface-200 bg-surface-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    isConnected
                      ? "bg-teal-100 text-teal-600"
                      : "bg-surface-100 text-ink-600"
                  }`}
                >
                  <Icon strokeWidth={1.75} className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-800">
                    {connector.label}
                  </p>
                  {isConnected ? (
                    <span className="text-xs font-medium text-teal-600">Connected</span>
                  ) : (
                    <span className="text-xs text-ink-500">Not connected</span>
                  )}
                </div>
                {isConnected && (
                  <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 text-teal-600 shrink-0" />
                )}
              </div>

              {isConnected && ev ? (
                <p className="text-xs text-ink-600 truncate">{getMetricSummary(ev)}</p>
              ) : (
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={() => void handleConnect(connector)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 strokeWidth={1.75} className="h-3 w-3 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Connect {connector.label}
                      <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {connectedCount > 0 && (
        <p className="text-xs text-ink-500 mt-3">
          Connected sources boost SVI confidence to 75%.
        </p>
      )}
    </div>
  );
}
