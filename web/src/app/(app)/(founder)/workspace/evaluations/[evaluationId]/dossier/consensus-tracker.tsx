"use client";

// GA4 `consensus_viewed` (BA spec §C.5) — fired once per dossier view when
// the seats table renders with ≥ 2 seats. Renders nothing.

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

export function ConsensusTracker({ evaluationId, seats }: { evaluationId: string; seats: number }) {
  useEffect(() => {
    trackEvent("consensus_viewed", { evaluation_id: evaluationId, seats });
  }, [evaluationId, seats]);
  return null;
}
