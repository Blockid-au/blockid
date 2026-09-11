"use client";

// Grant application draft editor (T0251, plan §4h "Application drafts").
// Opened by /workspace/funding?draft=<grantId>&kind=grant.
//
//   • Shows the grant's application_prompts (or the generic set) with one
//     textarea per question, prefilled from the latest
//     grant_application_drafts row.
//   • "Generate draft" — Growth / Startup Package: included, one click.
//     Starter: the button carries the credit cost and the click opens an
//     inline confirm ("Spend 2 credits?") before POST { confirm: true } —
//     transparent-pricing rule: the price is on screen before anything is
//     spent.
//   • Save → PATCH /api/funding/draft; "Copy all" → clipboard as markdown.
//   • Never blank: a failed AI call keeps the questions, shows the retry hint.
//
// Client-safe imports only (lib/funding/application-prompts + copy).

import * as React from "react";
import { Check, ClipboardCopy, Coins, ExternalLink, Loader2, PenLine, RefreshCw, Save } from "lucide-react";
import { renderAnswersText, type ApplicationPrompt } from "@/lib/funding/application-prompts";
import { fill, FUNDING_COPY } from "@/lib/funding/copy";

export interface GrantDraftEditorGrant {
  id: string;
  name: string;
  official_url: string;
  closes_at: string | null;
}

export interface GrantDraftEditorDraft {
  id: string;
  answers: Record<string, string>;
  status: "draft" | "final";
  updated_at: string;
  ai_ok: boolean;
}

export interface GrantDraftEditorProps {
  grant: GrantDraftEditorGrant;
  prompts: ApplicationPrompt[];
  /** True when the set is the generic fallback. */
  generic: boolean;
  projectId: string | null;
  initial: GrantDraftEditorDraft | null;
  /** Credits per draft — 0 when unlimited (Growth / Startup Package). */
  cost: number;
  unlimited: boolean;
  /** False for founders below Starter — editor renders the locked line only. */
  allowed: boolean;
}

type Phase = "idle" | "confirm" | "generating" | "saving";

