// The free-allowance copy, resolved once on the server and handed to the
// /analyze client components as a plain object (G25-C, 2026-09-21).
//
// The catalogue (`lib/i18n/messages/{en,vi}.json`, `free_report.*`) holds the
// words; this module fills the tokens that are constants — the allowance
// count, the price label (from lane A's SKU constant, never a literal), the
// per-network limit — so no component and no catalogue line ever carries a
// number that could drift. Pure and isomorphic.

import type { Messages } from "@/lib/i18n/t";
import { t } from "@/lib/i18n/t";
import { trustReportPriceLabelLong } from "@/lib/pricing/trust-report-price";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { FREE_REPORTS_PER_EMAIL, FREE_REPORTS_PER_IP_PER_DAY } from "./free-grants-rules";

export interface FreeReportCopy {
  email: {
    heading: string;
    body: string;
    label: string;
    placeholder: string;
    cta: string;
    consent: string;
    /** The approved data-principle sentence, verbatim. */
    principle: string;
    edit: string;
    errors: { required: string; invalid: string; disposable: string };
  };
  status: {
    /** `{n}` and `{email}` are filled by the component (the run's own numbers). */
    sending: string;
    queued: string;
    remainingOne: string;
    remainingNone: string;
  };
  pay: {
    heading: string;
    body: string;
    cta: string;
    accountHint: string;
    signupCta: string;
    edit: string;
    creditsQuote: string;
    creditsShort: string;
    creditsCta: string;
    creditsError: string;
    topupCta: string;
    recheckCta: string;
  };
  ipLimit: string;
}

function fill(text: string, tokens: Record<string, string | number>): string {
  return text.replace(/\{([a-zA-Z0-9]+)\}/g, (whole, key: string) => (key in tokens ? String(tokens[key]) : whole));
}

export function freeReportCopy(m: Messages, locale: "en" | "vi" = "en"): FreeReportCopy {
  const count = FREE_REPORTS_PER_EMAIL;
  const price = trustReportPriceLabelLong();
  const k = (key: string) => t(m, key);
  return {
    email: {
      heading: k("free_report.email.heading"),
      body: fill(k("free_report.email.body"), { count }),
      label: k("free_report.email.label"),
      placeholder: k("free_report.email.placeholder"),
      cta: k("free_report.email.cta"),
      consent: k("free_report.email.consent"),
      // EN: the constant itself (the catalogue line is pinned equal by the
      // parity test); VI: the approved translation from the catalogue.
      principle: locale === "en" ? DATA_PRINCIPLE_SENTENCE : k("free_report.email.principle"),
      edit: k("free_report.email.edit"),
      errors: {
        required: k("free_report.email.error.required"),
        invalid: k("free_report.email.error.invalid"),
        disposable: k("free_report.email.error.disposable"),
      },
    },
    status: {
      sending: fill(k("free_report.status.sending"), { count }),
      queued: k("free_report.status.queued"),
      remainingOne: k("free_report.status.remaining_one"),
      remainingNone: k("free_report.status.remaining_none"),
    },
    pay: {
      heading: fill(k("free_report.pay.heading"), { count: locale === "en" ? "two" : count }),
      body: fill(k("free_report.pay.body"), { price }),
      cta: k("free_report.pay.cta"),
      accountHint: k("free_report.pay.account_hint"),
      signupCta: k("free_report.pay.signup_cta"),
      edit: k("free_report.pay.edit"),
      creditsQuote: k("free_report.pay.credits_quote"),
      creditsShort: k("free_report.pay.credits_short"),
      creditsCta: k("free_report.pay.credits_cta"),
      creditsError: k("free_report.pay.credits_error"),
      topupCta: k("free_report.pay.topup_cta"),
      recheckCta: k("free_report.pay.recheck_cta"),
    },
    ipLimit: fill(k("free_report.ip_limit"), { limit: FREE_REPORTS_PER_IP_PER_DAY }),
  };
}

/** Fill the run-specific tokens of a status line. */
export function fillStatusLine(template: string, tokens: { n?: number | null; email?: string | null }): string {
  return fill(template, { n: tokens.n ?? "", email: tokens.email ?? "your inbox" });
}
