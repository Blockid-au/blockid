/**
 * /vi/methodology/calibration — Vietnamese mirror of the SVI backtest v0
 * page (G14-S39). Same body as the EN route (`(marketing)/methodology/
 * calibration/calibration-body.tsx`) rendered against the `vi` catalogue;
 * hreflang pair via `pageMetadata`.
 */

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { getMessages, t } from "@/lib/i18n/t";
import { pageMetadata } from "@/lib/seo/page-meta";
import { CALIBRATION_VI_PATH, CalibrationBody } from "../../../(marketing)/methodology/calibration/calibration-body";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  return pageMetadata({
    title: t(m, "calibration.meta.title"),
    description: t(m, "calibration.meta.description"),
    path: CALIBRATION_VI_PATH,
    viPath: CALIBRATION_VI_PATH,
    lang: "vi",
  });
}

export default async function ViCalibrationPage() {
  return (
    <MarketingShell>
      <CalibrationBody locale="vi" />
    </MarketingShell>
  );
}
