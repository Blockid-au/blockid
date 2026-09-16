// S-IA2 — ex /workspace/white-label, now the "White-label" section of
// /workspace/settings/enterprise. Honest "not available yet" card (S31-B,
// 2026-09-13): custom domains and attribution removal are deferred and not on
// any plan; the logo/colour branding that does exist is the Branding section
// above (#branding). The composed page authenticates once and passes `user`.
import type { AppUser } from "@/lib/auth";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { Palette } from "lucide-react";

export function WhiteLabelSection({ user }: { user: AppUser }) {
  return (
    <section aria-labelledby="white-label" data-testid="white-label-section">
      <NotAvailableYet
        feature="white_label"
        title="White-label"
        icon={Palette}
        userEmail={user.email}
        headingLevel="h2"
        headingId="white-label"
        backHref="/workspace/settings"
        backLabel="Back to Settings"
        reason="Serving your workspace and reports from your own domain, with BlockID attribution removed, is not built yet and is not on any plan. What exists today: your logo, colours and cover on every exported report and investor share page (Custom Branding, Growth plan and above)."
        alternatives={[
          { href: "#branding", label: "Custom Branding — logo and colours on exports" },
          { href: "/pricing?feature=pdf_branding", label: "See which plan includes Custom Branding" },
        ]}
      />
    </section>
  );
}
