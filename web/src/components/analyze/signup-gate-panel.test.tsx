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

// ── One ask, not two ───────────────────────────────────────────────────────
//
// From run 1 the results page offers to email a free 5-page summary. That is
// an email ask; this panel is an account ask. Two unrelated demands for the
// same thing in one session reads as a site that keeps moving the goalposts,
// so when the address is already known the wall becomes a continuation of it.
describe("signupGateCopy — when the summary address is already known", () => {
  it("says what we already have and asks only for the new thing", () => {
    const copy = signupGateCopy({
      priorRuns: 1,
      windowDays: 30,
      summaryEmail: "founder@example.com",
    });
    expect(copy.heading).toBe("Finish the account and run this one");
    expect(copy.body).toContain("founder@example.com");
    expect(copy.body).toContain("password");
  });

  it("still says nothing costs money", () => {
    const copy = signupGateCopy({
      priorRuns: 1,
      windowDays: 30,
      summaryEmail: "founder@example.com",
    });
    expect(copy.body).toContain("still free");
    expect(copy.body).toContain("no card");
  });

  it("keeps the real history line", () => {
    const copy = signupGateCopy({
      priorRuns: 2,
      windowDays: 30,
      summaryEmail: "founder@example.com",
    });
    expect(copy.history).toContain("2 analyses");
    expect(copy.history).toContain("30 days");
  });

  it("falls back to the plain wall for anything that is not an address", () => {
    for (const value of [null, undefined, "", "   ", "not-an-email"]) {
      expect(
        signupGateCopy({ priorRuns: 1, summaryEmail: value }).heading,
      ).toBe("Create a free account to run this one");
    }
  });
});

describe("SignupGatePanel — carrying the known address through", () => {
  it("prefills the register link so the address is never typed twice", () => {
    const html = renderToStaticMarkup(
      <SignupGatePanel
        priorRuns={1}
        windowDays={30}
        submission={null}
        summaryEmail="founder@example.com"
      />,
    );
    // `?email=` is read by the login form (see login-form.tsx). If that ever
    // stops being true this promise becomes a lie, so it is pinned here.
    expect(html).toContain("email=founder%40example.com");
    expect(html).toContain("Set a password");
  });

  it("says create-an-account when we have no address", () => {
    const html = renderToStaticMarkup(
      <SignupGatePanel priorRuns={1} windowDays={30} submission={null} />,
    );
    expect(html).toContain("Create a free account");
    expect(html).not.toContain("email=");
  });
});
