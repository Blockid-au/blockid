// Colocated vitest for the signup gate prompt.
//
// This panel is the only place a visitor is ever told they need an account,
// so the tests here are mostly about honesty. Two failures would be
// commercially expensive and both are silent:
//
//   * implying the analysis costs money. It does not — this is an account
//     wall, not a paywall — and a founder who reads "free tool" on the
//     homepage and "pay to continue" here does not come back.
//   * promising the typed input survives signup when the return link does not
//     actually carry it. The visitor finds an empty box, retypes or leaves.
//
// Plus the plain mechanics: real counts only, a working register/sign-in
// route, and no dark patterns in the copy.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SignupGatePanel, signupGateCopy } from "./signup-gate-panel";

function html(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe("signupGateCopy — honesty", () => {
  it("never implies the run costs money", () => {
    const copy = signupGateCopy({ priorRuns: 1, windowDays: 30 });
    const all = `${copy.heading} ${copy.body} ${copy.history ?? ""}`;
    expect(all).toMatch(/free/i);
    // "nothing to pay" is fine — a price, a card requirement, or an upsell
    // is not. This is the line between an account wall and a paywall.
    expect(all).not.toMatch(
      /A\$|\d+\s*credits?|payment required|card required|purchase|upgrade to|subscri/i,
    );
  });

  it("says the run is free in so many words", () => {
    expect(signupGateCopy({ priorRuns: 1 }).body).toMatch(
      /free|nothing to pay/i,
    );
  });

  it("uses the real prior-run count and window", () => {
    expect(signupGateCopy({ priorRuns: 1, windowDays: 30 }).history).toBe(
      "You have already run one analysis on this browser in the last 30 days, without an account.",
    );
    expect(signupGateCopy({ priorRuns: 4, windowDays: 30 }).history).toBe(
      "You have already run 4 analyses on this browser in the last 30 days, without an account.",
    );
  });

  it("says nothing about history rather than inventing it", () => {
    expect(signupGateCopy({ priorRuns: 0 }).history).toBeNull();
    expect(signupGateCopy({}).history).toBeNull();
  });

  it("omits the window when the API did not send one", () => {
    expect(signupGateCopy({ priorRuns: 1 }).history).toBe(
      "You have already run one analysis on this browser, without an account.",
    );
  });
});

describe("SignupGatePanel — the input survives signup", () => {
  it("points register and sign-in back at /analyze with the input", () => {
    const out = html(
      <SignupGatePanel
        priorRuns={1}
        windowDays={30}
        submission={{ variant: "idea", text: "a marketplace for x" }}
      />,
    );
    // React escapes `&` in the rendered href, so match the encoded payload
    // rather than the whole query string.
    const next = encodeURIComponent(
      "/analyze?q=a+marketplace+for+x&kind=idea&resume=signup",
    );
    expect(out).toContain(`/auth/login?mode=register&amp;next=${next}`);
    expect(out).toContain(`/auth/login?next=${next}`);
  });

  it("promises retyping is unnecessary for text input", () => {
    const out = html(
      <SignupGatePanel submission={{ variant: "idea", text: "an idea" }} />,
    );
    expect(out).toMatch(/won’t be asked for it again/);
  });

  it("is honest that a deck cannot make the trip", () => {
    const file = new File(["deck"], "deck.pdf", { type: "application/pdf" });
    const out = html(<SignupGatePanel submission={{ variant: "deck", file }} />);
    expect(out).toMatch(/drop your deck once more/);
    expect(out).not.toMatch(/won’t be asked for it again/);
  });
});

describe("SignupGatePanel — no dark patterns", () => {
  it("has no countdown, scarcity or trial-expiry language", () => {
    const out = html(
      <SignupGatePanel
        priorRuns={2}
        windowDays={30}
        submission={{ variant: "idea", text: "an idea" }}
      />,
    );
    expect(out).not.toMatch(
      /only \d+ left|spots? remaining|expires? in|hurry|limited time|trial ended/i,
    );
  });

  it("ships no pre-ticked consent box", () => {
    const out = html(
      <SignupGatePanel submission={{ variant: "idea", text: "an idea" }} />,
    );
    expect(out).not.toContain("checked");
    expect(out).not.toContain('type="checkbox"');
  });

  it("labels itself for assistive tech", () => {
    const out = html(
      <SignupGatePanel submission={{ variant: "idea", text: "an idea" }} />,
    );
    expect(out).toContain('aria-labelledby="signup-gate-heading"');
    expect(out).toContain('id="signup-gate-heading"');
  });

  it("uses design-system tokens, never raw hex", () => {
    const out = html(
      <SignupGatePanel submission={{ variant: "idea", text: "an idea" }} />,
    );
    expect(out).toContain("bg-surface-raised");
    expect(out).toContain("bg-action");
    expect(out).toContain("text-on-action");
    expect(out).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});
