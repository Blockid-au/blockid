import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { BrandingClient } from "./branding-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { ApiKeysSection } from "./api-keys-section";
import { SviApiSection } from "./svi-api-section";

// S-IA2 (spec §A.1) — /workspace/settings/enterprise composes, in order:
//   #branding     Custom Branding  (ex /workspace/branding, this file)
//   #api-keys     API keys         (ex /workspace/api-keys → api-keys-section.tsx)
//   #svi-api      SVI Data API     (ex /workspace/svi-api → svi-api-section.tsx)
//
// G20-F1 (2026-09-20): the SSO (#sso) and White-label (#white-label)
// sections are hidden — neither is built or sold (lib/features/hidden.ts
// keys `sso`, `white_label`). The legacy /workspace/sso and
// /workspace/white-label redirects still land here, on the three sections
// that work. Un-hiding = removing the hidden rows and restoring the two
// section files (sso-section.tsx, white-label-section.tsx) from history.
//
// The page authenticates once and passes `user` to each section. Every
// section keeps its own plan gate inline (Branding → `pdf_branding`
// entitlement, API keys → `canCreateApiKeys`) so a lower plan still sees
// that section's locked / upgrade card instead of being redirected away
// from the whole page.

export const metadata: Metadata = {
  title: "Enterprise settings | BlockID",
  description:
    "Custom branding, API keys and the SVI Data API — every enterprise setting for your workspace in one place.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "branding", label: "Branding" },
  { id: "api-keys", label: "API keys" },
  { id: "svi-api", label: "SVI API" },
] as const;

export default async function EnterpriseSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/settings/enterprise");

  const isSandbox = await getCurrentProjectIsSandbox();

  // PDF branding gate (Growth+/Scale/Enterprise). Distinct from `white_label`
  // which unlocks full white-label chrome — pdf_branding only grants the
  // report-branding settings surface. See lib/branding/gate.ts.
  const isPro =
    user.role === "admin" ||
    (await can(
      { id: user.id, plan: user.plan ?? "free", segment: "founder" },
      "pdf_branding",
    ));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto space-y-12" data-testid="enterprise-settings">
        <header>
          <h1 className="text-xl font-bold text-ink-800">Enterprise settings</h1>
          <p className="text-sm text-ink-600 mt-1">
            Branding, programmatic access and identity for your workspace.
          </p>
          <nav aria-label="On this page" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-brand-600 hover:underline">
                {s.label}
              </a>
            ))}
          </nav>
        </header>

        {/* ── Branding (ex /workspace/branding) ────────────────────────── */}
        <section aria-labelledby="branding" data-testid="branding-section" className="max-w-2xl">
          <div className="mb-6">
            <h2 id="branding" className="scroll-mt-24 text-xl font-bold text-ink-800">Custom Branding</h2>
            <p className="text-sm text-ink-600 mt-1">
              Apply your logo and brand colours to SVI reports and investor
              share pages.
            </p>
          </div>
          <BrandingClient isPro={isPro} />
        </section>

        {/* ── API keys (S-IA2, ex /workspace/api-keys) ─────────────────── */}
        <ApiKeysSection user={user} />

        {/* ── SVI Data API (S-IA2, ex /workspace/svi-api) ──────────────── */}
        <SviApiSection />
      </div>
    </WorkspaceLayout>
  );
}
