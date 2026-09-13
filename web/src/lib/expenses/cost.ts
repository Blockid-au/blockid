// S28-C — credit maths for "Categorise N rows with AI". Client-safe (pure).
//
// Price: FEATURE_COSTS.expense_categorise (1 credit) per started block of
// ROWS_PER_CREDIT (100) AI-categorised rows, minimum 1 credit when there is
// anything to categorise, 0 when there is nothing. Growth+ / an active
// Startup Package pays nothing (server gate: lib/funding/growth-extras.ts).
// The UI shows the price BEFORE the model runs (preview → confirm).

export const ROWS_PER_CREDIT = 100;
export const EXPENSE_CATEGORISE_FEATURE = "expense_categorise";

/** Credit units (blocks of ROWS_PER_CREDIT) for `rows` rows: 0 → 0, 1..100 → 1, 101..200 → 2, … */
export function categoriseUnits(rows: number): number {
  if (!Number.isFinite(rows) || rows <= 0) return 0;
  return Math.max(1, Math.ceil(rows / ROWS_PER_CREDIT));
}

/** Credits charged for `rows` rows at `unitCost` per block; 0 when included. */
export function categoriseCost(rows: number, unitCost: number, included: boolean): number {
  if (included) return 0;
  const units = categoriseUnits(rows);
  return Math.round(units * unitCost * 100) / 100;
}

export function categoriseCostLabel(rows: number, cost: number, included: boolean): string {
  if (rows <= 0) return "Nothing to categorise";
  const n = `${rows} row${rows === 1 ? "" : "s"}`;
  if (included) return `Categorise ${n} with AI (included in your plan)`;
  return `Categorise ${n} with AI (cost: ${cost} credit${cost === 1 ? "" : "s"})`;
}
