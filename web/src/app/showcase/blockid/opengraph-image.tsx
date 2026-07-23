// Iteration-8 T3 — file-convention OG image for /showcase/blockid.
// Next.js auto-registers this as og:image; the metadata block in page.tsx
// also lists it explicitly as belt-and-suspenders for crawlers that don't
// follow the App Router convention. See docs/plans/iteration-8.md task #3.

import { ImageResponse } from "next/og";
import { ShowcaseOgImage } from "@/components/og/showcase-og-image";
import { readShowcaseCurrentPhase } from "@/lib/showcase/blockid-og-state";

export const runtime = "nodejs";
export const alt = "BlockID.au — Startup Valuation Index";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
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
