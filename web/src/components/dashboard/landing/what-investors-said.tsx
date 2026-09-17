// Block 6 · What investors said — G14-S34 (goal doc D3 / F-5; approved plan
// §5 row S34). Optional: the page mounts it ONLY when a
// founder_feedback_letters row exists for the founder, so a phase-0 landing
// keeps its five blocks.
//
// Content = the stored anonymised aggregate: per-dimension bars (mean 1–5 +
// agree share rounded to 25 %), risk buckets (dimension · count · titles),
// the deduplicated questions, and the three next actions the letter mapped
// from the weakest evaluator-rated dimension (each a FeedbackActionLink
// firing `feedback_action_clicked`). The full letter markdown opens in a
// <details>. Never an evaluator id, org, decision, conviction or note — the
// loader already refused any row carrying a forbidden key.
//
// Member view (§B.4): read-only, the tracker never marks the owner's letter
// opened. Locale: the VI letter body is shown when the founder's locale
// cookie is `vi` (letter_md_vi); the frame copy comes from feedback.* in
// both catalogues.

import { MessageSquareQuote } from "lucide-react";
import type { FeedbackLetterRow } from "@/lib/evaluations/feedback-letter-store";
import { dimensionTitle, type FeedbackLocale } from "@/lib/evaluations/feedback-letter-shared";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";
import { FeedbackActionLink, FeedbackLetterTracker } from "./what-investors-said-client";

const CATALOGUE: Record<FeedbackLocale, Record<string, string>> = { en: en as Record<string, string>, vi: vi as Record<string, string> };
function msg(locale: FeedbackLocale, key: string, tokens: Record<string, string | number> = {}): string {
  const raw = CATALOGUE[locale][key] ?? CATALOGUE.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in tokens ? String(tokens[k]) : `{${k}}`));
}

export interface WhatInvestorsSaidProps {
  ctx: LandingContext;
  letter: FeedbackLetterRow;
  locale?: FeedbackLocale;
  canEdit?: boolean;
}

export const WHAT_INVESTORS_SAID_ID = "what-investors-said";