export function GrantDraftEditor({ grant, prompts, generic, projectId, initial, cost, unlimited, allowed }: GrantDraftEditorProps) {
  const [draftId, setDraftId] = React.useState<string | null>(initial?.id ?? null);
  const [answers, setAnswers] = React.useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of prompts) out[p.id] = initial?.answers[p.id] ?? "";
    return out;
  });
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [notice, setNotice] = React.useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(
    initial && !initial.ai_ok ? { tone: "warn", text: FUNDING_COPY.growth.draftFailed } : null,
  );
  const [copied, setCopied] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  // S8-B: the Generate button unmounts while the inline confirm shows —
  // focus goes to Confirm and comes back to Generate on Cancel (WCAG 2.4.3).
  const generateRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (phase === "confirm") confirmRef.current?.focus();
  }, [phase]);
  const cancelConfirm = () => {
    setPhase("idle");
    window.setTimeout(() => generateRef.current?.focus(), 0);
  };

  const busy = phase === "generating" || phase === "saving";
  const hasAnswers = prompts.some((p) => (answers[p.id] ?? "").trim().length > 0);

  async function generate() {
    setPhase("generating");
    setNotice(null);
    try {
      const res = await fetch("/api/funding/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ project_id: projectId, grant_id: grant.id, confirm: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        draft?: { id: string; answers: Record<string, string> };
        ai_ok?: boolean;
        creditsCharged?: number;
        creditsRequired?: number;
        balance?: number;
      };
      if (!res.ok || !data.ok || !data.draft) {
        if (res.status === 402) {
          setNotice({ tone: "err", text: `Not enough credits — this draft needs ${data.creditsRequired ?? cost}, you have ${data.balance ?? 0}.` });
        } else if (res.status === 403) {
          setNotice({ tone: "err", text: FUNDING_COPY.growth.draftLocked });
        } else {
          setNotice({ tone: "err", text: FUNDING_COPY.growth.draftFailed });
        }
        return;
      }
      setDraftId(data.draft.id);
      const next: Record<string, string> = {};
      for (const p of prompts) next[p.id] = data.draft.answers[p.id] ?? "";
      setAnswers(next);
      setDirty(false);
      setNotice(
        data.ai_ok
          ? { tone: "ok", text: data.creditsCharged ? `Draft ready — ${data.creditsCharged} credits spent.` : "Draft ready — included in your plan." }
          : { tone: "warn", text: FUNDING_COPY.growth.draftFailed },
      );
    } catch {
      setNotice({ tone: "err", text: FUNDING_COPY.growth.draftFailed });
    } finally {
      setPhase("idle");
    }
  }

  async function save(status?: "draft" | "final") {
    if (!draftId) return;
    setPhase("saving");
    try {
      const res = await fetch("/api/funding/draft", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: draftId, answers, ...(status ? { status } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) {
        setDirty(false);
        setNotice({ tone: "ok", text: status === "final" ? "Marked final and saved." : "Saved." });
      } else {
        setNotice({ tone: "err", text: "Could not save — try again." });
      }
    } catch {
      setNotice({ tone: "err", text: "Could not save — try again." });
    } finally {
      setPhase("idle");
    }
  }

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(renderAnswersText(prompts, answers, `${grant.name} — application draft`));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ tone: "err", text: "Clipboard blocked — select the text and copy it by hand." });
    }
  }

  const generateLabel = unlimited
    ? hasAnswers ? "Regenerate draft — included" : "Generate draft — included"
    : hasAnswers ? `Regenerate draft — ${cost} credits` : `Generate draft — ${cost} credits`;

  return (
    <section
      className="mb-6 rounded-2xl border border-action/40 bg-surface p-5"
      aria-labelledby="grant-draft-title"
      data-grant-draft-editor
      data-grant={grant.id}
      data-cost={cost}
      data-unlimited={unlimited ? "1" : "0"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-action">Application draft</p>
          <h2 id="grant-draft-title" className="mt-1 inline-flex items-center gap-2 text-lg font-semibold text-primary">
            <PenLine className="h-4 w-4 text-action" aria-hidden /> {fill(FUNDING_COPY.growth.draftTitle, { grant: grant.name })}
          </h2>
          <p className="mt-1 text-sm text-secondary" data-draft-pricing>
            {!allowed
              ? FUNDING_COPY.growth.draftLocked
              : unlimited
                ? FUNDING_COPY.growth.draftIncluded
                : fill(FUNDING_COPY.growth.draftCost, { cost })}
            {grant.closes_at ? ` Closes ${grant.closes_at}.` : ""}
          </p>
          {generic ? <p className="mt-1 text-xs text-tertiary" data-draft-generic>{FUNDING_COPY.growth.draftGeneric}</p> : null}
        </div>
        <a href={grant.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 text-sm font-semibold text-action">
          Official guidelines <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      {allowed ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" data-draft-actions>
          {phase === "confirm" ? (
            <span
              className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-action/50 bg-surface-raised px-3 py-2 text-sm"
              role="group"
              aria-labelledby="draft-confirm-question"
              data-draft-confirm
            >
              <Coins className="h-4 w-4 text-action" aria-hidden />
              <span id="draft-confirm-question">
                Spend <strong>{cost} credits</strong> on this draft?
              </span>
              <button ref={confirmRef} type="button" onClick={() => void generate()} className="min-h-6 rounded-lg bg-action px-3 py-1 text-sm font-semibold text-on-action">
                Confirm
              </button>
              <button type="button" onClick={cancelConfirm} className="min-h-6 rounded-lg px-2 py-1 text-sm font-semibold text-secondary hover:text-primary">
                Cancel
              </button>
            </span>
          ) : (
            <button
              ref={generateRef}
              type="button"
              disabled={busy}
              aria-busy={phase === "generating"}
              onClick={() => (unlimited ? void generate() : setPhase("confirm"))}
              className="inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-semibold text-on-action disabled:opacity-60"
              data-draft-generate
            >
              {phase === "generating" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              {generateLabel}
            </button>
          )}
          <button
            type="button"
            disabled={busy || !draftId || !dirty}
            aria-busy={phase === "saving"}
            onClick={() => void save()}
            className="inline-flex items-center gap-2 rounded-xl border border-line-subtle px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            data-draft-save
          >
            <Save className="h-4 w-4" aria-hidden /> Save
          </button>
          <button
            type="button"
            disabled={busy || !draftId}
            onClick={() => void save("final")}
            className="inline-flex items-center gap-2 rounded-xl border border-line-subtle px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            data-draft-final
          >
            <Check className="h-4 w-4" aria-hidden /> Mark final
          </button>
          <button
            type="button"
            disabled={!hasAnswers}
            onClick={() => void copyAll()}
            className="inline-flex items-center gap-2 rounded-xl border border-line-subtle px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            data-draft-copy
          >
            <ClipboardCopy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy all"}
          </button>
        </div>
      ) : null}

      {/* Live region is always mounted so the first notice is announced (a region inserted with its text is often skipped). */}
      <div role="status" aria-live="polite" data-draft-status>
        {phase === "generating" ? <span className="sr-only">Generating your draft</span> : null}
        {copied ? <span className="sr-only">Draft copied to the clipboard</span> : null}
        {notice ? (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              notice.tone === "ok" ? "bg-bull/10 text-bull" : notice.tone === "warn" ? "bg-warn/10 text-warn" : "bg-bear/10 text-bear"
            }`}
            data-draft-notice={notice.tone}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <ol className="mt-5 space-y-5" data-draft-prompts>
        {prompts.map((p, i) => (
          <li key={p.id} data-prompt={p.id}>
            <label htmlFor={`draft-${p.id}`} className="block text-sm font-semibold text-primary">
              {i + 1}. {p.question}
            </label>
            {p.guidance && p.guidance !== "generic" ? (
              <p id={`draft-${p.id}-guidance`} className="mt-1 text-xs text-tertiary">
                {p.guidance}
              </p>
            ) : null}
            <textarea
              id={`draft-${p.id}`}
              aria-describedby={`${p.guidance && p.guidance !== "generic" ? `draft-${p.id}-guidance ` : ""}draft-${p.id}-count`}
              value={answers[p.id] ?? ""}
              onChange={(e) => {
                setAnswers((a) => ({ ...a, [p.id]: e.target.value }));
                setDirty(true);
              }}
              rows={5}
              disabled={!allowed}
              placeholder={allowed ? "Generate a draft, or write your answer here." : ""}
              className="mt-2 w-full rounded-xl border border-line-subtle bg-surface-raised px-3 py-2 text-sm text-primary focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30"
            />
            <p id={`draft-${p.id}-count`} className="mt-1 text-right text-xs text-tertiary">
              {(answers[p.id] ?? "").trim() ? (answers[p.id] ?? "").trim().split(/\s+/).length : 0}
              {p.max_words ? ` / ${p.max_words} words` : " words"}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default GrantDraftEditor;
