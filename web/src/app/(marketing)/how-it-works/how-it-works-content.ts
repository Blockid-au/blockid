/**
 * /how-it-works dimension cards — G14-S36.
 *
 * Read from DIMENSION_OWNERS (the engine's single table) so the public
 * explainer names the eight dimensions exactly as the report chapters and
 * the evaluator dossier do. Pure; `page.test.tsx` pins title parity.
 */

import { DIMENSION_OWNERS, DIM_LEGACY_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { agentLabel } from "../methodology/methodology-content";

export interface HowItWorksStep {
  title: string;
  body: string;
  /** Lucide icon name, resolved in page.tsx (content files stay React-free). */
  icon: "upload" | "scan" | "gauge" | "route";
}

/**
 * The four steps (G17 P2-A moved them here from
 * `components/marketing/how-it-works-section.tsx`, which this page was the
 * only consumer of; they render as a numbered `FeatureGrid`).
 */
export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    icon: "upload",
    title: "Give it what you have",
    body: "A pitch deck, your website, or a few sentences. Whatever you hand over, it works out what stage the company is at before it scores anything.",
  },
  {
    icon: "scan",
    title: "It reads the thing properly",
    body: "Thirteen criteria across eight dimensions — team, market, product, traction, capital, risk, compliance and momentum — each scored against something specific in what you gave it.",
  },
  {
    icon: "gauge",
    title: "You get a number and a range",
    body: "Berkus, the VC method, discounted cash flow and comparable companies, run side by side in Australian dollars, with the workings attached.",
  },
  {
    icon: "route",
    title: "Then you decide what to do with it",
    body: "A ranked list of next moves, a data room drafted from your own answers, and — when the time comes — the share register itself.",
  },
];

export interface HowItWorksDimension {
  key: DimKey;
  code: string;
  title: string;
  owner: string;
  body: string;
}

/** The eight cards, in the legacy display order the PDFs and DIMS tables use. */
export const HOW_IT_WORKS_DIMENSIONS: readonly HowItWorksDimension[] = DIM_LEGACY_ORDER.map((key) => {
  const d = DIMENSION_OWNERS[key];
  return { key, code: key.toUpperCase(), title: d.title, owner: agentLabel(d.primary), body: d.promptCopy.streamDescription };
});
