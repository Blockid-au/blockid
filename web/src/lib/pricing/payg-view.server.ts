// payg-view.server — read `platform_config.payg_enabled` + the PAYG display
// prices once, server-side, and hand the result down as a prop (G35 P5).
// See payg-copy.ts for the switch semantics. Never throws: a config read
// failure yields the flag-OFF view (today's site), never a half-v5 page.

import { getPlatformConfig } from "@/lib/platform-config";
import { PAYG_OFF_VIEW, paygView, type PaygView } from "@/lib/pricing/payg-copy";

export async function getPaygView(): Promise<PaygView> {
  try {
    return paygView(await getPlatformConfig());
  } catch {
    return PAYG_OFF_VIEW;
  }
}

/** Just the flag — for routes, crons and e-mails that only branch on it. */
export async function isPaygEnabled(): Promise<boolean> {
  return (await getPaygView()).enabled;
}
