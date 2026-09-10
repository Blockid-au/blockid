// G8-P8 — phase × tier sidebar visibility matrix + unlock criteria, derived
// from code so the founder docs cannot drift from what the sidebar does.
//
// Sources (all read live, nothing is hand-copied here):
//   • components/workspace/nav-groups.ts   — NAV_GROUPS catalogue + gates
//   • lib/nav/hide-when-locked.ts          — decideVisibility() (D2 hybrid)
//   • lib/nav/role-menu-overlay.ts         — per-segment hidden groups
//   • lib/segments.ts                      — plan → tier rank, meetsMinPlan()
//   • lib/growth/phase-gate.ts             — PHASE_EXIT_RULES
//   • lib/growth/phase-taxonomy.ts         — 12 growth phases + labels
//   • lib/evaluation-criteria.ts           — criterion titles (EN + VI)
//   • config/pricing/plans.generated.ts    — plan ids, segments, features
//
// The visibility pipeline mirrors `decideGroupVisibility()`, `resolveGroup()`
// and the near/later split in components/workspace/workspace-layout.tsx —
// those helpers are module-private to a "use client" file, so the rule
// order is re-stated here in the same sequence and pinned by
// unlock-matrix.test.ts. If workspace-layout.tsx changes its rules, update
// this file in the same commit.
//
// Consumers:
//   • scripts/docs/render-unlock-matrix.mjs → docs/user/menu-walkthrough.md
//     tables + web/content/generated/unlock-matrix.json
//   • app/docs/unlocks/page.tsx renders the JSON (founder-facing page)
//
// Pure module: no I/O.

import { NAV_GROUPS, type NavGroup, type NavItem } from "@/components/workspace/nav-groups";
import { decideVisibility, type LockedDecision } from "@/lib/nav/hide-when-locked";
import { getMenuOverlayForRole } from "@/lib/nav/role-menu-overlay";
import type { WorkflowStep } from "@/lib/nav/workflow-steps";
import { GROWTH_PHASE_TO_WORKFLOW_STEP, navPhaseFromGrowthPhase } from "@/lib/nav/founder-phase";
import { meetsMinPlan, planIdToTier, type PlanTier, type Segment } from "@/lib/segments";
import { PHASE_EXIT_RULES, REQUIRED_QUALITY, type SviDimension } from "@/lib/growth/phase-gate";
import {
  GROWTH_PHASE_IDS,
  GROWTH_PHASE_LABELS,
  GROWTH_PHASE_ORDER,
  nextGrowthPhase,
  type GrowthPhaseId,
} from "@/lib/growth/phase-taxonomy";
import { CRITERIA, type CriterionKey } from "@/lib/evaluation-criteria";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";

// ─── Columns ─────────────────────────────────────────────────────────────────

/** Plan ids that head the matrix columns, in display order. */
export const COLUMN_PLAN_IDS = [
  "founder_free",
  "founder_starter",
  "founder_growth",
  "founder_package",
  "investor_angel",
  "investor_advisor",
  "investor_vc_small",
] as const;

export type ColumnPlanId = (typeof COLUMN_PLAN_IDS)[number];

/** Short column headings — the founder-facing names, not SKU ids. */
const COLUMN_LABEL: Record<ColumnPlanId, string> = {
  founder_free: "Free",
  founder_starter: "Starter",
  founder_growth: "Growth",
  founder_package: "Package",
  investor_angel: "Evaluator Scout",
  investor_advisor: "Evaluator Firm",
  investor_vc_small: "Evaluator Program",
};

export interface MatrixColumn {
  id: ColumnPlanId;
  label: string;
  /** Marketing name from plans.csv (e.g. "Startup Package"). */
  planName: string;
  /** PlanTier the sidebar compares against `minPlan` (via planIdToTier). */
  tier: PlanTier;
  segment: Segment;
  /** Feature flags the plan grants — what `useEntitlement().can()` sees. */
  features: string[];
  /** Every dimmed row this plan sees once all phase groups are open. */
  lockedRows: LockedRow[];
}

export function buildColumns(): MatrixColumn[] {
  return COLUMN_PLAN_IDS.map((id) => {
    const plan = GENERATED_PLANS_BY_ID[id];
    if (!plan) throw new Error(`unlock-matrix: plan "${id}" missing from plans.generated.ts`);
    return {
      id,
      label: COLUMN_LABEL[id],
      planName: plan.name,
      tier: planIdToTier(id),
      segment: plan.segment as Segment,
      features: [...plan.feature_flags],
      lockedRows: [],
    };
  });
}

