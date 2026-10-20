import { describe, expect, it } from "vitest";
import {
  guestInputTypeFor,
  guestPaidCopy,
  guestUrlFor,
  shouldAutoRun,
} from "./analyze-root";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import type { IntakeResult } from "@/lib/intake/analyze-input";

const deckIntake = { inputKind: "pitch_deck" } as IntakeResult;
const siteIntake = { inputKind: "website", rawText: "https://a.io" } as IntakeResult;
const ideaIntake = { inputKind: "idea_text" } as IntakeResult;

describe("guestPaidCopy (G35 P5 payg switch, copy only)", () => {
  it("flag OFF: today's legacy one-off wording, byte-identical, whatever the tier param", () => {
    for (const tier of ["full", "snapshot"] as const) {
      const c = guestPaidCopy(PAYG_OFF_VIEW, tier);
      expect(c.banner).toBe("Paid report · A$3 inc. GST · emailed as a PDF");
      expect(c.cta).toBe("Continue — A$3 report");
      expect(c.title).toBe("Your A$3 report");
      expect(c.oneOff).toBe("One-off A$3 inc. GST");
      expect(c.checkoutPrice).toBe("A$3");
      expect(c.tierName).toBeUndefined();
      expect(c.quoteLabel).toBeNull();
    }
  });

  it("flag ON (D26): Full by default, Snapshot when the link chose it, prices from the view", () => {
    const full = guestPaidCopy(PAYG_ON_VIEW);
    expect(full.cta).toBe(`Continue — Full report ${PAYG_ON_VIEW.full}`);
    expect(full.title).toBe(`Your Full report — ${PAYG_ON_VIEW.full}`);
    expect(full.banner).toBe(`Paid report · Full ${PAYG_ON_VIEW.full} inc. GST · emailed as a PDF`);
    expect(full.quoteLabel).toBe(`Full ${PAYG_ON_VIEW.full} inc. GST`);
    expect(full.tierName).toBe("Full");
    const snap = guestPaidCopy(PAYG_ON_VIEW, "snapshot");
    expect(snap.cta).toBe(`Continue — Snapshot report ${PAYG_ON_VIEW.snapshot}`);
    expect(snap.oneOff).toBe(`One-off Snapshot report ${PAYG_ON_VIEW.snapshot} inc. GST`);
    for (const c of [full, snap]) {
      for (const v of Object.values(c)) if (typeof v === "string") expect(v).not.toMatch(/A\$3(?!\d)/);
    }
  });
});

describe("shouldAutoRun", () => {
  it("runs straight away for an anonymous free visitor", () => {
    // True on EVERY path, not just the hero handoff. For an anonymous caller
    // the confirm modal renders a sign-in link in place of the run button, so
    // routing run 1 through it would wall the one run that must never be
    // walled.
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

  // Returning from the signup gate. The run was promised free BEFORE the
  // account existed, so a credit confirmation here would be a bait and
  // switch — and a brand-new account has no credits to clear it with, so the
  // CTA would be disabled and the promise simply broken.
  it("runs straight away for someone returning from the signup gate", () => {
    expect(
      shouldAutoRun({ tier: "free", authenticated: true, resumedFromSignup: true }),
    ).toBe(true);
  });

  it("still never skips the paid confirmation, even resuming from signup", () => {
    expect(
      shouldAutoRun({ tier: "paid", authenticated: true, resumedFromSignup: true }),
    ).toBe(false);
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

// 26/09 — the upload card starts from what the visitor handed over, nothing invented.
describe("initialIntakeProgress", () => {
  it("a file: its name and size, nothing uploaded yet", async () => {
    const { initialIntakeProgress } = await import("./analyze-root");
    const file = new File(["0123456789"], "deck.pdf", { type: "application/pdf" });
    expect(initialIntakeProgress(file, 5)).toEqual({ hasFile: true, source: "file", filename: "deck.pdf", loaded: 0, total: 10, uploaded: false, startedAt: 5, uploadedAt: null, at: 5 });
  });

  it("typed text or a URL: no upload row", async () => {
    const { initialIntakeProgress } = await import("./analyze-root");
    expect(initialIntakeProgress(null, 7)).toMatchObject({ hasFile: false, source: "text", filename: null, total: 0 });
    // 27/09 review: a website submission is read, not uploaded.
    expect(initialIntakeProgress(null, 7, "url")).toMatchObject({ hasFile: false, source: "website" });
    expect(initialIntakeProgress(null, 7, "idea")).toMatchObject({ source: "text" });
  });
});
