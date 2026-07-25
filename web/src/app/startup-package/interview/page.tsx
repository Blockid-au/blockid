// Startup Package — Guided Interview (RSC entry)
//
// Server component: gates on auth, resolves the founder's active project
// (if any) so the client wizard can autosave without a first-round dance,
// and hands off to the client interview-wizard.
//
// The wizard itself is a "use client" boundary (see interview-wizard.tsx);
// this file keeps the SSR outer shell + metadata for SEO + skip link etc.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { InterviewWizard } from "./interview-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Startup Package · Guided Interview",
  description:
    "Answer 8 short questions and let BlockID's C-Level agents score your startup in real time.",
  robots: { index: false, follow: false },
};

export default async function StartupPackageInterviewPage() {
  const user = await getCurrentUser();
  if (!user) {
    // Kick to login and come back — the wizard needs an authenticated
    // user to autosave answers, spend credits, and snapshot SVI.
    redirect("/login?next=/startup-package/interview");
  }

  const activeProject = await getActiveProject(user.id);
  const projectId = activeProject?.id ?? null;

  return (
    <div
      data-theme="lux"
      className="min-h-svh bg-slate-950 text-slate-100"
    >
      <a
        href="#interview-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cyan-500 focus:px-4 focus:py-2 focus:text-slate-950"
      >
        Skip to interview
      </a>

      <header className="border-b border-slate-800/70 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-slate-500">
              Startup Package
            </p>
            <h1 className="text-lg font-semibold text-slate-100">
              Guided founder interview
            </h1>
          </div>
          <a
            href="/dashboard"
            className="text-xs text-slate-400 underline hover:text-slate-200"
          >
            Save & exit
          </a>
        </div>
      </header>

      <main id="interview-main">
        <InterviewWizard initialProjectId={projectId} />
      </main>
    </div>
  );
}
