// /apply/[slug] — public program-intake application page (G14 S35, D2).
//
// Server shell: resolves the intake by slug (404 unknown / not migrated),
// renders the "closed" card when the acceptance rules say so, otherwise the
// client form (submit-deck-form.tsx) with every string already resolved
// from the intake.* catalogue (EN / VI by the blockid_lang cookie). G21
// P2-A: when the intake links an intake_templates row, its questions render
// below the fixed fields and its consent text under the data principle.
//
// Unlisted: `robots: noindex` + robots.txt disallows /apply/ + the sitemap
// is an allow-list that never mentions it. `/submit` stays the public-index
// submission and is untouched.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getLocale } from "@/lib/i18n";
import { getMessages, t } from "@/lib/i18n/t";
import { lookupPublicIntake, type IntakeRejection } from "@/lib/intake/program-intakes";
import { getTemplateById } from "@/lib/intake/templates";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { SubmitDeckForm, type SubmitDeckCopy } from "./submit-deck-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function fill(s: string, vars: Record<string, string>): string {
  return s.replace(/\{([a-zA-Z]+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [m, found] = await Promise.all([getMessages(await getLocale()), lookupPublicIntake(slug)]);
  const program = found.ok ? found.intake.name : "a program";
  return {
    title: fill(t(m, "intake.meta.title"), { program }),
    description: t(m, "intake.meta.description"),
    robots: { index: false, follow: false },
  };
}

export default async function ApplyPage({ params }: Props) {
  const { slug } = await params;
  const found = await lookupPublicIntake(slug);
  if (!found.ok) notFound();
  const { intake, acceptance } = found;
  // G21 P2-A — a linked intake template adds its questions + consent text;
  // no template (or 0422 not applied) = the fixed form, unchanged.
  const [locale, template] = await Promise.all([getLocale(), getTemplateById(intake.templateId)]);
  const m = await getMessages(locale);

  // The consent sentence must be the approved DATA_PRINCIPLE_SENTENCE verbatim
  // (EN); VI renders the catalogue twin the parity test pins.
  const consentSentence = locale === "en" ? DATA_PRINCIPLE_SENTENCE : t(m, "intake.consent.sentence", DATA_PRINCIPLE_SENTENCE);

  const copy: SubmitDeckCopy = {
    startupName: t(m, "intake.field.startupName"),
    founderName: t(m, "intake.field.founderName"),
    founderEmail: t(m, "intake.field.founderEmail"),
    website: t(m, "intake.field.website"),
    deck: t(m, "intake.field.deck"),
    deckHint: t(m, "intake.field.deckHint"),
    consentSentence,
    consentLabel: t(m, "intake.consent.label"),
    submit: t(m, "intake.submit"),
    submitting: t(m, "intake.submitting"),
    successTitle: t(m, "intake.success.title"),
    successBody: t(m, "intake.success.body"),
    successHint: t(m, "intake.success.hint"),
    privacy: t(m, "intake.privacy"),
    errors: Object.fromEntries(
      ["duplicate", "deck_required", "deck_too_large", "deck_type", "deck_infected", "scanner_unavailable", "consent_required", "invalid_input", "rate_limited", "closed", "generic"].map((k) => [k, t(m, `intake.error.${k}`)]),
    ) as SubmitDeckCopy["errors"],
  };

  return (
    <MarketingShell>
      <section className="mx-auto max-w-2xl px-4 py-16 sm:py-24" data-testid="apply-page" data-intake-slug={intake.slug}>
        <div className="mb-10 text-center">
          <span className="mb-4 inline-block rounded-full border border-action/40 bg-action/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-action">
            {t(m, "intake.badge")}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-strong sm:text-4xl">{fill(t(m, "intake.headline"), { program: intake.name })}</h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-secondary">{intake.blurb ?? t(m, "intake.subhead")}</p>
        </div>

        {acceptance.ok ? (
          <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-6 shadow-xl sm:p-8">
            <SubmitDeckForm slug={intake.slug} copy={copy} questions={template?.questions ?? []} programConsentText={template?.consentText ?? null} />
          </div>
        ) : (
          <div className="rounded-2xl border border-line-subtle bg-surface-sunken p-8 text-center shadow-xl" data-testid="apply-closed" data-reason={acceptance.reason}>
            <h2 className="text-xl font-semibold text-strong">{t(m, "intake.closed.title")}</h2>
            <p className="mt-3 text-sm text-secondary">{t(m, `intake.closed.${acceptance.reason satisfies IntakeRejection}`)}</p>
            <p className="mt-6 text-xs text-secondary">
              {t(m, "intake.closed.hint")}{" "}
              {/* G20-F1: /submit is hidden (no listing flow) — the free score is the open door. */}
              <Link href="/analyze" className="font-semibold text-action underline-offset-2 hover:underline">
                /analyze
              </Link>
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-secondary">{t(m, "intake.powered")}</p>
      </section>
    </MarketingShell>
  );
}
