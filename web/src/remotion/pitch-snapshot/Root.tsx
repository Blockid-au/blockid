/**
 * Remotion Pitch Snapshot — composition root.
 *
 * Registers the PitchSnapshot composition (1800 frames @ 30fps = 60 seconds,
 * 1920x1080). Props are typed so the server-side render endpoint can inject
 * live startup data via `--props` or Lambda inputProps.
 *
 * Preview:  cd web && npm run video:preview
 * Render:   npx remotion render src/remotion/pitch-snapshot/Root.tsx PitchSnapshot out.mp4 --props '{...}'
 */

import React from "react";
import { Composition, registerRoot } from "remotion";
import { PitchSnapshot, type PitchSnapshotProps } from "./PitchSnapshot";
import { BRAND } from "../styles/brand";

const DURATION_SEC = 60;
const TOTAL_FRAMES = DURATION_SEC * BRAND.fps; // 1800

/** Default props used by the Remotion Studio preview only. */
const DEFAULT_PROPS: PitchSnapshotProps = {
  startupName: "Acme AI",
  tagline: "AI-powered tools for Australian founders",
  description:
    "We help founders validate, value, and fund their startups with AI-native tooling.",
  problem:
    "90% of startups fail. Manual valuation costs A$5k–A$50k and takes weeks. Founders have no structured way to track startup health.",
  solution:
    "BlockID Startup Value Index™ provides instant AI-powered valuation, equity tooling, and investor-ready reports — all in one platform.",
  sector: "SaaS / FinTech",
  stage: "Seed",
  tam: "A$4.4T global startup ecosystem",
  sam: "A$3.2B cap-table management market",
  som: "A$250K Year 1 (AU bootstrapped SaaS)",
  traction:
    "500+ founders signed up. 2,400+ SVI analyses run. A$5 Founding50 lifetime deal selling.",
  team: "Do Van Long — Founder & CEO. Full-stack engineer with 10+ years building SaaS products.",
  ask: "Raising A$500K seed round. 18-month runway. Product, growth, compliance.",
  slug: "acme-ai",
  sviScore: 142,
  sviGrade: "A",
};

const Root: React.FC = () => (
  <Composition
    id="PitchSnapshot"
    component={PitchSnapshot}
    durationInFrames={TOTAL_FRAMES}
    fps={BRAND.fps}
    width={BRAND.width}
    height={BRAND.height}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(Root);
