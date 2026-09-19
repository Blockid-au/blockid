"use client";

/**
 * ViHeroSearch — the /vi homepage's search box (G17 P2-A).
 *
 * The same `SmartIntake` omnibox the English home renders inside
 * `HeroSection`, with a Vietnamese placeholder, and the same hand-off:
 * whatever is typed is stashed as the pending intake and carried to
 * `/analyze`, so it is never asked for twice. The page itself stays a
 * server component — this island is only the box.
 *
 * Replaces `components/landing/hero-search.tsx` (the legacy dark-token
 * search with its own English H1), which /vi was the last consumer of.
 */

import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";
import { pendingIntakeQuery, setPendingIntake } from "@/lib/analyze/pending-intake";

export function ViHeroSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();

  function handleSubmit(payload: SmartIntakeSubmission) {
    trackEvent("svi_submitted", {
      method: payload.file ? "file" : "text",
      has_file: !!payload.file,
      arm: "E1",
    });
    setPendingIntake(payload);
    router.push(pendingIntakeQuery(payload));
  }

  return (
    <div data-testid="hero-search" id="score">
      <SmartIntake onSubmit={handleSubmit} placeholder={placeholder} />
    </div>
  );
}
