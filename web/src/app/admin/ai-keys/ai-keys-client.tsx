"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Key,
  Loader2,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProviderInfo {
  id: string;
  name: string;
  status: "active" | "configured" | "missing";
  detail: string;
}

interface AIStatus {
  ok: boolean;
  activeCount: number;
  configuredCount: number;
  totalProviders: number;
  providers: ProviderInfo[];
  priority: string[];
}

const STATUS_CONFIG = {
  active: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Active" },
  configured: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Configured" },
  missing: { icon: XCircle, color: "text-red-400", bg: "bg-red-50 border-red-200", label: "Missing" },
} as const;

export function AIKeysClient() {
  const [data, setData] = React.useState<AIStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  const fetchStatus = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-status");
      const json = await res.json();
      if (json.ok) setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  React.useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  const testAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cron/growth-insights", {
        headers: { "X-Test-Only": "true" },
      });
      const json = await res.json();
      if (json.ok) {
        setTestResult(`AI working — ${json.recommendations?.length ?? 0} recommendations generated`);
      } else {
        setTestResult(`Error: ${json.error ?? "Unknown"}`);
      }
    } catch (err) {
      setTestResult(`Network error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-ink-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <XCircle className="mx-auto h-10 w-10 text-red-400 mb-3" />
        <p className="text-sm text-ink-600">Failed to load AI provider status</p>
        <Button variant="secondary" size="sm" onClick={fetchStatus} className="mt-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
          <Key strokeWidth={1.75} className="h-6 w-6 text-amber-500" />
          AI Provider Management
        </h1>
        <p className="text-sm text-ink-600 mt-1">
          Monitor and manage AI provider keys. The system auto-falls through the chain until one works.
        </p>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold font-mono text-emerald-600">{data.activeCount}</p>
          <p className="text-xs text-ink-600 mt-1">Active</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold font-mono text-amber-600">{data.configuredCount - data.activeCount}</p>
          <p className="text-xs text-ink-600 mt-1">Configured</p>
        </div>
        <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold font-mono text-red-400">{data.totalProviders - data.configuredCount}</p>
          <p className="text-xs text-ink-600 mt-1">Missing</p>
        </div>
      </div>

      {/* Provider Chain */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Provider Fallback Chain (priority order)</h2>
          <button onClick={fetchStatus} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer">
            <RefreshCw strokeWidth={1.75} className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="divide-y divide-surface-200/50">
          {data.providers.map((provider, idx) => {
            const cfg = STATUS_CONFIG[provider.status];
            const Icon = cfg.icon;
            return (
              <div key={provider.id} className={`px-6 py-4 flex items-center gap-4 ${provider.status === "missing" ? "opacity-50" : ""}`}>
                <span className="text-xs font-mono text-ink-400 w-6 shrink-0">{idx + 1}.</span>
                <Icon strokeWidth={1.75} className={`h-5 w-5 shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-800">{provider.name}</p>
                  <p className="text-xs text-ink-600 mt-0.5 truncate">{provider.detail}</p>
                </div>
                <span className={`text-[10px] font-medium rounded px-2 py-0.5 border ${cfg.bg}`}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Test AI */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-ink-800 mb-3 flex items-center gap-2">
          <Zap strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
          Test AI Connection
        </h2>
        <p className="text-xs text-ink-600 mb-4">
          Triggers a real AI call through the fallback chain to verify which provider responds.
        </p>
        <Button variant="secondary" size="sm" onClick={testAI} disabled={testing}>
          {testing ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...
            </span>
          ) : "Run AI Test"}
        </Button>
        {testResult && (
          <p className={`mt-3 text-xs rounded-lg px-3 py-2 ${testResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {testResult}
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-6">
        <h2 className="text-sm font-semibold text-ink-800 mb-3">How to fix missing providers</h2>
        <div className="space-y-3 text-xs text-ink-700">
          <div>
            <p className="font-medium text-ink-800">Claude CLI OAuth (auto-refreshes):</p>
            <code className="block mt-1 bg-white rounded px-2 py-1 text-[11px] font-mono border border-surface-200">
              ssh server &amp;&amp; claude  # just opening Claude CLI refreshes the token
            </code>
          </div>
          <div>
            <p className="font-medium text-ink-800">Codex OAuth (auto-refreshes):</p>
            <code className="block mt-1 bg-white rounded px-2 py-1 text-[11px] font-mono border border-surface-200">
              ssh server &amp;&amp; codex  # opening Codex CLI refreshes the token
            </code>
          </div>
          <div>
            <p className="font-medium text-ink-800">API Keys (set in .env or GitLab CI):</p>
            <code className="block mt-1 bg-white rounded px-2 py-1 text-[11px] font-mono border border-surface-200 whitespace-pre-wrap">
              # Edit .env on server then redeploy, or update GitLab CI variables:{"\n"}
              # Settings → CI/CD → Variables → Add/Update key
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
