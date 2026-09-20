// next-action — G19-S43: the chapter's "next action" fits the founder.
//
// Before S43 every chapter took `DIMENSION_ACTIONS[dim][0]` ("Register ABN"
// on a Verified-ABN company, "Find a co-founder" for three co-founders) with
// `expectedLift = weight × (70 − score) / 100` → "+1". This module picks the
// action from what the report actually knows and quotes the one lift model:
//
//   1. an unassessed chapter → the best linked CTA among its missing rows;
//   2. the lowest-scoring criterion card below the strong band, its own
//      next step (lift = criterion weight × gap, catalogue scale);
//   3. the best missing-row CTA (catalogue lift);
//   4. any criterion card's next step;
//   5. the dimension's generic action list, skipping anything already
//      satisfied (verified ABN, ≥ 2 co-founders, a present connector);
//   6. "Add evidence for <dim>" on the first connector not yet present.
//
// Shared by report-v2/adapter.ts (read-time) and report-pipeline/
// agent-dispatcher.ts (W4 deterministic card). Pure, client-safe.

import { CRITERIA } from "@/lib/evaluation-criteria";
import { DIMENSION_OWNERS, type DimKey, type EvidenceSource } from "@/lib/report-pipeline/dimension-owners";
import { DIMENSION_ACTIONS } from "@/lib/svi-actions";
import { clampLift, derivedLift, liftForSource } from "@/lib/svi-lift";
import { bestMissingCta, evidencedSources } from "./evidence-cta";
import type { CriterionCard, DimensionChapter, EvidenceRow } from "./schema";

export type NextAction = DimensionChapter["nextAction"];

export interface NextActionFacts {
  /** projects.verification_level ≥ 2 (ABR Active) — "Register ABN" is never offered. */
  abnVerified: boolean;
  /** Known co-founder count (null = unknown) — "Find a co-founder" is skipped at ≥ 2. */
  coFounders: number | null;
}

export interface NextActionInput {
  dim: DimKey;
  score: number;
  assessed: boolean;
  cards: readonly CriterionCard[];
  /** The chapter's evidence rows (missing rows carry `cta`). */
  evidence: readonly EvidenceRow[];
  facts: NextActionFacts;
}

const CONNECT_SOURCE: Record<string, EvidenceSource> = { stripe: "stripe", "google analytics": "ga4", analytics: "ga4", github: "github", xero: "xero" };

/** True when the founder already has what the action asks for. */
export function isActionSatisfied(label: string, facts: NextActionFacts, evidenced: ReadonlySet<EvidenceSource>): boolean {
  const l = label.toLowerCase();
  if (facts.abnVerified && /\babn\b|\basic\b/.test(l)) return true;
  if ((facts.coFounders ?? 0) >= 2 && /co-?founder/.test(l)) return true;
  const m = l.match(/^connect\s+(stripe|google analytics|analytics|github|xero)\b/);
  if (m && evidenced.has(CONNECT_SOURCE[m[1]])) return true;
  if (/^upload .*(linkedin|founder profile)/.test(l) && evidenced.has("linkedin")) return true;
  return false;
}

/** The evidence source a generic action label adds (undefined when it is not an evidence action). */
export function sourceForLabel(label: string): EvidenceSource | undefined {
  const l = label.toLowerCase();
  const m = l.match(/^connect\s+(stripe|google analytics|analytics|github|xero)\b/);
  if (m) return CONNECT_SOURCE[m[1]];
  if (/linkedin|team profile/.test(l)) return "linkedin";
  if (/^upload\b/.test(l)) return "upload";
  return undefined;
}

/** Bullets that repeat a criterion-card bullet (normalised) are dropped from the chapter level. */
export function dedupeAgainstCards(items: readonly string[], cards: readonly CriterionCard[]): string[] {
  const norm = (s: string) => s.replace(/\s*\[(?:ev:[^\]]*|unevidenced)\]\s*$/i, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
  const seen = new Set(cards.flatMap((c) => [...c.strengths, ...c.gaps]).map(norm));
  const out: string[] = [];
  for (const it of items) {
    const n = norm(it);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(it);
  }
  return out;
}

