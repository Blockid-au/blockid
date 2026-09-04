// Wave 31D — Spanish Trusted Business Report (authenticated).
// Mirror of /workspace/business-report but with locale="es" so shell copy
// (headings, TOC, methodology, band names) render in Spanish. AI-generated
// narrative stays in whatever language the model produced.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/business-report/business-report-client";

export const metadata: Metadata = {
  title: "Informe de Negocio de Confianza — BlockID",
  description:
    "Informe completo de las 8 dimensiones SVI — puntuaciones, evidencia, benchmarks del mercado AU, valoración y hoja de ruta de mejora.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EsBusinessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ pid?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/es/workspace/business-report");
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid } = await searchParams;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <BusinessReportClient projectId={pid ?? "default"} locale="es" />
    </WorkspaceLayout>
  );
}
