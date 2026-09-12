// Static general-advice disclaimer block for @react-pdf documents.
//
// QA-3 commercial audit P1-7 (2026-09-12): five founder-facing PDF exports
// (financial projection, pitch deck, GTM playbook, Investor-Ready Score,
// Founder Pack) shipped with no advice disclaimer at all, while the SVI
// report / summary, valuation certificate and fundraising report carried
// one. This is the one block they all render now.
//
// It is the render-time sibling of `disclaimer-footer.ts` (the DB-backed
// pdf-lib stamper that appends the *registered* disclaimer id + version +
// hash for regulator provenance). The stamper is a post-processing step
// that needs Supabase; this component is pure so the templates and their
// pdf-parse tests need no database. The wording follows the AU compliance
// skill's standard report footer: general information only, not personal
// financial product advice (s766B Corporations Act 2001 (Cth)), no AFSL,
// seek independent advice, entity line.

import * as React from "react";
import { StyleSheet, Text, View } from "@react-pdf/renderer";

export const PDF_ENTITY_LINE =
  "Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW";

export const PDF_GENERAL_ADVICE_DISCLAIMER =
  "This document is produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111). " +
  "It is general information only — not a financial valuation, an investment recommendation, or personal financial product advice under s766B of the Corporations Act 2001 (Cth), and not legal, tax or accounting advice. " +
  "BlockID.au does not hold an Australian Financial Services Licence (AFSL). Seek independent professional advice before acting on it.";

export const PDF_FINANCIAL_PROJECTION_DISCLAIMER =
  "Forward-looking financial projections are estimates based on the stated assumptions and available data; actual results will differ. They do not constitute financial advice. Consult a qualified accountant or financial adviser before making business or investment decisions.";

export const PDF_PITCH_DECK_DISCLAIMER =
  "This deck is for discussion only. It is not an offer, invitation or recommendation to acquire securities and is not a disclosure document under Chapter 6D of the Corporations Act 2001 (Cth); any offer would be made only under an applicable exemption (for example s708) and on the terms of definitive documents. Forward-looking statements are estimates, not guarantees.";

export type AdviceDisclaimerVariant = "general" | "financial" | "pitch";

export function adviceDisclaimerText(variant: AdviceDisclaimerVariant = "general"): string {
  switch (variant) {
    case "financial":
      return `${PDF_FINANCIAL_PROJECTION_DISCLAIMER} ${PDF_GENERAL_ADVICE_DISCLAIMER}`;
    case "pitch":
      return `${PDF_PITCH_DECK_DISCLAIMER} ${PDF_GENERAL_ADVICE_DISCLAIMER}`;
    default:
      return PDF_GENERAL_ADVICE_DISCLAIMER;
  }
}

const st = StyleSheet.create({
  box: {
    marginTop: 12,
    paddingTop: 6,
    borderTopWidth: 0.5,
  },
  text: {
    fontSize: 6.5,
    lineHeight: 1.45,
  },
});

/**
 * Compact disclaimer paragraph. Place it at the end of a page's content (not
 * `fixed`) so it never collides with an absolutely-positioned footer.
 */
export function AdviceDisclaimer({
  variant = "general",
  dark = false,
  style,
}: {
  variant?: AdviceDisclaimerVariant;
  dark?: boolean;
  style?: Record<string, unknown>;
}) {
  const color = dark ? "#94A3B8" : "#64748B";
  const border = dark ? "#1E293B" : "#E2E8F0";
  return (
    <View style={[st.box, { borderTopColor: border }, style ?? {}]} wrap={false}>
      <Text style={[st.text, { color }]}>{adviceDisclaimerText(variant)}</Text>
    </View>
  );
}
