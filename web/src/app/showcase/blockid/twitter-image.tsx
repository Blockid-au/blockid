// Iteration-8 T3 — file-convention Twitter card image for /showcase/blockid.
// Same composition as opengraph-image.tsx via the shared ShowcaseOgImage
// component, but sized 1200x675 for Twitter's summary_large_image card.

import { ImageResponse } from "next/og";
import { ShowcaseOgImage } from "@/components/og/showcase-og-image";
import { readShowcaseCurrentPhase } from "@/lib/showcase/blockid-og-state";

export const runtime = "nodejs";
export const alt = "BlockID.au — Startup Valuation Index";
export const size = { width: 1200, height: 675 };
export const contentType = "image/png";

export default async function TwitterImage() {
  const currentPhase = await readShowcaseCurrentPhase();
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
