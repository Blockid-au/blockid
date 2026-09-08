import { describe, expect, it } from "vitest";
import {
  guestInputTypeFor,
  guestUrlFor,
  shouldAutoRun,
} from "./analyze-root";
import type { IntakeResult } from "@/lib/intake/analyze-input";

const deckIntake = { inputKind: "pitch_deck" } as IntakeResult;
const siteIntake = { inputKind: "website", rawText: "https://a.io" } as IntakeResult;
const ideaIntake = { inputKind: "idea_text" } as IntakeResult;

describe("shouldAutoRun", () => {
  it("runs straight away for an anonymous free visitor", () => {
    // This is the hero handoff: they already pressed the button once.
    expect(shouldAutoRun({ tier: "free", authenticated: false })).toBe(true);
  });

  it("never skips confirmation on the paid tier", () => {
    expect(shouldAutoRun({ tier: "paid", authenticated: false })).toBe(false);
    expect(shouldAutoRun({ tier: "paid", authenticated: true })).toBe(false);
  });

  it("never skips confirmation for a signed-in user (credits can be spent)", () => {
    expect(shouldAutoRun({ tier: "free", authenticated: true })).toBe(false);
  });

  it("does not auto-run when the session state is unknown", () => {
    expect(shouldAutoRun({ tier: "free" })).toBe(false);
  });
});

describe("guestInputTypeFor", () => {
  it("sells a deck upload as pitch_file", () => {
    const file = new File(["d"], "d.pdf", { type: "application/pdf" });
    expect(guestInputTypeFor(deckIntake, { variant: "deck", file })).toBe(
      "pitch_file",
    );
  });

  it("sells a site as website_url", () => {
    expect(
      guestInputTypeFor(siteIntake, {
        variant: "url",
        url: "https://a.io",
      }),
    ).toBe("website_url");
  });

  it("has no guest SKU for a typed idea", () => {
    expect(guestInputTypeFor(ideaIntake, { variant: "idea", text: "x" })).toBeNull();
  });

  it("returns null without an intake", () => {
    expect(guestInputTypeFor(null, { variant: "idea", text: "x" })).toBeNull();
  });
});

describe("guestUrlFor", () => {
  it("accepts an https url", () => {
    expect(guestUrlFor(siteIntake, { variant: "url", url: "https://a.io" })).toBe(
      "https://a.io",
    );
  });

  it("rejects a non-http scheme", () => {
    expect(
      guestUrlFor(siteIntake, { variant: "url", url: "javascript:alert(1)" }),
    ).toBe("");
  });

  it("rejects free text", () => {
    expect(guestUrlFor(ideaIntake, { variant: "idea", text: "not a url" })).toBe("");
  });
});
