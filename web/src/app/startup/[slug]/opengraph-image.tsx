// Subgoal 9 — App Router file-convention OG image for /startup/[slug].
//
// Mirrors the /showcase/blockid/opengraph-image pattern (see
// web/src/app/showcase/blockid/opengraph-image.tsx). Reuses the shared
// <ShowcaseOgImage> shell so every Package listing on social ends up with
// the same visual system. Falls back to a neutral pre-launch image when
// the listing hasn't loaded (unpublished slug, DB unreachable) so link
// unfurlers never render a broken preview.

import { ImageResponse } from "next/og";
import { ShowcaseOgImage } from "@/components/og/showcase-og-image";
import { loadPublicListing } from "@/lib/startup-package/public-listing";

export const runtime = "nodejs";
export const alt = "BlockID.au — Startup Package listing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let currentPhase: number | null = null;
  try {
    const listing = await loadPublicListing(slug);
    if (listing?.svi) {
      // Coarse phase bucketing: map the 4-band SVI to a 12-phase index
      // so the shared showcase OG shell has something to point at.
      const bandToPhase = { seed: 3, growth: 6, scale: 9, unicorn: 12 } as const;
      currentPhase = bandToPhase[listing.svi.band];
    }
  } catch {
    // Fall through to null → shared shell renders the neutral pre-launch state.
  }
  return new ImageResponse(
    (
      <ShowcaseOgImage
        currentPhase={currentPhase}
        width={size.width}
        height={size.height}
      />
    ),
    { ...size },
  );
}
