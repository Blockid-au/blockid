// Colocated test for JourneyStepLadder — pins the G7 Q3 + Q4 decisions
// adopted in S19-A (docs/plans/ux-ia-startup-flow-goal.md open_questions):
//
//   Q3  all 12 phases on desktop; mobile collapses to current + next 2 with
//       a "Show all 12" toggle (aria-expanded, aria-controls, keyboard).
//   Q4  completed phases are check-mark links to their landing routes; a
//       "Skip to current phase" anchor (#phase-current) renders once the
//       current phase index is >= 3; the current step carries
//       id="phase-current" + aria-current="step" exactly once.
//
// Static render only — this workspace does not install
// @testing-library/react (see stage-banner.test.tsx). The toggle's click
// path is covered by rendering both initial states through
// `defaultMobileExpanded`, and the window rule through the pure helpers.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CURRENT_PHASE_ANCHOR_ID,
  JourneyStepLadder,
  MOBILE_WINDOW_AFTER,
  PHASE_ROUTES,
  SKIP_ANCHOR_MIN_INDEX,
  coarsePhaseToOrdinal,
  mobileVisiblePhases,
  showsSkipAnchor,
} from "./journey-step-ladder";
import { ALL_PHASE_KEYS, type PhaseKey } from "@/lib/journey-map";

function render(props: Partial<React.ComponentProps<typeof JourneyStepLadder>> & { currentPhase: number }) {
  return renderToStaticMarkup(<JourneyStepLadder {...props} />);
}

/** `<li data-phase="N" …>` opening tags, in DOM order. */
function phaseItems(html: string): string[] {
  return [...html.matchAll(/<li [^>]*data-phase="\d+"[^>]*>/g)].map((m) => m[0]);
}

function collapsedItems(html: string): string[] {
  return phaseItems(html).filter((li) => li.includes('data-mobile-collapsed="true"'));
}

function toggle(html: string): string {
  const m = html.match(/<button [^>]*data-testid="journey-show-all-toggle"[^>]*>/);
  if (!m) throw new Error("toggle missing");
  return m[0];
}

describe("JourneyStepLadder — G7 Q3 (desktop 12 / mobile current + next 2)", () => {
  it("renders all 12 phase nodes for every current phase, desktop and mobile", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const html = render({ currentPhase: phase });
      expect(phaseItems(html), `phase ${phase}`).toHaveLength(12);
      for (const key of ALL_PHASE_KEYS) {
        // Desktop PhaseNode + MobileNode both carry the same test id.
        const count = html.split(`data-testid="journey-step-node-${key}"`).length - 1;
        expect(count, `node ${key} at phase ${phase}`).toBe(2);
      }
    }
  });

  it("desktop rail never hides completed check-marks — collapse only applies below sm", () => {
    const html = render({ currentPhase: 8 });
    for (const li of collapsedItems(html)) {
      // Hidden on phones only; from sm upward it is flex again.
      expect(li).toContain('class="hidden sm:flex');
      expect(li).not.toMatch(/class="hidden "/);
    }
    // No node is removed from the DOM.
    expect(phaseItems(html)).toHaveLength(12);
  });

  it("mobileVisiblePhases = current + next 2, clamped at 12", () => {
    expect(MOBILE_WINDOW_AFTER).toBe(2);
    expect(mobileVisiblePhases(1)).toEqual([1, 2, 3]);
    expect(mobileVisiblePhases(5)).toEqual([5, 6, 7]);
    expect(mobileVisiblePhases(11)).toEqual([11, 12]);
    expect(mobileVisiblePhases(12)).toEqual([12]);
  });

  it("collapsed by default: 9 of 12 rows hidden below sm, current + next 2 visible", () => {
    const html = render({ currentPhase: 5 });
    const hidden = collapsedItems(html);
    expect(hidden).toHaveLength(12 - 3);
    const visible = phaseItems(html).filter((li) => !li.includes("data-mobile-collapsed"));
    expect(visible.map((li) => li.match(/data-phase="(\d+)"/)![1])).toEqual(["5", "6", "7"]);
    expect(html).toContain('data-mobile-expanded="false"');
  });

  it("toggle: <button> with aria-expanded + aria-controls, 'Show all 12 phases' when collapsed", () => {
    const html = render({ currentPhase: 5 });
    const btn = toggle(html);
    expect(btn).toContain('type="button"');
    expect(btn).toContain('aria-expanded="false"');
    expect(btn).toContain('aria-controls="journey-step-ladder-list"');
    expect(btn).toContain("sm:hidden"); // mobile-only control
    expect(btn).toContain("min-h-11"); // 44px touch target
    expect(html).toContain("Show all 12 phases");
    expect(html).toContain("4 completed");
    expect(html).toContain('id="journey-step-ladder-list"');
  });

  it("expanded state: aria-expanded=true, no rows collapsed, 'Show fewer phases'", () => {
    const html = render({ currentPhase: 5, defaultMobileExpanded: true });
    expect(toggle(html)).toContain('aria-expanded="true"');
    expect(collapsedItems(html)).toHaveLength(0);
    expect(html).toContain('data-mobile-expanded="true"');
    expect(html).toContain("Show fewer phases");
    expect(html).not.toContain("Show all 12 phases");
  });

  it("is prefers-reduced-motion safe (pulse + transitions opt out)", () => {
    const html = render({ currentPhase: 3 });
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).toContain("motion-reduce:transition-none");
  });
});