// ─── 12 growth phases → sidebar phase (0..5) ─────────────────────────────────

/**
 * The sidebar gates groups on a coarse 0..5 `currentPhase` (the workflow-step
 * index in lib/nav/workflow-steps.ts), not on the 12 growth phases directly.
 * Since S7-A the bridge is real code, not a docs-only table: the founder
 * route-group layout resolves `max(navPhaseFromSvi, navPhaseFromGrowthPhase)`
 * (`lib/nav/founder-phase.ts`) and the sidebar gates on that. This matrix
 * reads the same `GROWTH_PHASE_TO_WORKFLOW_STEP` table, so Table 1 is
 * derived from what the sidebar really does for a founder whose SVI band
 * does not out-rank their declared growth phase. unlock-matrix.test.ts still
 * pins the table against `currentPhaseToStep()` for 6..12.
 */
export { GROWTH_PHASE_TO_WORKFLOW_STEP };

export function sidebarPhaseFor(id: GrowthPhaseId): number {
  return navPhaseFromGrowthPhase(id);
}

// ─── Visibility pipeline (mirrors workspace-layout.tsx) ──────────────────────

export type GroupState = "visible" | "hidden_phase" | "hidden_segment" | "later_preview" | "empty";

export interface GroupCell {
  /** NavGroup.id (home, validate, build, fundraise, scale-exit, roles, account). */
  id: string;
  label: string;
  state: GroupState;
  /** Rows the viewer sees inside the group (after segment + feature filters). */
  visibleItems: number;
  /** Of those, rows rendered dimmed with a lock / Upgrade chip (plan too low). */
  upgradeItems: number;
  /** Of those, rows rendered dimmed with an "Add-on" pill (purchasable feature). */
  addOnItems: number;
}

/** A dimmed row and why — listed once per column (it does not vary by phase). */
export interface LockedRow {
  group: string;
  label: string;
  /** "upgrade" = plan below `minPlan`; "add-on" = purchasable feature missing. */
  reason: "upgrade" | "add-on";
  /** Minimum plan tier for the row (upgrade rows). */
  minPlan?: PlanTier;
}

interface ViewerContext {
  planId: string;
  segment: Segment;
  currentPhase: number;
  features: ReadonlySet<string>;
}

/** `decideGroupVisibility()` in workspace-layout.tsx, rule for rule. */
const CORE_GROUP_IDS = new Set(["home", "validate", "account"]);

function decideGroupVisibility(group: NavGroup, ctx: ViewerContext): LockedDecision {
  if (group.id && CORE_GROUP_IDS.has(group.id)) return "show";
  if (group.segments && group.segments.length > 0) {
    if (!group.segments.includes(ctx.segment)) return "hide";
  }
  if (group.minPhase != null && group.minPhase > ctx.currentPhase) return "hide";
  const minTier = group.minTier ?? group.minPlan;
  if (minTier) {
    const tierOk = meetsMinPlan(ctx.planId, minTier);
    return decideVisibility({ scopeOk: true, tierOk, flagOk: true, hideWhenLocked: true });
  }
  return "show";
}

/** `resolveGroup()` in workspace-layout.tsx — item-level filter + lock flag. */
function resolveGroup(group: NavGroup, ctx: ViewerContext): Array<{ item: NavItem; locked: boolean; addOn: boolean }> {
  if (group.segments && group.segments.length > 0) {
    if (!group.segments.includes(ctx.segment)) return [];
  }
  const out: Array<{ item: NavItem; locked: boolean; addOn: boolean }> = [];
  for (const item of group.items) {
    if (item.segments && item.segments.length > 0 && !item.segments.includes(ctx.segment)) continue;
    if (item.feature && !ctx.features.has(item.feature)) continue;
    const meetsPlan = item.minPlan ? meetsMinPlan(ctx.planId, item.minPlan) : true;
    const missingAddOn = Boolean(item.lockedWithoutFeature && !ctx.features.has(item.lockedWithoutFeature));
    const locked = !meetsPlan || missingAddOn;
    out.push({ item, locked, addOn: locked && Boolean(item.addOnKey) });
  }
  return out;
}

