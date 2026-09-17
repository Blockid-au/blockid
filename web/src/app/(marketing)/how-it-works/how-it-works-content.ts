/**
 * /how-it-works dimension cards — G14-S36.
 *
 * Read from DIMENSION_OWNERS (the engine's single table) so the public
 * explainer names the eight dimensions exactly as the report chapters and
 * the evaluator dossier do. Pure; `page.test.tsx` pins title parity.
 */

import { DIMENSION_OWNERS, DIM_LEGACY_ORDER, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { agentLabel } from "../methodology/methodology-content";

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
