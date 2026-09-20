/**
 * /methodology/governance — Startup Value Index score governance (G21 P0-D).
 *
 * The public rendering of `docs/product/score-governance.md`: dimension
 * definitions, weight policy, versioning + history, change policy, benchmark
 * publication rules, conflict handling, human review + overrides,
 * corrections / appeals, re-score policy, model provenance, data limitations.
 * Every figure comes from the engine's constants via `buildGovernanceProps`.
 * `/vi/methodology/governance` is the Vietnamese mirror (short summary +
 * the same sections).
 */

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import { METHODOLOGY_PATH } from "../methodology-content";
import { GovernanceBody } from "./governance-body";
import { GOVERNANCE_PATH, GOVERNANCE_VI_PATH, buildGovernanceProps } from "./governance-content";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const p = buildGovernanceProps();
  return pageMetadata({
    title: "Score governance",
    description: `How the Startup Value Index (v${p.version}) is governed: dimensions, weights, versioning, benchmark rules, conflicts, human review, corrections and re-scores.`,
    path: GOVERNANCE_PATH,
    viPath: GOVERNANCE_VI_PATH,
  });
}

export default function GovernanceRoute() {
  return <GovernanceBody {...buildGovernanceProps()} locale="en" summary={null} methodologyHref={METHODOLOGY_PATH} />;
}
