/**
 * /solutions/vn-sme — Vietnamese SME persona landing (P-02).
 *
 * Master Upgrade Plan §7.1 sitemap + §7.2 persona surface + §7.7 bilingual
 * rules. Per user-locked decision D4 (Phase 1 MVP), this page is fully
 * translated to Vietnamese via the `t()` helper — the mirror surfaces at
 * `/vi/solutions/vn-sme` while the English version stays at
 * `/solutions/vn-sme`. Both are indexable with `hreflang` alternates.
 *
 * Locked §2 copy is embedded via the `businessId.*` / `hero.v3.*` keys plus
 * new `solutions.vnSme.*` keys added in
 * [web/src/lib/i18n/messages/en.json](../../../lib/i18n/messages/en.json)
 * and [web/src/lib/i18n/messages/vi.json](../../../lib/i18n/messages/vi.json).
 *
 * VN divergences per §7.7: cross-border evidence, DKKD/MST alongside
 * ASIC/ABR, VND display where relevant, VN FAQ (data residency). All
 * factual, no legal or financial advice.
 *
 * Server component. Locale defaults to EN; the `/vi/solutions/vn-sme`
 * mirror should re-export this page passing `locale="vi"` via a wrapper.
 */

import type { Metadata } from "next";
import { getMessages, t } from "@/lib/i18n/t";
import { SolutionsPageShell } from "../solutions-shared";

