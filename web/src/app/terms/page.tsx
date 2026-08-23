import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "Terms of Service — BlockID",
  description:
    "Terms and conditions for using the BlockID platform. Governed by Australian law.",
  alternates: {
    canonical: "https://blockid.au/terms",
  },
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Last updated: 2026-08-23
          </p>

          <div className="mt-8 space-y-10 text-ink-600 leading-relaxed">
            <section>
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your use of
                the BlockID platform and services provided by Auschain PTY LTD
                (ACN 659 615 111, ABN 79 659 615 111), of Sydney, NSW,
                Australia (&quot;BlockID&quot;, &quot;we&quot;, &quot;us&quot;).
                By accessing or using our platform, you agree to be bound by
                these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                1. Acceptance of Terms
              </h2>
              <p className="mt-3">
                By creating an account or using BlockID, you confirm that you
                are at least 18 years of age, have the legal capacity to enter
                into these Terms, and agree to comply with all applicable laws
                and regulations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                2. Your Account
              </h2>
              <p className="mt-3">
                You are responsible for maintaining the confidentiality of your
                account credentials and for all activity that occurs under your
                account. You agree to notify us immediately of any unauthorised
                access. BlockID reserves the right to suspend or terminate
                accounts that violate these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                3. Use of the Service
              </h2>
              <p className="mt-3">
                BlockID provides AI-powered tools for startup ownership,
                valuation, and fundraising. You may use the platform for lawful
                business purposes only. You agree not to:
              </p>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>Reverse-engineer, decompile, or disassemble any part of the platform</li>
                <li>Use the service to generate misleading or fraudulent documents</li>
                <li>Interfere with the operation or security of the platform</li>
                <li>Resell or redistribute access to the platform without written consent</li>
                <li>Upload content that is unlawful, defamatory, or infringes third-party rights</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                4. Intellectual Property
              </h2>
              <p className="mt-3">
                All content, code, designs, and AI models comprising the
                BlockID platform are owned by or licensed to Auschain PTY LTD.
                You retain ownership of the data and documents you upload. By
                using the platform, you grant BlockID a limited licence to
                process your data solely to provide the services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                5. Disclaimer
              </h2>
              <p className="mt-3">
                BlockID is a software platform and does not provide financial,
                legal, or tax advice. AI-generated outputs, including
                valuations, scores, and term sheets, are for informational
                purposes only. You should engage a licensed professional
                adviser before making investment or fundraising decisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                6. Limitation of Liability
              </h2>
              <p className="mt-3">
                To the maximum extent permitted by Australian law, BlockID
                shall not be liable for any indirect, incidental, special,
                consequential, or punitive damages, including loss of profits,
                data, or business opportunities, arising from your use of or
                inability to use the platform. Our total liability for any
                claim shall not exceed the fees you have paid to BlockID in the
                twelve months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                6a. Australian Consumer Law non-excludable guarantees
              </h2>
              <p className="mt-3">
                Nothing in these Terms limits or excludes rights that cannot
                be excluded under the Australian Consumer Law (Schedule 2 of
                the <em>Competition and Consumer Act 2010</em> (Cth)),
                including the consumer guarantees in sections 54 to 59.
                Where a consumer guarantee is contravened, our liability is
                limited (to the extent permitted by law) to, at our option,
                the re-supply of the affected service or the refund of
                amounts paid for the affected service. Section 6 above
                applies subject to this section 6a.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                7. Fees, GST and tax invoices
              </h2>
              <p className="mt-3">
                All fees are stated in Australian dollars (AUD) and are
                exclusive of GST unless expressly stated otherwise. Where
                GST is payable, we will add GST to the fee at the applicable
                rate and Stripe will issue an ATO-compliant tax invoice on
                payment. You are responsible for any withholding or other
                tax obligations arising in your own jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                8. Cancellation and refunds
              </h2>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Cooling-off:</strong> You may cancel a first paid
                  subscription within seven (7) days of the initial charge
                  for a full refund, provided you have not run more than
                  one paid analysis in that period.
                </li>
                <li>
                  <strong>Monthly plans:</strong> Cancel at any time from
                  the Billing Portal; access continues until the end of the
                  paid period and no pro-rata refund is issued.
                </li>
                <li>
                  <strong>Annual plans:</strong> Cancellation within 14 days
                  of a renewal charge attracts a pro-rata refund for the
                  unused period. After that window, annual plans run to
                  term without refund.
                </li>
                <li>
                  <strong>Credits and add-ons:</strong> Prepaid credit
                  packs are non-refundable once consumed, but any unused
                  balance is refunded on written request within 14 days of
                  purchase.
                </li>
              </ul>
              <p className="mt-3">
                These rights are in addition to any remedy available under
                the Australian Consumer Law (see section 6a).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                9. Dispute resolution
              </h2>
              <p className="mt-3">
                Before commencing formal proceedings, the parties agree to
                use the following ladder in good faith:
              </p>
              <ol className="mt-3 list-decimal pl-5 space-y-1.5">
                <li>
                  <strong>Informal negotiation</strong> — email{" "}
                  <a
                    href="mailto:admin@blockid.au"
                    className="text-brand-600 hover:text-brand-500 underline"
                  >
                    admin@blockid.au
                  </a>{" "}
                  with a written description of the dispute; we will
                  respond within 10 business days.
                </li>
                <li>
                  <strong>Escalation</strong> — if unresolved, either party
                  may escalate to a nominated senior manager for a
                  structured discussion within a further 10 business days.
                </li>
                <li>
                  <strong>Mediation</strong> — if still unresolved, the
                  parties agree to attempt mediation administered by the
                  <em> Resolution Institute</em> (
                  <a
                    href="https://www.resolution.institute"
                    className="text-brand-600 hover:text-brand-500 underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    resolution.institute
                  </a>
                  ) under its standard mediation rules, with costs shared
                  equally.
                </li>
                <li>
                  <strong>Courts</strong> — only after the steps above have
                  been attempted may a party commence proceedings in the
                  Supreme Court of New South Wales, which the parties
                  submit to as the exclusive jurisdiction.
                </li>
              </ol>
              <p className="mt-3">
                Nothing in this section prevents a party from seeking
                urgent interlocutory relief.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                10. Governing Law
              </h2>
              <p className="mt-3">
                These Terms are governed by the laws of New South Wales,
                Australia. Subject to section 9 (Dispute resolution), any
                dispute arising from these Terms or your use of the
                platform shall be subject to the exclusive jurisdiction of
                the courts of New South Wales.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                11. Changes to These Terms
              </h2>
              <p className="mt-3">
                We may update these Terms from time to time. If we make
                material changes, we will notify you via email or an in-app
                notification. Your continued use of the platform after the
                effective date of changes constitutes acceptance of the revised
                Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                9. Contact
              </h2>
              <p className="mt-3">
                For questions about these Terms, contact us at{" "}
                <a
                  href="mailto:admin@blockid.au"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  admin@blockid.au
                </a>
                .
              </p>
              <p className="mt-2">
                Auschain PTY LTD
                <br />
                ACN 659 615 111 · ABN 79 659 615 111
                <br />
                Sydney, NSW, Australia
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
