import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "Terms of Service — BlockID",
  description:
    "Terms and conditions for using the BlockID platform. Governed by Australian law.",
};

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-bold tracking-tight text-ink-800">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Last updated: May 2026
          </p>

          <div className="mt-8 space-y-10 text-ink-600 leading-relaxed">
            <section>
              <p>
                These Terms of Service (&quot;Terms&quot;) govern your use of
                the BlockID platform and services provided by BlockID Pty Ltd
                (ABN 79 659 615 111) (&quot;BlockID&quot;, &quot;we&quot;,
                &quot;us&quot;). By accessing or using our platform, you agree
                to be bound by these Terms.
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
                BlockID platform are owned by or licensed to BlockID Pty Ltd.
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
                7. Governing Law
              </h2>
              <p className="mt-3">
                These Terms are governed by the laws of New South Wales,
                Australia. Any dispute arising from these Terms or your use of
                the platform shall be subject to the exclusive jurisdiction of
                the courts of New South Wales.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                8. Changes to These Terms
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
                  href="mailto:hello@blockid.au"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  hello@blockid.au
                </a>
                .
              </p>
              <p className="mt-2">
                BlockID Pty Ltd
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