/** Tiny markdown → React for the stored letter (##/### headings, `-` bullets, **bold**, _em_). */
export function LetterMarkdown({ md }: { md: string }) {
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;
  const inline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
      return <span key={i}>{p}</span>;
    });
  };
  const flush = () => {
    if (!list.length) return;
    nodes.push(
      <ul key={`ul-${key++}`} className="ml-4 list-disc space-y-1">
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      nodes.push(<h4 key={`h-${key++}`} className="mt-3 text-xs font-semibold uppercase tracking-wide text-secondary">{inline(line.slice(4))}</h4>);
    } else if (line.startsWith("## ")) {
      flush();
      // the block header already carries the title
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else {
      flush();
      nodes.push(<p key={`p-${key++}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-secondary" data-letter-markdown>{nodes}</div>;
}

export function WhatInvestorsSaid({ ctx, letter, locale = "en", canEdit = true }: WhatInvestorsSaidProps) {
  const agg = letter.aggregate;
  const L = (key: string, tokens?: Record<string, string | number>) => msg(locale, key, tokens);
  const rated = (agg.dimensions ?? []).filter((d) => d.mean != null && d.n > 0);
  const weakest = agg.weakestDim ?? null;
  const risks = (agg.risks ?? []).slice(0, 3);
  const questions = (agg.questions ?? []).slice(0, 4);
  const actions = (letter.nextActions ?? []).slice(0, 3);
  const md = locale === "vi" && letter.letterMdVi ? letter.letterMdVi : letter.letterMd;

  return (
    <LandingBlock
      id={WHAT_INVESTORS_SAID_ID}
      name="what-investors-said"
      order={6}
      title={L("feedback.block.title")}
      icon={MessageSquareQuote}
      span="wide"
      aside={
        weakest ? (
          <span data-landing-weakest={weakest} className="rounded-full bg-bear/10 px-2 py-0.5 text-[11px] font-semibold text-bear">
            {L("feedback.block.weakestPill", { dim: dimensionTitle(weakest, locale) })}
          </span>
        ) : null
      }
      cta={
        actions[0] ? (
          <LandingCta block="what-investors-said" href={actions[0].href} ctx={ctx} action={actions[0].id} variant={canEdit ? "primary" : "secondary"} testId="landing-feedback-cta">
            {actions[0].title}
          </LandingCta>
        ) : (
          <LandingCta block="what-investors-said" href="/workspace/evidence" ctx={ctx} action="add_evidence" variant={canEdit ? "primary" : "secondary"} testId="landing-feedback-cta">
            {L("feedback.letter.nextHeading")}
          </LandingCta>
        )
      }
    >
      <FeedbackLetterTracker letterId={letter.id} k={letter.k} weakestDim={weakest ?? "none"} phase={ctx.phase} markOpened={canEdit} />
      <p className="text-xs text-tertiary" data-landing-feedback-basis>
        {L("feedback.block.basedOn", { k: letter.k, orgs: letter.orgCount })}
      </p>

      {rated.length ? (
        <section className="mt-3" aria-label={L("feedback.block.ratings")}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{L("feedback.block.ratings")}</h3>
          <ul className="mt-2 space-y-1.5" data-landing-feedback-dims>
            {rated.map((d) => {
              const pct = Math.round(((d.mean ?? 0) / 5) * 100);
              return (
                <li key={d.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3" data-feedback-dim={d.key} data-feedback-mean={d.mean ?? undefined}>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-xs ${d.key === weakest ? "font-semibold text-primary" : "text-secondary"}`}>{dimensionTitle(d.key, locale)}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">{(d.mean ?? 0).toFixed(1)}/5</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`${dimensionTitle(d.key, locale)} ${(d.mean ?? 0).toFixed(1)} of 5`}>
                      <div className={`h-full rounded-full ${d.key === weakest ? "bg-bear" : "bg-action"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-tertiary" title={L("feedback.letter.agreeShare", { pct: d.agreePct ?? 0 })}>
                    {d.agreePct ?? 0}%
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {risks.length ? (
        <section className="mt-3" aria-label={L("feedback.block.risks")}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{L("feedback.block.risks")}</h3>
          <ul className="mt-1.5 space-y-1" data-landing-feedback-risks>
            {risks.map((b) => (
              <li key={b.dimension} className="flex items-start justify-between gap-2 rounded-lg bg-surface-sunken px-3 py-1.5 text-xs" data-feedback-risk={b.dimension}>
                <span className="min-w-0">
                  <span className="font-medium text-primary">{dimensionTitle(b.dimension, locale)}</span>
                  {b.titles.length ? <span className="text-secondary"> — {b.titles.join("; ")}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-tertiary">×{b.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {questions.length ? (
        <section className="mt-3" aria-label={L("feedback.block.questions")}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{L("feedback.block.questions")}</h3>
          <ol className="mt-1.5 ml-4 list-decimal space-y-1 text-xs text-secondary" data-landing-feedback-questions>
            {questions.map((q, i) => (
              <li key={i}>{q.text}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {actions.length ? (
        <section className="mt-3" aria-label={L("feedback.block.actions")}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{L("feedback.block.actions")}</h3>
          <ol className="mt-1.5 space-y-1.5" data-landing-feedback-actions>
            {actions.map((a, i) => (
              <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg border border-line-subtle px-3 py-2" data-feedback-action-row={a.id}>
                <div className="min-w-0">
                  <FeedbackActionLink letterId={letter.id} actionId={a.id} dimension={a.dimension} href={a.href}>
                    {i + 1}. {a.title}
                  </FeedbackActionLink>
                  <p className="text-[10px] text-tertiary">
                    {a.effort} effort · {a.timeToComplete}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-bull">+{a.sviBenefit} pts</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <details className="mt-3" data-landing-feedback-letter>
        <summary className="cursor-pointer text-xs font-medium text-action">{L("feedback.block.readLetter")}</summary>
        <div className="mt-2">
          <LetterMarkdown md={md} />
        </div>
      </details>
    </LandingBlock>
  );
}
