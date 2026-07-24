// Atlassian showcase walkthrough — ordered step list.
//
// The demo is a 9-step guided tour that walks a founder through the
// /showcase/atlassian/* route family. Each step maps to a mirror page
// that Round 2 will build (this module is just the step registry).
//
// Consumed by:
//   - web/src/components/showcase/demo-walkthrough-shell.tsx (client)
//   - web/src/components/showcase/atlassian-walkthrough-provider.tsx (server)
//   - each mirror page passes its own `stepNumber` into the provider.
//
// Design constraints:
//   - Kept as a pure TS constant so the shell + tests + provider all read
//     the same source of truth.
//   - Navigation helpers (getStepByNumber, getPrevStep, getNextStep,
//     buildStepUrl, keyToNavAction) are pure functions — the shell wraps
//     them in router.push() calls, but the logic itself stays testable
//     without a DOM.

export type WalkthroughStep = {
  /** 1-indexed step number. */
  n: number;
  /** Target pathname for this step (no query string). */
  path: string;
  /** Sticky-top-bar title. */
  title: string;
  /**
   * 1-2 sentence founder-mentor prompt shown below the top bar. Written in
   * a "why should I care about this screen" register — never lorem ipsum.
   */
  guideText: string;
  /**
   * Primary 12-phase key this step demonstrates. Stringified ordinal
   * matching PHASE_LABELS in web/src/lib/showcase/gallery.ts.
   */
  phaseSlug: string;
};

export const ATLASSIAN_WALKTHROUGH: WalkthroughStep[] = [
  {
    n: 1,
    path: "/showcase/atlassian",
    title: "Landing — the founder story",
    guideText:
      "Start here. The Atlassian story in one page: bootstrap Sydney to NASDAQ, two secondaries, zero founder dilution.",
    phaseSlug: "1",
  },
  {
    n: 2,
    path: "/showcase/atlassian/dashboard",
    title: "Living dashboard",
    guideText:
      "This is what BlockID.au would show your own startup: current phase, agent activity, milestone timeline — but populated by real Atlassian data.",
    phaseSlug: "7",
  },
  {
    n: 3,
    path: "/showcase/atlassian/svi-report",
    title: "SVI score — 13 criteria",
    guideText:
      "The BlockID SVI grades a startup across 13 criteria. Here's how Atlassian scores today, and where each score came from.",
    phaseSlug: "11",
  },
  {
    n: 4,
    path: "/showcase/atlassian/growth-phases",
    title: "12-phase growth map",
    guideText:
      "Every phase is a moment where a founder needs different advice. See what Atlassian actually did at each of the 12 phases, versus what most founders do wrong.",
    phaseSlug: "8",
  },
  {
    n: 5,
    path: "/showcase/atlassian/agents/ceo",
    title: "C-Level agent panel",
    guideText:
      "The BlockID agents (CEO, CFO, CTO, CMO, COO, CHRO, CLO) each write a briefing on Atlassian. Click through the tabs to see the phase-appropriate advice.",
    phaseSlug: "1",
  },
  {
    n: 6,
    path: "/showcase/atlassian/data-room",
    title: "Investor data-room mirror",
    guideText:
      "This is the structure of an investor data room, populated with Atlassian's own public disclosures where available and redacted stubs where they aren't.",
    phaseSlug: "9",
  },
  {
    n: 7,
    path: "/showcase/atlassian/valuation",
    title: "Valuation methods side-by-side",
    guideText:
      "DCF, Berkus, Scorecard, and Comparables at four points in Atlassian's history — so you can see which method fits which phase.",
    phaseSlug: "10",
  },
  {
    n: 8,
    path: "/showcase/atlassian/guide",
    title: "12-chapter mentor guide",
    guideText:
      "The lessons from Atlassian's journey, rewritten as a chapter-by-chapter mentor guide you can apply to your own startup this week.",
    phaseSlug: "6",
  },
  {
    n: 9,
    path: "/showcase/atlassian/summary",
    title: "Wrap-up — your turn",
    guideText:
      "The takeaways in one screen, plus a suggested next action tailored to whichever phase your own startup sits in.",
    phaseSlug: "12",
  },
];

export const ATLASSIAN_WALKTHROUGH_TOTAL = ATLASSIAN_WALKTHROUGH.length;

/** Path a viewer returns to when they hit Escape or the dismiss button. */
export const ATLASSIAN_WALKTHROUGH_EXIT_PATH = "/showcase/atlassian";

/**
 * Look up a step by its 1-indexed number. Returns `null` when the number is
 * out of range so callers can render a "step not found" fallback without
 * throwing.
 */
export function getStepByNumber(n: number): WalkthroughStep | null {
  return ATLASSIAN_WALKTHROUGH.find((s) => s.n === n) ?? null;
}

/** Previous step in the walkthrough, or `null` on the first step. */
export function getPrevStep(currentN: number): WalkthroughStep | null {
  if (currentN <= 1) return null;
  return getStepByNumber(currentN - 1);
}

/** Next step in the walkthrough, or `null` on the last step. */
export function getNextStep(currentN: number): WalkthroughStep | null {
  if (currentN >= ATLASSIAN_WALKTHROUGH_TOTAL) return null;
  return getStepByNumber(currentN + 1);
}

/**
 * Build the query-annotated URL for a step. Preserves the `?step=N` param
 * so a deep link continues to advance the walkthrough correctly.
 */
export function buildStepUrl(step: WalkthroughStep): string {
  return `${step.path}?step=${step.n}`;
}

/** Format the sticky-bar "Step N of TOTAL — Title" heading. */
export function formatStepHeading(step: WalkthroughStep, total = ATLASSIAN_WALKTHROUGH_TOTAL): string {
  return `Step ${step.n} of ${total} — ${step.title}`;
}

/**
 * Navigation intent for a keyboard event. Returns `null` when the key isn't
 * a walkthrough control — callers should let the browser handle those.
 */
export type WalkthroughKeyAction =
  | { kind: "prev"; target: WalkthroughStep }
  | { kind: "next"; target: WalkthroughStep }
  | { kind: "exit"; targetPath: string }
  | null;

/**
 * Pure key-to-action mapper. Extracted so the shell's keyboard handler is
 * unit-testable without JSDOM.
 */
export function keyToNavAction(key: string, currentN: number): WalkthroughKeyAction {
  if (key === "ArrowRight") {
    const next = getNextStep(currentN);
    if (!next) return null;
    return { kind: "next", target: next };
  }
  if (key === "ArrowLeft") {
    const prev = getPrevStep(currentN);
    if (!prev) return null;
    return { kind: "prev", target: prev };
  }
  if (key === "Escape") {
    return { kind: "exit", targetPath: ATLASSIAN_WALKTHROUGH_EXIT_PATH };
  }
  return null;
}
