// S-IA2 — ex /workspace/sso, now the "SSO" section of
// /workspace/settings/enterprise. Honest "not available yet" card (S31-B,
// 2026-09-13): SSO is a third-party identity-provider integration and is
// deferred; it is not sold on any plan today, so there is no upgrade button
// and no date. The composed page authenticates once and passes `user` down.
import type { AppUser } from "@/lib/auth";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { Shield } from "lucide-react";

export function SsoSection({ user }: { user: AppUser }) {
  return (
    <section aria-labelledby="sso" data-testid="sso-section">
      <NotAvailableYet
        feature="sso"
        title="Single Sign-On"
        icon={Shield}
        userEmail={user.email}
        headingLevel="h2"
        headingId="sso"
        backHref="/workspace/settings"
        backLabel="Back to Settings"
        reason="Signing your team in through a corporate identity provider (SAML 2.0 / OIDC) needs a partner integration we have not built. Nothing on any plan grants it today, so we do not sell it. Team members can be invited by email and sign in with a password, Google, or a magic link."
        alternatives={[
          { href: "/workspace/team", label: "Invite team members" },
          { href: "/workspace/settings", label: "Account and sign-in settings" },
        ]}
      />
    </section>
  );
}
