import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Mail, MapPin } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact Us — BlockID",
  description:
    "Get in touch with the BlockID team. Based in Sydney, Australia.",
};

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-bold tracking-tight text-ink-800">
            Contact Us
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-600">
            Have a question, partnership enquiry, or need support? We would
            love to hear from you.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-surface-200 bg-surface-100 p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                  <Mail strokeWidth={1.75} className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-semibold text-ink-800">Email</h2>
              </div>
              <p className="mt-3 text-ink-600">
                Reach us at{" "}
                <a
                  href="mailto:ceo@longcare.au"
                  className="text-brand-600 hover:text-brand-500 underline"
                >
                  ceo@longcare.au
                </a>
              </p>
              <p className="mt-1 text-sm text-ink-600">
                We aim to respond within one business day.
              </p>
            </div>

            <div className="rounded-xl border border-surface-200 bg-surface-100 p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                  <MapPin strokeWidth={1.75} className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-semibold text-ink-800">Location</h2>
              </div>
              <p className="mt-3 text-ink-600">Sydney, Australia</p>
              <p className="mt-1 text-sm text-ink-600">
                BlockID Pty Ltd (ABN 79 659 615 111)
              </p>
            </div>
          </div>

          <section className="mt-12">
            <h2 className="text-2xl font-semibold text-ink-800">Support</h2>
            <p className="mt-3 leading-relaxed text-ink-600">
              For technical support or account-related queries, email us at{" "}
              <a
                href="mailto:ceo@longcare.au"
                className="text-brand-600 hover:text-brand-500 underline"
              >
                ceo@longcare.au
              </a>{" "}
              with a description of your issue. If you are a Founding 50
              member, please include your account email so we can prioritise
              your request.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