/**
 * One sidebar render for a (plan, segment, currentPhase) triple — every
 * catalogue group in overlay order with its resolved state.
 */
export function lockedRowsFor(ctx: Omit<ViewerContext, "currentPhase">): LockedRow[] {
  const overlay = getMenuOverlayForRole({ role: null, segment: ctx.segment, accountType: null });
  const hidden = new Set(overlay.hiddenGroups);
  const out: LockedRow[] = [];
  for (const group of NAV_GROUPS) {
    if (hidden.has(group.label)) continue;
    for (const r of resolveGroup(group, { ...ctx, currentPhase: 5 })) {
      if (!r.locked) continue;
      out.push({
        group: group.label,
        label: r.item.label,
        reason: r.addOn ? "add-on" : "upgrade",
        ...(r.item.minPlan && !meetsMinPlan(ctx.planId, r.item.minPlan) ? { minPlan: r.item.minPlan } : {}),
      });
    }
  }
  return out;
}

export function renderSidebar(ctx: ViewerContext): GroupCell[] {
  const overlay = getMenuOverlayForRole({ role: null, segment: ctx.segment, accountType: null });
  const hidden = new Set(overlay.hiddenGroups);
  const rank = new Map<string, number>();
  overlay.sidebarOrder.forEach((label, i) => rank.set(label, i));
  const laterThreshold = ctx.currentPhase + 3;

  const cells: GroupCell[] = [];
  for (const group of NAV_GROUPS) {
    const base: GroupCell = {
      id: group.id ?? group.label,
      label: group.label,
      state: "visible",
      visibleItems: 0,
      upgradeItems: 0,
      addOnItems: 0,
    };
    if (hidden.has(group.label)) {
      cells.push({ ...base, state: "hidden_segment" });
      continue;
    }
    const isLater = group.minPhase != null && group.minPhase > laterThreshold;
    if (!isLater) {
      const vis = decideGroupVisibility(group, ctx);
      if (vis === "hide") {
        const bySegment = group.segments && group.segments.length > 0 && !group.segments.includes(ctx.segment);
        cells.push({ ...base, state: bySegment ? "hidden_segment" : "hidden_phase" });
        continue;
      }
    }
    const resolved = resolveGroup(group, ctx);
    if (resolved.length === 0) {
      cells.push({ ...base, state: "empty" });
      continue;
    }
    cells.push({
      ...base,
      state: isLater ? "later_preview" : "visible",
      visibleItems: resolved.length,
      upgradeItems: resolved.filter((r) => r.locked && !r.addOn).length,
      addOnItems: resolved.filter((r) => r.addOn).length,
    });
  }
  // Overlay ordering (groups without a rank keep catalogue order at the end).
  return cells.sort((a, b) => {
    const ra = rank.has(a.label) ? rank.get(a.label)! : Number.POSITIVE_INFINITY;
    const rb = rank.has(b.label) ? rank.get(b.label)! : Number.POSITIVE_INFINITY;
    return ra - rb;
  });
}

// ─── Matrix ──────────────────────────────────────────────────────────────────

export interface MatrixPhaseRow {
  id: GrowthPhaseId;
  order: number;
  labelEn: string;
  labelVi: string;
  workflowStep: WorkflowStep;
  /** Index into `UnlockMatrix.steps` — phases in the same step render identically. */
  sidebarPhase: number;
}

/** column id → cells (every catalogue group, in sidebar order). */
export type StepCells = Record<ColumnPlanId, GroupCell[]>;

export interface UnlockRule {
  id: GrowthPhaseId;
  order: number;
  labelEn: string;
  labelVi: string;
  requiredQuality: string;
  requiredCriteria: Array<{ key: CriterionKey; title: string; titleVi: string }>;
  dimensionFloors: Array<{ dimension: SviDimension; label: string; floor: number }>;
  nextPhase: GrowthPhaseId | null;
  nextPhaseLabelEn: string | null;
  /** Sidebar groups that appear for the first time when the next phase starts. */
  groupsUnlockedOnExit: string[];
}

export interface UnlockMatrix {
  generatedBy: string;
  sources: string[];
  columns: MatrixColumn[];
  phases: MatrixPhaseRow[];
  /** Sidebar render per workflow step (0..5) — keyed by sidebarPhase, then column. */
  steps: Record<string, StepCells>;
  rules: UnlockRule[];
}

