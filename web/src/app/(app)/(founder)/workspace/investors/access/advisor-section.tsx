// Advisor portal — section (3) of /workspace/investors/access (S-IA2).
// Ex /dashboard/advisor/page.tsx: the RoleLandingIntro for the advisor role
// plus the AdvisorClient (client list + SVI progress, fetched client-side).
// The composed page does auth once; nothing here is keyed on the caller.

import { AdvisorClient } from "./advisor-client";
import { RoleLandingIntro } from "@/components/role/role-landing-intro";

export function AdvisorSection() {
  return (
    <section id="advisor" aria-labelledby="advisor-heading" data-access-section="advisor" className="scroll-mt-24">
      <h2 id="advisor-heading" className="text-2xl font-bold text-ink-900">Advisor portal</h2>
      <p className="mt-1 text-sm text-ink-500">Manage your startup clients and track their SVI progress.</p>
      <div className="mb-6 mt-4">
        <RoleLandingIntro role="advisor" hasGlobalSpotlight />
      </div>
      <AdvisorClient />
    </section>
  );
}
