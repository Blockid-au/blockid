// Colocated vitest for the pure `web/src/lib/svi-actions.ts` — the SVI
// dimension → action + evidence-gap → action + next-action-title → action
// resolver consumed by the SVI report render + the dashboard next-best-action
// card. Previously untested. Pins:
//
//   • DIMENSION_ACTIONS covers every canonical 8-dim SVI key
//     (ftv/mpc/ptd/tre/cgh/iri/lco/svm) — a silent drop or rename surfaces
//     the shipped registry contract that the SVI report keys off.
//   • EVIDENCE_GAP_ACTIONS covers every declared gap key with a well-typed
//     SVIAction (label + type).
//   • getActionForGap ladder is order-preserving — the first matching branch
//     wins, so a caller passing "GitHub source code" cannot accidentally
//     route through the generic "source code" upload fallback while the
//     specific `source_code` mapping exists.
//   • getActionForNextAction walks NEXT_ACTION_MAPPING in declaration order
//     and returns the first matching mapping (case-insensitive).

import { describe, expect, it } from "vitest";
import {
  DIMENSION_ACTIONS,
  EVIDENCE_GAP_ACTIONS,
  getActionsForDimension,
  getActionForGap,
  getActionForNextAction,
  type SVIAction,
} from "./svi-actions";

const CANONICAL_DIMS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;

const CANONICAL_GAP_KEYS = [
  "pitch_deck",
  "financial_model",
  "cap_table",
  "shareholders_agreement",
  "revenue_proof",
  "customer_data",
  "product_demo",
  "source_code",
  "abn_registration",
  "ip_protection",
] as const;

const VALID_TYPES: SVIAction["type"][] = ["tool", "upload", "guide", "external"];