function fromMissing(row: EvidenceRow, dim: DimKey, score: number): NextAction {
  const lift = row.cta?.lift ?? liftForSource(dim, row.source) ?? derivedLift(DIMENSION_OWNERS[dim].weight, score);
  return { title: row.cta?.label ?? row.label, window: "this_week", expectedLift: clampLift(lift), evidenceToAdd: row.source };
}

function fromCard(card: CriterionCard): NextAction {
  const weight = CRITERIA.find((c) => c.key === card.key)?.weight ?? 6;
  return { title: card.nextAction.trim(), window: card.score < 40 ? "this_week" : "30d", expectedLift: derivedLift(weight, card.score) };
}

/** Pick the chapter's next action (see the module header for the order). */
export function chooseNextAction(input: NextActionInput): NextAction {
  const owner = DIMENSION_OWNERS[input.dim];
  const evidenced = evidencedSources(input.evidence);
  const usable = (label: string) => label.trim().length > 0 && !isActionSatisfied(label, input.facts, evidenced);
  const missing = bestMissingCta(input.evidence.filter((r) => r.dims.includes(input.dim)));
  // The dimension's own (primary) criteria come first, then the secondary
  // lenses, lowest score first — so two chapters sharing a criterion do not
  // both name the same step.
  const primary = new Set<string>(owner.primaryCriteria);
  const cards = [...input.cards].filter((c) => usable(c.nextAction)).sort((a, b) => Number(primary.has(b.key)) - Number(primary.has(a.key)) || a.score - b.score);
  const lowest = cards.find((c) => c.score < 70);

  if (!input.assessed && missing) return fromMissing(missing, input.dim, input.score);
  // Below the strong band: the lowest criterion's own step and the best
  // linked gap compete on lift (a 1-point criterion gap never outranks a
  // +6 connector); ties go to the criterion.
  if (lowest) {
    const fromLowest = fromCard(lowest);
    if (missing) {
      const gap = fromMissing(missing, input.dim, input.score);
      if (gap.expectedLift > fromLowest.expectedLift) return gap;
    }
    return fromLowest;
  }
  if (missing) return fromMissing(missing, input.dim, input.score);
  if (cards[0]) return fromCard(cards[0]);

  const generic = (DIMENSION_ACTIONS[input.dim] ?? []).find((a) => usable(a.label));
  // The evidence the generic action adds ("Connect Google Analytics" → ga4,
  // "Upload …" → upload), else the first connector not yet present.
  const source = (generic ? sourceForLabel(generic.label) : undefined) ?? owner.connectors.find((s) => !evidenced.has(s));
  const lift = (source ? liftForSource(input.dim, source) : undefined) ?? derivedLift(owner.weight, input.score);
  return {
    title: generic?.label ?? `Add evidence for ${owner.shortLabel}`,
    window: "30d",
    expectedLift: clampLift(lift),
    ...(source ? { evidenceToAdd: source } : {}),
  };
}

/**
 * G19-S43 / D2: reconcile an owner-agent (LLM) next action with the one lift
 * model — the catalogue value when the action adds evidence, the proposal
 * clamped onto the catalogue range otherwise; a satisfied action (verified
 * ABN, present connector) is replaced by the deterministic pick.
 */
export function reconcileLlmNextAction(proposed: { title: string; window: NextAction["window"]; expected_lift: number; evidence_to_add?: EvidenceSource }, input: NextActionInput): NextAction {
  const evidenced = evidencedSources(input.evidence);
  if (!proposed.title.trim() || isActionSatisfied(proposed.title, input.facts, evidenced)) return chooseNextAction(input);
  const fromCatalogue = proposed.evidence_to_add ? liftForSource(input.dim, proposed.evidence_to_add) : undefined;
  const expectedLift = typeof fromCatalogue === "number" ? fromCatalogue : clampLift(proposed.expected_lift);
  return { title: proposed.title, window: proposed.window, expectedLift, ...(proposed.evidence_to_add ? { evidenceToAdd: proposed.evidence_to_add } : {}) };
}
