// G19-S44 — which criterion cards a chapter carries in full vs compact.
// Client-safe, shared by the web chapter and the page estimate.

import { CRITERIA } from "@/lib/evaluation-criteria";
import type { DimensionChapter } from "./schema";

export type CardRenderMode = "full" | "compact";

/**
 * G19-S44: a criterion card whose primary dimension is another chapter is
 * rendered COMPACT there (title · score · one-line verdict · link to the
 * owning chapter) instead of the full card — one full copy per document. A
 * chapter with no card of its own (CGH: every card is borrowed) keeps its
 * cards in full so it never reads empty. Web + estimate share this rule.
 */
export function cardRenderModes(ch: Pick<DimensionChapter, "dim" | "criteria">): Map<string, CardRenderMode> {
  const own = ch.criteria.filter((c) => (CRITERIA.find((d) => d.key === c.key)?.primaryDimension ?? ch.dim) === ch.dim);
  const modes = new Map<string, CardRenderMode>();
  for (const c of ch.criteria) modes.set(c.key, own.length === 0 || own.includes(c) ? "full" : "compact");
  return modes;
}

