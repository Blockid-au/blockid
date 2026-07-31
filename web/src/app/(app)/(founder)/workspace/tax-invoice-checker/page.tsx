// /workspace/tax-invoice-checker — founder-facing ATO tax-invoice format
// checker (P5-tax-invoice-checker-ui). Runs the pure `assessTaxInvoice()`
// helper (P5-tax-invoice-checker) in-browser via
// `TaxInvoiceCheckerClient` so a founder can paste supplier-invoice fields
// and see the ATO classification + missing fields + GST cross-check live.
//
// No API route, no persistence — deliberately stateless. The
// P5-tax-invoice-checker-persist follow-up will add a
// `compliance_tax_invoice_checks` snapshot table once callers need one.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { TaxInvoiceCheckerClient } from "./tax-invoice-checker-client";

export const metadata: Metadata = {
  title: "Tax Invoice Checker | Workspace | BlockID",
  description:
    "Validate a supplier tax invoice against the ATO valid-tax-invoice rules before you claim a GST input-tax credit.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/tax-invoice-checker");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold text-ink-900">
            Tax invoice checker
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Paste the fields from a supplier invoice — we&apos;ll validate
            against the ATO valid-tax-invoice rules under{" "}
            <em>A New Tax System (Goods and Services Tax) Act 1999 (Cth) s
            29-70(1)</em>{" "}
            and flag any missing fields that would block your GST input-tax
            credit. This is a live linter, not a saved compliance artefact —
            confirm with a registered tax agent before relying on it.
          </p>
        </header>
        <TaxInvoiceCheckerClient />
      </div>
    </WorkspaceLayout>
  );
}