describe("DIMENSION_ACTIONS registry", () => {
  it("covers exactly the 8 canonical SVI dimension keys", () => {
    expect(Object.keys(DIMENSION_ACTIONS).sort()).toEqual([...CANONICAL_DIMS].sort());
  });

  it.each(CANONICAL_DIMS)("%s has at least one action", (dim) => {
    expect(DIMENSION_ACTIONS[dim].length).toBeGreaterThan(0);
  });

  it("every action has a non-empty label and a valid type", () => {
    for (const dim of CANONICAL_DIMS) {
      for (const action of DIMENSION_ACTIONS[dim]) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(VALID_TYPES).toContain(action.type);
      }
    }
  });

  it("every non-upload action carries an href", () => {
    for (const dim of CANONICAL_DIMS) {
      for (const action of DIMENSION_ACTIONS[dim]) {
        if (action.type === "upload") {
          expect(action.href).toBeUndefined();
        } else {
          expect(action.href).toBeDefined();
          expect(action.href!.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every external action uses a fully-qualified http(s) URL", () => {
    for (const dim of CANONICAL_DIMS) {
      for (const action of DIMENSION_ACTIONS[dim]) {
        if (action.type === "external" || action.type === "guide") {
          expect(action.href).toMatch(/^https?:\/\//);
        }
      }
    }
  });

  it("every tool action uses a root-relative href", () => {
    for (const dim of CANONICAL_DIMS) {
      for (const action of DIMENSION_ACTIONS[dim]) {
        if (action.type === "tool") {
          expect(action.href).toMatch(/^\//);
        }
      }
    }
  });

  it("ftv anchors on the co-founder + team-profile tools", () => {
    const hrefs = DIMENSION_ACTIONS.ftv.map((a) => a.href);
    expect(hrefs).toContain("/tools/cofounder-match");
    expect(hrefs).toContain("/workspace/profile");
  });

  it("mpc anchors on the SBA market-research guide", () => {
    const guide = DIMENSION_ACTIONS.mpc.find((a) => a.type === "guide");
    expect(guide?.href).toContain("sba.gov");
  });

  it("lco anchors on both the ABN + ASIC registration surfaces", () => {
    const hrefs = DIMENSION_ACTIONS.lco.map((a) => a.href);
    expect(hrefs).toContain("https://www.abr.gov.au/business-super-funds-702/applying-abn");
    expect(hrefs).toContain("https://asic.gov.au/for-business/registering-a-company/");
  });

  it("iri exposes the Investor-Ready Score + data room + term sheet + funding plan tools", () => {
    const hrefs = DIMENSION_ACTIONS.iri.map((a) => a.href);
    expect(hrefs).toContain("/score");
    expect(hrefs).toContain("/tools/data-room");
    expect(hrefs).toContain("/tools/term-sheet");
    expect(hrefs).toContain("/tools/funding-plan");
  });

  it("cgh exposes the cap-table + equity-split tools plus the SHA upload", () => {
    const cgh = DIMENSION_ACTIONS.cgh;
    expect(cgh.some((a) => a.href === "/tools/cap-table")).toBe(true);
    expect(cgh.some((a) => a.href === "/tools/equity-split")).toBe(true);
    expect(cgh.some((a) => a.type === "upload" && a.label === "Upload SHA")).toBe(true);
  });

  it("tre exposes Stripe + Analytics + revenue-proof upload actions", () => {
    const labels = DIMENSION_ACTIONS.tre.map((a) => a.label);
    expect(labels).toContain("Connect Stripe");
    expect(labels).toContain("Connect Google Analytics");
    expect(labels).toContain("Upload revenue proof");
    for (const a of DIMENSION_ACTIONS.tre) expect(a.type).toBe("upload");
  });

  it("ptd exposes product-demo + GitHub upload actions", () => {
    const labels = DIMENSION_ACTIONS.ptd.map((a) => a.label);
    expect(labels).toContain("Upload product demo");
    expect(labels).toContain("Connect GitHub");
    for (const a of DIMENSION_ACTIONS.ptd) expect(a.type).toBe("upload");
  });

  it("svm exposes the idea-valuation + dilution tools", () => {
    const hrefs = DIMENSION_ACTIONS.svm.map((a) => a.href);
    expect(hrefs).toContain("/tools/idea-valuation");
    expect(hrefs).toContain("/tools/dilution");
  });
});

describe("getActionsForDimension", () => {
  it.each(CANONICAL_DIMS)("returns the shipped list for %s", (dim) => {
    expect(getActionsForDimension(dim)).toEqual(DIMENSION_ACTIONS[dim]);
  });

  it("returns [] for an unknown dimension key", () => {
    expect(getActionsForDimension("quantum-moat")).toEqual([]);
  });

  it("returns [] for the empty string", () => {
    expect(getActionsForDimension("")).toEqual([]);
  });

  it("is case-sensitive — upper-case FTV misses the ftv entry", () => {
    // Guards against a caller trusting a wrong-case dim code — the SVI
    // report always stores lower-case dim codes; a match here would mean
    // the registry silently normalised to upper-case which downstream
    // colour + scoring code does NOT expect.
    expect(getActionsForDimension("FTV")).toEqual([]);
  });

  it("returns the same array reference identity as the registry", () => {
    // Downstream callers should not need to defensive-copy; pinning the
    // identity means a future refactor that starts returning a fresh
    // array per call surfaces here (either intentional or accidental).
    expect(getActionsForDimension("ftv")).toBe(DIMENSION_ACTIONS.ftv);
  });
});

describe("EVIDENCE_GAP_ACTIONS registry", () => {
  it("covers exactly the 10 shipped gap keys", () => {
    expect(Object.keys(EVIDENCE_GAP_ACTIONS).sort()).toEqual([...CANONICAL_GAP_KEYS].sort());
  });

  it("every gap action has a non-empty label and a valid type", () => {
    for (const key of CANONICAL_GAP_KEYS) {
      const a = EVIDENCE_GAP_ACTIONS[key];
      expect(a.label.length).toBeGreaterThan(0);
      expect(VALID_TYPES).toContain(a.type);
    }
  });

  it("cap_table is a tool with the /tools/cap-table href", () => {
    expect(EVIDENCE_GAP_ACTIONS.cap_table).toEqual({
      label: "Build cap table",
      href: "/tools/cap-table",
      type: "tool",
    });
  });

  it("abn_registration is external and points at abr.gov.au", () => {
    const a = EVIDENCE_GAP_ACTIONS.abn_registration;
    expect(a.type).toBe("external");
    expect(a.href).toBe("https://www.abr.gov.au/business-super-funds-702/applying-abn");
  });

  it("upload-typed gap actions never carry an href", () => {
    for (const key of CANONICAL_GAP_KEYS) {
      const a = EVIDENCE_GAP_ACTIONS[key];
      if (a.type === "upload") expect(a.href).toBeUndefined();
    }
  });
});

describe("getActionForGap — keyword ladder", () => {
  // The ladder walks specific → generic. These fixtures pin the first
  // matching branch for each declared keyword group.

  it("matches 'pitch' → pitch_deck", () => {
    expect(getActionForGap("Missing pitch deck")).toEqual(EVIDENCE_GAP_ACTIONS.pitch_deck);
  });

  it("matches 'deck' alone → pitch_deck", () => {
    expect(getActionForGap("Investor deck missing")).toEqual(EVIDENCE_GAP_ACTIONS.pitch_deck);
  });

  it("matches 'revenue' → revenue_proof", () => {
    expect(getActionForGap("No revenue evidence")).toEqual(EVIDENCE_GAP_ACTIONS.revenue_proof);
  });

  it("matches 'stripe' → revenue_proof", () => {
    expect(getActionForGap("Connect Stripe for MRR")).toEqual(EVIDENCE_GAP_ACTIONS.revenue_proof);
  });

  it("matches 'invoice' → revenue_proof", () => {
    expect(getActionForGap("Upload paid invoice")).toEqual(EVIDENCE_GAP_ACTIONS.revenue_proof);
  });

  it("matches 'cap table' → cap_table", () => {
    expect(getActionForGap("cap table missing")).toEqual(EVIDENCE_GAP_ACTIONS.cap_table);
  });

  it("matches 'github' → source_code", () => {
    expect(getActionForGap("connect GitHub repo")).toEqual(EVIDENCE_GAP_ACTIONS.source_code);
  });

  it("matches 'source code' → source_code", () => {
    expect(getActionForGap("no source code linked")).toEqual(EVIDENCE_GAP_ACTIONS.source_code);
  });

  it("matches 'repository' → source_code", () => {
    expect(getActionForGap("link a repository")).toEqual(EVIDENCE_GAP_ACTIONS.source_code);
  });

  it("matches 'analytics' → customer_data", () => {
    expect(getActionForGap("connect analytics")).toEqual(EVIDENCE_GAP_ACTIONS.customer_data);
  });

  it("matches 'google analytics' → customer_data", () => {
    expect(getActionForGap("hook up Google Analytics")).toEqual(EVIDENCE_GAP_ACTIONS.customer_data);
  });

  it("matches 'abn' → abn_registration", () => {
    expect(getActionForGap("register ABN")).toEqual(EVIDENCE_GAP_ACTIONS.abn_registration);
  });

  it("matches 'asic' → abn_registration", () => {
    expect(getActionForGap("Update ASIC record")).toEqual(EVIDENCE_GAP_ACTIONS.abn_registration);
  });

  it("matches 'sha' → shareholders_agreement", () => {
    expect(getActionForGap("Upload signed SHA")).toEqual(EVIDENCE_GAP_ACTIONS.shareholders_agreement);
  });

  it("matches 'shareholder' → shareholders_agreement", () => {
    expect(getActionForGap("Shareholder register missing")).toEqual(
      EVIDENCE_GAP_ACTIONS.shareholders_agreement,
    );
  });

  it("matches 'financial model' → financial_model", () => {
    expect(getActionForGap("financial model PDF")).toEqual(EVIDENCE_GAP_ACTIONS.financial_model);
  });

  it("matches 'p&l' → financial_model", () => {
    expect(getActionForGap("Attach P&L")).toEqual(EVIDENCE_GAP_ACTIONS.financial_model);
  });

  it("matches 'demo' → product_demo", () => {
    expect(getActionForGap("Upload demo video")).toEqual(EVIDENCE_GAP_ACTIONS.product_demo);
  });

  it("matches 'prototype' → product_demo", () => {
    expect(getActionForGap("Prototype missing")).toEqual(EVIDENCE_GAP_ACTIONS.product_demo);
  });

  it("matches 'ip'/'patent'/'trademark' → ip_protection", () => {
    expect(getActionForGap("File IP protection")).toEqual(EVIDENCE_GAP_ACTIONS.ip_protection);
    expect(getActionForGap("Provisional patent")).toEqual(EVIDENCE_GAP_ACTIONS.ip_protection);
    expect(getActionForGap("Register trademark")).toEqual(EVIDENCE_GAP_ACTIONS.ip_protection);
  });

  it("matches generic 'evidence' → { label: 'Upload evidence', type: 'upload' } fallback", () => {
    expect(getActionForGap("Missing evidence")).toEqual({ label: "Upload evidence", type: "upload" });
  });

  it("matches generic 'upload' → generic upload-evidence fallback", () => {
    // The ladder only fires this branch when NOTHING more specific matched;
    // `Please upload` contains no earlier keyword so it falls through here.
    expect(getActionForGap("Please upload")).toEqual({ label: "Upload evidence", type: "upload" });
  });

  it("matches 'document' → generic upload-evidence fallback", () => {
    expect(getActionForGap("Add a document")).toEqual({ label: "Upload evidence", type: "upload" });
  });

  it("matches 'website' → generic upload-evidence fallback", () => {
    expect(getActionForGap("Link a website")).toEqual({ label: "Upload evidence", type: "upload" });
  });

  it("matches 'landing page' → generic upload-evidence fallback", () => {
    expect(getActionForGap("Landing page URL")).toEqual({ label: "Upload evidence", type: "upload" });
  });

  it("returns null when no keyword matches", () => {
    expect(getActionForGap("unrelated whatever")).toBeNull();
  });

  it("returns null on the empty string", () => {
    expect(getActionForGap("")).toBeNull();
  });

  it("is case-insensitive — upper-case 'PITCH DECK' still matches pitch_deck", () => {
    expect(getActionForGap("PITCH DECK MISSING")).toEqual(EVIDENCE_GAP_ACTIONS.pitch_deck);
  });

  it("ladder ordering — 'pitch' fires the pitch_deck branch before any later 'evidence' branch would", () => {
    // If a future edit reorders the ladder and puts the generic 'evidence'
    // branch above pitch/deck, this asserts the specific branch still wins.
    expect(getActionForGap("pitch deck evidence")).toEqual(EVIDENCE_GAP_ACTIONS.pitch_deck);
  });

  it("ladder ordering — 'revenue' fires revenue_proof even when 'evidence' is also present", () => {
    expect(getActionForGap("revenue evidence")).toEqual(EVIDENCE_GAP_ACTIONS.revenue_proof);
  });
});

describe("getActionForNextAction — keyword ladder", () => {
  it("matches 'moat' → idea-valuation tool", () => {
    expect(getActionForNextAction("Build a defensible moat")).toEqual({
      label: "Evaluate your idea",
      href: "/tools/idea-valuation",
      type: "tool",
    });
  });

  it("matches 'AI moat' → idea-valuation tool", () => {
    expect(getActionForNextAction("Establish an AI moat")).toEqual({
      label: "Evaluate your idea",
      href: "/tools/idea-valuation",
      type: "tool",
    });
  });

  it("matches 'defensible' → idea-valuation tool", () => {
    expect(getActionForNextAction("Make your product defensible")).toEqual({
      label: "Evaluate your idea",
      href: "/tools/idea-valuation",
      type: "tool",
    });
  });

  it("matches 'cap table' → cap-table tool", () => {
    expect(getActionForNextAction("Build your cap table")).toEqual({
      label: "Build cap table",
      href: "/tools/cap-table",
      type: "tool",
    });
  });

  it("matches 'founder split' → cap-table tool", () => {
    expect(getActionForNextAction("Decide founder split")).toEqual({
      label: "Build cap table",
      href: "/tools/cap-table",
      type: "tool",
    });
  });

  it("matches 'evidence' → generic upload", () => {
    expect(getActionForNextAction("Upload evidence")).toEqual({
      label: "Upload evidence",
      type: "upload",
    });
  });

  it("matches 'github' → generic upload", () => {
    expect(getActionForNextAction("Connect GitHub")).toEqual({
      label: "Upload evidence",
      type: "upload",
    });
  });

  it("matches 'analytics' → generic upload", () => {
    expect(getActionForNextAction("Connect analytics")).toEqual({
      label: "Upload evidence",
      type: "upload",
    });
  });

  it("matches 'stripe' → Connect Stripe upload", () => {
    expect(getActionForNextAction("Connect Stripe")).toEqual({
      label: "Connect Stripe",
      type: "upload",
    });
  });

  it("matches 'paying customer' → Connect Stripe upload", () => {
    expect(getActionForNextAction("Get first paying customer")).toEqual({
      label: "Connect Stripe",
      type: "upload",
    });
  });

  it("matches 'tam'/'sam'/'som'/'market size' → idea-valuation tool", () => {
    const expected = { label: "Validate your idea", href: "/tools/idea-valuation", type: "tool" };
    expect(getActionForNextAction("Estimate TAM")).toEqual(expected);
    expect(getActionForNextAction("Refine SAM")).toEqual(expected);
    expect(getActionForNextAction("Compute SOM")).toEqual(expected);
    expect(getActionForNextAction("Market size analysis")).toEqual(expected);
  });

  it("matches 'demo'/'prototype'/'mvp' → Upload demo upload", () => {
    const expected = { label: "Upload demo", type: "upload" };
    expect(getActionForNextAction("Record product demo")).toEqual(expected);
    expect(getActionForNextAction("Ship prototype")).toEqual(expected);
    expect(getActionForNextAction("MVP for launch")).toEqual(expected);
  });

  it("matches 'abn'/'asic'/'register' → Register ABN external", () => {
    const expected = {
      label: "Register ABN",
      href: "https://www.abr.gov.au/business-super-funds-702/applying-abn",
      type: "external",
    };
    expect(getActionForNextAction("Register ABN with ATO")).toEqual(expected);
    expect(getActionForNextAction("File ASIC form")).toEqual(expected);
    expect(getActionForNextAction("Register company")).toEqual(expected);
  });

  it("matches 'pitch deck' or 'pitch' → Upload pitch deck upload", () => {
    const expected = { label: "Upload pitch deck", type: "upload" };
    expect(getActionForNextAction("Draft pitch deck")).toEqual(expected);
    expect(getActionForNextAction("Rehearse pitch")).toEqual(expected);
  });

  it("matches 'data room' → data-room tool", () => {
    expect(getActionForNextAction("Populate the data room")).toEqual({
      label: "Build data room",
      href: "/tools/data-room",
      type: "tool",
    });
  });

  it("matches 'funding'/'raise' → funding-plan tool", () => {
    const expected = { label: "Create funding plan", href: "/tools/funding-plan", type: "tool" };
    expect(getActionForNextAction("Plan next funding round")).toEqual(expected);
    expect(getActionForNextAction("Prepare to raise seed")).toEqual(expected);
  });

  it("matches 'term sheet' → term-sheet tool", () => {
    expect(getActionForNextAction("Review term sheet")).toEqual({
      label: "Analyze term sheet",
      href: "/tools/term-sheet",
      type: "tool",
    });
  });

  it("matches 'dilution' → dilution tool", () => {
    expect(getActionForNextAction("Model dilution")).toEqual({
      label: "Plan dilution",
      href: "/tools/dilution",
      type: "tool",
    });
  });

  it("matches 'co-founder' → cofounder-match tool", () => {
    expect(getActionForNextAction("Find a co-founder")).toEqual({
      label: "Find a co-founder",
      href: "/tools/cofounder-match",
      type: "tool",
    });
  });

  it("matches 'cofounder' (no hyphen) → cofounder-match tool", () => {
    expect(getActionForNextAction("Meet a cofounder")).toEqual({
      label: "Find a co-founder",
      href: "/tools/cofounder-match",
      type: "tool",
    });
  });

  it("returns null when no keyword matches", () => {
    expect(getActionForNextAction("go for a walk")).toBeNull();
  });

  it("returns null on the empty string", () => {
    expect(getActionForNextAction("")).toBeNull();
  });

  it("is case-insensitive across the ladder", () => {
    // Every keyword is lower-cased before matching so an upper-case title
    // still resolves. If a future edit skips the `.toLowerCase()` this
    // check flips first.
    expect(getActionForNextAction("BUILD CAP TABLE")).toEqual({
      label: "Build cap table",
      href: "/tools/cap-table",
      type: "tool",
    });
  });

  it("ladder ordering — 'moat' fires before any later branch (e.g. 'evidence')", () => {
    // A title mentioning both 'moat' and 'evidence' must resolve to
    // idea-valuation (declared first), not the generic upload branch.
    expect(getActionForNextAction("moat evidence")).toEqual({
      label: "Evaluate your idea",
      href: "/tools/idea-valuation",
      type: "tool",
    });
  });

  it("ladder ordering — 'cap table' fires before generic 'evidence'", () => {
    expect(getActionForNextAction("cap table evidence")).toEqual({
      label: "Build cap table",
      href: "/tools/cap-table",
      type: "tool",
    });
  });
});
