"use client";

// Fires the GA4 `dossier_view` event once per page view (BA spec §C.5).
// The dossier itself is server-rendered; this is the only client JS on the
// page besides the workspace shell. Renders nothing.

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

export function DossierViewTracker({
  evaluationId,
  consentTier,
  plan,
  role,
}: {
  evaluationId: string;
  consentTier: string;
  plan: string;
  role: "assessor" | "founder";
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("dossier_view", { evaluation_id: evaluationId, consent_tier: consentTier, plan, role });
  }, [evaluationId, consentTier, plan, role]);
  return null;
}