describe("JourneyStepLadder — G7 Q4 (returning founder)", () => {
  it("current step carries id=phase-current and aria-current=step exactly once", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const html = render({ currentPhase: phase });
      const current = phaseItems(html).filter((li) => li.includes('aria-current="step"'));
      expect(current, `phase ${phase}`).toHaveLength(1);
      expect(current[0]).toContain(`id="${CURRENT_PHASE_ANCHOR_ID}"`);
      expect(current[0]).toContain(`data-phase="${phase}"`);
      expect(html.split(`id="${CURRENT_PHASE_ANCHOR_ID}"`).length - 1).toBe(1);
    }
  });

  it("showsSkipAnchor: index >= 3 (ordinal >= 4)", () => {
    expect(SKIP_ANCHOR_MIN_INDEX).toBe(3);
    expect(showsSkipAnchor(1)).toBe(false);
    expect(showsSkipAnchor(3)).toBe(false);
    expect(showsSkipAnchor(4)).toBe(true);
    expect(showsSkipAnchor(12)).toBe(true);
  });

  it("renders the skip anchor (href=#phase-current) only when index >= 3", () => {
    for (const phase of ALL_PHASE_KEYS) {
      const html = render({ currentPhase: phase });
      const has = html.includes('data-testid="journey-skip-to-current"');
      expect(has, `phase ${phase}`).toBe(phase - 1 >= SKIP_ANCHOR_MIN_INDEX);
      if (has) {
        const a = html.match(/<a [^>]*data-testid="journey-skip-to-current"[^>]*>/)![0];
        expect(a).toContain(`href="#${CURRENT_PHASE_ANCHOR_ID}"`);
        // Visible on mobile, sr-only until focused from sm upward.
        expect(a).toContain("sm:sr-only");
        expect(a).toContain("sm:focus:not-sr-only");
        expect(a).toContain("focus-visible:ring-2");
        // Anchor sits before the list so it is the first tab stop in the ladder.
        expect(html.indexOf("journey-skip-to-current")).toBeLessThan(html.indexOf("journey-step-ladder-list"));
        expect(html).toContain(`Skip to current phase (Phase ${phase}:`);
      }
    }
  });

  it("completed phases render as check-mark links to their landing routes; future phases are not links", () => {
    const html = render({ currentPhase: 6 });
    // Every `<a …>` opening tag that carries a journey-step-node test id,
    // keyed by ordinal. Attribute order differs between the desktop and
    // mobile nodes, so match on the tag as a whole.
    const anchors = [...html.matchAll(/<a [^>]*data-testid="journey-step-node-(\d+)"[^>]*>/g)];
    const linkedOrdinals = new Map<number, string[]>();
    for (const m of anchors) {
      const key = Number(m[1]);
      linkedOrdinals.set(key, [...(linkedOrdinals.get(key) ?? []), m[0]]);
    }
    for (const key of ALL_PHASE_KEYS) {
      const href = PHASE_ROUTES[key as PhaseKey];
      const tags = linkedOrdinals.get(key) ?? [];
      if (key <= 6) {
        // Completed (1–5) and current (6): desktop + mobile node both link.
        expect(tags, `phase ${key} should link to ${href}`).toHaveLength(2);
        for (const tag of tags) expect(tag).toContain(`href="${href}"`);
      } else {
        expect(tags, `phase ${key} must not be a link`).toHaveLength(0);
      }
    }
    // Completed phases announce "(completed)" and show the check glyph;
    // the current phase is labelled by name.
    expect(html.split("(completed)").length - 1).toBe(5);
    expect(html).toContain("Phase 6: Revenue / Business Model (current)");
  });

  it("coarse dashboard phase maps to a stable ordinal", () => {
    expect([0, 1, 2, 3, 4, 5].map(coarsePhaseToOrdinal)).toEqual([1, 3, 5, 9, 7, 11]);
    expect(coarsePhaseToOrdinal(-4)).toBe(1);
    expect(coarsePhaseToOrdinal(99)).toBe(11);
    const html = render({ currentPhase: 3, mode: "coarse" });
    expect(html).toContain('data-current-phase="9"');
    // A coarse phase-3 founder (ordinal 9) is a returning founder → skip anchor.
    expect(html).toContain('data-testid="journey-skip-to-current"');
  });
});
