/**
 * hide-when-locked — v3 nav visibility rule per Master Upgrade Plan §16.4.
 *
 * Rule:
 *   visible = role.hasScope(item.requiredScope)
 *          && (tier.covers(item.minTier) || item.hideWhenLocked === false)
 *          && flag.on(item.flag)
 *
 * When the tier check fails and `hideWhenLocked` is undefined or true, the
 * item is dropped from the sidebar tree entirely — no teaser row. When
 * `hideWhenLocked` is explicitly false (add-on rows like Share Management),
 * the caller keeps the item visible so a dimmed + Add-on pill can be
 * rendered.
 *
 * This helper is intentionally UI-agnostic — it takes the pre-checked
 * tier and scope booleans and returns a decision so nav renderers stay
 * pure. The persona rail (§16.2 layer B) filters BEFORE this helper
 * runs by matching `item.persona` to the active persona.
 *
 * Marketing exception (§16.4): the /pricing surface reads the full SKU
 * catalogue and always renders every tier — it MUST NOT call this
 * helper. The helper is for the workspace app sidebar only.
 */

export type LockedDecision = "show" | "show_dimmed" | "hide";

export interface HideWhenLockedInput {
  /** Result of `role.hasScope(item.requiredScope)`. */
  scopeOk: boolean;
  /** Result of `tier.covers(item.minTier)`. */
  tierOk: boolean;
  /** Result of `flag.on(item.flag)` — feature flag or entitlement gate. */
  flagOk: boolean;
  /** The item's `hideWhenLocked` field. Default `true` in v3. */
  hideWhenLocked?: boolean;
}

/**
 * Decide what to do with a locked or unlocked nav item under v3 rules.
 * Returns:
 *   "show"        — every gate passes; render normally.
 *   "show_dimmed" — tier is missing but the item opts out via
 *                   hideWhenLocked=false (add-on rows).
 *   "hide"        — anything else: scope fail, flag fail, or tier fail
 *                   with default hide-not-teaser behaviour.
 */
export function decideVisibility(input: HideWhenLockedInput): LockedDecision {
  if (!input.scopeOk) return "hide";
  if (!input.flagOk) return "hide";
  if (input.tierOk) return "show";
  return input.hideWhenLocked === false ? "show_dimmed" : "hide";
}

/**
 * Filter a nav-item list under v3 rules. The predicate the caller must
 * supply resolves the four gates (scope/tier/flag/hideWhenLocked) — this
 * helper's job is to apply the drop-vs-dim decision uniformly.
 *
 * Returned items are annotated with `_lockedDim: true` when the caller
 * should render them dimmed. Non-mutating: the original items are spread.
 */
export function filterHideWhenLocked<
  T extends { hideWhenLocked?: boolean },
>(
  items: readonly T[],
  gate: (item: T) => Omit<HideWhenLockedInput, "hideWhenLocked">,
): Array<T & { _lockedDim?: true }> {
  const out: Array<T & { _lockedDim?: true }> = [];
  for (const item of items) {
    const decision = decideVisibility({
      ...gate(item),
      hideWhenLocked: item.hideWhenLocked,
    });
    if (decision === "hide") continue;
    if (decision === "show_dimmed") {
      out.push({ ...item, _lockedDim: true });
      continue;
    }
    out.push(item);
  }
  return out;
}
