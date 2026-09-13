import { describe, expect, it } from "vitest";
import { INCLUDED_CREDIT_NOTE, NO_CHARGE_CREDIT_NOTE, creditNoteFor } from "./credits-preview";

const OWN = "Charged to your credits.";
const MEMBER = "Charged to your own credits — not the project owner's.";

describe("creditNoteFor (lane-2 P3-d)", () => {
  it("a real charge keeps the wallet note (owner or member)", () => {
    expect(creditNoteFor({ cost: 2, included: false, chargeNote: OWN })).toBe(OWN);
    expect(creditNoteFor({ cost: 1, included: false, chargeNote: MEMBER })).toBe(MEMBER);
  });

  it("an included feature never says 'Charged to your credits.'", () => {
    const note = creditNoteFor({ cost: 0, included: true, chargeNote: OWN });
    expect(note).toBe(INCLUDED_CREDIT_NOTE);
    expect(note).toMatch(/no credits charged/i);
    expect(note).not.toMatch(/Charged to your/);
  });

  it("cost 0 without inclusion (already paid / nothing to issue) is 'No credits charged.'", () => {
    expect(creditNoteFor({ cost: 0, included: false, chargeNote: OWN })).toBe(NO_CHARGE_CREDIT_NOTE);
  });

  it("included but a cost is still due (a regenerate priced by the route) → the charge note wins", () => {
    expect(creditNoteFor({ cost: 1, included: true, chargeNote: OWN })).toBe(OWN);
  });
});
