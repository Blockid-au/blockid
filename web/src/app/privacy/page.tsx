import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "Privacy Policy — BlockID",
  description:
    "How BlockID collects, uses, discloses and protects personal information under the Australian Privacy Act 1988 and the Australian Privacy Principles.",
  alternates: {
    canonical: "https://blockid.au/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Last updated: 2026-08-23
          </p>

          <div className="mt-8 space-y-10 text-ink-600 leading-relaxed">
            <section>
              <p>
                Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111), of
                Sydney, NSW, Australia (trading as &quot;BlockID.au&quot;,
                &quot;we&quot;, &quot;us&quot;) is the data controller for
                personal information collected through this platform. This
                policy is our notice under Australian Privacy Principle
                (APP) 1 and APP 5, and describes how we handle personal
                information under the{" "}
                <em>Privacy Act 1988</em> (Cth) and the 13 Australian
                Privacy Principles in Schedule 1 of that Act. We review it
                at least annually.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                1. Open and transparent management (APP 1)
              </h2>
              <p className="mt-3">
                We maintain internal procedures to ensure compliance with
                the APPs, including a data-handling register, staff
                training, and vendor due-diligence records. This notice is
                published at{" "}
                <code>https://blockid.au/privacy</code> and updated when
                our practices change. Complaints and access requests are
                handled by the Privacy Officer (see section 9).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                2. What we collect and why (APP 3)
              </h2>
              <p className="mt-3">
                We collect only personal information reasonably necessary
                to deliver the BlockID service:
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Account &amp; identity:</strong> name, email
                  address, company name, role — used to create your
                  workspace and communicate with you.
                </li>
                <li>
                  <strong>Company data:</strong> ABN, cap-table entries,
                  financial projections, revenue/burn, evidence uploads
                  (pitch decks, letters, screenshots) — used to compute
                  your Startup Value Index (SVI) and produce your investor
                  pack.
                </li>
                <li>
                  <strong>Payment metadata:</strong> plan, tax status, last
                  4 of card (via Stripe) — used for billing and ATO tax
                  invoices. Full card details are handled by Stripe and
                  never touch our servers.
                </li>
                <li>
                  <strong>Product usage:</strong> IP address, user agent,
                  pages visited, feature clicks — used to secure the
                  platform and improve UX. Analytics only fire after you
                  consent via the cookie banner.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                3. Notification of collection (APP 5)
              </h2>
              <p className="mt-3">
                This policy is our APP 5 collection notice. When you
                submit a form, the surrounding UI also states what will be
                collected and why. If we ever collect personal information
                from a source other than you (for example, a public
                directory), we will notify you at the next reasonable
                opportunity.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                4. How we use personal information (APP 6)
              </h2>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>To deliver and improve the SVI, dashboards and reports</li>
                <li>To communicate about your account and provide support</li>
                <li>To bill, invoice and reconcile payments</li>
                <li>To prevent fraud, abuse and security incidents</li>
                <li>To comply with legal obligations (e.g. ATO, ASIC)</li>
                <li>
                  For direct marketing about our own services — you may
                  opt out at any time via the unsubscribe link or by
                  emailing the Privacy Officer.
                </li>
              </ul>
              <p className="mt-3">
                We do not use your personal information for a secondary
                purpose unless it is related to the primary purpose above
                and you would reasonably expect it, or you have consented,
                or an APP 6 exception applies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                5. Cross-border disclosure (APP 8)
              </h2>
              <p className="mt-3">
                To run the service we disclose limited personal
                information to the following overseas processors. Before
                disclosure we take reasonable steps under APP 8(2)(a) to
                ensure each recipient does not breach the APPs — namely
                Data Processing Addenda, SCCs where applicable, and a
                review of each vendor&apos;s SOC 2 / ISO 27001 posture.
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Stripe, Inc. (United States)</strong> — payment
                  processing, subscription billing, ATO tax-invoice
                  issuance.
                </li>
                <li>
                  <strong>Anthropic PBC (United States)</strong> — AI
                  inference for the C-Level agent panel and report
                  drafting; inputs are not used to train Anthropic
                  foundation models.
                </li>
                <li>
                  <strong>OpenAI, L.L.C. (United States)</strong> —
                  fallback AI inference for specific enrichment tasks;
                  API-tier data-retention terms apply.
                </li>
                <li>
                  <strong>Google LLC (United States)</strong> — Gemini
                  inference for select tasks and Google Analytics 4 for
                  aggregated product analytics (only after consent).
                </li>
                <li>
                  <strong>Resend, Inc. (United States)</strong> —
                  transactional email delivery (score-ready notices,
                  receipts).
                </li>
              </ul>
              <p className="mt-3">
                You consent to these overseas disclosures by using the
                platform. If you do not consent, please email the Privacy
                Officer and we will discuss alternatives, including
                account closure and data deletion.
              </p>
            </section>

            <section id="security">
              <h2 className="text-xl font-semibold text-ink-800">
                6. Security of personal information (APP 11)
              </h2>
              <p className="mt-3">
                We take reasonable steps to protect personal information
                from misuse, interference, loss, unauthorised access,
                modification and disclosure:
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>TLS 1.2+ in transit; AES-256 at rest</li>
                <li>
                  Postgres Row-Level Security so each tenant only sees
                  their own rows
                </li>
                <li>Least-privilege access + audit logging on admin actions</li>
                <li>Secrets vaulted, rotated on staff change</li>
                <li>Encrypted backups retained for 14 rolling days</li>
                <li>Annual internal security review; SOC 2 Type II in progress</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                7. Access and correction (APP 12 &amp; APP 13)
              </h2>
              <p className="mt-3">
                You may request access to, or correction of, the personal
                information we hold about you by emailing{" "}
                <a
                  href="mailto:admin@blockid.au"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  admin@blockid.au
                </a>
                . We will respond within 30 days. There is no charge for
                access; we may charge a reasonable cost-recovery fee for
                unusually large requests, which we will discuss with you
                first. If we refuse a request we will give written reasons
                and information about how to complain.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                8. Notifiable Data Breaches (Privacy Act Part IIIC)
              </h2>
              <p className="mt-3">
                We comply with the Notifiable Data Breaches scheme in
                Part IIIC of the <em>Privacy Act 1988</em> (Cth). If we
                become aware of an eligible data breach — i.e. a breach
                likely to result in serious harm — we will notify affected
                individuals and the Office of the Australian Information
                Commissioner (OAIC) as soon as practicable and, in any
                event, within 72 hours of assessment where feasible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                9. Complaints and the OAIC
              </h2>
              <p className="mt-3">
                Complaints should first be sent to the Privacy Officer at{" "}
                <a
                  href="mailto:admin@blockid.au"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  admin@blockid.au
                </a>
                . We will acknowledge within 5 business days and respond
                substantively within 30 days.
              </p>
              <p className="mt-3">
                If you are not satisfied with our response, you may lodge
                a complaint with the Office of the Australian Information
                Commissioner (OAIC):
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1">
                <li>
                  Web:{" "}
                  <a
                    href="https://www.oaic.gov.au/privacy/privacy-complaints"
                    className="text-brand-600 hover:text-brand-500 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    oaic.gov.au/privacy/privacy-complaints
                  </a>
                </li>
                <li>Phone: 1300 363 992</li>
                <li>Post: GPO Box 5218, Sydney NSW 2001</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                10. Retention
              </h2>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>
                  <strong>SVI / score submissions:</strong> 24 months
                  from last activity, then de-identified for cohort
                  benchmarks.
                </li>
                <li>
                  <strong>Financial records (billing, invoices):</strong>{" "}
                  7 years, in line with ATO record-keeping obligations.
                </li>
                <li>
                  <strong>Evidence uploads (decks, files):</strong> for
                  the life of the account plus 30 days after closure.
                </li>
                <li>
                  <strong>Backups:</strong> 14 rolling days, then
                  overwritten.
                </li>
                <li>
                  <strong>Product-analytics events (after consent):</strong>{" "}
                  25 months (GA4 default).
                </li>
              </ul>
              <p className="mt-3">
                You can request earlier deletion at any time; we will
                comply unless a legal retention obligation applies (in
                which case we will tell you which and for how long).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                11. Cookies and analytics
              </h2>
              <p className="mt-3">
                We use strictly-necessary cookies to run the platform
                (session, CSRF, consent state). Analytics cookies (Google
                Analytics 4) are set only after you grant consent via the
                on-page banner. You can revoke at any time using the
                &quot;Cookie prefs&quot; control fixed to the bottom-left
                of every public page, or by clearing site data in your
                browser.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                12. Changes to this policy
              </h2>
              <p className="mt-3">
                We may update this policy from time to time. Material
                changes will be communicated via email or an in-app
                notification and reflected in the &quot;Last updated&quot;
                date above. Your continued use of the platform after
                changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                13. Contact
              </h2>
              <p className="mt-3">
                Privacy Officer (interim — the founder acts as Privacy
                Officer until a dedicated hire is named):
              </p>
              <p className="mt-2">
                Auschain PTY LTD
                <br />
                ACN 659 615 111 · ABN 79 659 615 111
                <br />
                Sydney, NSW, Australia
                <br />
                Email:{" "}
                <a
                  href="mailto:admin@blockid.au"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  admin@blockid.au
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
