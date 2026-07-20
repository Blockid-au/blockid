import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import {
  listExperiments,
  summarise,
  type PricingExperiment,
  type VariantSummary,
} from "@/lib/pricing-experiments";
import { PricingTestClient } from "./pricing-test-client";

export const metadata: Metadata = {
  title: "Pricing A/B Tests — BlockID Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPricingTestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/pricing-test");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const experiments: PricingExperiment[] = await listExperiments();
  const entries = await Promise.all(
    experiments.map(async (e) => [e.id, await summarise(e.id)] as const),
  );
  const summaries: Record<string, VariantSummary[]> = {};
  for (const [id, rows] of entries) summaries[id] = rows;

  return (
    <PricingTestClient
      user={{ email: user.email, displayName: user.displayName ?? null }}
      initialExperiments={experiments}
      initialSummaries={summaries}
    />
  );
}
