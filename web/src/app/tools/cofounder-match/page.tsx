import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { CofounderMatchForm } from "./cofounder-match-form";
import { ProfileList } from "./profile-list";

const TITLE = "Cofounder Match Australia — BlockID";
const DESCRIPTION =
  "Find your AU startup cofounder. Free directory for idea-stage founders. By BlockID.au.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "cofounder match australia",
    "find cofounder sydney",
    "startup cofounder directory",
    "technical cofounder australia",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "https://blockid.au/tools/cofounder-match",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  alternates: {
    canonical: "https://blockid.au/tools/cofounder-match",
  },
};

// Force dynamic so the directory list reflects the latest submissions on each
// request — directory is small (max 12) so the cost is trivial.
export const dynamic = "force-dynamic";

export default function CofounderMatchPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
              Free tool · No login · AU-tuned
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-slate-50">
              Find your cofounder — match before you incorporate, fight, or
              fork.
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
              Stop posting to Reddit. The AU founder match directory. Idea-stage
              founders register a profile, browse anonymized cards, and we
              connect you when there&apos;s a fit.
            </p>
          </header>

          <section className="mt-10" aria-labelledby="register">
            <h2 id="register" className="sr-only">
              Register your profile
            </h2>
            <CofounderMatchForm />
          </section>

          <section className="mt-16" aria-labelledby="directory">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2
                  id="directory"
                  className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-50"
                >
                  Recent profiles
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Anonymized cards. First name + last initial, city and role
                  tags only — never email or LinkedIn.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <Suspense
                fallback={
                  <div className="rounded-2xl border border-ink-700 bg-ink-900 p-10 text-center text-sm text-slate-500">
                    Loading directory…
                  </div>
                }
              >
                <ProfileList />
              </Suspense>
            </div>
          </section>

          <section className="mt-16 grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Why a directory, not DM-roulette?",
                body: "Reddit and Slack groups bury you. A focused AU directory means founders looking for a cofounder right now can actually find each other before incorporating.",
              },
              {
                title: "Why anonymized?",
                body: "Your name and email aren't useful to a stranger. Role + stage + city are. We match you privately when there's a real fit, not a vibe.",
              },
              {
                title: "What's next after a match?",
                body: "We hand you each other's contact details + a short founder-fit checklist (working styles, equity expectations, cap table mechanics). Then it's over to you.",
              },
            ].map((b) => (
              <article
                key={b.title}
                className="rounded-2xl border border-ink-700 bg-ink-900 p-6"
              >
                <h3 className="text-base font-semibold text-slate-50">
                  {b.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {b.body}
                </p>
              </article>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
