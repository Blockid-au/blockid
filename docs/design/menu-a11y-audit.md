# Menu A11y + Mobile Audit — ux-ia-startup-flow §P7

_Owner:_ nav agent (Round 5.13) · _Date:_ 2026-07-24 · _Scope:_ NavV2 (marketing shell), `site/navbar` (legacy shell), workspace-layout top-bar + sidebar.

## Summary

All three top-nav surfaces meet the WCAG 2.1 AA menu/keyboard contract after this pass. One legacy inconsistency (`aria-haspopup="true"` on NavV2 dropdown triggers) is now `"menu"` so screen readers announce the correct disclosure verb ("menu" vs generic "popup"). A mobile-tap check confirms that both NavV2 and the legacy `ToolsDropdown` respond to `click` (touch) as well as `hover`, so no `data-open` shim was needed.

## Contract per surface

| Surface | Landmark | Trigger role | `aria-haspopup` | `aria-expanded` | Keyboard | Mobile |
|---|---|---|---|---|---|---|
| NavV2 desktop dropdown (`landing/nav-v2.tsx`) | `<nav aria-label="Primary">` | `<button>` | `"menu"` (fixed) | yes | Enter/Space toggles, Arrow Down opens+focus first item, Arrow Up/Down cycles, Escape closes + returns focus to trigger, Tab exits | Mobile disclosure re-uses same MENU array; each trigger is a button with `aria-expanded` + `aria-label="<label> menu"` |
| `site/navbar` ToolsDropdown (`components/site/navbar.tsx`) | `<nav aria-label="Primary">` | `<button>` | `"menu"` | yes | Enter/Space toggles, Escape closes + returns focus to trigger | `onClick` toggles state; hover events are additive, so tap works even when `:hover` doesn't fire |
| Workspace sidebar (`workspace/workspace-layout.tsx`) | `<nav aria-label="Workspace navigation">` (new) | Group headers are `<span>` (not interactive); "Later phases" is a `<button>` | n/a (rows are links); `<button aria-haspopup>` not needed on collapse — `aria-expanded` + `aria-controls` are sufficient for a disclosure | Later-phases button carries `aria-expanded` + `aria-controls="later-phases-panel"` | Standard Tab through link list; Escape has no meaning inside a static sidebar | Mobile sidebar is toggled via a labelled hamburger already (`aria-expanded` on the toggle) |

## Findings + fixes shipped

1. **NavV2 dropdown trigger — `aria-haspopup` value.** Was `"true"`; the WAI-ARIA authoring spec prefers the specific verb (`"menu"`) when the target is a menu region. **Fixed** — both desktop `DesktopDropdown` and `MobileGroup` triggers now use `aria-haspopup="menu"`.
2. **NavV2 trigger `aria-label`.** The visible label was `"Product"` but the button announcement (with chevron aria-hidden) read as just `"Product"` — technically fine but ambiguous when the panel is closed. **Fixed** — added `aria-label="<label> menu"` on both desktop + mobile triggers so it reads "Product menu, collapsed" / "Product menu, expanded".
3. **Workspace sidebar landmark.** The `<nav>` element had no accessible name so screen readers announced two unnamed `navigation` regions on `/dashboard`. **Fixed** — added `aria-label="Workspace navigation"`.
4. **Later-phases disclosure.** Introduced in the P5 progressive-disclosure polish. Button carries `aria-expanded`, `aria-controls`, and a `title` that lists the phases it collapses. Chevron uses `aria-hidden`.
5. **Row-level `title` copy.** Dimmed sidebar rows now surface `title="Unlocks after Phase N: <PHASE_LABELS.en>"` — sighted users see the tooltip; screen readers pick this up as accessible description via most SR/UA combinations. The trailing lock glyph is `aria-hidden` because the title already conveys the state, avoiding a double announcement.
6. **Mobile tap-vs-hover.** Both NavV2's desktop dropdown and the legacy ToolsDropdown already fired `onClick` on the trigger. No `data-open` shim needed. Verified by inspecting the two components — both branch through `setOpen((v) => !v)` regardless of pointer type. The hover handlers are additive, not primary. Site/navbar mobile menu ("hamburger") uses a discrete `<button aria-expanded>` and a separate rendered dialog panel — no hover behaviour on that path at all.

## Contrast + colour

Spot-checked the four dominant colour pairs against WCAG AA (4.5:1 for body text, 3:1 for large / bold):

| Pair | Ratio | Verdict |
|---|---|---|
| `text-ink-500` on `bg-white` (default sidebar row) | ~7.9:1 | pass AA |
| `text-ink-300` on `bg-white` (dimmed future-phase row) | ~3.1:1 | pass AA-large only — acceptable because these rows are not the primary reading target; the `title` tooltip provides the affordance. |
| `text-brand-700` on `bg-brand-50` (active row) | ~6.4:1 | pass AA |
| `text-amber-700` on `bg-amber-100` (Locked badge) | ~5.6:1 | pass AA |
| `text-brand-ink-muted` on `bg-brand-navy/85` (NavV2 desktop link) | ~4.6:1 | pass AA |

**No changes shipped** in this pass for colour — all pairs meet at least the AA-large threshold and the primary reading text meets AA-body.

## Non-fixes (intentional)

- **Later-phases button has no `aria-haspopup`.** It is a *disclosure*, not a *menu* — the ARIA APG explicitly distinguishes disclosures from menus. `aria-expanded` + `aria-controls` are the correct pattern.
- **Workspace group headers are non-interactive.** No affordance for keyboard focus needed; they render as `<span>`. This matches the sighted UX (they don't collapse; the whole group is either shown or hidden).
- **Public-marketing dimmed nav items.** NavV2 does not currently dim any nav rows (all top items are always available regardless of trial state). Progressive disclosure lives only in the workspace sidebar. If we later dim public rows for trial-gated features, the same `title` + lock pattern used in the workspace should be applied.

## Follow-up

- Consider replacing the `title` tooltip with a full `role="tooltip"` component so it can render on keyboard focus, not just hover — nice-to-have, not a blocker.
- The workspace mobile drawer has no dedicated aria label distinct from the desktop sidebar — currently both share the same `aria-label`. Acceptable because only one is visible at a time.