/** Display names for the SVI dimensions (svi-analysis.ts subs[].label). */
export const DIMENSION_LABEL: Record<SviDimension, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Technical",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
};

const CRITERION_BY_KEY = new Map(CRITERIA.map((c) => [c.key, c] as const));

function visibleGroupLabels(cells: GroupCell[]): string[] {
  return cells.filter((c) => c.state === "visible").map((c) => c.label);
}

export function buildUnlockMatrix(): UnlockMatrix {
  const columns = buildColumns().map((col) => ({
    ...col,
    lockedRows: lockedRowsFor({ planId: col.id, segment: col.segment, features: new Set(col.features) }),
  }));

  // Step 0 is the pre-SVI state (no phase yet); 1..5 are the workflow steps
  // the 12 growth phases bucket into.
  const steps: Record<string, StepCells> = {};
  for (let sidebarPhase = 0; sidebarPhase <= 5; sidebarPhase++) {
    const cells = {} as StepCells;
    for (const col of columns) {
      cells[col.id] = renderSidebar({
        planId: col.id,
        segment: col.segment,
        currentPhase: sidebarPhase,
        features: new Set(col.features),
      });
    }
    steps[String(sidebarPhase)] = cells;
  }

  const phases: MatrixPhaseRow[] = GROWTH_PHASE_IDS.map((id) => ({
    id,
    order: GROWTH_PHASE_ORDER[id],
    labelEn: GROWTH_PHASE_LABELS[id].en,
    labelVi: GROWTH_PHASE_LABELS[id].vi,
    workflowStep: GROWTH_PHASE_TO_WORKFLOW_STEP[id],
    sidebarPhase: sidebarPhaseFor(id),
  }));

  const founderCol = columns[0];
  const rules: UnlockRule[] = GROWTH_PHASE_IDS.map((id) => {
    const rule = PHASE_EXIT_RULES[id];
    const next = nextGrowthPhase(id);
    const nowVisible = visibleGroupLabels(
      renderSidebar({ planId: founderCol.id, segment: founderCol.segment, currentPhase: sidebarPhaseFor(id), features: new Set(founderCol.features) }),
    );
    const nextVisible = next
      ? visibleGroupLabels(
          renderSidebar({ planId: founderCol.id, segment: founderCol.segment, currentPhase: sidebarPhaseFor(next), features: new Set(founderCol.features) }),
        )
      : nowVisible;
    return {
      id,
      order: GROWTH_PHASE_ORDER[id],
      labelEn: GROWTH_PHASE_LABELS[id].en,
      labelVi: GROWTH_PHASE_LABELS[id].vi,
      requiredQuality: REQUIRED_QUALITY,
      requiredCriteria: rule.requiredCriteria.map((key) => {
        const def = CRITERION_BY_KEY.get(key);
        return { key, title: def?.title ?? key, titleVi: def?.titleVi ?? key };
      }),
      dimensionFloors: (Object.entries(rule.dimensionFloors) as Array<[SviDimension, number]>).map(
        ([dimension, floor]) => ({ dimension, label: DIMENSION_LABEL[dimension], floor }),
      ),
      nextPhase: next,
      nextPhaseLabelEn: next ? GROWTH_PHASE_LABELS[next].en : null,
      groupsUnlockedOnExit: nextVisible.filter((g) => !nowVisible.includes(g)),
    };
  });

  return {
    generatedBy: "web/scripts/docs/render-unlock-matrix.mjs",
    sources: [
      "web/src/components/workspace/nav-groups.ts",
      "web/src/components/workspace/workspace-layout.tsx",
      "web/src/lib/nav/hide-when-locked.ts",
      "web/src/lib/nav/role-menu-overlay.ts",
      "web/src/lib/nav/workflow-steps.ts",
      "web/src/lib/segments.ts",
      "web/src/lib/growth/phase-gate.ts",
      "web/src/lib/growth/phase-taxonomy.ts",
      "web/src/lib/evaluation-criteria.ts",
      "web/src/config/pricing/plans.generated.ts",
    ],
    columns,
    phases,
    steps,
    rules,
  };
}

// ─── Markdown rendering ──────────────────────────────────────────────────────

