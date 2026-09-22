import { describe, expect, it } from "vitest";
import { autoCite, idsForClaim, type CitableItem } from "./auto-cite";
const id = "public-attribution-1234567890abcdef";
const claim = 'The page at https://example.com/pricing states: "Acme does not report AUD 200 revenue. Other Business reports AUD 200 revenue."';
const item: CitableItem = { id, label: "Public page attribution", text: claim, claimScope: { kind: "literal_public_attribution", exactClaim: claim } };
describe("public attribution citation scope", () => {
  it("admits an exact complete attribution without splitting away negation", () => {
    const out = autoCite(claim, [item]);
    expect(out.text).toBe(`${claim} [ev:${id}]`); expect(out.added).toBe(1);
    expect(autoCite(out.text, [item]).text).toBe(out.text);
  });
  it("cannot cite a same-number wrong entity, metric, paraphrase or shortened excerpt", () => {
    for (const text of ["Acme has AUD 200 revenue.", "Other Business has AUD 200 cash.", "Acme reports AUD 200 revenue.", 'The page states: "Other Business reports AUD 200 revenue."']) {
      expect(idsForClaim(text, [item])).toBeNull();
      expect(autoCite(text, [item]).added).toBe(0);
      expect(autoCite(`${text} [ev:${id}]`, [item]).text).not.toContain(`[ev:${id}]`);
    }
  });
  it("strips preexisting invalid scope citations on non-numeric claims too", () => {
    expect(autoCite(`Acme is a verified competitor. [ev:${id}]`, [item]).text).not.toContain("[ev:");
  });
  it("does not broaden scope from a fabricated model quote or missing scope metadata", () => {
    const text = "Acme has AUD 200 revenue.";
    expect(autoCite(text, [item], [{ evidence_id: id, quote: "AUD 200" }]).added).toBe(0);
    const unscoped = { id, label: item.label, text: item.text };
    expect(autoCite(text, [unscoped]).added).toBe(0);
    expect(autoCite(`${text} [ev:${id}]`, [unscoped]).text).not.toContain("[ev:");
  });
  it("does not let an exact quote plus an extra conclusion borrow the citation", () => {
    const extra = `${claim} Therefore Acme has AUD 200 revenue. [ev:${id}]`;
    expect(autoCite(extra, [item]).text).not.toContain("[ev:");
  });
});
