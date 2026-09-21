"use client";

// Founder evidence step client (S-R5): PDF upload / pasted text / profile
// URL → POST /api/evidence/founder-signals, then the parsed summary.

import * as React from "react";
import { useRouter } from "next/navigation";

export interface FounderSignalsView {
  source: string;
  profileUrl: string | null;
  founderName: string | null;
  headline: string | null;
  currentRole: string | null;
  yearsExperience: number | null;
  yearsInDomain: number | null;
  priorCompanies: string[];
  exits: number;
  teamSizeOnPage: number | null;
  roles: Array<{ company: string; title: string | null; start: string | null; end: string | null; current: boolean; exit: boolean }>;
  education: string[];
  confidence: number;
  parsedAt: string;
}

interface Props {
  initial: FounderSignalsView | null;
  readOnly?: boolean;
}

const ERRORS: Record<string, string> = {
  invalid_linkedin_url: "That is not a linkedin.com/in/… profile URL.",
  nothing_to_parse: "Add a PDF, paste the profile text, or enter the profile URL.",
  pdf_only: "Only a PDF export is accepted (Profile → More → Save to PDF).",
  pdf_too_large: "The PDF is over 5 MB — export again from LinkedIn.",
  pdf_no_text: "The PDF has no extractable text — export again from LinkedIn or paste the profile text.",
  not_migrated: "Founder evidence is not enabled on this server yet.",
};

function fmtYears(v: number | null): string {
  return v == null ? "—" : `${v} yrs`;
}

export function FounderSignalsClient({ initial, readOnly = false }: Props) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"pdf" | "text" | "url">("pdf");
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState("");
  const [profileUrl, setProfileUrl] = React.useState(initial?.profileUrl ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [current, setCurrent] = React.useState<FounderSignalsView | null>(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (mode === "pdf") {
        if (!file) {
          setError(ERRORS.nothing_to_parse);
          return;
        }
        const fd = new FormData();
        fd.set("file", file);
        if (profileUrl.trim()) fd.set("profileUrl", profileUrl.trim());
        res = await fetch("/api/evidence/founder-signals", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/evidence/founder-signals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "text" ? { text, profileUrl: profileUrl.trim() || undefined } : { profileUrl: profileUrl.trim() }),
        });
      }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; signals?: FounderSignalsView };
      if (!res.ok || !body.ok || !body.signals) {
        setError(ERRORS[body.error ?? ""] ?? `Could not parse the profile (${body.error ?? res.status}).`);
        return;
      }
      setCurrent(body.signals);
      setFile(null);
      setText("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-full px-3 py-1 text-sm ${mode === m ? "bg-action text-on-action" : "border border-surface-300 text-ink-700"}`}
      aria-pressed={mode === m}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8">
      {!readOnly && (
        <form onSubmit={submit} className="rounded-2xl border border-surface-300 bg-white p-5 space-y-4" data-testid="founder-evidence-form">
          <div className="flex flex-wrap gap-2">
            {tab("pdf", "Upload LinkedIn PDF")}
            {tab("text", "Paste profile text")}
            {tab("url", "Profile URL only")}
          </div>
          {mode === "pdf" && (
            <label className="block text-sm text-ink-700">
              LinkedIn “Save to PDF” export (≤ 5 MB)
              <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
            </label>
          )}
          {mode === "text" && (
            <label className="block text-sm text-ink-700">
              Profile text (name, headline, Experience, Education)
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="mt-1 w-full rounded-lg border border-surface-300 p-2 text-sm" placeholder="Jane Doe&#10;Co-founder & CEO at Acme Health&#10;Sydney, New South Wales, Australia&#10;&#10;Experience&#10;&#10;Acme Health&#10;Co-founder & CEO&#10;Jan 2021 - Present" />
            </label>
          )}
          <label className="block text-sm text-ink-700">
            LinkedIn profile URL {mode === "url" ? "" : "(optional)"}
            <input type="url" value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} placeholder="https://www.linkedin.com/in/your-name" className="mt-1 w-full rounded-lg border border-surface-300 p-2 text-sm" />
          </label>
          <p className="text-xs text-ink-600">The URL is stored and shown to evaluators as a link. It is never fetched or scraped.</p>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy} className="rounded-lg bg-action px-4 py-2 text-sm font-medium text-on-action disabled:opacity-50">
            {busy ? "Parsing…" : "Save founder evidence"}
          </button>
        </form>
      )}

      <section className="rounded-2xl border border-surface-300 bg-white p-5" data-testid="founder-signals-current">
        <h2 className="text-sm font-semibold text-ink-800">What the report will cite</h2>
        {!current ? (
          <p className="mt-2 text-sm text-ink-600">Nothing parsed yet — the FTV chapter falls back to what you wrote in the pitch.</p>
        ) : (
          <div className="mt-3 space-y-3 text-sm text-ink-700">
            <p>
              <span className="font-medium text-ink-800">{current.founderName ?? "Founder"}</span>
              {current.headline ? ` — ${current.headline}` : ""}
              {current.profileUrl ? (
                <>
                  {" · "}
                  <a href={current.profileUrl} target="_blank" rel="noreferrer noopener" className="text-brand-700 underline">
                    LinkedIn
                  </a>
                </>
              ) : null}
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Experience" value={fmtYears(current.yearsExperience)} />
              <Stat label="In your domain" value={fmtYears(current.yearsInDomain)} />
              <Stat label="Prior companies" value={String(current.priorCompanies.length)} />
              <Stat label="Exits" value={String(current.exits)} />
              <Stat label="Team on page" value={current.teamSizeOnPage == null ? "—" : String(current.teamSizeOnPage)} />
            </dl>
            {current.roles.length > 0 && (
              <ul className="divide-y divide-surface-200 rounded-lg border border-surface-200">
                {current.roles.map((r, i) => (
                  <li key={`${r.company}-${i}`} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                    <span>
                      <span className="font-medium">{r.company}</span>
                      {r.title ? ` — ${r.title}` : ""}
                      {r.exit ? <span className="ml-2 rounded bg-emerald-100 px-1.5 text-xs text-emerald-800">exit</span> : null}
                    </span>
                    <span className="text-xs text-ink-600">
                      {r.start ?? "?"} → {r.current ? "present" : (r.end ?? "?")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-600">
              Source: {current.source.replace("linkedin_", "LinkedIn ")} · parsed {new Date(current.parsedAt).toLocaleDateString("en-AU")} · confidence {Math.round(current.confidence * 100)} %
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-50 p-2">
      <dt className="text-xs text-ink-600">{label}</dt>
      <dd className="text-base font-semibold text-ink-800 tabular-nums">{value}</dd>
    </div>
  );
}
