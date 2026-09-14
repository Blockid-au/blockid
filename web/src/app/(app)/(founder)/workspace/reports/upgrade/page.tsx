// /workspace/reports/upgrade — retired paywall, now a redirect.
//
// S31-B (2026-09-13). This page sold a "Standard Report — 5 credits or $29
// AUD one-time" and a "Premium — 10 credits or $79 AUD/month unlimited";
// neither SKU exists (Starter is A$29/mo, Growth A$69/mo, the one-off
// report is A$3), and its buttons went to /workspace/billing and a bare
// /pricing. Nothing links here any more, but the URL still resolved, so it
// now lands on the pricing page with the feature the premium report needs
// spelled out by <PricingFeatureNotice>.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportUpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ feature: "report.premium", from: "/workspace/reports" });
  if (sp.section) params.set("section", sp.section.slice(0, 64));
  redirect(`/pricing?${params.toString()}`);
}