/** One compact token per rendered group, e.g. `Validate (8 upgrade)`. */
export function cellToken(cell: GroupCell): string | null {
  switch (cell.state) {
    case "hidden_phase":
    case "hidden_segment":
    case "empty":
      return null;
    case "later_preview":
      return `Later phases: ${cell.label}`;
    case "visible": {
      const notes: string[] = [];
      if (cell.upgradeItems > 0) notes.push(`${cell.upgradeItems} upgrade`);
      if (cell.addOnItems > 0) notes.push(`${cell.addOnItems} add-on`);
      return notes.length > 0 ? `${cell.label} (${notes.join(", ")})` : cell.label;
    }
  }
}

export function cellText(cells: GroupCell[]): string {
  const tokens = cells.map(cellToken).filter((t): t is string => t !== null);
  return tokens.length > 0 ? tokens.join(" · ") : "—";
}

export const MATRIX_BEGIN = "<!-- BEGIN GENERATED: unlock-matrix (node web/scripts/docs/render-unlock-matrix.mjs) -->";
export const MATRIX_END = "<!-- END GENERATED: unlock-matrix -->";
export const RULES_BEGIN = "<!-- BEGIN GENERATED: unlock-rules (node web/scripts/docs/render-unlock-matrix.mjs) -->";
export const RULES_END = "<!-- END GENERATED: unlock-rules -->";

export function renderMatrixMarkdown(m: UnlockMatrix): string {
  const head = ["#", "Phase", ...m.columns.map((c) => c.label)];
  const lines: string[] = [];
  lines.push(`| ${head.join(" | ")} |`);
  lines.push(`|${head.map(() => "---").join("|")}|`);
  for (const p of m.phases) {
    const row = [
      String(p.order),
      `\`${p.id}\` — ${p.labelEn}`,
      ...m.columns.map((c) => cellText(m.steps[String(p.sidebarPhase)][c.id])),
    ];
    lines.push(`| ${row.join(" | ")} |`);
  }
  lines.push("");
  lines.push("Column key: " + m.columns.map((c) => `**${c.label}** = ${c.planName} (${c.segment}, tier \`${c.tier}\`)`).join(" · "));
  return lines.join("\n");
}

export function renderRulesMarkdown(m: UnlockMatrix): string {
  const lines: string[] = [];
  lines.push("| # | Phase | Required evidence (≥ " + m.rules[0].requiredQuality + ") | SVI dimension floor | Sidebar groups that appear when you move on |");
  lines.push("|---|---|---|---|---|");
  for (const r of m.rules) {
    const criteria = r.requiredCriteria.length === CRITERIA.length
      ? `all ${CRITERIA.length} criteria`
      : r.requiredCriteria.map((c) => `${c.title} (\`${c.key}\`)`).join(", ");
    const floors = r.dimensionFloors.length > 0
      ? r.dimensionFloors.map((f) => `${f.label} (${f.dimension.toUpperCase()}) ≥ ${f.floor}`).join(", ")
      : "—";
    const unlocks = r.nextPhase === null
      ? "Final phase — everything is already open"
      : r.groupsUnlockedOnExit.length > 0
        ? `${r.groupsUnlockedOnExit.join(", ")} (from \`${r.nextPhase}\`)`
        : `nothing new — same groups as \`${r.nextPhase}\``;
    lines.push(`| ${r.order} | \`${r.id}\` — ${r.labelEn} | ${criteria} | ${floors} | ${unlocks} |`);
  }
  return lines.join("\n");
}

/** Replace the text between BEGIN/END markers; throws when markers are missing. */
export function spliceGenerated(doc: string, begin: string, end: string, body: string): string {
  const b = doc.indexOf(begin);
  const e = doc.indexOf(end);
  if (b === -1 || e === -1 || e < b) {
    throw new Error(`unlock-matrix: markers not found — expected "${begin}" … "${end}"`);
  }
  return doc.slice(0, b + begin.length) + "\n" + body + "\n" + doc.slice(e);
}

/** Apply both generated sections to a markdown document. */
export function applyToDoc(doc: string, m: UnlockMatrix): string {
  let out = spliceGenerated(doc, MATRIX_BEGIN, MATRIX_END, renderMatrixMarkdown(m));
  out = spliceGenerated(out, RULES_BEGIN, RULES_END, renderRulesMarkdown(m));
  return out;
}
