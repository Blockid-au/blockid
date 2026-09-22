/**
 * /contact — the one contact form (honeypot + ?topic= + support alert
 * wiring, QA-3 P1-9) plus the email / location / LinkedIn cards.
 *
 * G17 P2-A: server component on the unicorn template inside MarketingShell
 * (it used to be a "use client" page with a raw-hex dark ground and its own
 * NavV2 + Footer). PageHero → Section (form + info cards) → Section
 * (audience links, FeatureGrid) → Section (support) → CtaBand. Metadata and
 * the ContactPage JSON-LD stay in `layout.tsx`. Entity lines come from
 * `lib/site/legal-entity` (operator = legal / billing; footer names both).
 */

import * as React from "react";
import { LEGAL_ENTITY, LEGAL_ENTITY_ABN_LABEL } from "@/lib/site/legal-entity";
import { ExternalLink, Mail, MapPin, Rocket, Users } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, FOCUS_RING, MOTION, PageHero, Section } from "@/components/marketing/template";
import { ContactForm } from "./contact-form";

const CARD = "rounded-xl border border-line-subtle bg-surface p-5 shadow-1";
const TILE = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent";
const LINK = `inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-action underline-offset-4 hover:underline ${MOTION} ${FOCUS_RING}`;

export default function ContactPage() {
  return (
    <MarketingShell>
      <PageHero
        eyebrow="Get in touch"
        title="Contact us"
        sub="Have a question, partnership enquiry, or need support? We would love to hear from you. We respond within one business day."
        align="start"
      />

      <Section id="form" ariaLabel="Contact form and details" tone="sunken">
        <div className="grid gap-10 md:grid-cols-5">
          {/* Left: the form. useSearchParams() needs a Suspense boundary on the App Router. */}
          <div className="md:col-span-3">
            <React.Suspense fallback={null}>
              <ContactForm />
            </React.Suspense>
          </div>

          {/* Right: info cards */}
          <div className="space-y-5 md:col-span-2">
            <div className={CARD}>
              <div className="mb-3 flex items-center gap-3">
                <span className={TILE} aria-hidden>
                  <Mail strokeWidth={1.75} className="h-5 w-5" />
                </span>
                <h2 className="font-display text-base font-semibold text-primary">Email</h2>
              </div>
              <a href="mailto:admin@blockid.au" className={LINK}>
                admin@blockid.au
              </a>
              <p className="mt-1 text-xs text-muted">We respond within one business day.</p>
            </div>

            <div className={CARD}>
              <div className="mb-3 flex items-center gap-3">
                <span className={TILE} aria-hidden>
                  <MapPin strokeWidth={1.75} className="h-5 w-5" />
                </span>
                <h2 className="font-display text-base font-semibold text-primary">Location</h2>
              </div>
              <p className="text-sm text-primary">Sydney, NSW, Australia</p>
              <p className="mt-1 text-xs text-muted">{`${LEGAL_ENTITY.operator} (${LEGAL_ENTITY_ABN_LABEL})`}</p>
            </div>

            <div className={CARD}>
              <h2 className="mb-3 font-display text-base font-semibold text-primary">Follow us</h2>
              <a
                href="https://linkedin.com/company/blockid-au"
                target="_blank"
                rel="noopener noreferrer"
                className={LINK}
                aria-label="BlockID on LinkedIn (opens in new tab)"
              >
                <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
                LinkedIn
              </a>
              {/* No X / Twitter link: @blockid_au does not exist (404 on
                  twitter.com and x.com — release QA-1 #14). LinkedIn is
                  the one live company profile (config/marketing-partners
                  + footer agree). Re-add only with a verified handle. */}
            </div>
          </div>
        </div>
      </Section>

      <Section id="audiences" eyebrow="Looking for something specific?" title="Evaluator pages">
        <FeatureGrid
          columns={2}
          ariaLabel="Audience-specific pages"
          items={[
            {
              icon: Users,
              title: "For investors",
              body: "Explore how BlockID supports deal flow, portfolio visibility and due diligence.",
              href: "/solutions/investor",
              cta: "Learn more",
              ctaId: "contact_audience_investor",
            },
            {
              icon: Rocket,
              title: "For accelerators",
              body: "Discover how BlockID powers accelerator cohorts with SVI tracking and portfolio dashboards.",
              href: "/solutions/accelerator",
              cta: "Learn more",
              ctaId: "contact_audience_accelerator",
            },
          ]}
        />
      </Section>

      <Section
        id="support"
        title="Support"
        lede="For technical support or account-related queries, email admin@blockid.au with a description of your issue and the account email so we can find your workspace."
        tone="sunken"
        spacing="sm"
      />

      <CtaBand
        title="Prefer to see it first?"
        sub="Score a startup free, or open the sample Investor Dossier — no call needed."
        primary={{ href: "/analyze", label: "Score a startup", ctaId: "contact_final_score" }}
        secondary={{ href: "/tbr/demo", label: "See a sample dossier" }}
        tone="base"
      />
    </MarketingShell>
  );
}
