/**
 * /methodology/calibration — SVI backtest v0 (G14-S39). See
 * `./calibration-body.tsx` for the page; this file is the EN route +
 * metadata. `force-dynamic` so the page reads the JSON the weekly backtest
 * cron rewrites without a rebuild.
 */

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { CALIBRATION_PATH, CALIBRATION_VI_PATH, CalibrationBody } from "./calibration-body";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("en");
  return pageMetadata({
    title: t(m, "calibration.meta.title"),
    description: t(m, "calibration.meta.description"),
    path: CALIBRATION_PATH,
    viPath: CALIBRATION_VI_PATH,
  });
}

export default async function CalibrationPage() {
  return (
    <MarketingShell>
      <CalibrationBody locale="en" />
    </MarketingShell>
  );
}
