"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
}

interface SavedKey {
  provider: string;
  api_key_masked: string;
  api_key_full: string;
  base_url: string | null;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

const STATUS_CONFIG = {
  active: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Active" },
  configured: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Configured" },
  missing: { icon: XCircle, color: "text-red-400", bg: "bg-red-50 border-red-200", label: "Missing" },
} as const;

const PROVIDER_OPTIONS = [
  { value: "anthropic_proxy", label: "Anthropic Proxy (TapHoaAPI)", needsUrl: true },
  { value: "anthropic", label: "Anthropic API Key" },
  { value: "openai", label: "OpenAI API Key" },
  { value: "gemini", label: "Google Gemini" },
];

export function AIKeysClient() {
  const [status, setStatus] = React.useState<AIStatus | null>(null);
  const [savedKeys, setSavedKeys] = React.useState<SavedKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);

  // Add key form
  const [showForm, setShowForm] = React.useState(false);
  const [formProvider, setFormProvider] = React.useState("anthropic_proxy");
  const [formKey, setFormKey] = React.useState("");
  const [formUrl, setFormUrl] = React.useState("https://taphoaapi.info.vn/v1");
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState("");

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    const [statusRes, keysRes] = await Promise.all([
      fetch("/api/admin/ai-status").then((r) => r.json()).catch(() => null),
      fetch("/api/admin/ai-keys").then((r) => r.json()).catch(() => null),
    ]);
    if (statusRes?.ok) setStatus(statusRes);
    if (keysRes?.ok) setSavedKeys(keysRes.keys ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => { void fetchAll(); }, [fetchAll]);

  const handleSave = async () => {
    if (!formKey.trim()) return;
    setSaving(true);
    setSaveMsg("");
    const res = await fetch("/api/admin/ai-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: formProvider,
        api_key: formKey.trim(),
        base_url: PROVIDER_OPTIONS.find((p) => p.value === formProvider)?.needsUrl ? formUrl.trim() : undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setSaveMsg("Saved! AI will use this key on next call.");
      setFormKey("");
      setShowForm(false);
      void fetchAll();
    } else {
      setSaveMsg(`Error: ${data.error}`);
    }
    setSaving(false);
  };

