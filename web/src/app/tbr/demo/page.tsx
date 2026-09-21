// /tbr/demo — public "reference" Trusted Business Report preview (band B,
// the demo document as stored). The view, the metadata and the four
// verdict-band variants live in ./demo-view.tsx; `/tbr/demo?band=A…D` is
// rewritten by the proxy onto ./band/[band] so this page stays
// `force-static` (G28-D, lib/report-v2/demo-band-route.ts).
//
// Server component. No DB reads, no auth, safe to CDN-cache.

import type { Metadata } from "next";
import { DEFAULT_DEMO_BAND, TbrDemoView, demoMetadata } from "./demo-view";

export const dynamic = "force-static";

export const metadata: Metadata = demoMetadata(DEFAULT_DEMO_BAND);

export default function TbrDemoPage() {
  return <TbrDemoView band={DEFAULT_DEMO_BAND} />;
}
