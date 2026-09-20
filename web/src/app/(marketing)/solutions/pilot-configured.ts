// G21 P0-C — server-only read of the two pilot price env vars, by NAME.
// Pages pass the result into `buildAcceleratorProps()` / <PilotOffer /> so
// an unminted price renders a contact link instead of a dead checkout. The
// values are never read into the render tree; only the booleans are.

import { PILOT_SKU_IDS, isPilotSkuConfigured, type PilotSkuId } from "@/lib/pricing/pilot-skus";

export function pilotSkusConfigured(): Readonly<Record<PilotSkuId, boolean>> {
  return Object.fromEntries(PILOT_SKU_IDS.map((id) => [id, isPilotSkuConfigured(id)])) as Record<PilotSkuId, boolean>;
}
