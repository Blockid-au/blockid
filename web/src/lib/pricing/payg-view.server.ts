// payg-view.server — the Pricing v5 switch + PAYG display prices as a
// `PaygView` for copy (G35 P5). The flag itself is read ONCE, by W3's
// fail-closed `readPaygConfig()` (payg-flag.ts) — this module only turns that
// slice into display labels, so copy and checkout can never disagree on
// "is it on?". Never throws: any failure yields the flag-OFF view (today's
// site), never a half-v5 page.

import { readPaygConfig } from "@/lib/pricing/payg-flag";
import { PAYG_OFF_VIEW, paygView, type PaygView } from "@/lib/pricing/payg-copy";

export async function getPaygView(): Promise<PaygView> {
  try {
    return paygView(await readPaygConfig());
  } catch {
    return PAYG_OFF_VIEW;
  }
}

/** Just the flag — for routes, crons and e-mails that only branch on it. */
export async function isPaygEnabled(): Promise<boolean> {
  return (await getPaygView()).enabled;
}
