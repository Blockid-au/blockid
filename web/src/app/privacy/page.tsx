import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

export const metadata: Metadata = {
  title: "Privacy Policy — BlockID",
  description:
    "Learn how BlockID collects, uses, and protects your personal information. Australian data residency and GDPR-aligned practices.",
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
            Last updated: May 2026
          </p>

          <div className="mt-8 space-y-10 text-ink-600 leading-relaxed">
            <section>
              <p>
                Auschain PTY LTD (ABN pending) (&quot;BlockID&quot;,
                &quot;we&quot;, &quot;us&quot;) is committed to protecting your
                privacy. This policy explains how we collect, use, store, and
                share your personal information when you use our platform and
                services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                1. Information We Collect
              </h2>
              <p className="mt-3">
                We collect information you provide directly, including your
                name, email address, company details, cap table data, financial
                projections, and any documents you upload. We also collect usage
                data such as IP addresses, browser type, pages visited, and
                feature interactions through cookies and analytics tools.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                2. How We Use Your Information
              </h2>
              <ul className="mt-3 list-disc pl-5 space-y-1.5">
                <li>To provide, maintain, and improve our platform and services</li>
                <li>To generate your Startup Viability Index and AI-powered analyses</li>
                <li>To communicate with you about your account, updates, and support</li>
                <li>To detect and prevent fraud, abuse, or security incidents</li>
                <li>To comply with legal obligations under Australian law</li>
                <li>To send product updates and marketing communications (with your consent)</li>
              </ul>
            </section>

            <section id="security">
              <h2 className="text-xl font-semibold text-ink-800">
                3. Data Storage &amp; Security
              </h2>
              <p className="mt-3">
                All data is stored with Australian data residency. We use
                industry-standard encryption in transit (TLS 1.2+) and at rest
                (AES-256). Access controls, audit logging, and regular security
                reviews protect your information. We are pursuing SOC 2 Type II
                certification.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                4. Third Parties
              </h2>
              <p className="mt-3">
                We do not sell your personal information. We may share data with
                trusted service providers who assist in operating our platform
                (e.g., cloud hosting, email delivery, analytics), subject to
                strict contractual obligations. We may also disclose information
                where required by Australian law or regulation.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                5. Your Rights
              </h2>
              <p className="mt-3">
                Under the Australian Privacy Act 1988 and applicable law, you
                have the right to access, correct, or delete your personal
                information. You may also withdraw consent for marketing
                communications at any time. To exercise these rights, contact
                us using the details below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                6. Cookies
              </h2>
              <p className="mt-3">
                We use essential cookies to operate the platform and analytics
                cookies to understand usage patterns. You can manage cookie
                preferences through your browser settings.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                7. Changes to This Policy
              </h2>
              <p className="mt-3">
                We may update this policy from time to time. Material changes
                will be communicated via email or an in-app notification. Your
                continued use of the platform after changes constitutes
                acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-ink-800">
                8. Contact
              </h2>
              <p className="mt-3">
                If you have questions about this privacy policy or wish to
                exercise your rights, contact us at{" "}
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