  const handleDelete = async (provider: string) => {
    const res = await fetch("/api/admin/ai-keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json();
    if (data.ok) void fetchAll();
  };

  const testAI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/cron/growth-insights", { headers: { "X-Test-Only": "true" } });
      const json = await res.json();
      setTestResult(json.ok ? `AI working — ${json.recommendations?.length ?? 0} recommendations generated` : `Error: ${json.error ?? "Unknown"}`);
    } catch (err) {
      setTestResult(`Network error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
    setTesting(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ink-400" /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
          <Key strokeWidth={1.75} className="h-6 w-6 text-amber-500" />
          AI Provider Management
        </h1>
        <p className="text-sm text-ink-600 mt-1">
          Configure API keys here. Keys saved in admin override environment variables.
        </p>
      </div>

      {/* Status Summary */}
      {status && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-3xl font-bold font-mono text-emerald-600">{status.activeCount}</p>
            <p className="text-xs text-ink-600 mt-1">Active</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-3xl font-bold font-mono text-amber-600">{status.configuredCount - status.activeCount}</p>
            <p className="text-xs text-ink-600 mt-1">Configured</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-3xl font-bold font-mono text-red-400">{status.totalProviders - status.configuredCount}</p>
            <p className="text-xs text-ink-600 mt-1">Missing</p>
          </div>
        </div>
      )}

      {/* Provider Chain */}
      {status && (
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Fallback Chain (priority order)</h2>
            <button onClick={fetchAll} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer">
              <RefreshCw strokeWidth={1.75} className="h-3 w-3" /> Refresh
            </button>
          </div>
          <div className="divide-y divide-surface-200/50">
            {status.providers.map((provider, idx) => {
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
                  <span className={`text-[10px] font-medium rounded px-2 py-0.5 border ${cfg.bg}`}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin-Saved Keys */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Admin-Configured Keys (stored in database)</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus strokeWidth={1.75} className="h-3.5 w-3.5 mr-1" />
            Add Key
          </Button>
        </div>

        {showForm && (
          <div className="px-6 py-4 border-b border-surface-200 bg-surface-50 space-y-3">
            <div className="flex gap-3">
              <select
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                className="h-10 rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <Input
                value={formKey}
                onChange={(e) => setFormKey(e.target.value)}
                placeholder="API key (comma-separated for multiple)"
                className="flex-1 font-mono text-xs"
              />
            </div>
            {PROVIDER_OPTIONS.find((p) => p.value === formProvider)?.needsUrl && (
              <Input
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="Base URL (e.g. https://taphoaapi.info.vn/v1)"
                className="font-mono text-xs"
              />
            )}
            <div className="flex items-center gap-3">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !formKey.trim()}>
                <Save strokeWidth={1.75} className="h-3.5 w-3.5 mr-1" />
                {saving ? "Saving..." : "Save Key"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              {saveMsg && <span className={`text-xs ${saveMsg.startsWith("Error") ? "text-red-500" : "text-emerald-600"}`}>{saveMsg}</span>}
            </div>
          </div>
        )}

        <div className="divide-y divide-surface-200/50">
          {savedKeys.length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-ink-500">No admin-configured keys. Keys from .env are used by default.</p>
          ) : savedKeys.map((key) => (
            <div key={key.provider} className="px-6 py-4 flex items-center gap-4">
              <Key strokeWidth={1.75} className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-800">{PROVIDER_OPTIONS.find((p) => p.value === key.provider)?.label ?? key.provider}</p>
                <p className="text-xs text-ink-600 font-mono mt-0.5">{key.api_key_masked}</p>
                {key.base_url && <p className="text-xs text-ink-500 mt-0.5">{key.base_url}</p>}
              </div>
              <span className="text-[10px] text-ink-500">{key.updated_by ? `by ${key.updated_by}` : ""}</span>
              <span className={`text-[10px] font-medium rounded px-2 py-0.5 border ${key.is_active ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                {key.is_active ? "Active" : "Disabled"}
              </span>
              <button onClick={() => handleDelete(key.provider)} className="text-red-400 hover:text-red-500 cursor-pointer">
                <Trash2 strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Test AI */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-ink-800 mb-3 flex items-center gap-2">
          <Zap strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
          Test AI Connection
        </h2>
        <p className="text-xs text-ink-600 mb-4">Run a real AI call through the fallback chain to verify which provider responds.</p>
        <Button variant="secondary" size="sm" onClick={testAI} disabled={testing}>
          {testing ? <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...</span> : "Run AI Test"}
        </Button>
        {testResult && (
          <p className={`mt-3 text-xs rounded-lg px-3 py-2 ${testResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{testResult}</p>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-6">
        <h2 className="text-sm font-semibold text-ink-800 mb-3">How to refresh OAuth tokens</h2>
        <div className="space-y-3 text-xs text-ink-700">
          <div>
            <p className="font-medium text-ink-800">Claude CLI OAuth:</p>
            <code className="block mt-1 bg-white rounded px-2 py-1 text-[11px] font-mono border border-surface-200">ssh server &amp;&amp; claude</code>
            <p className="mt-1 text-ink-500">Opening Claude CLI auto-refreshes the OAuth token.</p>
          </div>
          <div>
            <p className="font-medium text-ink-800">Codex OAuth:</p>
            <code className="block mt-1 bg-white rounded px-2 py-1 text-[11px] font-mono border border-surface-200">ssh server &amp;&amp; codex</code>
            <p className="mt-1 text-ink-500">Opening Codex CLI auto-refreshes the OAuth token.</p>
          </div>
          <div>
            <p className="font-medium text-ink-800">Or add keys above:</p>
            <p className="mt-1 text-ink-500">Keys saved here are stored in the database and override .env variables. No redeploy needed.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