const SITE_URL = "https://blockid.au";
const CANONICAL_EN = `${SITE_URL}/solutions/vn-sme`;
const CANONICAL_VI = `${SITE_URL}/vi/solutions/vn-sme`;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  const title = t(
    m,
    "meta.solutions.vnSme.title",
    "For Vietnamese-Australian SMEs — BlockID.au",
  );
  const description = t(
    m,
    "meta.solutions.vnSme.description",
    "One verified Business ID that works on both sides of the Australia-Vietnam corridor. DKKD/MST alongside ASIC/ABR, VND display, cross-border evidence.",
  );
  return {
    title,
    description,
    alternates: {
      canonical: CANONICAL_EN,
      languages: {
        en: CANONICAL_EN,
        vi: CANONICAL_VI,
        "x-default": CANONICAL_EN,
      },
    },
    openGraph: {
      title,
      description,
      url: CANONICAL_EN,
      siteName: "BlockID.au",
      type: "website",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function SolutionsVnSmePage() {
  // Default English render. VN mirror page under /vi/solutions/vn-sme
  // imports the same shell with locale="vi".
  const m = await getMessages("en");

  return (
    <SolutionsPageShell
      slug="vn-sme"
      lang="en"
      eyebrow={t(m, "solutions.vnSme.eyebrow", "For Vietnamese-Australian SMEs (P-02)")}
      headline={t(
        m,
        "solutions.vnSme.headline",
        "One trusted identity for both sides of the Australia-Vietnam corridor.",
      )}
      personaLine={t(
        m,
        "solutions.vnSme.persona",
        "Show DKKD/MST alongside ASIC/ABR. Present VAT invoices, bank statements and Vietnamese-language evidence to Australian counterparts — verified once, reused for grants, procurement and cross-border trade.",
      )}
      emotionalLine={t(m, "hero.v3.emotional")}
      outcomeLine={t(m, "hero.v3.outcome")}
      primaryCtaLabel={t(m, "hero.v3.cta.primary.signedOut")}
      secondaryCtaLabel={t(m, "hero.v3.cta.secondary")}
      benefitsTitle={t(
        m,
        "solutions.vnSme.benefits.title",
        "Built for the AU-VN corridor",
      )}
      benefits={[
        {
          title: t(
            m,
            "solutions.vnSme.benefit1.title",
            "Dual-jurisdiction identity",
          ),
          body: t(
            m,
            "solutions.vnSme.benefit1.body",
            "One Business ID shows your Australian ASIC/ABR record and Vietnamese DKKD/MST side-by-side. No more re-explaining your structure in every meeting.",
          ),
        },
        {
          title: t(
            m,
            "solutions.vnSme.benefit2.title",
            "Cross-border evidence, verified",
          ),
          body: t(
            m,
            "solutions.vnSme.benefit2.body",
            "Upload VAT invoices, bank statements and Vietnamese contracts. Our verification ladder handles bilingual evidence — the Trust Report renders EN + VI side-by-side.",
          ),
        },
        {
          title: t(
            m,
            "solutions.vnSme.benefit3.title",
            "AUD and VND, both native",
          ),
          body: t(
            m,
            "solutions.vnSme.benefit3.body",
            "Revenue and traction charts render in AUD or VND at the reader's choice. GST-inclusive AUD pricing on your side, no hidden currency conversion for VN buyers.",
          ),
        },
      ]}
      journeyTitle={t(
        m,
        "solutions.vnSme.journey.title",
        "Your first 90 days on BlockID.au",
      )}
      journey={[
        {
          window: t(m, "solutions.vnSme.journey.window1", "Day 0-30"),
          headline: t(
            m,
            "solutions.vnSme.journey.step1.head",
            "Identify + Verify",
          ),
          bullets: [
            t(
              m,
              "solutions.vnSme.journey.step1.b1",
              "Claim your ABN and link your Vietnamese DKKD/MST.",
            ),
            t(
              m,
              "solutions.vnSme.journey.step1.b2",
              "Reach Verification Level 2 (dual-jurisdiction identity confirmed).",
            ),
            t(
              m,
              "solutions.vnSme.journey.step1.b3",
              "Preview your 10-page Trust Report in EN and VI.",
            ),
          ],
        },
        {
          window: t(m, "solutions.vnSme.journey.window2", "Day 31-60"),
          headline: t(
            m,
            "solutions.vnSme.journey.step2.head",
            "Value + Cross-border evidence",
          ),
          bullets: [
            t(
              m,
              "solutions.vnSme.journey.step2.b1",
              "Upload VAT invoices, bank statements, bilingual contracts.",
            ),
            t(
              m,
              "solutions.vnSme.journey.step2.b2",
              "Unlock the full Trust Report (A$5.50 GST inclusive per business).",
            ),
            t(
              m,
              "solutions.vnSme.journey.step2.b3",
              "Book a Vietnamese-language advisor session (credits or A$149 pack).",
            ),
          ],
        },
        {
          window: t(m, "solutions.vnSme.journey.window3", "Day 61-90"),
          headline: t(
            m,
            "solutions.vnSme.journey.step3.head",
            "Connect + Cross-border deal flow",
          ),
          bullets: [
            t(
              m,
              "solutions.vnSme.journey.step3.b1",
              "Share your bilingual Business ID with AU buyers, VN suppliers, grant reviewers.",
            ),
            t(
              m,
              "solutions.vnSme.journey.step3.b2",
              "Reach Verification Level 3 (financials attested by qualified accountant either side).",
            ),
            t(
              m,
              "solutions.vnSme.journey.step3.b3",
              "Publish your public /id/{slug} profile — indexed for both google.com.au and google.com.vn.",
            ),
          ],
        },
      ]}
      faqTitle={t(m, "solutions.vnSme.faq.title", "Frequently asked")}
      faqs={[
        {
          q: t(
            m,
            "solutions.vnSme.faq.q1",
            "Where is my data stored — Australia or Vietnam?",
          ),
          a: t(
            m,
            "solutions.vnSme.faq.a1",
            "Primary storage is in Sydney (AWS ap-southeast-2). We do not store personal data in Vietnam. VN-language evidence is stored encrypted alongside your other evidence; a Vietnamese-language render is generated on-demand, not cached, unless you export it.",
          ),
        },
        {
          q: t(
            m,
            "solutions.vnSme.faq.q2",
            "Do Vietnamese-language reports meet Australian investor expectations?",
          ),
          a: t(
            m,
            "solutions.vnSme.faq.a2",
            "Trust Reports render in the reader's language. Australian investors reading a VN-SME profile see the executive summary and audited findings in English; the underlying evidence retains its original language with a translation footnote. Vietnamese counterparts get the VI mirror. Same verification level, same audit trail.",
          ),
        },
        {
          q: t(
            m,
            "solutions.vnSme.faq.q3",
            "What's the refund policy on the A$5.50 Trust Report?",
          ),
          a: t(
            m,
            "solutions.vnSme.faq.a3",
            "If a report fails to generate for any technical reason, we refund automatically to your original Stripe payment method. Successful generations are non-refundable because the audited output is delivered instantly. Accidental-purchase refunds within 14 days are honoured under Australian Consumer Law.",
          ),
        },
      ]}
      disclaimer={t(
        m,
        "solutions.vnSme.disclaimer",
        "Not financial or legal advice. Cross-border evidence remains subject to the receiving jurisdiction's rules. Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW.",
      )}
    />
  );
}
