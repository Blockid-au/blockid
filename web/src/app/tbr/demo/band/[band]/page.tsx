/**
 * `/tbr/demo?band=A|B|C|D` — one static demo per verdict band (G28-D).
 *
 * The public URL keeps the query-string shape: the proxy rewrites it here
 * (lib/report-v2/demo-band-route.ts, same contract as
 * `/funding/grants?state=NSW`), the metadata self-canonicalises to
 * `/tbr/demo?band=X`, and the parent `/tbr/demo` stays `force-static`
 * (reading `searchParams` there would make it dynamic). Four documents,
 * prerendered at build from `investmentBandFixture`; anything else is a
 * 404, never an on-demand render.
 *
 * Direct hits on `/tbr/demo/band/A` work too and canonicalise to the
 * query URL, so they never compete with it in the index.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoBandParams, normaliseDemoBand } from "@/lib/report-v2/demo-band-route";
import type { InvestmentBandFixture } from "@/lib/report-v2/fixtures";
import { TbrDemoView, demoMetadata } from "../../demo-view";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): Array<{ band: InvestmentBandFixture }> {
  return demoBandParams();
}

type Params = Promise<{ band: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const band = normaliseDemoBand((await params).band);
  return demoMetadata(band ?? "B");
}

export default async function TbrDemoBandPage({ params }: { params: Params }) {
  const band = normaliseDemoBand((await params).band);
  if (!band) notFound();
  return <TbrDemoView band={band} />;
}
