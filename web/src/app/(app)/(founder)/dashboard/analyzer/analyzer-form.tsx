"use client";

import { useState } from "react";

interface ProjectOption {
  id: string;
  name: string;
}

interface RunResponse {
  ok: boolean;
  reason?: string;
  sub_score?: number;
  valuation_adjuster_pct?: number;
  rationale?: string[];
  breakdown?: { githubSide: number | null; websiteSide: number | null };
  persist_warning?: string | null;
}

export function AnalyzerForm({ projects }: { projects: ProjectOption[] }) {
  const [startupId, setStartupId] = useState<string>(projects[0]?.id ?? "");
  const [githubUrl, setGithubUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!startupId) {
      setError("Pick a startup first.");
      return;
    }
    if (!githubUrl && !websiteUrl) {
      setError("Enter a GitHub URL or a website URL (at least one).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/analyzer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startup_id: startupId,
          github_url: githubUrl || null,
          website_url: websiteUrl || null,
        }),
      });
      const data = (await res.json()) as RunResponse;
      if (!res.ok || !data.ok) {
        setError(data.reason ?? `Request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || projects.length === 0;

  return (
    <form onSubmit={submit} className="space-y-5">
      {projects.length === 0 ? (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          You don&apos;t have any startups yet. Create one from the dashboard first.
        </p>
      ) : (
        <label className="block">
          <span className="text-sm font-medium">Startup</span>
          <select
            className="mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            value={startupId}
            onChange={(e) => setStartupId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-sm font-medium">GitHub URL</span>
        <input
          type="url"
          placeholder="https://github.com/owner/repo"
          className="mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Website URL</span>
        <input
          type="url"
          placeholder="https://example.com"
          className="mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={disabled}
        className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Analysing…" : "Run analyzer"}
      </button>

      {error ? (
        <p className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      {result?.ok ? (
        <section className="mt-6 space-y-4 rounded border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Result</h2>
            <span className="text-4xl font-bold tabular-nums">
              {result.sub_score}
              <span className="text-base font-normal text-neutral-500">/100</span>
            </span>
          </div>
          <p className="text-sm">
            <span className="font-medium">Valuation adjuster:</span>{" "}
            <span
              className={
                (result.valuation_adjuster_pct ?? 0) < 0
                  ? "text-red-600"
                  : (result.valuation_adjuster_pct ?? 0) > 0
                    ? "text-green-600"
                    : ""
              }
            >
              {(result.valuation_adjuster_pct ?? 0) > 0 ? "+" : ""}
              {result.valuation_adjuster_pct}%
            </span>
          </p>
          {result.breakdown ? (
            <p className="text-xs text-neutral-500">
              GitHub side: {result.breakdown.githubSide ?? "—"} · Website side:{" "}
              {result.breakdown.websiteSide ?? "—"}
            </p>
          ) : null}
          {result.rationale && result.rationale.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {result.rationale.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          {result.persist_warning ? (
            <p className="text-xs text-amber-700">
              Warning: analyzer_runs persist failed ({result.persist_warning}). Run the migration.
            </p>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
